import { ensureAgentCli, type LoginAgentWithCli } from './sandbox-login-agent-cli.js';
import { placeFunction, record, type LocalLogin, type LoginAgent, type LoginAgentDefinition } from './sandbox-login-agent.js';
import { isProxyAgent, proxyAccess, proxyAgents, proxyFingerprint, storedLoginStatus } from './sandbox-login-proxy.js';
import { detectOrchestratorAgents, loginAgent, readSandboxSignIns, runInSandbox, transferSandboxLogins, type KeyFiles, type LoginSources, type SandboxClient } from './sandbox-login-transfer.js';

/**
 * Signs a sandbox's coding agents in so they keep working after this machine's short-lived tokens expire:
 * 0. with a login stored by `o11 login claude|codex`, the agent goes through o11's proxy with a stand-in key;
 * 1. a long-lived login from here (one-year Claude token, API key) is copied;
 * 2. a long-lived login the sandbox already holds is kept (unless `renew`), never replaced by a short-lived copy;
 * 3. otherwise the current access token is copied so the agent works now, and with `approve` the sandbox starts its
 *    own login (`claude setup-token`, `codex login --device-auth`) for the person to approve once in their browser.
 * Each agent succeeds or fails on its own. Secrets are never printed or returned.
 */
export type SignInOptions = { agents?: LoginAgent[]; keyFiles?: KeyFiles; sources?: LoginSources; approve?: boolean; renew?: boolean; code?: string };
export type NeedsPerson = { url: string; code?: string; finish: 'paste-code' | 'rerun' };
export type AgentSignIn = { agent: LoginAgent; source?: string; longLived?: boolean; expiresAt?: string; needs_person?: NeedsPerson; error?: string; note?: string; cli?: string; verified?: boolean; cliError?: string;
  /** The login o11 keeps for this agent needs the person to sign in again (`o11 login <agent>`). */
  loginNeeded?: boolean };
type Approval = NonNullable<LoginAgentDefinition['approval']>;

