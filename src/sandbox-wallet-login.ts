import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';
import { executeSandboxCommand, sandboxCommandOutput } from './sandbox-execution.js';

/**
 * Sign a sandbox in to o11 with its own key, so the agents and scheduled runs inside it use the o11 CLI and Ostack
 * as the sandbox's owner. o11 issues the key for this sandbox only (the o11-key action): tool-only, on the owner's
 * card, revoked when a newer key is issued or the sandbox is deleted. o11 writes the key straight into a private file
 * in the sandbox and never returns it; the sandbox's o11 login reads it from stdin and the file is removed.
 */
type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
const staging = '.o11-login';
const shellLiteral = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const lockPattern = /^\/[A-Za-z0-9._/-]+\/\.o11-login\/o11-key-lock\.[A-Za-z0-9]{6,}$/;

/**
 * Installs the o11 CLI from the wallet's own installer, or upgrades it when its version differs from the wallet's
 * current release, after checking the installer's SHA-256. install.sh reads its release from go.o11.ai unless
 * O11_WALLET_ORIGIN says otherwise, so the origin is passed: a dev wallet's sandbox gets that wallet's release.
 * Every download and install attempt is time-limited. Prints the installed version on its last line.
 */
export function o11InstallScript(origin: string) {
  const base = `${origin}/downloads`;
  const versionOf = 'python3 -I -c \'import json,sys;print(json.load(sys.stdin).get("version",""))\'';
  const fetch = (url: string, to: string) => `command curl -fsSL --proto '=https' --connect-timeout 15 --max-time 60 ${shellLiteral(url)} -o "${to}"`;
  return ['set -eu', 'umask 077',
    'o="$HOME/.local/share/o11-wallet/bin/o11"',
    '[ -x "$o" ] || o="$(command -v o11 2>/dev/null || true)"',
    't="$(mktemp -d)"; trap \'rm -rf -- "$t"\' EXIT',
    'limit() { if command -v timeout >/dev/null 2>&1; then timeout "$@"; else shift; "$@"; fi; }',
    fetch(`${base}/checksums.json`, '$t/checksums.json'),
    `want="$(${versionOf} < "$t/checksums.json")"`,
    `have=""; [ -n "$o" ] && have="$(limit 20 "$o" --version 2>/dev/null | ${versionOf} 2>/dev/null || true)"`,
    'if [ -z "$want" ] || [ "$have" != "$want" ]; then',
    `  ${fetch(`${base}/install.sh`, '$t/install.sh')}`,
    '  sum="$(python3 -I -c \'import json,sys;print(json.load(open(sys.argv[1]))["files"]["install.sh"]["sha256"])\' "$t/checksums.json")"',
    '  [ "$sum" = "$(sha256sum "$t/install.sh" | cut -d" " -f1)" ] || { echo "o11_installer_checksum_mismatch" >&2; exit 82; }',
    // A large download can drop mid-transfer, which curl's own --retry doesn't repeat.
    `  for i in 1 2 3; do limit 240 env O11_WALLET_ORIGIN=${shellLiteral(origin)} O11_NO_MODIFY_PATH=1 sh "$t/install.sh" >/dev/null && break; [ "$i" = 3 ] && exit 1; sleep 2; done`,
    '  o="$HOME/.local/share/o11-wallet/bin/o11"',
    'fi',
    'o="$(readlink -f "$o")"',
    // Scheduled runs call o11 by name, so link it where cron's PATH looks.
    'mkdir -p "$HOME/.local/bin"; ln -sf "$o" "$HOME/.local/bin/o11"',
    'grep -q \'.local/bin\' "$HOME/.profile" 2>/dev/null || printf \'export PATH="$HOME/.local/bin:$PATH"\\n\' >> "$HOME/.profile"',
    `"$o" --version | ${versionOf}`].join('\n');
}

