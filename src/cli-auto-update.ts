import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { version } from '../package.json';
import { homedir } from 'node:os';
import { checkCliUpdate, compiledCli, trustedReleaseOrigin, updateCli, type CliUpdateCheck } from './cli-update.js';

const semver = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const runtimeSchema = z.object({ cli: z.string(), version: semver,
  files: z.object({ 'cli.js': z.string(), 'wallet-cli.js': z.string(), 'package.json': z.string() }) });
const cacheSchema = z.object({ checkedAt: z.number(), failedAt: z.number().optional(), latestVersion: semver.nullable(), runtime: runtimeSchema.optional() });
type Runtime = z.infer<typeof runtimeSchema>;
export type AutoUpdate = { check: CliUpdateCheck; invocation?: string[] };
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function newer(left: string, right: string) {
  const a = left.split('.').map(BigInt), b = right.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}
const unavailable = (): AutoUpdate => ({ check: { installedVersion: version, latestVersion: null, status: 'unknown',
  message: 'Update check unavailable. Continuing with the installed CLI; retry with o11 update.' } });
function checked(latestVersion: string): AutoUpdate {
  const status = newer(latestVersion, version) ? 'update_available' : newer(version, latestVersion) ? 'ahead' : 'current';
  return { check: { installedVersion: version, latestVersion, status, ...(status === 'update_available' ? { nextAction: 'update_cli' as const } : {}) } };
}
async function runtimeAt(cli: string, expectedVersion: string): Promise<Runtime> {
  if (!isAbsolute(cli) || !['wallet-cli.js', 'cli.js'].some(name => cli === join(dirname(cli), name))) throw new Error('Invalid installed CLI path');
  const directory = dirname(cli), directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('Invalid installed runtime');
  const files = {} as Runtime['files'];
  for (const name of ['cli.js', 'wallet-cli.js', 'package.json'] as const) {
    const path = join(directory, name), stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('Invalid installed runtime file');
    const bytes = await readFile(path); files[name] = hash(bytes);
    if (name === 'package.json') {
      z.object({ name: z.literal('@o11/sdk'), version: z.literal(expectedVersion) }).parse(JSON.parse(bytes.toString()));
    }
  }
  return { cli, version: expectedVersion, files };
}
async function invocation(runtime: Runtime) {
  const actual = await runtimeAt(runtime.cli, runtime.version);
  if (Object.entries(runtime.files).some(([name, digest]) => actual.files[name as keyof Runtime['files']] !== digest))
    throw new Error('Cached runtime changed');
  return [process.execPath, '--no-install', runtime.cli];
}

/** Runs before stdin, API calls or MCP initialization. A cached target also upgrades saved versioned commands. */
export async function prepareCliUpdate(origin: string, force = false): Promise<AutoUpdate> {
  const reexecuted = process.env.O11_CLI_UPDATE_REEXEC;
  if (reexecuted) return semver.safeParse(reexecuted).success ? checked(reexecuted) : unavailable();
  try {
    const base = trustedReleaseOrigin(origin), directory = join(process.env.O11_TOOLS_CONFIG_DIR ?? join(homedir(), '.config', 'o11-wallet'), '.cli-updates');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return unavailable();
    const key = hash(base), path = join(directory, key + '.json'), lock = join(directory, key + '.lock');
    const saved = await lstat(path).catch(() => undefined);
    let cache = saved?.isFile() && !saved.isSymbolicLink() && saved.size < 8192 && (process.platform === 'win32' || (saved.mode & 0o077) === 0)
      ? cacheSchema.safeParse(await readFile(path, 'utf8').then(text => JSON.parse(text) as unknown).catch(() => undefined)).data : undefined;
    const age = cache ? Date.now() - (cache.failedAt ?? cache.checkedAt) : Infinity;
    let cachedRuntime: AutoUpdate | undefined;
    if (cache?.runtime && newer(cache.runtime.version, version)) {
      try { cachedRuntime = { ...(cache.failedAt ? unavailable() : checked(cache.latestVersion ?? cache.runtime.version)), invocation: await invocation(cache.runtime) };
        if (!force && age >= 0 && age < (cache.failedAt ? 60_000 : 300_000)) return cachedRuntime; }
      catch { cache = undefined; /* Recheck a changed runtime instead of executing it. */ }
    }
    if (!force && cache && age >= 0 && age < (cache?.latestVersion && !cache.failedAt ? 300_000 : 60_000))
      return cache?.latestVersion ? checked(cache.latestVersion) : unavailable();
    let handle;
    try { handle = await open(lock, 'wx', 0o600); }
    catch {
      const locked = await lstat(lock).catch(() => undefined);
      if (locked?.isFile() && !locked.isSymbolicLink() && locked.mtimeMs < Date.now() - 30_000) await rm(lock, { force: true });
      return cachedRuntime ? { ...unavailable(), invocation: cachedRuntime.invocation } : unavailable(); // A concurrent installer owns the update; this command can keep using its working runtime.
    }
    const token = crypto.randomUUID(); await handle.writeFile(token); await handle.close();
    const remember = async (latestVersion: string | null, runtime?: Runtime, failed = false) => {
      const temporary = path + '.' + token + '.tmp';
      try { await writeFile(temporary, JSON.stringify({ checkedAt: failed && cache ? cache.checkedAt : Date.now(), ...(failed ? { failedAt: Date.now() } : {}), latestVersion, ...(runtime ? { runtime } : {}) }), { flag: 'wx', mode: 0o600 }); await rename(temporary, path); }
      finally { await rm(temporary, { force: true }); }
    };
    try {
      // Only the manifest probe has a short deadline; a verified new archive gets up to eight seconds total.
      const fetcher: typeof fetch = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        return fetch(input, { ...init, signal: url.pathname.endsWith('/checksums.json')
          ? AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(1500)]) : init?.signal });
      }, { preconnect: fetch.preconnect });
      // A standalone program is too large to swap in before a command: it reports the update and o11 update installs it.
      if (compiledCli) {
        const check = await checkCliUpdate(base, version, fetcher);
        if (!check.latestVersion) throw new Error('Release check unavailable');
        await remember(check.latestVersion);
        return checked(check.latestVersion);
      }
      const update = await updateCli(base, cachedRuntime ? cache!.runtime!.version : version, fetcher, 8000);
      if (update.updated && 'cli' in update && update.cli) {
        const runtime = await runtimeAt(update.activeCli ?? update.cli, update.activeVersion);
        await remember(update.latestVersion, runtime);
        return { ...checked(update.latestVersion), invocation: await invocation(runtime) };
      }
      await remember(update.latestVersion, cache?.runtime);
      return { ...checked(update.latestVersion!), ...(cachedRuntime ? { invocation: cachedRuntime.invocation } : {}) };
    } catch {
      await remember(cache?.latestVersion ?? null, cache?.runtime, true).catch(() => undefined);
      return cachedRuntime ? { ...unavailable(), invocation: cachedRuntime.invocation } : unavailable();
    } finally {
      if (await readFile(lock, 'utf8').catch(() => '') === token) await rm(lock, { force: true });
    }
  } catch { return unavailable(); }
}
