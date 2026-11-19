import type { HostRemote, HostedMachine } from './ostack/src/index.js';
import type { SandboxResult } from './contracts/sandboxes.js';
import { OstackError } from './ostack/src/index.js';
import { ToolClient } from './client.js';
import { profileTokenProvider, readConfig } from './config.js';
import { walletOrigin } from './access-tokens.js';
import { findHost, startHost } from './ostack-host-start.js';
import { executeSandboxCommand, sandboxCommandOutput } from './sandbox-execution.js';

/**
 * ostack's hosted computer through o11 sandbox operations: an E2B desktop (or a Boat sandbox when E2B can't start
 * one) on o11's account, paid from the person's credits and kept running until they stop it or the wallet can't pay.
 * Nothing here talks to E2B or Boat directly.
 */
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Written on each hosted computer once it runs with keepRunning. */
const KEEP_RUNNING_MARKER = '$HOME/.local/share/o11/ostack-host-keep-running';
const machineOf =(result: SandboxResult): HostedMachine => {
  const sandbox = result.sandbox;
  if (!sandbox) throw new OstackError('host_unavailable', 'o11 did not return the hosted computer.');
  return { id: sandbox.id, name: sandbox.name, provider: sandbox.provider, state: sandbox.state };
};

export function hostRemote(profile: string | undefined): HostRemote {
  let made: { client: ToolClient; origin: string } | undefined;
  const connect = async () => {
    if (made) return made;
    let config: Awaited<ReturnType<typeof readConfig>>;
    try { config = await readConfig(profile); } catch { throw new OstackError('not_signed_in', 'Sign in first: run "o11 login".'); }
    made = { client: new ToolClient({ ...config, tokenProvider: profileTokenProvider(profile, config) }), origin: walletOrigin(config.baseUrl) };
    return made;
  };
  const run = async (id: string, command: string, timeoutMs = 300_000) => {
    const { client } = await connect();
    const result = await executeSandboxCommand(client, { action: 'exec', id, params: { command } }, { timeoutMs });
    const exitCode = object(result.data).exitCode;
    return { exitCode: typeof exitCode === 'number' ? exitCode : null, ...sandboxCommandOutput(result) };
  };
  return {
    async ensure({ name, size, provider }) {
      const { client, origin } = await connect();
      const start = async (pinned = provider) => {
        const started = await startHost(client, { name, size, provider: pinned });
        if (!('result' in started)) throw new OstackError('host_unavailable', 'o11 could not start the hosted computer on any provider.', { refusals: started.refusals });
        return started;
      };
      let { result, resumed, replaced, refusals } = await start();
      let machine = machineOf(result);
      // An E2B computer made before o11 could keep one running stops after 24 hours. Computers made here carry a
      // marker; an E2B one without it is replaced (its site sign-ins are lost, and `replaced` says so).
      if (machine.provider === 'e2b' && object(result.data).created !== true) {
        // Only an explicit answer counts: a lost log reads as empty output, which must never delete a computer.
        const marked = await run(machine.id, `if [ -f "${KEEP_RUNNING_MARKER}" ]; then echo marked; else echo unmarked; fi`, 60_000).catch(() => null);
        if (marked?.exitCode === 0 && marked.stdout.trim() === 'unmarked') {
          await client.sandbox({ action: 'delete', id: machine.id, params: {} });
          ({ result, refusals } = await start());
          machine = machineOf(result); resumed = false; replaced = true;
        }
      }
      await run(machine.id, `mkdir -p "$(dirname "${KEEP_RUNNING_MARKER}")" && touch "${KEEP_RUNNING_MARKER}"`, 60_000).catch(() => undefined);
      // The current o11 (with ostack), the coding-agent CLIs, Chrome and cron; a rerun only upgrades what is stale.
      const prepared = await (await import('./sandbox-prepare.js')).prepareSandbox(client, machine.id, origin);
      return { machine, created: object(result.data).created === true, resumed, replaced, prepared, ...(refusals.length ? { fallback: refusals } : {}) };
    },
    async find(name, provider) {
      const { client } = await connect();
      return findHost(client, name, provider);
    },
    async orchestrator() {
      return (await import('./sandbox-login-transfer.js')).detectOrchestratorAgents();
    },
    async longLived(id, agent) {
      const { client } = await connect();
      const { loginAgent, runInSandbox } = await import('./sandbox-login-transfer.js');
      const result = await runInSandbox(client, id, [`cat "$HOME/.local/share/o11/logins/${agent}.json" 2>/dev/null || echo '{}'`, 'echo', loginAgent(agent).check ?? ''].join('\n'));
      const [marker = '{}', , ...rest] = result.stdout.split('\n');
      let saved: Record<string, unknown> = {};
      try { saved = object(JSON.parse(marker)); } catch { /* No record. */ }
      const expires = typeof saved.expiresAt === 'string' ? Date.parse(saved.expiresAt) : NaN;
      // The same test sign-in uses: a long-lived login the agent's own check confirms, or one recorded for over a day.
      return rest.includes('long-lived') || (saved.longLived === true && (Number.isNaN(expires) || expires > Date.now() + 86_400_000));
    },
    async signIn(id, { o11, agents, claudeTokenFile, approve, renew, code }) {
      const { client, origin } = await connect();
      const signed: unknown[] = [];
      if (o11) signed.push(await (await import('./sandbox-wallet-login.js')).signInSandboxToO11(client, id, origin));
      const { defaultLoginAgents, signInSandboxAgents } = await import('./sandbox-login-approval.js');
      // The orchestrator's own agent by default (Claude Code, Codex, ...), plus each with a login stored with o11, Claude
      // when it can't tell. Each agent on its own.
      const stored = agents ? [] : await (await import('./sandbox-login-proxy.js')).connectedProxyAgents(client);
      const named = agents ?? [...new Set([...defaultLoginAgents(undefined, stored.length ? [] : ['claude']), ...stored])];
      signed.push(...await signInSandboxAgents(client, id, { agents: named, sources: { claudeTokenFile }, approve, renew, code }));
      return signed;
    },
    async refreshProxyLogins(id) {
      const { client } = await connect();
      return (await import('./sandbox-login-approval.js')).refreshProxyLogins(client, id);
    },
    run,
    async link(id, view) {
      const { client } = await connect();
      const result = await client.sandbox({ action: view, id, params: {} });
      const data = object(result.data);
      if (typeof data.url !== 'string') throw new OstackError('host_unavailable', 'o11 returned no link to the hosted computer.');
      return { url: data.url, ...(typeof data.expiresAt === 'string' ? { expiresAt: data.expiresAt } : {}) };
    },
  };
}