const codePattern = /^[A-Za-z0-9._~#-]{8,512}$/;
const approvalRoot = '.local/share/o11/login-approval';
const message = (error: unknown) => (error instanceof Error ? error.message : 'Sign-in failed').slice(0, 300);
const lastJson = (stdout: string) => {
  const line = stdout.trim().split('\n').reverse().find(entry => entry.startsWith('{'));
  try { return record(line ? JSON.parse(line) : {}); } catch { return {}; }
};

/** The agents to sign in: the ones named, else the orchestrator's own (Claude Code, Codex, ...), else `fallback`. */
export function defaultLoginAgents(agents: LoginAgent[] | undefined, fallback: LoginAgent[] = []) {
  if (agents) return agents;
  const detected = detectOrchestratorAgents();
  return detected.length ? detected : fallback;
}

/** What the sandbox already holds for an agent, from its sign-in record and the agent's own check. */
async function sandboxState(client: SandboxClient, id: string, agent: LoginAgent) {
  const check = loginAgent(agent).check;
  const result = await runInSandbox(client, id, [`mkdir -p -m 700 "$HOME/${approvalRoot}"`, `printf '%s\\n' "$HOME"`, `cat "$HOME/.local/share/o11/logins/${agent}.json" 2>/dev/null || echo '{}'`, 'echo', check ?? ''].join('\n'));
  const [home = '', marker = '{}', , ...rest] = result.stdout.split('\n');
  let saved: Record<string, unknown> = {};
  try { saved = record(JSON.parse(marker)); } catch { /* No record. */ }
  const expires = typeof saved.expiresAt === 'string' ? Date.parse(saved.expiresAt) : NaN;
  const recorded = saved.longLived === true && (Number.isNaN(expires) || expires > Date.now() + 86_400_000);
  return { home: home.trim(), longLived: rest.includes('long-lived') || recorded, source: typeof saved.source === 'string' ? saved.source : 'sandbox' };
}

/**
 * Collects an approval started on an earlier run. A pasted code travels as a file, never in command text; with no
 * code, "$1" names a file that does not exist. Returns the finish state, and a note to show with a new link.
 */
async function finishApproval(client: SandboxClient, id: string, agent: LoginAgent, flow: Approval, home: string, code: string | undefined) {
  if (code !== undefined && !codePattern.test(code.trim())) throw new Error('That code has an unexpected format. Copy the whole code the page shows.');
  const path = `${home}/${approvalRoot}/${agent}.code`;
  if (code !== undefined) await client.sandbox({ action: 'files-write', id, params: { path, content: Buffer.from(code.trim()).toString('base64'), encoding: 'base64' } });
  const done = lastJson((await runInSandbox(client, id, `umask 077\n${placeFunction}\nset -- ${JSON.stringify(path)}\n${flow.finish}`, [], 120_000)).stdout);
  const detail = String(done.detail ?? 'unknown error').slice(0, 160);
  // The person approved, but placing the login failed. The sandbox keeps it for the next try, so no new link replaces it.
  if (done.state === 'failed' && done.kept === true)
    throw new Error(`The ${agent} sign-in was approved but could not be installed in the sandbox (${detail}). Fix that, then run the same command again with --approve.`);
  // The sandbox cannot finish any sign-in (no python3, say); a new link would fail the same way.
  if (done.state === 'failed' && done.fatal === true) throw new Error(`The ${agent} sign-in cannot finish in the sandbox: ${detail}`);
  const state = typeof done.state === 'string' ? done.state : 'expired';
  if (state === 'done' || state === 'waiting') return { state };
  if (code !== undefined) return { state, note: state === 'failed' ? `That code did not work (${detail}). Here is a new link.` : 'That sign-in had expired. Here is a new link.' };
  return { state, ...(state === 'failed' ? { note: `The last ${agent} sign-in did not finish (${detail}). Here is a new link.` } : {}) };
}

async function startApproval(client: SandboxClient, id: string, agent: LoginAgent, flow: Approval): Promise<NeedsPerson> {
  const started = lastJson((await runInSandbox(client, id, `umask 077\n${flow.start}`, [], 90_000)).stdout);
  if (typeof started.url !== 'string') throw new Error(`Could not start the ${agent} sign-in in the sandbox: ${String(started.detail ?? 'no link')}`);
  return { url: started.url, ...(typeof started.code === 'string' ? { code: started.code } : {}), finish: flow.needsCode ? 'paste-code' : 'rerun' };
}

/** Copies logins into the sandbox, then installs and checks the CLI of each agent that brings its own (Copilot, Amp, Goose, Cursor, ...). */
export async function copySandboxLogins(client: SandboxClient, id: string, logins: LocalLogin[]): Promise<AgentSignIn[]> {
  const { installed } = await transferSandboxLogins(client, id, logins);
  const results: AgentSignIn[] = [];
  for (const [index, login] of logins.entries()) {
    const placed = installed[index]!, definition = loginAgent(login.agent) as LoginAgentWithCli;
    const cli = definition.cli
      ? await ensureAgentCli(client, id, definition, { login }).catch(error => ({ agent: login.agent, cli: 'failed' as const, verified: false, error: message(error) }))
      : undefined;
    results.push({ agent: login.agent, source: placed.source, longLived: placed.longLived, ...(placed.expiresAt ? { expiresAt: placed.expiresAt } : {}),
      ...(cli ? { cli: cli.cli, verified: cli.verified, ...('error' in cli ? { cliError: cli.error } : {}) } : {}) });
  }
  return results;
}

/**
 * The proxy sign-in, unless this call names a key or token file for the agent or finishes an approval. Returns nothing
 * when o11 holds no login for it (or can't answer, as an older server), or a note when that login needs the person.
 */
async function proxySignIn(client: SandboxClient, id: string, agent: LoginAgent, options: SignInOptions): Promise<AgentSignIn | string | undefined> {
  const proxy = loginAgent(agent).proxy;
  if (!isProxyAgent(agent) || !proxy || options.keyFiles?.[`${agent}KeyFile`] || agent === 'claude' && options.sources?.claudeTokenFile || options.code !== undefined) return undefined;
  const status = await storedLoginStatus(client, agent).catch(() => undefined);
  if (!status?.connected) return undefined;
  if (status.needsSignIn) return `Your ${agent} login with o11 needs you to sign in again: run o11 login ${agent}.`;
  return (await copySandboxLogins(client, id, [proxy(await proxyAccess(client, id, agent))]))[0]!;
}

async function signInAgent(client: SandboxClient, id: string, agent: LoginAgent, options: SignInOptions): Promise<AgentSignIn> {
  let note: string | undefined;
  try { const placed = await proxySignIn(client, id, agent, options); if (typeof placed === 'object') return placed; note = placed; }
  catch (error) { note = `The o11 proxy sign-in failed (${message(error)}), so the usual sign-in was used.`; }
  const result = await signInOnly(client, id, agent, options);
  return note ? { ...result, note: result.note ? `${note} ${result.note}` : note } : result;
}

async function signInOnly(client: SandboxClient, id: string, agent: LoginAgent, options: SignInOptions): Promise<AgentSignIn> {
  let local: LocalLogin | undefined, localError: string | undefined;
  try { [local] = await readSandboxSignIns(options.keyFiles?.[`${agent}KeyFile`] ? undefined : [agent], options.keyFiles?.[`${agent}KeyFile`] ? { [`${agent}KeyFile`]: options.keyFiles[`${agent}KeyFile`] } : {}, options.sources); }
  catch (error) { localError = message(error); }
  const copy = async (login: LocalLogin) => (await copySandboxLogins(client, id, [login]))[0]!;
  if (local?.longLived) return copy(local);
  const flow = loginAgent(agent).approval;
  // A pasted code belongs to the agent whose approval asks for one.
  const code = flow?.needsCode ? options.code : undefined;
  const state = await sandboxState(client, id, agent);
  // --renew replaces a kept sign-in that stopped working (a revoked token, or one that was shorter-lived than recorded).
  if (state.longLived && code === undefined && !options.renew) return { agent, source: state.source, longLived: true, note: 'Already signed in on the sandbox; left as is.' };
  // An approval from an earlier run is collected before anything is copied, so a short-lived copy never replaces it.
  const earlier = flow && (options.approve || code !== undefined) ? await finishApproval(client, id, agent, flow, state.home, code) : undefined;
  if (earlier?.state === 'done') return { agent, source: 'sandbox-login', longLived: true };
  // A short-lived copy never replaces the sandbox's own long-lived login, nor lands while an approval is pending.
  const copyable = local && code === undefined && !state.longLived && earlier?.state !== 'waiting' ? local : undefined;
  const copied = copyable ? await copy(copyable) : undefined;
  const missing = state.longLived && local ? 'The sandbox holds a long-lived login of its own, which a short-lived copy would replace. Add --approve to sign it in again.' : localError ?? 'No login to copy';
  if (!flow || !options.approve && code === undefined) return copied ?? { agent, error: missing };
  const needs = await startApproval(client, id, agent, flow);
  return { ...(copied ?? { agent }), needs_person: needs, ...(earlier?.note ? { note: earlier.note } : {}) };
}

/** Sign in each agent on its own: one agent's failure never stops another. */
export async function signInSandboxAgents(client: SandboxClient, id: string, options: SignInOptions): Promise<AgentSignIn[]> {
  const agents = [...new Set([...(options.agents ?? []), ...Object.keys(options.keyFiles ?? {}).filter(key => options.keyFiles?.[key]).map(key => key.slice(0, -'KeyFile'.length))])];
  const results: AgentSignIn[] = [];
  for (const agent of agents) {
    try { results.push(await signInAgent(client, id, agent, options)); }
    catch (error) { results.push({ agent, error: message(error) }); }
  }
  return results;
}

/**
 * Re-places proxy sign-ins whose stand-in key changed (o11 reissues it when a sandbox starts or resumes). Only agents
 * whose sign-in record says o11-proxy are checked; the rest are left alone.
 */
export async function refreshProxyLogins(client: SandboxClient, id: string): Promise<AgentSignIn[]> {
  const records = await runInSandbox(client, id, proxyAgents.map(agent => `cat "$HOME/.local/share/o11/logins/${agent}.json" 2>/dev/null | head -c 2000 | tr -d '\n'; echo`).join('\n'));
  const lines = records.stdout.split('\n');
  const results: AgentSignIn[] = [];
  for (const [index, agent] of proxyAgents.entries()) {
    let saved: Record<string, unknown> = {};
    try { saved = record(JSON.parse(lines[index] || '{}')); } catch { /* No record. */ }
    if (saved.source !== 'o11-proxy') continue;
    try {
      // The proxy answers 409 ai_login_needed while the stored login needs the person; the stand-in key itself is fine.
      const status = await storedLoginStatus(client, agent);
      if (!status.connected || status.needsSignIn) { results.push({ agent, loginNeeded: true, error: `The ${agent} login o11 keeps needs signing in again: run o11 login ${agent}.` }); continue; }
      const access = await proxyAccess(client, id, agent);
      if (saved.fingerprint === proxyFingerprint(access)) continue;
      results.push((await copySandboxLogins(client, id, [loginAgent(agent).proxy!(access)]))[0]!);
    } catch (error) { results.push({ agent, error: `${message(error)}. Run o11 login ${agent}, then o11 sandbox login NAME --login ${agent}.` }); }
  }
  return results;
}
