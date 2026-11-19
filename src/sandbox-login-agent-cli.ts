import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';
import { executeSandboxCommand, sandboxCommandOutput } from './sandbox-execution.js';
import type { LoginAgentDefinition, LocalLogin } from './sandbox-login-agent.js';

/**
 * Helpers for the agents beyond Claude Code and Codex (cursor, gemini, opencode, copilot, amp, goose).
 * Their logins go through the shared registry (sandbox-login-transfer.ts). Installing the agent's CLI and checking it
 * is signed in is a separate step, `ensureAgentCli`, run after the login is placed: some CLIs import a login file only
 * on their first run, and an install can take minutes, which must not hold up the other agents' transfer.
 */
type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
export type AgentCli = {
  /** The command the person runs. */
  command: string;
  /** Shell that exits 0 when the CLI is already installed. */
  present: string;
  /** Shell that installs it. Fixed text, no secrets. */
  installScript: string;
  /** npm installs get a ~/.local/bin/<command> wrapper that loads the agent's env file and runs this binary. */
  wrapperTarget?: string;
  /** Shell run after install, e.g. a first sign-in from a staged key. */
  setupScript?: string;
  /** A cheap, non-interactive signed-in call, run as a plain exec with nothing exported. */
  verifyScript: string;
  verifyOk(stdout: string): boolean;
};
export type LoginAgentWithCli = LoginAgentDefinition & { cli?: AgentCli };

/** Values that go into sourced env files must be shell-inert. */
export const envValuePattern = /^[A-Za-z0-9._~+/=:@-]{8,8000}$/;
export const minimumLifetimeMs = 10 * 60_000;
/**
 * Copying a live OAuth/browser session to a sandbox is off by default: providers rarely document using one session
 * on two machines, and a copied Codex session was seen to sign the original machine out. The person opts in per
 * agent with O11_LOGIN_COPY_SESSIONS=cursor,gemini,... (or `all`). API keys and tokens they set themselves are copied.
 */
export function sessionCopyAllowed(env: Record<string, string | undefined>, agent: string) {
  const names = (env.O11_LOGIN_COPY_SESSIONS ?? '').split(',').map(name => name.trim());
  return names.includes('all') || names.includes(agent);
}
export const sessionCopyRefused = (agent: string, what: string, instead: string) =>
  new Error(`Not copying the ${agent} ${what}: copying a live session can sign this machine out. ${instead} To copy it anyway, set O11_LOGIN_COPY_SESSIONS=${agent}.`);
export const envFile = (agent: string) => `$HOME/.config/o11/agent-env/${agent}.env`;

export function envLines(values: Record<string, string>) {
  return `${Object.entries(values).map(([key, value]) => {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(key) || !envValuePattern.test(value)) throw new Error(`Refusing an unexpected ${key} value`);
    return `${key}='${value}'`;
  }).join('\n')}\n`;
}

