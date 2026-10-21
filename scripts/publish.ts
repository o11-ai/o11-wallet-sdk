import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { inspectArchive, integrity, packageName, reviewedFiles } from './artifacts';
import { assertPublicText } from './public-artifacts';

const root = resolve(import.meta.dir, '..');
const registry = 'https://registry.npmjs.org';
const repository = 'o11-ai/o11-wallet-sdk';
const workflow = `${repository}/.github/workflows/publish.yml@refs/heads/main`;
const mode = process.argv[2];
if (!['--check', '--publish'].includes(mode ?? '')) throw new Error('Use --check or --publish.');
const manifest = await Bun.file(join(root, 'package.json')).json() as {
  name: string; version: string; repository?: { url?: string };
};
if (manifest.name !== packageName || !/^\d+\.\d+\.\d+$/.test(manifest.version)
  || manifest.repository?.url !== `git+https://github.com/${repository}.git`) throw new Error('Unexpected wallet package identity.');

async function command(args: string[], cwd = root) {
  const child = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [output] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (await child.exited !== 0) throw new Error(`Release command failed: ${args[0]}.`);
  return output.trim();
}
async function credential() {
  const env = process.env;
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_WORKFLOW_REF !== workflow || !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '')
    || env.RUNNER_ENVIRONMENT !== 'github-hosted' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || env.NPM_CONFIG_TOKEN || env.NODE_AUTH_TOKEN || env.BUN_CONFIG_TOKEN) throw new Error('Use the authorized SDK release workflow.');
  if ((await command(['git', 'ls-remote', 'origin', 'refs/heads/main'])).split(/\s/)[0] !== env.GITHUB_SHA)
    throw new Error('A newer SDK revision superseded this release.');
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL ?? 'https://invalid.invalid');
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com') || url.username || url.password
    || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error('Missing GitHub publishing identity.');
  url.searchParams.set('audience', 'npm:registry.npmjs.org');
  const identityResponse = await fetch(url, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!identityResponse.ok) throw new Error(`GitHub identity returned HTTP ${identityResponse.status}.`);
  const identity = await identityResponse.json() as { value?: string };
  if (!identity.value) throw new Error('GitHub publishing identity missing.');
  const claims = JSON.parse(Buffer.from(identity.value.split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>;
  // The registry verifies the signature; reject scope mistakes before exchanging the identity.
  if (claims.iss !== 'https://token.actions.githubusercontent.com' || claims.aud !== 'npm:registry.npmjs.org'
    || claims.repository !== repository || claims.repository_id !== '1427937044' || claims.repository_owner_id !== '240864808'
    || claims.ref !== env.GITHUB_REF || claims.workflow_ref !== workflow || claims.sha !== env.GITHUB_SHA
    || claims.environment !== 'npm-production' || claims.runner_environment !== 'github-hosted'
    || typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now() + 30_000) throw new Error('SDK identity has the wrong scope.');
  const exchange = await fetch(`${registry}/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(packageName)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${identity.value}` }, redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (exchange.status !== 201) throw new Error(`npm authorization returned HTTP ${exchange.status}. Configure the package trusted publisher.`);
  const result = await exchange.json() as { token_type?: string; token?: string };
  if (result.token_type !== 'oidc' || !result.token || /[\r\n]/.test(result.token)) throw new Error('Invalid npm publishing credential.');
  return result.token;
}
async function lookup(digest: string) {
  const response = await fetch(`${registry}/${encodeURIComponent(packageName)}/${manifest.version}`, {
    redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'Cache-Control': 'no-cache' },
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`npm lookup returned HTTP ${response.status}.`);
  const value = await response.json() as { name?: string; version?: string; dist?: { tarball?: string; integrity?: string } };
  if (value.name !== packageName || value.version !== manifest.version
    || value.dist?.tarball !== `${registry}/${packageName}/-/sdk-${manifest.version}.tgz`) throw new Error('Unexpected npm package identity.');
  const download = await fetch(value.dist.tarball, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!download.ok || Number(download.headers.get('content-length')) > 16 * 1024 * 1024) throw new Error('npm package download failed.');
  const reader = download.body?.getReader();
  if (!reader) throw new Error('Empty npm package.');
  const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value: part } = await reader.read();
      if (done) break;
      size += part.length;
      if (size > 16 * 1024 * 1024) throw new Error('npm package exceeds the reviewed size limit.');
      parts.push(part);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(parts);
  if (integrity(bytes) !== value.dist.integrity || inspectArchive(bytes, manifest.version).digest !== digest)
    throw new Error('This version contains different files on npm. Bump the SDK version before publishing.');
  return true;
}

const temporary = await mkdtemp(join(tmpdir(), 'o11-sdk-release-'));
try {
  const staging = join(temporary, 'package');
  for (const path of reviewedFiles) {
    const bytes = await readFile(join(root, path));
    assertPublicText(bytes.toString(), path);
    await mkdir(dirname(join(staging, path)), { recursive: true });
    await writeFile(join(staging, path), bytes, { mode: path === 'cli.js' ? 0o755 : 0o644 });
  }
  const archive = join(temporary, 'sdk.tgz');
  await command(['bun', 'pm', 'pack', '--ignore-scripts', '--filename', archive], staging);
  const reviewed = inspectArchive(await readFile(archive), manifest.version);
  let confirmed = await lookup(reviewed.digest);
  console.log(`${packageName}@${manifest.version}: ${reviewedFiles.length} approved files; ${confirmed ? 'matching npm release exists' : 'not yet published'}.`);
  if (mode === '--publish') {
    const token = await credential();
    if (!confirmed) {
      await writeFile(join(temporary, 'package.json'), JSON.stringify({ name: packageName, version: manifest.version }));
      await writeFile(join(temporary, 'bunfig.toml'), `[install.scopes]\no11 = { url = "${registry}", token = "$NPM_CONFIG_TOKEN" }\n`);
      const child = Bun.spawn(['bun', 'publish', '--ignore-scripts', '--access', 'public', '--tag', 'latest', archive], {
        cwd: temporary, env: { PATH: process.env.PATH, HOME: temporary, CI: 'true', NPM_CONFIG_TOKEN: token },
        stdout: 'pipe', stderr: 'pipe', stdin: 'ignore',
      });
      const [code] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      console.log(`Package upload exited ${code}; checking the registry before deciding whether to retry.`);
    }
    for (let attempt = 0; !confirmed && attempt < 20; attempt++) {
      confirmed = await lookup(reviewed.digest);
      if (!confirmed) await Bun.sleep(15_000);
    }
    if (!confirmed) throw new Error('npm has not confirmed this release. Retry this workflow without changing this version.');
    console.log(`${packageName}@${manifest.version} is published and verified.`);
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
