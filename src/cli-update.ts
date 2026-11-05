import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { version } from '../package.json';

const releaseSchema = z.object({ version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  files: z.record(z.string(), z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) })) });
type Release = z.infer<typeof releaseSchema>;
export type CliUpdateCheck = { installedVersion: string; latestVersion: string | null;
  status: 'current' | 'update_available' | 'ahead' | 'unknown'; nextAction?: 'update_cli'; message?: string };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function walletOrigin(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
    throw new Error('Use an HTTPS wallet origin without credentials, path, query, or fragment');
  return url.origin;
}
async function download(origin: string, path: string, limit: number, fetcher: typeof fetch) {
  const response = await fetcher(new URL(path, origin), { redirect: 'error', credentials: 'omit',
    signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json, text/plain' } });
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
async function releaseAt(origin: string, fetcher: typeof fetch): Promise<Release> {
  const release = releaseSchema.parse(JSON.parse(new TextDecoder().decode(await download(origin, '/downloads/checksums.json', 256 * 1024, fetcher))));
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
export async function updateCli(origin: string, installedVersion = version, fetcher: typeof fetch = fetch) {
  const base = walletOrigin(origin), release = await releaseAt(base, fetcher), status = releaseStatus(release, installedVersion);
  if (status.status !== 'update_available') return { ...status, updated: false };
  const expected = release.files['install-wallet.ts']?.sha256;
  if (!expected) throw new Error('Wallet installer checksum is missing; existing installation preserved');
  const installer = await download(base, '/downloads/install-wallet.ts', 256 * 1024, fetcher);
  if (digest(installer) !== expected) throw new Error('Wallet installer checksum mismatch; existing installation preserved');
  const directory = await mkdtemp(join(tmpdir(), 'o11-wallet-update-'));
  try {
    await writeFile(join(directory, 'install-wallet.ts'), installer, { mode: 0o600 });
    await writeFile(join(directory, 'run.ts'), 'const {installWallet}=await import(new URL("install-wallet.ts",import.meta.url).href);\nconsole.log(JSON.stringify(await installWallet({origin:process.env.O11_WALLET_INSTALL_ORIGIN,expectedRelease:JSON.parse(process.env.O11_WALLET_EXPECTED_RELEASE!)})));\n', { mode: 0o600 });
    // The installer receives no API key, refresh token or private profile contents.
    const environment = { O11_WALLET_INSTALL_ORIGIN: base, O11_WALLET_EXPECTED_RELEASE: JSON.stringify({ version: release.version, sha256: release.files[`o11-sdk-${release.version}.tgz`]!.sha256 }), ...Object.fromEntries(['PATH', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'SystemRoot', 'TMPDIR', 'TEMP', 'TMP'].flatMap(name => process.env[name] ? [[name, process.env[name]!]] : [])) };
    const child = Bun.spawn([process.execPath, '--no-install', join(directory, 'run.ts')], { env: environment, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code !== 0) throw new Error('Wallet update failed; keep the existing command and retry update');
    const installed = z.object({ version: z.literal(release.version), command: z.string().nullable(), launcherVersion: releaseSchema.shape.version.optional(), invocation: z.string(), args: z.array(z.string()) }).parse(JSON.parse(stdout));
    return { installedVersion, latestVersion: release.version, status: installed.launcherVersion && releaseStatus({ ...release, version: installed.launcherVersion }, release.version).status === 'update_available' ? 'ahead' as const : 'current' as const, updated: true, ...installed, activeVersion: installed.launcherVersion ?? installed.version,
      message: 'Continue with the stable command and the same profile. Restart an already running MCP bridge to load this version.' };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
