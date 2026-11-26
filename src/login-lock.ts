import { chmod, lstat, mkdir, open, readFile, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { credentialDirectory } from './config.js';
import { LoginFailedError } from './login-errors.js';

// A device code lives at most 30 minutes (email-code-login.ts caps expires_in at 1800 s); a lock older than that plus a
// margin belongs to a login that can no longer finish.
const lockLifetimeMs = 31 * 60 * 1000;
// The host is recorded because a PID means nothing on another machine sharing this directory (a synced or network home).
const ownerSchema = z.object({ pid: z.number().int().positive(), startedAt: z.number().int().nonnegative(), host: z.string().optional() });

/** True when the process is gone. EPERM means it exists under another user, so it still holds the lock. */
function processGone(pid: number) {
  try { process.kill(pid, 0); return false; }
  catch (error) { return error instanceof Error && 'code' in error && error.code === 'ESRCH'; }
}

/** A lock whose owner died, or that outlived any device code, is stale. An unreadable lock (an older CLI's empty file,
 * or one being written now) counts as stale only by its age. */
export async function staleLock(path: string, now = Date.now()) {
  const stat = await lstat(path).catch(() => undefined);
  if (!stat) return true;
  if (now - stat.mtimeMs > lockLifetimeMs) return true;
  const owner = ownerSchema.safeParse(await readFile(path, 'utf8').then((text): unknown => JSON.parse(text)).catch(() => undefined));
  if (!owner.success) return false;
  if (now - owner.data.startedAt > lockLifetimeMs) return true;
  return (owner.data.host ?? hostname()) === hostname() && processGone(owner.data.pid);
}

/**
 * Removes a stale lock while holding a short takeover guard, so two logins cannot both clear it: the second one to get
 * the guard re-checks and finds either no lock (and races fairly on the exclusive create) or the first one's live lock.
 */
async function takeOver(path: string) {
  const guard = `${path}.takeover`;
  let handle;
  try { handle = await open(guard, 'wx', 0o600); }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    // A guard is held for milliseconds; one older than 30 s belongs to a login that died mid-takeover. The next login retries.
    const age = await lstat(guard).then(stat => Date.now() - stat.mtimeMs, () => 0);
    if (age > 30_000) await rm(guard, { force: true });
    return false;
  }
  try {
    if (!await staleLock(path)) return false;
    await rm(path, { force: true });
    return true;
  } finally { await handle.close(); await rm(guard, { force: true }); }
}

async function acquire(path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx', 0o600);
      const owner = JSON.stringify({ pid: process.pid, startedAt: Date.now(), host: hostname() });
      try { await handle.writeFile(owner); }
      catch (error) { await handle.close(); await rm(path, { force: true }); throw error; }
      return { handle, owner };
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      if (attempt === 0 && await staleLock(path) && await takeOver(path)) continue;
      throw new Error('A login is already pending for this profile. Use the approval link it printed, or stop that login and run login again.');
    }
  }
  throw new Error('A login is already pending for this profile.');
}

/** One device request and browser launch per profile, across processes. */
export async function withLoginLock<T>(profile: string | undefined, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const directory = credentialDirectory(profile);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The wallet configuration directory must not be a symlink');
  if (process.platform !== 'win32') await chmod(directory, 0o700);
  const path = join(directory, '.login.lock');
  const { handle, owner } = await acquire(path);
  const controller = new AbortController();
  const cancel = () => controller.abort(new LoginFailedError('cancelled', 'Sign-in cancelled. Saved credentials were preserved.'));
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try { return await action(controller.signal); }
  finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    await handle.close();
    // A later login may have taken over this lock as stale; remove it only while it is still this login's.
    if (await readFile(path, 'utf8').catch(() => undefined) === owner) await rm(path, { force: true });
  }
}
