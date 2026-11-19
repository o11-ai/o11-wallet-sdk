import { executeSandboxCommand, sandboxCommandOutput } from './sandbox-execution.js';
import { publicKeyPattern } from './cli-sandbox-ssh-keys.js';
import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';

type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };

/**
 * Runs in the sandbox as its default exec user. Idempotent: it authorizes the o11 key for that user, then makes sure an
 * SSH server answers on 127.0.0.1:22. A server that already answers there (Boat's own sshd) is used as it is. Otherwise
 * it installs OpenSSH with the system package manager and starts a key-only sshd that listens on loopback only, so the
 * only way in is the o11 forward. It prints the user and the host key the server presents, which the CLI pins.
 * $1: the staged public key file. $2: the base64 part of a key to remove (after a rotation), or empty.
 */
export const sandboxSshSetupScript = String.raw`set -eu
staged="$1"; old="$2"
user="$(id -un)"; home="$HOME"
if [ "$(id -u)" = 0 ]; then S=""; else S="sudo -n"; fi
umask 077
mkdir -p "$home/.ssh"; chmod 700 "$home/.ssh"
keys="$home/.ssh/authorized_keys"; touch "$keys"
if [ -n "$old" ]; then grep -vF -- "$old" "$keys" > "$keys.o11-new" || true; mv -f "$keys.o11-new" "$keys"; fi
line="$(cat "$staged")"; rm -f "$staged"
grep -qxF -- "$line" "$keys" || printf '%s\n' "$line" >> "$keys"
chmod 600 "$keys"
answers() { timeout 4 bash -c 'exec 3<>/dev/tcp/127.0.0.1/22; IFS= read -r -t 3 banner <&3; case "$banner" in SSH-*) exit 0;; esac; exit 1' 2>/dev/null; }
# packages openssh: OpenSSH server and client plus rsync. packages: rsync only. Fails when no known package manager exists.
packages() {
  deb=""; rpm=""; if [ "$#" -gt 0 ]; then deb="openssh-server openssh-client"; rpm="openssh-server openssh-clients"; fi
  if command -v apt-get >/dev/null 2>&1; then
    $S env DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null
    $S env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends $deb rsync >/dev/null
  elif command -v dnf >/dev/null 2>&1; then $S dnf install -y -q $rpm rsync >/dev/null
  elif command -v yum >/dev/null 2>&1; then $S yum install -y -q $rpm rsync >/dev/null
  elif command -v apk >/dev/null 2>&1; then $S apk add -q $deb rsync >/dev/null
  else return 1; fi
}
mode=native
if ! answers; then
  mode=o11
  $S true 2>/dev/null || { echo "o11_ssh_needs_root: $user can't use sudo here, so o11 can't start an SSH server" >&2; exit 82; }
  sshd=""; for candidate in /usr/sbin/sshd /usr/bin/sshd /sbin/sshd; do [ -x "$candidate" ] && sshd="$candidate" && break; done
  if [ -z "$sshd" ] || ! command -v rsync >/dev/null 2>&1; then
    packages openssh || { echo "o11_ssh_no_package_manager: openssh-server didn't install. The sandbox needs a package manager and internet access; if its network policy is deny-all, allow egress first (o11 sandbox network-policy NAME --network-policy allow-all), then run this again" >&2; exit 83; }
    for candidate in /usr/sbin/sshd /usr/bin/sshd /sbin/sshd; do [ -x "$candidate" ] && sshd="$candidate" && break; done
    [ -n "$sshd" ] || { echo "o11_ssh_install_failed: openssh-server did not install" >&2; exit 84; }
  fi
  $S ssh-keygen -A >/dev/null
  $S mkdir -p /run/sshd /etc/o11-sshd; $S chmod 755 /run/sshd
  # With UsePAM off, OpenSSH refuses accounts whose password is locked ("!"), even for key logins. "*" means no password.
  if $S grep -q "^$user:!" /etc/shadow 2>/dev/null && command -v usermod >/dev/null 2>&1; then $S usermod -p '*' "$user"; fi
  printf '%s\n' 'Port 22' 'ListenAddress 127.0.0.1' 'HostKey /etc/ssh/ssh_host_ed25519_key' 'PubkeyAuthentication yes' \
    'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin no' 'AuthorizedKeysFile .ssh/authorized_keys' \
    'AllowTcpForwarding yes' 'X11Forwarding no' 'PrintMotd no' 'UsePAM no' 'Subsystem sftp internal-sftp' 'PidFile /run/o11-sshd.pid' \
    'AcceptEnv LANG LC_*' 'ClientAliveInterval 30' | $S tee /etc/o11-sshd/sshd_config >/dev/null
  $S "$sshd" -t -f /etc/o11-sshd/sshd_config
  $S setsid "$sshd" -f /etc/o11-sshd/sshd_config < /dev/null > /dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do answers && break; sleep 0.5; done
  answers || { echo "o11_ssh_start_failed: sshd did not start on 127.0.0.1:22" >&2; exit 85; }
fi
# rsync needs its own binary on both ends. Best effort: a sandbox without sudo or a package manager still gets ssh, scp and sftp.
if ! command -v rsync >/dev/null 2>&1 && $S true 2>/dev/null; then packages >/dev/null 2>&1 || true; fi
host="$(ssh-keyscan -t ed25519 -p 22 127.0.0.1 2>/dev/null | awk '$2 == "ssh-ed25519" { print $2 " " $3; exit }')"
[ -n "$host" ] || host="$(awk '{ print $1 " " $2 }' /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null)"
printf 'o11-ssh user=%s mode=%s\n' "$user" "$mode"
printf 'o11-ssh host=%s\n' "$host"
if command -v rsync >/dev/null 2>&1; then printf 'o11-ssh rsync=yes\n'; else printf 'o11-ssh rsync=no\n'; fi
`;

