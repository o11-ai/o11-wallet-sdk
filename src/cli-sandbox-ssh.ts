import { readFile, writeFile, rename } from 'node:fs/promises';
import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';
import { selfInvocation } from './cli-update.js';
import { ensureSandboxKey, pinSandboxHostKey, sandboxSshAlias, sandboxSshFiles, saveSandboxSshState } from './cli-sandbox-ssh-keys.js';
import { installSshConfig, removeSshConfigBlock, sshConfigPath, sandboxSshHostBlock, sandboxSshOptions } from './cli-sandbox-ssh-config.js';
import { setupSandboxSsh } from './cli-sandbox-ssh-setup.js';
import { sandboxSshProxy } from './cli-sandbox-ssh-proxy.js';

type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
type Connection = { baseUrl: string; token: string; cardId?: string };
type Context = { client: SandboxClient; connection: () => Promise<Connection>; profile?: string; cardId?: string; jsonOutput: boolean };

export const sandboxSshActions = ['ssh', 'ssh-config', 'ssh-proxy', 'ssh-key'] as const;
const usage = {
  ssh: 'Use o11 sandbox ssh NAME [--rotate] [-- SSH_ARGS...]',
  'ssh-config': 'Use o11 sandbox ssh-config NAME [--install | --uninstall]',
  'ssh-proxy': 'Use o11 sandbox ssh-proxy NAME (ssh runs this as its ProxyCommand)',
  'ssh-key': 'Use o11 sandbox ssh-key NAME --rotate',
};

export function sandboxSshArguments(values: string[]) {
  const action = values[0] as typeof sandboxSshActions[number];
  if (!sandboxSshActions.includes(action)) throw new Error(usage.ssh);
  const allowed: Record<string, string[]> = { ssh: ['--rotate'], 'ssh-config': ['--install', '--uninstall'], 'ssh-proxy': [], 'ssh-key': ['--rotate'] };
  let id: string | undefined, sshArgs: string[] = [];
  const flags = new Set<string>();
  for (let index = 1; index < values.length; index++) {
    const word = values[index]!;
    if (word === '--') {
      if (action !== 'ssh') throw new Error(usage[action]);
      sshArgs = values.slice(index + 1); break;
    }
    if (word.startsWith('-')) {
      if (!allowed[action]!.includes(word) || flags.has(word)) throw new Error(usage[action]);
      flags.add(word); continue;
    }
    if (id) throw new Error(action === 'ssh' ? `${usage.ssh}. Put the remote command after --` : usage[action]);
    id = word;
  }
  if (!id || id.length > 128 || action === 'ssh-key' && !flags.has('--rotate') || flags.has('--install') && flags.has('--uninstall')) throw new Error(usage[action]);
  return { action, id, sshArgs, rotate: flags.has('--rotate'), install: flags.has('--install'), uninstall: flags.has('--uninstall') };
}

/**
 * The command ssh runs as ProxyCommand. After an automatic update this process runs from a versioned cache folder that
 * a later update replaces, so name the installed o11 launcher instead; it re-runs the newest release the same way.
 */
function launcher() {
  const installed = process.env.O11_CLI_UPDATE_REEXEC ? Bun.which('o11') : null;
  return installed ? [installed] : selfInvocation();
}

/** Resolves the sandbox, makes sure its key, sshd and host-key pin are current, and returns what ssh needs. */
async function prepare(context: Context, id: string, rotate = false) {
  const info = await context.client.sandbox({ action: 'info', id, params: {} });
  const sandbox = info.sandbox;
  if (!sandbox) throw new Error(`o11 could not find sandbox ${id}`);
  const label = sandbox.name ?? id;
  // A deleted (or deleting, or never created) sandbox can't be resumed; only a stopped or paused one can.
  if (['deleted', 'deleting', 'failed'].includes(sandbox.state ?? '')) throw new Error(`${label} is ${sandbox.state === 'failed' ? 'not created' : 'deleted'}. Create a new sandbox with o11 sandbox create.`);
  if (sandbox.state !== 'running') throw new Error(`${label} is ${sandbox.state}. Start it with o11 sandbox resume ${label}, then try again.`);
  const key = await ensureSandboxKey(sandbox.id, { rotate });
  const setup = await setupSandboxSsh(context.client, sandbox.id, key.publicKey, key.previous);
  if (!setup.rsync) process.stderr.write(`o11: rsync isn't installed in ${label} and o11 couldn't install it. Installing needs internet access to the package mirror; check o11 sandbox network-policy ${label}. ssh, scp and sftp work.\n`);
  const alias = sandboxSshAlias(sandbox.name ?? sandbox.id);
  await pinSandboxHostKey(key.files, alias, setup.hostKey);
  await saveSandboxSshState(key.files, { id: sandbox.id, name: sandbox.name ?? sandbox.id, provider: sandbox.provider, user: setup.user, alias });
  const proxy = [...launcher(), ...(context.profile ? ['--profile', context.profile] : []), ...(context.cardId ? ['--card', context.cardId] : []), 'sandbox', 'ssh-proxy', sandbox.id];
  return { sandbox, files: key.files, publicKey: key.publicKey, alias, setup, host: { id: sandbox.id, alias, user: setup.user, files: key.files, proxy } };
}

