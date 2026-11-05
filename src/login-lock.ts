import { chmod, lstat, mkdir, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { credentialDirectory } from './config.js';

/** One device request and browser launch per profile, across processes. */
export async function withLoginLock<T>(profile: string | undefined, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const directory = credentialDirectory(profile);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The wallet configuration directory must not be a symlink');
  if (process.platform !== 'win32') await chmod(directory, 0o700);
  const path = join(directory, '.login.lock');
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
      throw new Error('A login is already pending for this profile. Use its existing approval page. If that process has ended, remove .login.lock from this profile directory before retrying.');
    throw error;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Sign-in cancelled. Saved credentials were preserved.'));
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try { return await action(controller.signal); }
  finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    await handle.close(); await rm(path, { force: true });
  }
}