export type SandboxSshSetup = { user: string; mode: 'native' | 'o11'; hostKey: string; rsync: boolean };
const hostKeyPattern = /^ssh-ed25519 [A-Za-z0-9+/]{68}$/;

export function parseSandboxSshSetup(stdout: string): SandboxSshSetup {
  const user = /^o11-ssh user=([a-z_][a-z0-9_.-]{0,31}) mode=(native|o11)$/m.exec(stdout);
  const host = /^o11-ssh host=(.*)$/m.exec(stdout)?.[1]?.trim() ?? '';
  if (!user) throw new Error('The sandbox did not report its SSH user');
  if (!hostKeyPattern.test(host)) throw new Error("The sandbox's SSH server has no Ed25519 host key");
  return { user: user[1]!, mode: user[2] as 'native' | 'o11', hostKey: host, rsync: !/^o11-ssh rsync=no$/m.test(stdout) };
}

/** Uploads only the public key (files-write), then runs the setup script through o11's exec. */
export async function setupSandboxSsh(client: SandboxClient, id: string, publicKey: string, previous?: string): Promise<SandboxSshSetup> {
  if (!publicKeyPattern.test(publicKey)) throw new Error('The o11 SSH public key is malformed');
  const staged = `/tmp/o11-ssh-${crypto.randomUUID()}.pub`;
  await client.sandbox({ action: 'files-write', id, params: { path: staged, content: `${publicKey}\n` } });
  const old = previous && previous !== publicKey ? previous.split(' ')[1]! : '';
  const result = await executeSandboxCommand(client, { action: 'exec', id, params: { cmd: 'bash', args: ['-c', sandboxSshSetupScript, 'o11-ssh-setup', staged, old] } }, { timeoutMs: 300_000 });
  const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : {};
  const exitCode = Reflect.get(data, 'exitCode');
  const { stdout, stderr } = sandboxCommandOutput(result);
  if (exitCode !== 0) {
    const reason = /o11_ssh_[a-z_]+: [^\n]*/.exec(stderr)?.[0]?.replace(/^o11_ssh_[a-z_]+: /, '') ?? stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300);
    throw new Error(`Could not set up SSH in the sandbox (exit ${typeof exitCode === 'number' ? exitCode : result.status ?? 'unknown'})${reason ? `: ${reason}` : ''}`);
  }
  return parseSandboxSshSetup(stdout);
}