async function runSsh(args: string[]) {
  const child = Bun.spawn(['ssh', ...args], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
  const forward = (signal: NodeJS.Signals) => () => { try { child.kill(signal); } catch { /* Already gone. */ } };
  const onTerm = forward('SIGTERM'), onHup = forward('SIGHUP');
  process.on('SIGTERM', onTerm); process.on('SIGHUP', onHup);
  // ssh handles Ctrl-C itself (it reaches the remote shell in a session); this process only waits for it.
  const onInt = () => undefined; process.on('SIGINT', onInt);
  try { return await child.exited; } finally { process.off('SIGTERM', onTerm); process.off('SIGHUP', onHup); process.off('SIGINT', onInt); }
}

async function uninstall(id: string) {
  const path = sshConfigPath();
  const current = await readFile(path, 'utf8').catch(() => '');
  const next = removeSshConfigBlock(current, id);
  if (next === current) return { removed: false, path };
  const staged = `${path}.o11-${crypto.randomUUID()}`;
  await writeFile(staged, next, { mode: 0o600 }); await rename(staged, path);
  return { removed: true, path };
}

/** `o11 sandbox ssh|ssh-config|ssh-proxy|ssh-key`. Returns the exit code and anything left to print. */
export async function sandboxSsh(context: Context, values: string[]): Promise<{ exitCode: number; result?: unknown }> {
  const parsed = sandboxSshArguments(values);
  if (parsed.action === 'ssh-proxy') {
    const files = sandboxSshFiles(parsed.id);
    const outcome = await sandboxSshProxy(await context.connection(), parsed.id,
      { input: process.stdin, output: process.stdout, log: line => process.stderr.write(`${line}\n`) },
      async () => {
        process.stderr.write('o11: starting SSH in the sandbox again\n');
        const prepared = await prepare(context, parsed.id);
        if (prepared.files.directory !== files.directory) throw new Error('The sandbox changed while connecting');
      });
    process.stdin.destroy(); // Nothing more to relay; an open stdin would keep this process alive.
    return { exitCode: outcome.code };
  }
  if (parsed.action === 'ssh-config' && parsed.uninstall) {
    const info = await context.client.sandbox({ action: 'info', id: parsed.id, params: {} });
    return { exitCode: 0, result: await uninstall(info.sandbox?.id ?? parsed.id) };
  }
  const prepared = await prepare(context, parsed.id, parsed.rotate);
  if (parsed.action === 'ssh-key') return { exitCode: 0, result: { rotated: true, sandbox: prepared.sandbox.id, publicKey: prepared.publicKey, privateKey: prepared.files.key } };
  if (parsed.action === 'ssh-config') {
    const block = sandboxSshHostBlock(prepared.host);
    const installed = parsed.install ? await installSshConfig(prepared.sandbox.id, block) : undefined;
    if (context.jsonOutput) return { exitCode: 0, result: { host: prepared.alias, user: prepared.setup.user, sshd: prepared.setup.mode, config: block, ...(installed ? { installed } : {}) } };
    process.stdout.write(`${block}\n`);
    process.stderr.write(installed
      ? `Added to ${installed}. Connect with: ssh ${prepared.alias}   (scp, rsync, sftp, VS Code and Cursor Remote-SSH use the same name)\n`
      : `Add this to ~/.ssh/config, or run again with --install to add it for you. Then: ssh ${prepared.alias}\n`);
    return { exitCode: 0 };
  }
  const options = sandboxSshOptions(prepared.host).flatMap(([key, value]) => ['-o', `${key}=${value}`]);
  return { exitCode: await runSsh(['-F', 'none', ...options, prepared.alias, ...parsed.sshArgs]) };
}
