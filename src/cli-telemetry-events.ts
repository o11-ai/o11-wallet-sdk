import { z } from "zod";
import { CallStreamError } from "./call-stream.js";
import { ToolCallError, ToolClientError, TopUpRequestError } from "./client-errors.js";
import { InvocationWaitTimeoutError } from "./invocation-wait.js";
import { TokenNotRenewableError } from "./token-provider.js";
import { EmailLoginError } from "./email-login.js";
import { LoginFailedError, NotLoggedInError, type LoginFailureReason } from "./login-errors.js";

/**
 * cli_command and cli_login_* events, built from the command line, environment and error only. Pure: the spool
 * (cli-telemetry-spool.ts) stores them and the wallet's /v1/cli/events checks the same rules again. Nothing here is
 * free text: names are allow-listed or pattern-checked, IDs are UUIDs, and arguments and flag values are never read.
 */
export const telemetrySchemaVersion = 1;
export type CliErrorClass = "network" | "auth" | "not_logged_in" | "update_required" | "validation" | "server_4xx" | "server_5xx"
  | "insufficient_balance" | "not_configured" | "not_found" | "cancelled" | "wait_timeout" | "unknown";
export type LoginMethod = "browser" | "no_browser" | "key_stdin" | "reused";
export type ProfileKind = "oauth" | "key" | "env";
export type SpooledEvent = { id: string; event: string; timestamp: string; properties: Record<string, string | number | boolean | string[]>;
  /** The wallet origin the command used; the sender posts each event there and strips this field. Absent: the default. */
  origin?: string };

type Env = Record<string, string | undefined>;
const word = /^[a-z][a-z0-9_-]{0,39}$/;
const flagName = /^--?[a-z][a-z0-9-]{0,39}$/;
const uuid = z.uuid();

/** Commands outside the help table that the CLI still answers. */
const extraCommands = new Set(["help", "version", "wallet", "generate_session_id", "session-id", "run-status", "rate", "invoke", "reports",
  "report", "report-status", "report-info", "configure-service", "retry", "events", "release", "resources", "history", "wait", "status"]);
/** Subcommands that are fixed words. sandbox and ostack take an action word, checked by pattern only. */
const fixedSubcommands: Record<string, ReadonlySet<string>> = {
  keys: new Set(["add", "list", "remove", "activate"]), avatar: new Set(["clone", "status", "video"]),
  login: new Set(["claude", "codex"]), logout: new Set(["claude", "codex"]), resources: new Set(["list", "get", "events", "release"]),
};
const actionWord = /^[a-z][a-z0-9-]{0,31}$/;

/** The command name when the CLI knows it, else "other"; never the text someone typed. */
export function commandName(command: string | undefined, known: (name: string) => boolean) {
  if (!command || command === "--help" || command === "-h") return "help";
  if (command === "--version") return "version";
  return known(command) || extraCommands.has(command) ? command : "other";
}
export function subcommandName(command: string, first: string | undefined) {
  if (!first) return undefined;
  if (command === "sandbox" || command === "ostack") return actionWord.test(first) ? first : undefined;
  return fixedSubcommands[command]?.has(first) ? first : undefined;
}
/** Flag names before `--`, without `=value`; values and positional arguments are never kept. */
export function flagNames(argv: string[]) {
  const names = new Set<string>();
  for (const value of argv) {
    if (value === "--") break;
    const name = value.split("=", 1)[0]!;
    if (flagName.test(name)) names.add(name);
  }
  return [...names].sort().slice(0, 30);
}

const ciVariables: [string, string][] = [["GITHUB_ACTIONS", "github-actions"], ["GITLAB_CI", "gitlab"], ["CIRCLECI", "circleci"],
  ["BUILDKITE", "buildkite"], ["JENKINS_URL", "jenkins"], ["TF_BUILD", "azure-pipelines"], ["CODEBUILD_BUILD_ID", "codebuild"],
  ["BITBUCKET_BUILD_NUMBER", "bitbucket"], ["TRAVIS", "travis"], ["VERCEL", "vercel"], ["NETLIFY", "netlify"]];
/** Coding agents that mark the shells they start. Only presence is read, never the value. */
const agentVariables: [string, string][] = [["CLAUDECODE", "claude-code"], ["CLAUDE_CODE_ENTRYPOINT", "claude-code"],
  ["CODEX_SANDBOX", "codex"], ["CODEX_SANDBOX_NETWORK_DISABLED", "codex"], ["CODEX_MANAGED_BY_NPM", "codex"], ["CODEX_HOME", "codex"],
  ["CURSOR_AGENT", "cursor"], ["CURSOR_TRACE_ID", "cursor"], ["GEMINI_CLI", "gemini-cli"], ["OPENCODE", "opencode"],
  ["AMP_HOME", "amp"], ["GOOSE_TERMINAL", "goose"], ["CLINE_ACTIVE", "cline"], ["AIDER_MODEL", "aider"],
  ["REPL_ID", "replit"], ["COPILOT_AGENT_ACTION", "copilot"]];

