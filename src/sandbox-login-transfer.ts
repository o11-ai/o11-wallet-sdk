import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';
import { executeSandboxCommand, sandboxCommandOutput } from './sandbox-execution.js';
import { markerScript, placeFunction, type Env, type LocalLogin, type LoginAgent, type LoginAgentDefinition } from './sandbox-login-agent.js';
import { claudeLoginAgent } from './sandbox-login-claude.js';
import { codexLoginAgent } from './sandbox-login-codex.js';
import { ampLoginAgent } from './sandbox-login-amp.js';
import { copilotLoginAgent } from './sandbox-login-copilot.js';
import { cursorLoginAgent } from './sandbox-login-cursor.js';
import { geminiLoginAgent } from './sandbox-login-gemini.js';
import { gooseLoginAgent } from './sandbox-login-goose.js';
import { opencodeLoginAgent } from './sandbox-login-opencode.js';

/**
 * Sign a sandbox's coding agents in with the caller's own logins, through o11's provider-neutral exec and
 * files-write actions. Refresh tokens never leave this machine: a sandbox refreshing a copied one could sign the
 * caller out here. Each agent is a `LoginAgentDefinition` in its own sandbox-login-<agent>.ts.
 */
export type { LocalLogin, LoginAgent, LoginAgentDefinition } from './sandbox-login-agent.js';
export type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
export type LoginSources = { home?: string; env?: Env; claudeTokenFile?: string };
/** `${agent}KeyFile`: an API key file for that agent, from --<agent>-key-file. */
export type KeyFiles = Record<string, string | undefined>;

/** Every agent o11 can sign in, in the order --login lists them. Add new agents here. */
const loginAgentDefinitions = new Map<LoginAgent, LoginAgentDefinition>([
  claudeLoginAgent,
  codexLoginAgent,
  cursorLoginAgent,
  geminiLoginAgent,
  opencodeLoginAgent,
  copilotLoginAgent,
  ampLoginAgent,
  gooseLoginAgent,
].map(agent => [agent.name, agent]));
export function registerLoginAgent(agent: LoginAgentDefinition) { loginAgentDefinitions.set(agent.name, agent); }
export const loginAgentNames = () => [...loginAgentDefinitions.keys()];
export function loginAgent(name: LoginAgent) {
  const agent = loginAgentDefinitions.get(name);
  if (!agent) throw new Error(`Unknown agent ${name}. Use ${loginAgentNames().join(', ')}`);
  return agent;
}
/** The coding agents running this process (the orchestrator calling o11), from the environment they set. */
export const detectOrchestratorAgents = (env: Env = process.env) => loginAgentNames().filter(name => loginAgent(name).detect(env));

const stagingDirectory = '.o11-login';
const usage = () => `Use --login o11,${loginAgentNames().join(',')} or --login none`;

export function parseLoginAgents(value: unknown): LoginAgent[] {
  if (value === undefined || value === 'none') return [];
  if (typeof value !== 'string') throw new Error(usage());
  const names = [...new Set(value.split(',').map(name => name.trim()))];
  if (!names.length || names.some(name => !loginAgentDefinitions.has(name))) throw new Error(usage());
  return names;
}