/** A small local file, or undefined. Errors never include its contents. */
export async function readSmall(path: string, limit = 1024 * 1024) {
  try {
    if ((await stat(path)).size > limit) return undefined;
    return await readFile(path, 'utf8');
  } catch { return undefined; }
}
export async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
  const body = await readSmall(path);
  if (body === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

export type ReadSecret = (service: string, account?: string) => Promise<string | undefined>;
/** Linux Secret Service (secret-tool) or the macOS keychain. A missing tool or entry reads as undefined. */
export const readSystemSecret: ReadSecret = (service, account) => new Promise(resolve => {
  const [command, args] = process.platform === 'darwin'
    ? ['security', ['find-generic-password', '-s', service, ...(account ? ['-a', account] : []), '-w']]
    : ['secret-tool', ['lookup', 'service', service, ...(account ? ['account', account] : [])]];
  execFile(command, args, { timeout: 5000, maxBuffer: 64 * 1024 }, (error, stdout) => resolve(error ? undefined : stdout.trim() || undefined));
});
/** Tests replace the keychain reader here. */
export const secretReader: { read: ReadSecret } = { read: readSystemSecret };

/** Merge a JSON object (fixed, no secrets) into a settings file in the sandbox, keeping other keys. */
export function mergeJsonScript(path: string, value: object) {
  const json = JSON.stringify(value);
  if (json.includes("'")) throw new Error('Settings must not contain single quotes');
  return [`f="${path}"`, 'mkdir -p -- "$(dirname -- "$f")"',
    'if [ -s "$f" ]; then command -v python3 >/dev/null 2>&1 || { printf \'%s\\n\' "o11_login_settings_merge_unavailable:$f" >&2; exit 81; }',
    `  python3 -I -c 'import json,sys
def m(a,b):
  for k,v in b.items(): a[k]=m(a[k],v) if isinstance(v,dict) and isinstance(a.get(k),dict) else v
  return a
open(sys.argv[1]+".o11-new","w").write(json.dumps(m(json.load(open(sys.argv[1])),json.loads(sys.argv[2]))))' "$f" '${json}'`,
    `else printf '%s\\n' '${json}' >"$f.o11-new"; fi`, 'chmod 600 -- "$f.o11-new"; mv -f -- "$f.o11-new" "$f"'].join('\n');
}

/** npm install into a private, pinned prefix; the ~/.local/bin wrapper puts it on PATH. */
export function npmCli(agent: string, command: string, pkg: string): Pick<AgentCli, 'command' | 'present' | 'installScript' | 'wrapperTarget'> {
  const prefix = `$HOME/.local/share/o11/agents/${agent}`;
  return { command, wrapperTarget: `${prefix}/bin/${command}`, present: `test -x "${prefix}/bin/${command}" && test -x "$HOME/.local/bin/${command}"`,
    installScript: `command -v npm >/dev/null 2>&1 || { printf '%s\\n' o11_agent_missing_npm >&2; exit 72; }\nnpm install -g --no-fund --no-audit --prefix "${prefix}" ${pkg} >/dev/null 2>&1 || { printf '%s\\n' o11_agent_npm_install_failed >&2; exit 73; }` };
}
/**
 * A CLI o11's sandbox image usually installs already (sandbox-prepare.ts: npm into ~/.local). Installed the same way,
 * pinned, only when missing.
 */
export function npmGlobalCli(command: string, pkg: string): Pick<AgentCli, 'command' | 'present' | 'installScript'> {
  return { command, present: `PATH="$HOME/.opencode/bin:$PATH" command -v ${command} >/dev/null 2>&1`,
    installScript: `command -v npm >/dev/null 2>&1 || { printf '%s\\n' o11_agent_missing_npm >&2; exit 72; }\nnpm install -g --no-fund --no-audit --prefix "$HOME/.local" ${pkg} >/dev/null 2>&1 || { printf '%s\\n' o11_agent_npm_install_failed >&2; exit 73; }` };
}
export function wrapperScript(agent: string, command: string, target: string) {
  const path = `$HOME/.local/bin/${command}`;
  return ['mkdir -p "$HOME/.local/bin"',
    `if [ -e "${path}" ] && ! grep -q o11-agent-wrapper "${path}" 2>/dev/null; then printf '%s\\n' "o11_agent_wrapper_conflict:${path}" >&2; exit 82; fi`,
    `cat > "${path}.o11-new" <<'O11_WRAPPER'`, '#!/bin/sh', '# o11-agent-wrapper',
    `f="${envFile(agent)}"`, '[ -r "$f" ] && { set -a; . "$f"; set +a; }', `exec "${target}" "$@"`, 'O11_WRAPPER',
    `chmod 755 "${path}.o11-new"`, `mv -f "${path}.o11-new" "${path}"`].join('\n');
}
export const replyOk = (stdout: string) => /\bok\b/i.test(stdout);

async function run(client: SandboxClient, id: string, command: string, timeoutMs: number, secrets: string[]) {
  const result = await executeSandboxCommand(client, { action: 'exec', id, params: { command } }, { timeoutMs });
  const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : {};
  const exitCode = Reflect.get(data, 'exitCode');
  let { stdout, stderr } = sandboxCommandOutput(result);
  for (const secret of secrets) if (secret) { stdout = stdout.split(secret).join('[redacted]'); stderr = stderr.split(secret).join('[redacted]'); }
  return { exitCode: typeof exitCode === 'number' ? exitCode : undefined, stdout, stderr };
}

/**
 * Install the agent's CLI in the sandbox when missing, then check it is signed in with one cheap call.
 * Run after the login transfer. Pass the login (when known) so its secrets are redacted from any output.
 */
export async function ensureAgentCli(client: SandboxClient, id: string, agent: LoginAgentWithCli, options: { verify?: boolean; login?: LocalLogin } = {}) {
  const cli = agent.cli;
  if (!cli) return { agent: agent.name, cli: 'unmanaged' as const, verified: false };
  const secrets = options.login?.secrets ?? [];
  const path = 'export PATH="$HOME/.local/bin:$PATH"';
  const fail = (step: string, result: { exitCode?: number; stderr: string }) =>
    new Error(`${agent.name} ${step} failed in the sandbox (exit ${result.exitCode ?? 'unknown'}): ${result.stderr.trim().slice(-300)}`);
  let state: 'present' | 'installed' = 'present';
  if ((await run(client, id, `${path}\n${cli.present}`, 60_000, secrets)).exitCode !== 0) {
    const installed = await run(client, id, `set -eu\n${path}\n${cli.installScript}`, 600_000, secrets);
    if (installed.exitCode !== 0) throw fail(`${cli.command} install`, installed);
    state = 'installed';
  }
  if (cli.wrapperTarget) {
    const wrapped = await run(client, id, `set -eu\n${wrapperScript(agent.name, cli.command, cli.wrapperTarget)}`, 60_000, secrets);
    if (wrapped.exitCode !== 0) throw fail('wrapper', wrapped);
  }
  if (cli.setupScript) {
    const setup = await run(client, id, `set -eu\n${path}\n${cli.setupScript}`, 180_000, secrets);
    if (setup.exitCode !== 0) throw fail('sign-in setup', setup);
  }
  if (options.verify === false) return { agent: agent.name, cli: state, verified: false };
  // A plain exec, like the person's later commands: nothing is exported here, so this proves the login is in place.
  const check = await run(client, id, cli.verifyScript, 180_000, secrets);
  return { agent: agent.name, cli: state, verified: check.exitCode === 0 && cli.verifyOk(check.stdout) };
}