/** Where the CLI runs: platform, CI, terminal and coding-agent host. */
export function runEnvironment(env: Env, tty: { stdin: boolean; stdout: boolean }, cli: { version: string; standalone: boolean }) {
  const set = (name: string) => Boolean(env[name]) && env[name] !== "0" && env[name] !== "false";
  const ciProvider = ciVariables.find(([name]) => set(name))?.[1];
  const ci = Boolean(ciProvider) || set("CI");
  const agentHost = agentVariables.find(([name]) => set(name))?.[1];
  return {
    schema_version: telemetrySchemaVersion, cli_version: cli.version, standalone: cli.standalone,
    os: ["darwin", "linux", "win32"].includes(process.platform) ? process.platform : "other",
    arch: ["arm64", "x64"].includes(process.arch) ? process.arch : "other",
    ci, ...(ciProvider ? { ci_provider: ciProvider } : {}), is_tty: tty.stdin && tty.stdout, stdout_tty: tty.stdout,
    ...(agentHost ? { agent_host: agentHost } : {}),
    ...(set("O11_CLI_UPDATE_REEXEC") ? { auto_update: env.O11_CLI_UPDATE_REEXEC === "helper" ? "helper" : "child" } : {}),
  };
}

/** The ToolClientError behind a wrapped failure, or the error itself. An abort with a typed reason (Ctrl-C during
 * sign-in rejects the poll's delay with an AbortError whose cause is that reason) counts as the reason. */
function walletError(error: unknown): unknown {
  if (error instanceof ToolCallError || error instanceof TopUpRequestError) return walletError(error.cause);
  if (error instanceof Error && error.name === "AbortError" && error.cause instanceof LoginFailedError) return error.cause;
  return error;
}
const errorCode = (body: unknown) => typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
  && /^[A-Z_]{1,80}$/.test(body.error) ? body.error : undefined;

const loginErrorClass: Record<LoginFailureReason, CliErrorClass> = { timeout: "network", denied: "auth", expired: "auth", network: "network",
  invalid_key: "auth", card_not_found: "not_found", cancelled: "cancelled", rate_limited: "server_4xx", unexpected_address: "unknown",
  check_failed: "network" };
/** Error class and the wallet's own status, code and request IDs. `phase` is where it was thrown: parsing input or running. */
export function classifyError(error: unknown, phase: "parse" | "run") {
  const cause = walletError(error);
  if (cause instanceof ToolClientError || cause instanceof CallStreamError && cause.status !== undefined) {
    const status = cause instanceof ToolClientError ? cause.status : cause.status!;
    const code = errorCode(cause instanceof ToolClientError ? cause.response : cause.body);
    const errorClass: CliErrorClass = status === 426 || code === "UPDATE_REQUIRED" ? "update_required"
      : status === 401 ? "auth" : code === "INSUFFICIENT_BALANCE" ? "insufficient_balance" : code === "NOT_CONFIGURED" ? "not_configured"
      : status === 404 || code === "NOT_FOUND" ? "not_found" : code === "INVALID_INPUT" ? "validation"
      : status >= 500 ? "server_5xx" : "server_4xx";
    const trace = cause instanceof ToolClientError ? cause.trace : undefined;
    return { error_class: errorClass, http_status: status, ...(code ? { error_code: code } : {}),
      ...(trace?.requestId && uuid.safeParse(trace.requestId).success ? { request_id: trace.requestId.toLowerCase() } : {}),
      ...(trace?.callId ? { call_id: trace.callId } : {}) };
  }
  const errorClass: CliErrorClass = cause instanceof z.ZodError || phase === "parse" && cause instanceof Error && !(cause instanceof NotLoggedInError) ? "validation"
    : cause instanceof NotLoggedInError ? "not_logged_in"
    : cause instanceof TokenNotRenewableError ? "auth"
    : cause instanceof InvocationWaitTimeoutError ? "wait_timeout"
    : cause instanceof LoginFailedError ? loginErrorClass[cause.reason]
    : cause instanceof DOMException && cause.name === "AbortError" ? "cancelled"
    : cause instanceof DOMException && cause.name === "TimeoutError" || cause instanceof TypeError && "code" in cause && typeof cause.code === "string"
      || cause instanceof CallStreamError ? "network"
    : "unknown";
  const network = cause instanceof TypeError && "code" in cause && typeof cause.code === "string" && /^[A-Za-z_]{1,40}$/.test(cause.code) ? cause.code
    : cause instanceof DOMException && cause.name === "TimeoutError" ? "timeout" : undefined;
  return { error_class: errorClass, ...(network ? { network_error: network } : {}) };
}

/** A login failure's reason, from typed errors only. */
export function loginFailureReason(failure: unknown, method: LoginMethod): LoginFailureReason | "invalid_code" | "unknown" {
  const error = walletError(failure);
  if (error instanceof LoginFailedError) return error.reason;
  if (error instanceof EmailLoginError) return error.status === 429 ? "rate_limited" : error.code === "invalid_otp" ? "invalid_code" : "network";
  if (error instanceof ToolClientError) return error.status === 401 || error.status === 403 ? (method === "key_stdin" ? "invalid_key" : "expired") : "network";
  if (error instanceof DOMException) return error.name === "TimeoutError" ? "timeout" : "cancelled";
  if (error instanceof TypeError && "code" in error) return "network";
  return "unknown";
}

export function telemetryEvent(event: string, properties: SpooledEvent["properties"], now = new Date()): SpooledEvent {
  return { id: crypto.randomUUID(), event, timestamp: now.toISOString(), properties };
}
