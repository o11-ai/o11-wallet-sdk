import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * o11-managed SSH material for one sandbox, kept beside the o11 login (O11_TOOLS_CONFIG_DIR or ~/.config/o11-wallet).
 * The private key is created here and never leaves this computer; only the public key goes to the sandbox.
 */
export type SandboxSshFiles = { directory: string; key: string; publicKey: string; knownHosts: string; state: string };
export type SandboxSshState = { id: string; name: string; provider: string; user: string; alias: string };

const sandboxIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
export const publicKeyPattern = /^ssh-ed25519 [A-Za-z0-9+/]{68}(?: [A-Za-z0-9._@:-]{0,100})?$/;

export function sandboxSshRoot() { return join(process.env.O11_TOOLS_CONFIG_DIR ?? join(homedir(), '.config', 'o11-wallet'), 'sandbox-ssh'); }

export function sandboxSshFiles(id: string): SandboxSshFiles {
  if (!sandboxIdPattern.test(id)) throw new Error('The sandbox ID is not valid for SSH');
  const directory = join(sandboxSshRoot(), id);
  return { directory, key: join(directory, 'id_ed25519'), publicKey: join(directory, 'id_ed25519.pub'), knownHosts: join(directory, 'known_hosts'), state: join(directory, 'state.json') };
}

/** Host name in ~/.ssh/config: o11-NAME, limited to characters ssh accepts without quoting. */
export function sandboxSshAlias(name: string) {
  const clean = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `o11-${clean || 'sandbox'}`;
}

async function exists(path: string) { return stat(path).then(() => true, () => false); }

async function keygen(path: string) {
  const child = Bun.spawn(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'o11-sandbox', '-f', path], { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' });
  const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(`ssh-keygen failed: ${error.trim().slice(0, 200) || `exit ${code}`}. Install OpenSSH to use o11 sandbox ssh.`);
}

async function readPublicKey(path: string) {
  const line = (await readFile(path, 'utf8')).trim();
  if (!publicKeyPattern.test(line)) throw new Error(`The o11 SSH key at ${path} is not an Ed25519 public key. Run with --rotate to replace it.`);
  return line;
}

/** The sandbox's key pair: created on first use, replaced with rotate. Returns the previous public key after a rotation. */
export async function ensureSandboxKey(id: string, options: { rotate?: boolean } = {}) {
  const files = sandboxSshFiles(id);
  await mkdir(files.directory, { recursive: true, mode: 0o700 });
  await chmod(files.directory, 0o700);
  const present = await exists(files.key) && await exists(files.publicKey);
  if (present && !options.rotate) {
    await chmod(files.key, 0o600);
    return { files, publicKey: await readPublicKey(files.publicKey), previous: undefined };
  }
  const previous = present ? await readPublicKey(files.publicKey).catch(() => undefined) : undefined;
  const staged = join(files.directory, `.id_ed25519-${crypto.randomUUID()}`);
  try {
    await keygen(staged);
    await chmod(staged, 0o600);
    const publicKey = await readPublicKey(`${staged}.pub`);
    await rename(`${staged}.pub`, files.publicKey);
    await rename(staged, files.key);
    return { files, publicKey, previous };
  } finally { await rm(staged, { force: true }); await rm(`${staged}.pub`, { force: true }); }
}

/** Pins the host key that o11 read from inside the sandbox. Only this file is used, so the user's known_hosts never changes. */
export async function pinSandboxHostKey(files: SandboxSshFiles, alias: string, hostKey: string) {
  await writeFile(files.knownHosts, `${alias} ${hostKey}\n`, { mode: 0o600 });
  await chmod(files.knownHosts, 0o600);
}

export async function saveSandboxSshState(files: SandboxSshFiles, state: SandboxSshState) {
  await writeFile(files.state, `${JSON.stringify(state)}\n`, { mode: 0o600 });
}

export async function readSandboxSshState(files: SandboxSshFiles): Promise<SandboxSshState | undefined> {
  try {
    const value = JSON.parse(await readFile(files.state, 'utf8')) as Partial<SandboxSshState>;
    return typeof value.user === 'string' && typeof value.alias === 'string' && typeof value.id === 'string' ? value as SandboxSshState : undefined;
  } catch { return undefined; }
}
