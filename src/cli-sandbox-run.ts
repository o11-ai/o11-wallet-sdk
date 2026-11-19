import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';
import { openLink } from './avatar-arguments.js';
import { excludeArguments, linksToSkip, removeEscapingLinks } from './cli-sandbox-tar-safety.js';
import { executeSandboxCommand, sandboxCommandOutput } from './sandbox-execution.js';
import { pipesStdin, pumpSandboxStdin } from './cli-sandbox-stdin.js';

type Client = { sandbox(input: SandboxInput): Promise<SandboxResult>; sandboxDownload(id: string, path: string): Promise<Response> };
type Relay = { baseUrl: string; token: string; cardId?: string };
type Json = SandboxInput['params'][string];
const object = (value: unknown): Record<string, Json> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json> : {};
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const UPLOAD_LIMIT = 4 * 1024 * 1024;
const RUNNING = new Set(['running', 'ready', 'started']);
function exitCodeOf(result: SandboxResult) {
  const data = { ...object(object(result.data).command), ...object(result.data) };
  return typeof data.exitCode === 'number' && Number.isInteger(data.exitCode) ? data.exitCode : undefined;
}
async function poll(client: Client, id: string, commandId: string) {
  for (let attempt = 0; attempt < 600; attempt++) {
    const status = await client.sandbox({ action: 'command-status', id, params: { commandId } });
    const code = exitCodeOf(status);
    if (code !== undefined) return code;
    await Bun.sleep(1000);
  }
  throw new Error(`The command is still running. Check it with o11 sandbox command-status ${id} --command-id ${commandId}`);
}
/** Prints a command's output as it is written, through the o11 logs relay. Falls back to reading logs when the relay is closed to this sandbox. */
export async function sandboxAttach(client: Client, relay: Relay, id: string, commandId: string, out = { stdout: process.stdout, stderr: process.stderr }): Promise<number> {
  const printed = { stdout: 0, stderr: 0 };
  for (let round = 0; round < 50; round++) {
    const url = new URL(`/v1/sandbox-relay/${encodeURIComponent(id)}/logs/${encodeURIComponent(commandId)}`, relay.baseUrl);
    // Only Boat sends reconnect lines; resume after them at the bytes already printed.
    if (round > 0) { url.searchParams.set('stdoutOffset', String(printed.stdout)); url.searchParams.set('stderrOffset', String(printed.stderr)); }
    const response = await fetch(url, { redirect: 'error', headers: { Authorization: `Bearer ${relay.token}`, ...(relay.cardId ? { 'x-o11-card-id': relay.cardId } : {}) } });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      const code = await poll(client, id, commandId);
      const logs = await client.sandbox({ action: 'logs', id, params: { commandId } });
      const streams = sandboxCommandOutput(logs);
      out.stdout.write(Buffer.from(streams.stdout).subarray(printed.stdout)); out.stderr.write(Buffer.from(streams.stderr).subarray(printed.stderr));
      return code;
    }
    let exit: number | undefined, reconnect = false, rest = '';
    const decoder = new TextDecoder();
    const handle = (line: string) => {
      if (!line.trim()) return;
      const frame = object(JSON.parse(line));
      const stream = frame.type === 'stdout' || frame.type === 'stderr' ? frame.type : frame.stream === 'stdout' || frame.stream === 'stderr' ? frame.stream : undefined;
      if (stream && typeof frame.data === 'string') {
        const bytes = Buffer.from(frame.data);
        // Skip any bytes already printed if Boat replays from an earlier offset.
        const end = typeof frame.nextOffset === 'number' ? frame.nextOffset : printed[stream] + bytes.length, start = end - bytes.length;
        if (end > printed[stream]) { out[stream].write(bytes.subarray(Math.max(0, printed[stream] - start))); printed[stream] = end; }
      } else if (frame.type === 'exit') exit = typeof frame.exitCode === 'number' ? frame.exitCode : 1;
      else if (frame.type === 'reconnect') reconnect = true;
      else if (frame.type === 'error') throw new Error(`The command stream failed: ${String(frame.message ?? frame.error ?? 'unknown error')}`);
    };
    const reader = response.body.getReader();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        rest += decoder.decode(part.value, { stream: true });
        const lines = rest.split('\n'); rest = lines.pop() ?? '';
        for (const line of lines) handle(line);
      }
      handle(rest + decoder.decode());
    } finally { await reader.cancel().catch(() => undefined); }
    if (exit !== undefined) return exit;
    if (!reconnect) {
      const code = await poll(client, id, commandId);
      const streams = sandboxCommandOutput(await client.sandbox({ action: 'logs', id, params: { commandId } }));
      out.stdout.write(Buffer.from(streams.stdout).subarray(printed.stdout)); out.stderr.write(Buffer.from(streams.stderr).subarray(printed.stderr));
      return code;
    }
  }
  throw new Error('The command stream reconnected too many times');
}
async function run(argv: string[], cwd?: string, input?: Uint8Array) {
  const child = Bun.spawn(argv, { cwd, stdin: input ?? 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).arrayBuffer(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`${argv[0]} failed: ${stderr.trim().slice(0, 300)}`);
  return new Uint8Array(stdout);
}
async function packDirectory(dir: string) {
  if (!(await stat(dir)).isDirectory()) throw new Error(`${dir} is not a directory`);
  let list: Uint8Array | undefined;
  try { list = await run(['git', '-C', dir, 'ls-files', '-co', '--exclude-standard', '-z']); } catch { /* Not a git checkout: send everything but .git. */ }
  const archive = list ? await run(['tar', '-czf', '-', '--null', '-T', '-'], dir, list) : await run(['tar', '-czf', '-', '--exclude=./.git', '.'], dir);
  if (archive.byteLength > UPLOAD_LIMIT) throw new Error(`The folder is ${Math.ceil(archive.byteLength / 1024 / 1024)} MiB compressed. o11 copies folders up to 4 MiB compressed.`);
  return archive;
}
async function shell(client: Client, id: string, command: string) {
  const result = await executeSandboxCommand(client, { action: 'exec', id, params: { command } }, { timeoutMs: 300_000 });
  const code = exitCodeOf(result);
  if (code !== 0) throw new Error(`The sandbox command failed (exit ${code ?? 'unknown'}): ${sandboxCommandOutput(result).stderr.trim().slice(0, 300)}`);
}
async function home(client: Client, id: string) {
  const info = await client.sandbox({ action: 'info', id, params: {} });
  if (info.sandbox?.provider === 'vercel') return '/vercel/sandbox';
  // Boat runs commands as its sandbox user; ask the guest for that user's home folder.
  const result = await executeSandboxCommand(client, { action: 'exec', id, params: { command: 'printf %s "$HOME"' } }, { timeoutMs: 60_000 });
  const path = sandboxCommandOutput(result).stdout.trim();
  if (exitCodeOf(result) !== 0 || !path.startsWith('/')) throw new Error('Could not read the sandbox home folder');
  return path;
}
/** Copies a local folder into the sandbox as one archive. In a git checkout only tracked and unignored files are sent. */
export async function sandboxPushDirectory(client: Client, id: string, dir: string, to?: string) {
  const archive = await packDirectory(resolve(dir));
  const target = to ?? `${await home(client, id)}/${basename(resolve(dir))}`;
  const remote = `/tmp/o11-push-${crypto.randomUUID()}.tgz`;
  await client.sandbox({ action: 'files-write', id, params: { path: remote, content: Buffer.from(archive).toString('base64'), encoding: 'base64' } });
  await shell(client, id, `mkdir -p ${quote(target)} && tar -xzf ${quote(remote)} -C ${quote(target)}; status=$?; rm -f ${quote(remote)}; exit $status`);
  return { pushed: true, path: target, bytes: archive.byteLength };
}
/**
 * Copies a sandbox folder to a new or empty local folder as one archive. .git is left out, as push does. The archive comes
 * from the sandbox, so it gets the snapshot-download checks: no absolute or `..` paths, and no links that point outside.
 */
export async function sandboxPullDirectory(client: Client, id: string, from: string, dir: string, force = false) {
  const local = resolve(dir);
  const existing = await readdir(local).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
  if (existing.length && !force) throw new Error(`${local} is not empty. Use --force to copy into it anyway.`);
  const remote = `/tmp/o11-pull-${crypto.randomUUID()}.tgz`;
  await shell(client, id, `tar -czf ${quote(remote)} --exclude=.git -C ${quote(from)} .`);
  let bytes: Uint8Array;
  try {
    try { bytes = new Uint8Array(await (await client.sandboxDownload(id, remote)).arrayBuffer()); }
    catch {
      const read = object((await client.sandbox({ action: 'files-read', id, params: { path: remote, encoding: 'base64' } })).data);
      if (typeof read.content !== 'string') throw new Error('o11 could not read the folder archive');
      bytes = Buffer.from(read.content, 'base64');
    }
  } finally { await shell(client, id, `rm -f ${quote(remote)}`).catch(() => undefined); }
  const scratch = await mkdtemp(join(tmpdir(), 'o11-pull-')), archive = join(scratch, 'folder.tgz'), tree = join(scratch, 'tree');
  let skipped = 0;
  try {
    await writeFile(archive, bytes, { mode: 0o600 });
    const skip = await linksToSkip(archive, ['gzip', '-dc']);
    await mkdir(tree);
    // The sandbox made the archive, so .git is dropped here too, not only by the sandbox's tar.
    await run(['tar', '-xzf', archive, '-C', tree, '--no-same-owner', '--exclude=.git', ...await excludeArguments(archive, skip)]);
    skipped = skip.length + await removeEscapingLinks(tree);
    await mkdir(local, { recursive: true });
    await run(['cp', '-a', `${tree}/.`, `${local}/`]);
  } finally { await rm(scratch, { recursive: true, force: true }); }
  return { pulled: true, path: local, bytes: bytes.byteLength, ...(skipped ? { skippedLinks: skipped } : {}) };
}
async function waitRunning(client: Client, id: string) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const info = await client.sandbox({ action: 'info', id, params: {} });
    if (RUNNING.has(info.sandbox?.state ?? '')) return;
    if (['failed', 'deleted', 'stopped'].includes(info.sandbox?.state ?? '')) throw new Error(`The sandbox is ${info.sandbox?.state}`);
    await Bun.sleep(2000);
  }
  throw new Error('The sandbox did not start within 3 minutes');
}
/** o11 sandbox run [--provider P] [create flags] [--push DIR] [--keep] -- COMMAND [ARG...]. Without a NAME it is a one-shot run. */
const runSwitches = new Set(['--attach', '--json', '-j', '--detached', '--detach', '--stdin', '--rm', '--stop', '--keep', '--auto-pause', '--auto-resume', '--no-internet', '--persistent', '--no-env']);
export function isOneShotRun(args: string[]) {
  const split = args.indexOf('--');
  if (args[0] !== 'run' || split < 0) return false;
  // A bare word that isn't a flag's value is a sandbox NAME: run NAME [--attach] -- CMD runs in that sandbox.
  for (let index = 1; index < split; index++) {
    const word = args[index]!;
    if (!word.startsWith('-')) return false;
    if (!word.includes('=') && !runSwitches.has(word)) index++;
  }
  return true;
}
export function sandboxRunArguments(args: string[]) {
  const split = args.indexOf('--');
  if (args[0] !== 'run' || split < 0 || !args[split + 1]) throw new Error('Use o11 sandbox run [--provider e2b|boat|vercel] [--push DIR] [--workdir DIR] [--rm|--stop|--keep] -- COMMAND [ARG...]');
  const flags = args.slice(1, split), command = args.slice(split + 1);
  let push: string | undefined, workdir: string | undefined, after: 'delete' | 'stop' | 'keep' | undefined;
  const create: string[] = [];
  const end = (value: 'delete' | 'stop' | 'keep') => { if (after && after !== value) throw new Error('Choose one of --rm, --stop or --keep'); after = value; };
  for (let index = 0; index < flags.length; index++) {
    if (flags[index] === '--push') { push = flags[++index]; if (!push) throw new Error('Supply a folder after --push'); }
    else if (flags[index] === '--workdir' || flags[index] === '-w') { workdir = flags[++index]; if (!workdir) throw new Error('Supply a folder after --workdir'); }
    else if (flags[index] === '--rm') end('delete');
    else if (flags[index] === '--stop') end('stop');
    else if (flags[index] === '--keep') end('keep');
    else if (!flags[index]!.startsWith('-') && !create.at(-1)?.startsWith('--')) throw new Error('run creates its own sandbox. To run in an existing one, use exec NAME.');
    else create.push(flags[index]!);
  }
  if (!create.includes('--agents')) create.push('--agents', 'none');
  return { create: ['create', ...create], command, push, workdir, after: after ?? 'delete' };
}
/** The provider's own reason (and any provider o11 skipped) instead of only the operation ID. */
export function createFailure(created: { requestId?: string; data?: unknown; sizing?: unknown }) {
  const reason = object(created.data).reason, skipped = object(created.sizing).skipped;
  const tried = Array.isArray(skipped) ? skipped.map(row => `${String(object(row).provider)}: ${String(object(row).reason)}`) : [];
  const why = [typeof reason === 'string' ? reason : '', ...tried.filter(line => typeof reason !== 'string' || !line.endsWith(reason))].filter(Boolean).join(' ');
  return `The sandbox was not created${why ? `. ${why}` : ''}${created.requestId ? `. Details: o11 sandbox operation ${created.requestId}` : ''}`;
}
export async function sandboxRun(client: Client, relay: Relay, args: string[], buildCreate: (words: string[]) => Promise<SandboxInput>, log = (line: string) => process.stderr.write(line + '\n')) {
  const options = sandboxRunArguments(args);
  const created = await executeSandboxCommand(client, await buildCreate(options.create));
  const id = created.sandbox?.id;
  if (!id || ['failed', 'unknown'].includes(created.status ?? '')) throw new Error(createFailure(created));
  log(`o11: sandbox ${created.sandbox!.name} (${id})`);
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned || options.after === 'keep') return; cleaned = true;
    const action = options.after === 'stop' ? 'stop' : 'delete';
    try { await client.sandbox({ action, id, params: {} }); log(`o11: sandbox ${action === 'stop' ? 'stopped' : 'deleted'}`); }
    catch { log(`o11: ${action} failed. Run o11 sandbox ${action} ${id}`); }
  };
  const interrupt = () => { void cleanup().finally(() => process.exit(130)); };
  process.once('SIGINT', interrupt);
  const started = Date.now();
  try {
    await waitRunning(client, id);
    let cwd = options.workdir;
    if (options.push) { const pushed = (await sandboxPushDirectory(client, id, options.push)).path; cwd ??= pushed; }
    const command = options.command.map(quote).join(' ');
    const submitted = await client.sandbox({ action: 'exec', id, params: { command: cwd ? `cd ${quote(cwd)} && ${command}` : command, detached: true } });
    const commandId = object(submitted.data).commandId;
    if (typeof commandId !== 'string') throw new Error('The sandbox did not return a command ID');
    const code = await sandboxAttach(client, relay, id, commandId);
    log(`o11: exit ${code} after ${Math.round((Date.now() - started) / 1000)} s${options.after === 'keep' ? `; sandbox kept: ${id}` : ''}`);
    return code;
  } finally {
    process.off('SIGINT', interrupt);
    await cleanup();
  }
}
const remotePath = (value: string) => { const split = value.indexOf(':'); return split > 0 && !/^[A-Za-z]:[\\/]/.test(value) ? { id: value.slice(0, split), path: value.slice(split + 1) } : undefined; };
export const isSandboxComposite = (args: string[]) => isOneShotRun(args) || ['push', 'attach', 'desktop', 'browser'].includes(args[0] ?? '') ||
  ['exec', 'run'].includes(args[0] ?? '') && (args.includes('--attach') || args[0] === 'exec' && pipesStdin(args)) || ['copy', 'cp', 'scp'].includes(args[0] ?? '') && (args.includes('-r') || args.includes('--recursive'));