/**
 * The o11 key has one fixed path (o11 writes only to <home>/.o11-login/o11-key), so concurrent sign-ins take turns:
 * a short-lived background holder takes an flock and keeps it until this run releases it (or 5 minutes pass). It
 * deletes this run's handle file once it holds the lock. Without flock or setsid the step runs unserialized.
 * Prints $HOME, then the handle (empty when unserialized).
 */
export const o11KeyLockScript = ['set -eu', 'umask 077', `s="$HOME/${staging}"`, 'mkdir -p -m 700 -- "$s"', 'r=""',
  // Release markers left by a holder that had already timed out.
  'find "$s" -mindepth 1 -maxdepth 1 -name \'o11-key-lock.*\' -mmin +30 -exec rm -f -- {} + 2>/dev/null || true',
  'if command -v flock >/dev/null 2>&1 && command -v setsid >/dev/null 2>&1; then',
  '  r="$(mktemp "$s/o11-key-lock.XXXXXXXX")"',
  '  setsid sh -c \'exec 9>"$1/o11-key.lock"; flock -w 240 9 || exit 1; rm -f -- "$2"; i=0; while [ ! -e "$2.done" ] && [ "$i" -lt 300 ]; do sleep 1; i=$((i+1)); done; rm -f -- "$2.done"\' sh "$s" "$r" </dev/null >/dev/null 2>&1 &',
  '  i=0; while [ -e "$r" ] && [ "$i" -lt 250 ]; do sleep 1; i=$((i+1)); done',
  '  [ ! -e "$r" ] || { rm -f -- "$r"; echo "o11_key_lock_busy" >&2; exit 75; }',
  'fi', 'printf \'%s\\n%s\' "$HOME" "$r"'].join('\n');
const release = (lock: string) => lock ? `: >${shellLiteral(`${lock}.done`)}` : ':';

/** Reads the staged key on stdin, signs the default profile in, and removes the file (and releases the lock) whatever happens. */
export function o11LoginScript(origin: string, lock = '') {
  return ['set -eu', 'umask 077', `f="$HOME/${staging}/o11-key"`, `trap 'rm -f -- "$f"; ${release(lock).replaceAll("'", "'\\''")}' EXIT`,
    'o="$HOME/.local/bin/o11"; [ -x "$o" ] || o="$(command -v o11)"',
    `"$o" login --server ${shellLiteral(origin)} --key-stdin < "$f" >/dev/null`,
    '"$o" setup >/dev/null 2>&1 || true', 'printf signed-in'].join('\n');
}

async function run(client: SandboxClient, id: string, command: string, timeoutMs = 300_000) {
  const result = await executeSandboxCommand(client, { action: 'exec', id, params: { command } }, { timeoutMs });
  const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : {};
  const exitCode = Reflect.get(data, 'exitCode'), { stdout, stderr } = sandboxCommandOutput(result);
  return { exitCode: typeof exitCode === 'number' ? exitCode : undefined, stdout, stderr };
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
    const issued = await client.sandbox({ action: 'o11-key', id, params: { path: `${home}/${staging}/o11-key` } });
    const keyId = issued.data && typeof issued.data === 'object' && !Array.isArray(issued.data) ? Reflect.get(issued.data, 'keyId') : undefined;
    signedIn = await run(client, id, o11LoginScript(origin, lock));
    if (signedIn.exitCode !== 0) throw new Error(`o11 sign-in failed in the sandbox (exit ${signedIn.exitCode ?? 'unknown'}): ${signedIn.stderr.trim().slice(0, 300)}`);
    return { agent: 'o11' as const, keyId: typeof keyId === 'string' ? keyId : undefined, version: installed.stdout.trim().split('\n').at(-1), refreshes: true };
  } finally {
    if (signedIn?.exitCode !== 0) await run(client, id, `rm -f -- "$HOME/${staging}/o11-key"; ${release(lock)}`).catch(() => undefined);
  }
}
