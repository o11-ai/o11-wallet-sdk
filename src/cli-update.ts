import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { version } from '../package.json';

const releaseSchema = z.object({ version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  files: z.record(z.string(), z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) })) });
type Release = z.infer<typeof releaseSchema>;
export type CliUpdateCheck = { installedVersion: string; latestVersion: string | null;
  status: 'current' | 'update_available' | 'ahead' | 'unknown'; nextAction?: 'update_cli'; message?: string };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** A standalone program (bun build --compile) runs its bundle from Bun's embedded file system and needs no Bun. */
export const compiledCli = /^(?:\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(import.meta.path);
/** The argv that starts this same CLI again. */
export const selfInvocation = (): string[] => compiledCli ? [process.execPath] : [process.execPath, '--no-install', process.argv[1]!];
/** The release file name of the standalone program for a computer, or null when none is built for it. */
export function binaryName(platform: string = process.platform, arch: string = process.arch) {
  const os = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : platform === 'win32' ? 'windows' : null;
  // Windows on Arm runs the x64 program through its built-in emulation.
  const cpu = os === 'windows' && arch === 'arm64' ? 'x64' : arch === 'arm64' || arch === 'x64' ? arch : null;
  // Alpine and other musl-based Linux need the musl build.
  const musl = os === 'linux' && existsSync(`/lib/ld-musl-${cpu === 'arm64' ? 'aarch64' : 'x86_64'}.so.1`);
  return os && cpu ? `o11-${os}-${cpu}${musl ? '-musl' : ''}${os === 'windows' ? '.exe' : ''}` : null;
}
/** Large program files live on GitHub Releases; their SHA-256 comes from the wallet's own checksums.json. */
/** O11_RELEASE_BASE_URL points at a mirror; the bytes must still match the wallet's checksums. */
export function binaryDownloadUrl(releaseVersion: string, name: string) {
  const mirror = process.env.O11_RELEASE_BASE_URL?.replace(/\/+$/, '');
  if (mirror && !/^(?:https:\/\/|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/)/.test(mirror + '/')) throw new Error('O11_RELEASE_BASE_URL must use HTTPS');
  return `${mirror ?? 'https://github.com/o11-ai/o11-wallet-sdk/releases/download'}/v${releaseVersion}/${name}`;
}
const binaryLimit = 512 * 1024 * 1024;

function walletOrigin(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
    throw new Error('Use an HTTPS wallet origin without credentials, path, query, or fragment');
  return url.origin;
}
export function trustedReleaseOrigin(value: string) {
  const origin = walletOrigin(value), host = new URL(origin).hostname;
  if (!['docs.o11.ai', 'go.o11.ai', 'linux.ajay.dog', '127.0.0.1', 'localhost', '[::1]'].includes(host))
    throw new Error('Automatic installation is unavailable for this wallet origin. Keep the current CLI or install from https://docs.o11.ai.');
  return origin;
}
async function download(origin: string, path: string, limit: number, fetcher: typeof fetch, deadline = Date.now() + 5000) {
  const response = await fetcher(new URL(path, origin), { redirect: 'error', credentials: 'omit',
    signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now()))), headers: { Accept: 'application/json, text/plain' } });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit)
    throw new Error('Wallet release download is unavailable');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit) throw new Error('Wallet release download exceeds its size limit');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks, size);
}
async function releaseAt(origin: string, fetcher: typeof fetch, deadline?: number): Promise<Release> {
  const release = releaseSchema.parse(JSON.parse(new TextDecoder().decode(await download(origin, '/downloads/checksums.json', 256 * 1024, fetcher, deadline))));
  if (!release.files[`o11-sdk-${release.version}.tgz`]) throw new Error('Wallet release archive checksum is missing');
  return release;
}
function releaseStatus(release: Release, installedVersion: string): CliUpdateCheck {
  const installed = releaseSchema.shape.version.parse(installedVersion).split('.').map(BigInt), latest = release.version.split('.').map(BigInt);
  let comparison = 0;
  for (let i = 0; i < 3; i++) { if (installed[i]! !== latest[i]!) { comparison = installed[i]! < latest[i]! ? -1 : 1; break; } }
  return { installedVersion, latestVersion: release.version,
    status: comparison < 0 ? 'update_available' : comparison > 0 ? 'ahead' : 'current',
    ...(comparison < 0 ? { nextAction: 'update_cli' as const } : {}) };
}
/** Task-start/setup checks stay separate from paid commands and never send saved credentials. */
export async function checkCliUpdate(origin: string, installedVersion = version, fetcher: typeof fetch = fetch): Promise<CliUpdateCheck> {
  try { return releaseStatus(await releaseAt(walletOrigin(origin), fetcher), installedVersion); }
  catch { return { installedVersion, latestVersion: null, status: 'unknown', message: 'Release check unavailable. Keep working access and retry update --check later.' }; }
}
export async function updateCli(origin: string, installedVersion = version, fetcher: typeof fetch = fetch, timeoutMs = 60_000) {
  // A whole program is larger than the script archive, so it gets up to ten minutes on slow connections.
  const deadline = Date.now() + (compiledCli ? Math.max(timeoutMs, 600_000) : timeoutMs);
  const base = trustedReleaseOrigin(origin), release = await releaseAt(base, fetcher, deadline), status = releaseStatus(release, installedVersion);
  if (status.status !== 'update_available') return { ...status, updated: false };
  if (compiledCli) {
    const command = await replaceBinary(release, fetcher, deadline);
    return { installedVersion, latestVersion: release.version, status: 'current' as const, updated: true, version: release.version,
      command, invocation: command, args: [], activeVersion: release.version, message: 'Use the returned command. Restart MCP to load this version.' };
  }
  const expected = release.files['install-wallet.ts']?.sha256;
  if (!expected) throw new Error('Wallet installer checksum is missing; existing installation preserved');
  const installer = await download(base, '/downloads/install-wallet.ts', 256 * 1024, fetcher, deadline);
  if (digest(installer) !== expected) throw new Error('Wallet installer checksum mismatch; existing installation preserved');
  const directory = await mkdtemp(join(tmpdir(), 'o11-wallet-update-'));
  try {
    await writeFile(join(directory, 'install-wallet.ts'), installer, { mode: 0o600 });
    await writeFile(join(directory, 'run.ts'), 'const {installWallet}=await import(new URL("install-wallet.ts",import.meta.url).href);\nconsole.log(JSON.stringify(await installWallet({origin:process.env.O11_WALLET_INSTALL_ORIGIN,expectedRelease:JSON.parse(process.env.O11_WALLET_EXPECTED_RELEASE!)})));\n', { mode: 0o600 });
    // The installer receives no API key, refresh token or private profile contents.
    const environment = { O11_WALLET_INSTALL_ORIGIN: base, O11_WALLET_EXPECTED_RELEASE: JSON.stringify({ version: release.version, sha256: release.files[`o11-sdk-${release.version}.tgz`]!.sha256 }), ...Object.fromEntries(['PATH', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'SystemRoot', 'TMPDIR', 'TEMP', 'TMP'].flatMap(name => process.env[name] ? [[name, process.env[name]!]] : [])) };
    const child = Bun.spawn([process.execPath, '--no-install', join(directory, 'run.ts')], { env: environment, stdout: 'pipe', stderr: 'pipe' });
    const timer = setTimeout(() => child.kill(), Math.max(1, deadline - Date.now()));
    const [stdout, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error('Wallet update failed; keep the existing command and retry update');
    const installed = z.object({
      version: z.literal(release.version), command: z.string().nullable(), cli: z.string().optional(),
      activeCli: z.string().optional(), launcherVersion: releaseSchema.shape.version.optional(), invocation: z.string(),
      args: z.array(z.string()), warnings: z.array(z.string()).optional(),
      launchers: z.array(z.object({ name: z.string(), path: z.string(), version: releaseSchema.shape.version.nullable(),
        status: z.enum(['updated', 'preserved_newer', 'preserved_unknown', 'unavailable', 'busy', 'disabled']),
        reason: z.enum(['unsafe_path', 'unreadable', 'foreign_file', 'unverified_target', 'locked', 'disabled']).optional(),
      })).optional(),
    }).parse(JSON.parse(stdout));
    return { installedVersion, latestVersion: release.version, status: installed.launcherVersion && releaseStatus({ ...release, version: installed.launcherVersion }, release.version).status === 'update_available' ? 'ahead' as const : 'current' as const, updated: true, ...installed, activeVersion: installed.launcherVersion ?? installed.version,
      message: (installed.command ? 'Use the returned command.' : 'Use the returned versioned invocation.')
        + ' Restart MCP to load this version.' };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

/** Downloads this computer's program, checks it against the trusted manifest, and swaps it in place of the running one. */
async function replaceBinary(release: Release, fetcher: typeof fetch, deadline: number) {
  const name = binaryName(), expected = name ? release.files[name]?.sha256 : undefined;
  if (!name || !expected) throw new Error('This release has no o11 program for this computer; existing installation preserved');
  const target = process.execPath, temporary = join(dirname(target), `.${basename(target)}.${crypto.randomUUID()}.download`);
  if (process.platform === 'win32') await rm(`${target}.old`, { force: true }).catch(() => undefined);
  try {
    const response = await fetcher(binaryDownloadUrl(release.version, name), { redirect: 'follow', credentials: 'omit',
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > binaryLimit)
      throw new Error('o11 download is unavailable; existing installation preserved');
    const hash = createHash('sha256'), file = Bun.file(temporary).writer();
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > binaryLimit) throw new Error('o11 download exceeds its size limit; existing installation preserved');
        hash.update(chunk); file.write(chunk);
      }
    } finally { await file.end(); }
    if (hash.digest('hex') !== expected) throw new Error('o11 download checksum mismatch; existing installation preserved');
    await chmod(temporary, 0o755);
    // Apple silicon refuses unsigned programs; an ad-hoc signature is enough for one built elsewhere.
    if (process.platform === 'darwin') await Bun.spawn(['/usr/bin/codesign', '--sign', '-', '--force', temporary], { stdout: 'ignore', stderr: 'ignore' }).exited.catch(() => undefined);
    const started = Bun.spawnSync([temporary, '--version'], { stdout: 'pipe', stderr: 'ignore', timeout: 30_000 });
    if (started.exitCode !== 0 || !started.stdout.toString().includes(`"version":"${release.version}"`))
      throw new Error('The downloaded o11 program would not start; existing installation preserved');
    // Windows cannot overwrite a running program but can rename it; the old file is removed on the next update.
    if (process.platform === 'win32') {
      await rename(target, `${target}.old`);
      try { await rename(temporary, target); } catch (error) { await rename(`${target}.old`, target); throw error; }
    } else await rename(temporary, target);
    return target;
  } finally { await rm(temporary, { force: true }); }
}
