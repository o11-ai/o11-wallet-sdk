import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';
import { O11_KEY_FILE, o11InstallScript, o11KeyLockScript, o11KeyReleaseScript, o11LoginScript } from './ostack/src/index.js';
import { executeSandboxCommand, sandboxCommandOutput } from './sandbox-execution.js';

/**
 * Sign a sandbox in to o11 with its own key, so the agents and scheduled runs inside it use the o11 CLI and Ostack
 * as the sandbox's owner. o11 issues the key for this sandbox only (the o11-key action): tool-only, on the owner's
 * card, revoked when a newer key is issued or the sandbox is deleted. o11 writes the key straight into a private file
 * in the sandbox and never returns it; the sandbox's o11 login reads it from stdin and the file is removed.
 */
type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
const lockPattern = /^\/[A-Za-z0-9._/-]+\/\.o11-login\/o11-key-lock\.[A-Za-z0-9]{6,}$/;
export { o11InstallScript, o11KeyLockScript, o11LoginScript };

async function run(client: SandboxClient, id: string, command: string, timeoutMs = 300_000) {
  const result = await executeSandboxCommand(client, { action: 'exec', id, params: { command } }, { timeoutMs });
  const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : {};
  const exitCode = Reflect.get(data, 'exitCode'), { stdout, stderr } = sandboxCommandOutput(result);
  return { exitCode: typeof exitCode === 'number' ? exitCode : undefined, stdout, stderr };
}

/** Whether the sandbox's o11 login still reaches this o11 (o11 doctor asks the server, so a revoked key reads as not connected). */
export async function sandboxO11LoginWorks(client: SandboxClient, id: string, origin: string) {
  const checked = await run(client, id, `o="$HOME/.local/bin/o11"; [ -x "$o" ] || o="$(command -v o11)" || exit 3; "$o" doctor 2>/dev/null`, 60_000).catch(() => undefined);
  if (checked?.exitCode !== 0) return false;
  try {
    const doctor = JSON.parse(checked.stdout) as unknown;
    if (!doctor || typeof doctor !== 'object') return false;
    const server = Reflect.get(doctor, 'server');
    return Reflect.get(doctor, 'connected') === true && (typeof server !== 'string' || new URL(server).origin === new URL(origin).origin);
  } catch { return false; }
}

export async function signInSandboxToO11(client: SandboxClient, id: string, origin: string) {
  const installed = await run(client, id, o11InstallScript(origin));
  if (installed.exitCode !== 0) throw new Error(`Could not install o11 in the sandbox (exit ${installed.exitCode ?? 'unknown'}): ${installed.stderr.trim().slice(0, 300)}`);
  const prepared = await run(client, id, o11KeyLockScript);
  const [home = '', lock = ''] = prepared.stdout.split('\n').map(line => line.trim());
  if (prepared.exitCode === 75) throw new Error('Another o11 sign-in is running in this sandbox. Try again in a few minutes.');
  if (prepared.exitCode !== 0 || !home.startsWith('/') || !/^\/[A-Za-z0-9._/-]+$/.test(home) || lock && !lockPattern.test(lock)) throw new Error('Could not prepare the sandbox for o11 sign-in');
  let signedIn: Awaited<ReturnType<typeof run>> | undefined;
  try {
    // o11 writes the key into this file itself and never returns it.
    const issued = await client.sandbox({ action: 'o11-key', id, params: { path: `${home}/${O11_KEY_FILE}` } });
    const keyId = issued.data && typeof issued.data === 'object' && !Array.isArray(issued.data) ? Reflect.get(issued.data, 'keyId') : undefined;
    signedIn = await run(client, id, o11LoginScript(origin, lock));
    if (signedIn.exitCode !== 0) throw new Error(`o11 sign-in failed in the sandbox (exit ${signedIn.exitCode ?? 'unknown'}): ${signedIn.stderr.trim().slice(0, 300)}`);
    return { agent: 'o11' as const, keyId: typeof keyId === 'string' ? keyId : undefined, version: installed.stdout.trim().split('\n').at(-1), refreshes: true };
  } finally {
    if (signedIn?.exitCode !== 0) await run(client, id, `rm -f -- "$HOME/${O11_KEY_FILE}"; ${o11KeyReleaseScript(lock)}`).catch(() => undefined);
  }
}