/** Folder copy, push, attach and one-shot run. Returns undefined for any other sandbox command. */
export async function sandboxComposite(client: Client, relay: Relay, args: string[], buildCreate: (words: string[]) => Promise<SandboxInput>): Promise<{ result?: unknown; exitCode: number } | undefined> {
  const verb = args[0] ?? '';
  if (isOneShotRun(args)) return { exitCode: await sandboxRun(client, relay, args, buildCreate) };
  if (['copy', 'cp', 'scp'].includes(verb) && (args.includes('-r') || args.includes('--recursive'))) {
    const [source, target, ...extra] = args.slice(1).filter(word => !['-r', '--recursive', '--json', '-j', '--force'].includes(word));
    if (!source || !target || extra.length) throw new Error('Use o11 sandbox copy -r LOCAL_DIR NAME:PATH or copy -r NAME:PATH LOCAL_DIR [--force]');
    const from = remotePath(source), to = remotePath(target), force = args.includes('--force');
    if (Boolean(from) === Boolean(to)) throw new Error('Copy needs one local folder and one NAME:PATH');
    if (to && force) throw new Error('--force is for copying a folder out of a sandbox into a local folder that is not empty');
    return { exitCode: 0, result: to ? await sandboxPushDirectory(client, to.id, source, to.path) : await sandboxPullDirectory(client, from!.id, from!.path, target, force) };
  }
  if (verb === 'push') {
    const [id, dir, ...rest] = args.slice(1).filter(word => !['--json', '-j'].includes(word));
    if (!id || !dir || rest.length && (rest.length !== 2 || rest[0] !== '--to')) throw new Error('Use o11 sandbox push NAME DIR [--to PATH]');
    return { exitCode: 0, result: await sandboxPushDirectory(client, id, dir, rest[1]) };
  }
  if (['exec', 'run'].includes(verb) && (args.includes('--attach') || verb === 'exec' && pipesStdin(args))) {
    const input = await buildCreate(['exec', ...args.slice(1).filter(word => word !== '--attach')]);
    const submitted = await client.sandbox({ ...input, params: { ...input.params, detached: true } });
    const commandId = object(submitted.data).commandId;
    if (!input.id || typeof commandId !== 'string') return { exitCode: 2, result: submitted };
    // Piped input goes in while the output streams out; a failed upload stops the command instead of leaving it waiting.
    const pump = input.params.stdin === true && !process.stdin.isTTY ? pumpSandboxStdin(client, input.id, commandId).catch(async (error: unknown) => {
      await client.sandbox({ action: 'command-stop', id: input.id!, params: { commandId } }).catch(() => undefined);
      throw error;
    }) : undefined;
    const [exitCode] = await Promise.all([sandboxAttach(client, relay, input.id, commandId), pump]);
    return { exitCode };
  }
  if (verb === 'desktop' || verb === 'browser') {
    // Vercel installs its desktop on first use and answers "still installing" until it is up; wait for it here.
    const input = await buildCreate(args);
    const { open, browserOnly, ...params } = input.params;
    const request = { ...input, action: verb === 'browser' || browserOnly === true ? 'browser' : 'desktop', params };
    // Each request waits about 20 s in o11; the first install takes about a minute, slower images up to a few.
    for (const started = Date.now(); ;) {
      try {
        const result = await client.sandbox(request);
        const url = object(result.data).url;
        return { exitCode: 0, result: open === true && typeof url === 'string' ? { ...result, opened: await openLink(url) } : result };
      } catch (error) {
        // client.sandbox wraps the wallet error; its message is in cause.response.message.
        const response = object(object((error as { cause?: unknown }).cause).response);
        const message = `${error instanceof Error ? error.message : ''} ${typeof response.message === 'string' ? response.message : ''}`;
        const waited = Math.round((Date.now() - started) / 1000);
        if (waited > 360 || !message.includes('still installing')) throw error;
        process.stderr.write(`The desktop is still installing (${waited} s so far, about a minute the first time). Waiting...\n`);
        await Bun.sleep(5_000);
      }
    }
  }
  if (verb === 'attach') {
    const id = args[1], flag = args.indexOf('--command-id'), commandId = flag > 0 ? args[flag + 1] : undefined;
    if (!id || id.startsWith('-') || !commandId) throw new Error('Use o11 sandbox attach NAME --command-id ID');
    return { exitCode: await sandboxAttach(client, relay, id, commandId) };
  }
  return undefined;
}