/** Remove --login and local key-file flags (and, for `login`, --approve, --renew and --code) so the server never sees them. */
export function splitLoginArguments(args: string[]) {
  const signIn = args[0] === 'login';
  const localFlags = new Set(['--login', '--claude-token-file', ...signIn ? ['--code'] : [], ...loginAgentNames().map(name => `--${name}-key-file`)]);
  const rest: string[] = [];
  let login: LoginAgent[] | undefined, tokenFile: string | undefined, o11 = false, approve: true | undefined, renew: true | undefined, code: string | undefined;
  const keyFiles: KeyFiles = {};
  for (let index = 0; index < args.length; index++) {
    const word = args[index]!;
    if (word === '--') { rest.push(...args.slice(index)); break; }
    if (signIn && word === '--approve') { approve = true; continue; }
    if (signIn && word === '--renew') { renew = true; continue; }
    const [flag, inline] = word.includes('=') ? [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)] : [word, undefined];
    if (!localFlags.has(flag)) { rest.push(word); continue; }
    const value = inline ?? args[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Supply a value after ${flag}`);
    if (flag === '--login') {
      if (login) throw new Error('Supply --login once');
      // o11 is the sandbox's own o11 sign-in (sandbox-wallet-login.ts); the rest are coding agents.
      const names = value.split(',').map(name => name.trim());
      o11 = names.includes('o11');
      const agents = names.filter(name => name !== 'o11');
      login = agents.length ? parseLoginAgents(agents.join(',')) : [];
    }
    else if (flag === '--claude-token-file') tokenFile = value;
    else if (flag === '--code') code = value;
    else keyFiles[`${flag.slice(2, -'-key-file'.length)}KeyFile`] = value;
  }
  return { args: rest, login, o11, claudeTokenFile: tokenFile, keyFiles, ...(approve ? { approve } : {}), ...(renew ? { renew } : {}), ...(code ? { code } : {}) };
}

/** An API key file becomes the same sandbox login files as a copied login. o11 only relays it into the sandbox. */
async function keyFileLogin(agent: LoginAgent, path: string): Promise<LocalLogin> {
  const definition = loginAgent(agent);
  if (!definition.fromKey) throw new Error(`${agent} cannot use a key file`);
  let key: string;
  try {
    if ((await stat(path)).size > 16000) throw new Error('too large');
    key = (await readFile(path, 'utf8')).trim();
  } catch { throw new Error(`The ${agent} key file at ${path} is missing or larger than 16000 bytes`); }
  if (!/^[^\s\x00-\x1f\x7f]{8,16000}$/.test(key)) throw new Error(`The ${agent} key file must hold one API key`);
  return definition.fromKey(key);
}

/** Read local logins and key files on the caller's machine. One sign-in per agent. */
export async function readSandboxSignIns(agents: LoginAgent[] | undefined, keyFiles: KeyFiles, sources: LoginSources = {}) {
  const keyed = Object.keys(keyFiles).filter(key => keyFiles[key] !== undefined).map(key => key.slice(0, -'KeyFile'.length));
  if (keyed.some(agent => agents?.includes(agent))) throw new Error('Use either --login or a key file for each agent, not both');
  const logins = agents?.length ? await readLocalLogins(agents, sources) : [];
  for (const agent of keyed) logins.push(await keyFileLogin(agent, keyFiles[`${agent}KeyFile`]!));
  return logins;
}

/** Read local logins on the caller's machine. Nothing here is sent anywhere. */
export async function readLocalLogins(agents: LoginAgent[], sources: LoginSources = {}) {
  const home = sources.home ?? homedir(), env = sources.env ?? process.env;
  const logins: LocalLogin[] = [];
  for (const agent of agents) logins.push(await loginAgent(agent).read({ home, env, claudeTokenFile: sources.claudeTokenFile }));
  return logins;
}

/** A run's own staging folder, as the sandbox's mktemp names it. Only such a path is put into shell text. */
const stagingPattern = new RegExp(`^/[A-Za-z0-9._/-]+/\\${stagingDirectory}/run\\.[A-Za-z0-9]{6,}$`);

/**
 * Shell text holds paths only. Secrets arrive as staged files written through files-write into `staging` (this run's
 * own folder under ~/.o11-login), which the script removes when it ends.
 */
export function loginInstallScript(agents: LoginAgent[], staging?: string) {
  if (staging !== undefined && !stagingPattern.test(staging)) throw new Error('Unexpected sandbox staging folder');
  const lines = ['set -eu', 'umask 077', `s=${staging ? `'${staging}'` : `"$HOME/${stagingDirectory}"`}`, 'trap \'rm -rf -- "$s"\' EXIT', placeFunction];
  for (const agent of agents) {
    const definition = loginAgent(agent);
    lines.push(`set -- "$s/${definition.file}"`, definition.install);
  }
  return lines.join('\n');
}

export function redactLoginText(value: string, logins: LocalLogin[]) {
  let clean = value;
  for (const secret of logins.flatMap(login => login.secrets)) if (secret) clean = clean.split(secret).join('[redacted]');
  return clean;
}

export async function runInSandbox(client: SandboxClient, id: string, command: string, logins: LocalLogin[] = [], timeoutMs?: number) {
  const result = await executeSandboxCommand(client, { action: 'exec', id, params: { command } }, timeoutMs ? { timeoutMs } : undefined);
  const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : {};
  const exitCode = Reflect.get(data, 'exitCode');
  const { stdout, stderr } = sandboxCommandOutput(result);
  return { exitCode: typeof exitCode === 'number' ? exitCode : undefined, stdout: redactLoginText(stdout, logins), stderr: redactLoginText(stderr, logins) };
}

/** Install logins in a running sandbox. Works on any provider that supports exec and files-write. */
export async function transferSandboxLogins(client: SandboxClient, id: string, logins: LocalLogin[]) {
  if (!logins.length) return { installed: [] };
  // Each run stages in its own folder, so sign-ins running at the same time never remove each other's files.
  // ~/.o11-login itself stays: the o11 key is staged there (sandbox-wallet-login.ts). A run that died before its cleanup
  // is swept here once it is 30 minutes old.
  const prepared = await runInSandbox(client, id, [`set -eu; umask 077; mkdir -p -m 700 -- "$HOME/${stagingDirectory}"`,
    `find "$HOME/${stagingDirectory}" -mindepth 1 -maxdepth 1 -name 'run.*' -mmin +30 -exec rm -rf -- {} + 2>/dev/null || true`,
    `mktemp -d "$HOME/${stagingDirectory}/run.XXXXXXXX"`].join('\n'), logins);
  const staging = prepared.stdout.trim();
  if (prepared.exitCode !== 0 || !stagingPattern.test(staging)) throw new Error('Could not prepare the sandbox for login transfer');
  let installed: Awaited<ReturnType<typeof runInSandbox>> | undefined;
  try {
    for (const login of logins)
      await client.sandbox({ action: 'files-write', id, params: { path: `${staging}/${login.file}`, content: Buffer.from(login.content).toString('base64'), encoding: 'base64' } });
    const markers = logins.map(login => markerScript(login.agent, { source: login.source, longLived: login.longLived, ...(login.expiresAt ? { expiresAt: login.expiresAt } : {}), ...(login.fingerprint ? { fingerprint: login.fingerprint } : {}) }));
    installed = await runInSandbox(client, id, [loginInstallScript(logins.map(login => login.agent), staging), ...markers].join('\n'), logins);
  } finally {
    if (installed?.exitCode !== 0) await runInSandbox(client, id, `rm -rf -- '${staging}'`, logins).catch(() => undefined);
  }
  if (installed.exitCode !== 0) throw new Error(`Login transfer failed in the sandbox (exit ${installed.exitCode ?? 'unknown'}): ${installed.stderr.trim().slice(0, 300)}`);
  const placed = installed.stdout.trim().split('\n').filter(Boolean).map(line => ({ mode: line.slice(0, line.indexOf(' ')), path: line.slice(line.indexOf(' ') + 1) }));
  return { installed: logins.map(login => ({ agent: login.agent, source: login.source, longLived: login.longLived, ...(login.expiresAt ? { expiresAt: login.expiresAt } : {}),
    refreshes: false, files: placed.filter(file => file.path.includes(login.agent)) })) };
}
