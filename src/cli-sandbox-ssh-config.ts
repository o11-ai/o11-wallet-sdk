import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SandboxSshFiles } from './cli-sandbox-ssh-keys.js';

export type HostBlockInput = { id: string; alias: string; user: string; files: SandboxSshFiles; proxy: string[] };

/** ssh runs ProxyCommand through a shell and expands %-tokens in it and in file paths; quote and escape for both. */
function quoted(value: string) {
  if (/["$`\\\r\n]/.test(value)) throw new Error(`o11 can't write an SSH config entry for a path with quotes, $, backticks or backslashes: ${value}`);
  return `"${value.replaceAll('%', '%%')}"`;
}

export function sandboxSshOptions(input: HostBlockInput): [string, string][] {
  return [
    ['User', input.user],
    ['IdentityFile', quoted(input.files.key)],
    ['IdentitiesOnly', 'yes'],
    ['UserKnownHostsFile', quoted(input.files.knownHosts)],
    ['GlobalKnownHostsFile', '/dev/null'],
    ['StrictHostKeyChecking', 'yes'],
    ['HostKeyAlias', input.alias],
    ['CheckHostIP', 'no'],
    ['UpdateHostKeys', 'no'],
    ['ProxyCommand', input.proxy.map(quoted).join(' ')],
    ['ServerAliveInterval', '30'],
  ];
}

const begin = (id: string) => `# >>> o11 sandbox ${id} >>>`;
const end = (id: string) => `# <<< o11 sandbox ${id} <<<`;

export function sandboxSshHostBlock(input: HostBlockInput) {
  return [begin(input.id), `# Managed by o11. Update with: o11 sandbox ssh-config ${input.id} --install`, `Host ${input.alias}`,
    ...sandboxSshOptions(input).map(([key, value]) => `  ${key} ${value}`), end(input.id)].join('\n');
}

/** Replace this sandbox's block, or add it at the top so it wins over a broad Host * further down. */
export function mergeSshConfig(current: string, id: string, block: string) {
  const start = current.indexOf(begin(id)), finish = current.indexOf(end(id));
  if (start >= 0 && finish > start) return current.slice(0, start) + block + current.slice(finish + end(id).length);
  return current.trim() ? `${block}\n\n${current}` : `${block}\n`;
}

export function removeSshConfigBlock(current: string, id: string) {
  const start = current.indexOf(begin(id)), finish = current.indexOf(end(id));
  if (start < 0 || finish <= start) return current;
  return (current.slice(0, start) + current.slice(finish + end(id).length)).replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

/** The ~/.ssh/config o11 edits. $HOME wins (Bun caches os.homedir()), so a test or a wrapper can point it elsewhere. */
export function sshConfigPath(home = process.env.HOME || homedir()) { return join(home, '.ssh', 'config'); }

/** Writes this sandbox's block into ~/.ssh/config. Only called with --install. */
export async function installSshConfig(id: string, block: string, path = sshConfigPath()) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const current = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return ''; throw error; });
  const next = mergeSshConfig(current, id, block);
  const staged = `${path}.o11-${crypto.randomUUID()}`;
  await writeFile(staged, next.endsWith('\n') ? next : `${next}\n`, { mode: 0o600 });
  await chmod(staged, 0o600);
  await rename(staged, path);
  return path;
}
