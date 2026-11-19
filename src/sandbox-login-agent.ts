import { readFile, stat } from 'node:fs/promises';
import type { ProxyAccess } from './sandbox-login-proxy.js';

/**
 * The contract each coding agent implements to be signed in to a sandbox. Add an agent by writing
 * `sandbox-login-<agent>.ts` that exports a `LoginAgentDefinition`, then list it in `loginAgentDefinitions`
 * (sandbox-login-transfer.ts) and in the wallet SDK source lists (scripts/wallet-sdk/artifacts.ts, install-wallet.ts).
 */
export type LoginAgent = string;
export type Env = Record<string, string | undefined>;
export type LocalLogin = {
  agent: LoginAgent;
  /** Where the login came from, e.g. token-file, current-access-token, api-key. Never the secret itself. */
  source: string;
  /** True when it keeps working without this machine: an API key, a one-year token, or a login the sandbox refreshes itself. */
  longLived: boolean;
  expiresAt?: string;
  /** For an o11-proxy login: a hash of the proxy address and stand-in key, kept in the sign-in record. */
  fingerprint?: string;
  /** File name staged in the sandbox and handed to `install` as "$1". */
  file: string;
  content: string;
  /** Every secret in `content`, redacted from any command output. */
  secrets: string[];
};
export type LoginSources = { home: string; env: Env; claudeTokenFile?: string };

export interface LoginAgentDefinition {
  name: LoginAgent;
  /** File name the login is staged under in the sandbox (LocalLogin.file). */
  file: string;
  /** True when `env` belongs to a process this agent started, so the agent calling o11 is this one. */
  detect(env: Env): boolean;
  /** A login on this machine to copy. Throws with a short, secret-free message when there is none. */
  read(sources: LoginSources): Promise<LocalLogin>;
  /** An API key file's contents as a login. */
  fromKey?(key: string): LocalLogin;
  /** Settings that send the agent through o11's AI proxy with the sandbox's stand-in key (sandbox-login-proxy.ts). */
  proxy?(access: ProxyAccess): LocalLogin;
  /**
   * Shell run in the sandbox with "$1" the staged login file. Call `place SRC DEST` (defined by the caller) for each
   * file it writes; place prints "<mode> <path>". Paths must contain the agent name.
   */
  install: string;
  /**
   * Shell run in the sandbox that prints `long-lived` when the sandbox already holds a login of its own that keeps
   * working (so a short-lived copy must not replace it). Optional.
   */
  check?: string;
  /**
   * A one-time approval run in the sandbox, for when nothing long-lived can be copied. Both print one JSON line.
   * start: {"url","code"?} or {"state":"failed","detail"}. finish ("$1" is a staged file holding the code the person
   * pasted, possibly empty): {"state":"done"|"waiting"|"expired"|"failed","detail"?}. Neither may print a secret.
   */
  approval?: { start: string; finish: string; needsCode: boolean };
}

export const tokenPattern = /^[A-Za-z0-9._~+/=-]{20,8000}$/;
export const text = (value: unknown) => typeof value === 'string' ? value : '';
export const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function jwtExpiry(token: string) {
  try {
    const exp = record(JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))).exp;
    return typeof exp === 'number' ? new Date(exp * 1000).toISOString() : undefined;
  } catch { return undefined; }
}

export async function readJson(path: string, label: string): Promise<Record<string, unknown>> {
  let body: string;
  try {
    if ((await stat(path)).size > 1024 * 1024) throw new Error('too large');
    body = await readFile(path, 'utf8');
  } catch { throw new Error(`${label} was not found at ${path}`); }
  try {
    const value: unknown = JSON.parse(body);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* Report a generic error so file contents never reach the terminal. */ }
  throw new Error(`${label} at ${path} is not valid JSON`);
}

/** Where a pending approval keeps its state in the sandbox (outside the login staging folder, which is wiped). */
export const approvalDirectory = (agent: LoginAgent) => `"$HOME/.local/share/o11/login-approval/${agent}"`;

/**
 * Shell that runs `command` (no single quotes) detached in a pseudo-terminal under the approval folder "$d", reusing one still running
 * for under `minutes`, so a link the person already has keeps working. Input goes through the fifo "$d/in".
 */
export function detachedApproval(agent: LoginAgent, command: string, minutes: number) {
  return [`d=${approvalDirectory(agent)}`,
    `if [ -f "$d/pid" ] && kill -0 "$(cat "$d/pid")" 2>/dev/null && [ -z "$(find "$d/pid" -mmin +${minutes} 2>/dev/null)" ]; then :; else`,
    '  [ -f "$d/pid" ] && kill -- "-$(cat "$d/pid")" 2>/dev/null', '  rm -rf -- "$d"; mkdir -p -m 700 -- "$d"; mkfifo -m 600 "$d/in"',
    `  setsid sh -c 'exec 3<>"$1/in"; script -qfec "stty cols 1000 rows 50; ${command.replace(/["$`\\]/g, match => `\\${match}`)}" /dev/null <&3 >"$1/out" 2>&1; echo $? >"$1/exit"' sh "$d" >/dev/null 2>&1 &`,
    '  echo $! >"$d/pid"', 'fi'].join('\n');
}

/** Shell function every install uses: copy "$1" to "$2" as 0600 and print "<mode> <path>". */
export const placeFunction = 'place() { d="$(dirname -- "$2")"; mkdir -p -- "$d"; chmod 700 -- "$d"; cp -- "$1" "$2.o11-new"; chmod 600 -- "$2.o11-new"; mv -f -- "$2.o11-new" "$2"; printf \'%s %s\\n\' "$(stat -c %a -- "$2")" "$2"; }';

/** Shell that records, without secrets, how an agent was signed in. sandboxLoginStatus reads it back. */
export function markerScript(agent: LoginAgent, marker: { source: string; longLived: boolean; expiresAt?: string; fingerprint?: string }) {
  const body = JSON.stringify({ ...marker, installedAt: new Date().toISOString() }).replaceAll("'", '');
  return `mkdir -p -m 700 "$HOME/.local/share/o11/logins" && printf '%s\\n' '${body}' >"$HOME/.local/share/o11/logins/${agent}.json"`;
}

/** Python that prints the approval output with terminal escapes removed, for parsing in the sandbox. */
export const plainOutput = `python3 -I -c 'import re,sys;t=open(sys.argv[1],errors="replace").read();t=re.sub(r"\\x1b\\][^\\x07\\x1b]*(\\x07|\\x1b\\\\)","",t);t=re.sub(r"\\x1b\\[(\\d*)C",lambda m:" "*int(m.group(1) or 1),t);print(re.sub(r"\\x1b\\[[0-9;?<>]*[A-Za-z]","",t))'`;
