import type { ToolClient } from './client.js';
import type { ToolConfig } from './config.js';
import { sandboxRequest, sandboxExitCode } from './cli-sandbox.js';
import { sandboxTerminal, sandboxBrowserTerminal, sandboxPrivatePreview } from './cli-sandbox-terminal.js';
import { sandboxCopy } from './cli-sandbox-copy.js';
import { isSandboxComposite, sandboxComposite } from './cli-sandbox-run.js';
import { sandboxForward } from './cli-sandbox-forward.js';
import { executeSandboxCommand, sandboxCommandOutput } from './sandbox-execution.js';
import { walletOrigin } from './access-tokens.js';
import { sandboxFileOutput, sandboxFileOutputActions } from './cli-sandbox-file-output.js';
import { hostCreatedPorts, takeCreateHostPorts } from './cli-sandbox-create-host.js';

type SandboxCommandContext = { client: ToolClient; config: ToolConfig; cardId?: string; args: string[]; jsonOutput: boolean;
  tokenProvider?: { getAccessToken(): Promise<string | undefined> }; profile?: string };

/** `o11 sandbox ...`: returns what to print, and whether the command already wrote its own output. */
export async function runSandboxCommand({ client, config, cardId, tokenProvider, args, jsonOutput, profile }: SandboxCommandContext) {
  let result: unknown, sandboxPrinted = false;
  const done = () => ({ result, printed: sandboxPrinted });
    // Bare `sandbox help` is the same text as --help; `help --provider X` (or --json) keeps the machine-readable contract.
    if (args[0] === 'help' && args.length === 1 && !jsonOutput) {
      process.stdout.write(`${(await import('./cli-sandbox-usage.js')).sandboxUsage}\n`); sandboxPrinted = true;
      return done();
    }
    if (args[0] === 'providers') {
      const { sandboxProviders, sandboxProvidersText } = await import('./cli-sandbox-providers.js');
      if (jsonOutput) result = sandboxProviders(); else { process.stdout.write(`${sandboxProvidersText()}\n`); sandboxPrinted = true; }
      return done();
    }
    if (args[0] === 'files' && args[1] === 'watch') {
      ({ result, printed: sandboxPrinted } = await (await import('./cli-sandbox-watch.js')).sandboxWatch(client, args));
      return done();
    }
    if (args[0] === "preview") {
      const token = tokenProvider ? await tokenProvider.getAccessToken() : config.apiKey;
      if (!token) throw new Error('Connect to o11 to open a sandbox preview');
      result = await (await import('./cli-sandbox-preview.js')).sandboxPreviewLink({ baseUrl: config.baseUrl, token, cardId }, args);
      return done();
    }
    if (args[0] === "forward") {
      const token = tokenProvider ? await tokenProvider.getAccessToken() : config.apiKey;
      if (!token) throw new Error('Connect to o11 to forward a sandbox port');
      const forwarded = await sandboxForward({ baseUrl: config.baseUrl, token, cardId }, args);
      result = forwarded; if (forwarded.connections > 0 && forwarded.opened === 0) process.exitCode = 1;
      return done();
    }
    if (args[0] === "snapshot-download") {
      result = await (await import('./cli-sandbox-snapshot-download.js')).sandboxSnapshotDownload(client, await sandboxRequest(args));
      return done();
    }
    if (sandboxFileOutputActions.includes(args[0] ?? '')) {
      ({ result, printed: sandboxPrinted } = await sandboxFileOutput(client, await sandboxRequest(args), jsonOutput));
      return done();
    }
    if (args[0] === "private-preview") {
      const input = await sandboxRequest(args);
      const token = tokenProvider ? await tokenProvider.getAccessToken() : config.apiKey;
      if (!token) throw new Error('Connect to o11 to open a private sandbox preview');
      result = await sandboxPrivatePreview({ baseUrl: config.baseUrl, token, cardId }, input);
      sandboxPrinted = result === undefined;
      return done();
    }
    if (['ssh', 'ssh-config', 'ssh-proxy', 'ssh-key'].includes(args[0] ?? '')) {
      // Real OpenSSH through o11's forward: ssh, scp, rsync, sftp and editors' Remote-SSH (cli-sandbox-ssh.ts).
      const connection = async () => {
        const token = tokenProvider ? await tokenProvider.getAccessToken() : config.apiKey;
        if (!token) throw new Error('Connect to o11 to reach the sandbox over SSH');
        return { baseUrl: config.baseUrl, token, cardId };
      };
      const ssh = await (await import('./cli-sandbox-ssh.js')).sandboxSsh({ client, connection, profile, cardId, jsonOutput }, args);
      process.exitCode = ssh.exitCode; result = ssh.result; sandboxPrinted = ssh.result === undefined;
      return done();
    }
    if (['terminal', 'connect', 'shell', 'sh'].includes(args[0] ?? '')) {
      const input = await sandboxRequest(args);
      if (!input.id || Object.keys(input.params).some(key => !["browser", "workdir", "env", "sudo", "keep", "pid"].includes(key)) || input.connectionId || input.provider || input.requestId
        || input.params.browser === true && (input.params.keep !== undefined || input.params.pid !== undefined))
        throw new Error('Use o11 sandbox terminal NAME [--workdir DIR] [--env KEY=VALUE] [--sudo] [--browser], or on E2B --keep to leave the shell running and --pid PID to reattach');
      const token = tokenProvider ? await tokenProvider.getAccessToken() : config.apiKey;
      if (!token) throw new Error('Connect to o11 to open a sandbox terminal');
      if (input.params.browser === true) {
        result = await sandboxBrowserTerminal({ baseUrl: config.baseUrl, token, cardId }, input.id, input.params);
        return done();
      }
      process.exitCode = await sandboxTerminal({ baseUrl: config.baseUrl, token, cardId }, input.id, input.params);
      sandboxPrinted = true;
      return done();
    }
    if (isSandboxComposite(args)) {
      const token = tokenProvider ? await tokenProvider.getAccessToken() : config.apiKey;
      if (!token) throw new Error('Connect to o11 to use the sandbox');
      const composite = await sandboxComposite(client, { baseUrl: config.baseUrl, token, cardId }, args, sandboxRequest);
      process.exitCode = composite!.exitCode; result = composite!.result; sandboxPrinted = composite!.result === undefined; return done();
    }
    if (["copy", "cp", "scp"].includes(args[0] ?? "")) { const copied = await sandboxCopy(client, args); result = copied; process.exitCode = sandboxExitCode({ ...copied, data: "data" in copied ? copied.data : copied }); return done(); }
    const { splitLoginArguments, readSandboxSignIns } = await import('./sandbox-login-transfer.js');
    const login = splitLoginArguments(args);
    // Sign-ins are read here and written only into the caller's own sandbox; o11 never stores them.
    const signIns = () => readSandboxSignIns(login.login, login.keyFiles, { claudeTokenFile: login.claudeTokenFile });
    // A failed o11 sign-in is reported next to the others; it never loses a paid-for sandbox or a sign-in link.
    const o11SignIn = async (id: string, wanted = login.o11) => wanted
      ? (await import('./sandbox-wallet-login.js')).signInSandboxToO11(client, id, walletOrigin(config.baseUrl))
        .catch((error: unknown) => ({ agent: 'o11', error: error instanceof Error ? error.message.slice(0, 300) : 'o11 sign-in failed' }))
      : undefined;
    // The agents named with --login or a key file, each copied and with its CLI set up (sandbox-login-approval.ts).
    const signInNamed = async (id: string) => (await import('./sandbox-login-approval.js')).signInSandboxAgents(client, id,
      { agents: login.login ?? [], keyFiles: login.keyFiles, sources: { claudeTokenFile: login.claudeTokenFile } })
      .catch((error: unknown) => [{ agent: 'login', error: error instanceof Error ? error.message.slice(0, 300) : 'Sign-in failed' }]);
    const keyed = Object.values(login.keyFiles).some(Boolean);
    if (login.args[0] === 'login') {
      const id = login.args[1];
      if (!id) throw new Error('Use o11 sandbox login NAME [--login o11,claude,codex] [--approve] [--renew] [--code CODE] (or --claude-key-file/--codex-key-file FILE)');
      // No --login: o11 plus the agent running this command. --approve starts the sandbox's own long-lived sign-in.
      const { defaultLoginAgents, signInSandboxAgents } = await import('./sandbox-login-approval.js');
      const agents = await signInSandboxAgents(client, id, { agents: keyed && !login.login ? [] : login.login ? defaultLoginAgents(login.login) : await (await import('./sandbox-login-proxy.js')).withStoredLoginAgents(client, defaultLoginAgents(undefined)),
        keyFiles: login.keyFiles, sources: { claudeTokenFile: login.claudeTokenFile }, approve: login.approve, renew: login.renew, code: login.code });
      const o11 = login.o11 || login.login === undefined && !keyed ? await o11SignIn(id, true) : undefined;
      const installed = o11 ? [...agents, o11] : agents;
      result = { installed };
      if (agents.length && agents.every(agent => agent.error) || o11 && 'error' in o11) process.exitCode = 1;
      return done();
    }
    const { prepareArguments, prepareCreated } = await import('./cli-sandbox-prepare.js');
    const prepare = prepareArguments(login.args);
    const input = await sandboxRequest(prepare.args);
    const creates = ['create', 'get-or-create'].includes(input.action);
    if (creates && prepare.prepare) prepare.defaults(input);
    if (!creates && input.action !== 'agent-exec' && (login.login?.length || login.o11 || Object.keys(login.keyFiles).length))
      throw new Error('Use --login or a key file with create, login or agent exec');
    // Read sign-ins (and check --host) before create so a mistake fails before compute is paid for.
    // On create, a login that can't be copied (a ChatGPT or live Claude session) never stops the create: the sandbox is
    // made and that agent is reported with the approve command. A missing key file still fails here.
    const logins = creates && !keyed ? await signIns().catch(() => []) : await signIns(), hostPorts = takeCreateHostPorts(input);
    if (input.action === 'agent-exec' && logins.length) {
      // The agent would run signed out, so a failed sign-in stops here, before the run.
      const failed = (await signInNamed(input.id!)).filter(agent => agent.error);
      if (failed.length) throw new Error(failed.map(agent => `${agent.agent}: ${agent.error}`).join('; '));
    }
    const output = await executeSandboxCommand(client, input); result = output; process.exitCode = sandboxExitCode(output);
    // Every new sandbox gets the current o11, the coding-agent CLIs, Chrome and cron before any sign-in (--no-prepare skips it).
    // A replayed request ID or an existing get-or-create sandbox was prepared the first time; preparing again would block it.
    const repeat = Reflect.get(Object(output.data), 'replayed') === true || Reflect.get(Object(output.data), 'created') === false;
    const prepared = creates && prepare.prepare && !repeat ? await prepareCreated(client, input, output, walletOrigin(config.baseUrl)) : undefined;
    if (prepared) result = { ...output, prepared };
    if (creates && (login.login?.length || keyed || login.o11) && output.sandbox && !['failed', 'attention'].includes(output.status ?? '')) {
      const id = output.sandbox.id;
      const agents = login.login?.length || keyed ? await signInNamed(id) : [], o11 = await o11SignIn(id);
      const installed = o11 ? [...agents, o11] : agents;
      // An agent that needs the person once is reported with its next step; the create itself succeeded.
      const approve = agents.filter(agent => 'error' in agent && agent.error && /--approve/.test(String(agent.error))).map(agent => agent.agent);
      result = { ...output, ...(prepared ? { prepared } : {}), login: { installed,
        ...(approve.length ? { next: `Sign ${approve.join(', ')} in on the sandbox once: o11 sandbox login ${id} --login ${approve.join(',')} --approve` } : {}) } };
      if (installed.some(agent => 'error' in agent && agent.error && !approve.includes(agent.agent))) process.exitCode = 1;
    } else if (creates && login.login === undefined && !login.o11 && !keyed && output.sandbox && !['failed', 'attention'].includes(output.status ?? '')
      && !repeat && (input.action === 'create' || Reflect.get(Object(output.data), 'created') === true)) {
      // A new sandbox comes up signed in to o11 and to the agent running this command. Failures are reported, not fatal.
      const id = output.sandbox.id, { defaultLoginAgents, signInSandboxAgents } = await import('./sandbox-login-approval.js');
      const agents = await signInSandboxAgents(client, id, { agents: await (await import('./sandbox-login-proxy.js')).withStoredLoginAgents(client, defaultLoginAgents(undefined)).catch(() => defaultLoginAgents(undefined)) }).catch(() => []);
      const o11 = await o11SignIn(id, true);
      const failed = agents.filter(agent => agent.error || agent.longLived === false).map(agent => agent.agent);
      result = { ...output, ...(prepared ? { prepared } : {}), login: { installed: [...agents, o11], ...(failed.length ? { next: `For a login that lasts, run o11 sandbox login ${id} --login ${failed.join(',')} --approve` } : {}) } };
    }
    if (hostPorts.length) { const hosted = await hostCreatedPorts(client, output, hostPorts); result = { ...(result as object), hosted: hosted.hosted }; if (hosted.failed) process.exitCode = 1; }
    if (input.action === 'domain') result = absoluteSandboxLinks(result, config.baseUrl);
    if (input.action === 'capabilities' && input.params.matrix === true && !jsonOutput) {
      const { isSandboxMatrix, sandboxMatrixText } = await import('./cli-sandbox-providers.js');
      if (isSandboxMatrix(output.data)) { process.stdout.write(`${sandboxMatrixText(output.data)}\n`); sandboxPrinted = true; }
    }
    if (input.action === 'sizes' && !jsonOutput) {
      const { isSandboxSizes, sandboxSizesText } = await import('./cli-sandbox-sizes.js');
      if (isSandboxSizes(output.data)) { process.stdout.write(`${sandboxSizesText(output.data)}\n`); sandboxPrinted = true; }
    }
    // exec and user-exec print the command's own output; --json keeps the full record.
    // E2B answers a short command in the exec call itself (status succeeded with an exit code), like user-exec.
    const finished = output.status === "completed" || !["failed", "unknown", "pending", "attention"].includes(output.status ?? "")
      && typeof Reflect.get(Object(output.data), "exitCode") === "number";
    if (["exec", "agent-exec", "user-exec"].includes(input.action) && input.params.detached !== true && !jsonOutput && finished) {
      const streams = sandboxCommandOutput(output), notice = Reflect.get(Object(output.data), "notice");
      process.stdout.write(streams.stdout); process.stderr.write(streams.stderr);
      if (Reflect.get(Object(output.data), "timedOut") === true && typeof notice === "string") process.stderr.write(`${notice}\n`);
      sandboxPrinted = true;
    }
  return done();
}

/** Relay links come back relative to the o11 server; print them as full URLs. */
function absoluteSandboxLinks<T>(value: T, baseUrl: string): T {
  if (Array.isArray(value)) return value.map(item => absoluteSandboxLinks(item, baseUrl)) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, key === 'url' && typeof item === 'string' && item.startsWith('/') ? new URL(item, baseUrl).toString() : absoluteSandboxLinks(item, baseUrl)])) as T;
}
