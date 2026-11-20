import { isatty } from "node:tty";
import { installIdSync, installTrackingEnabled, reportOrigin } from "./cli-install.js";
import { walletOrigin } from "./access-tokens.js";
import { lastWalletResponse, useInstallId } from "./cli-telemetry-context.js";
import { classifyError, commandName, flagNames, loginFailureReason, runEnvironment, subcommandName, telemetryEvent,
  type LoginMethod, type ProfileKind, type SpooledEvent } from "./cli-telemetry-events.js";
import { appendSpoolSync, flushSpoolInBackground } from "./cli-telemetry-spool.js";
import { compiledCli } from "./cli-update.js";
import type { LoginAuth } from "./browser-login.js";

/**
 * Usage telemetry for one CLI process (see cli-install.ts for what is collected). Off with DO_NOT_TRACK=1 or
 * O11_TELEMETRY=0: then no install ID is read or created, no header is sent and nothing is written or posted.
 * Events go to the local spool when they happen (login) or when the process exits (cli_command); a background process
 * posts the spool (cli-telemetry-spool.ts), so no command waits on delivery.
 */
export type CliTelemetry = ReturnType<typeof startCliTelemetry>;
type Properties = SpooledEvent["properties"];

export function profileKind(profile: string | undefined, config: { refreshToken?: string }, env = process.env): ProfileKind {
  if (!(profile ?? env.O11_TOOLS_PROFILE) && env.O11_TOOLS_URL && env.O11_API_KEY) return "env";
  return config.refreshToken ? "oauth" : "key";
}

export function startCliTelemetry(version: string, argv: string[], known: (name: string) => boolean) {
  const enabled = installTrackingEnabled();
  const state: { command: string; subcommand?: string; phase: "parse" | "run"; error?: Properties; profileKind?: ProfileKind;
    runId?: string; origin?: string; transport: "http" | "mcp_stdio"; autoUpdate?: boolean; login?: { method: LoginMethod; started: number; auth?: LoginAuth } } =
    { command: "other", phase: "parse", transport: "http" };
  const flags = flagNames(argv);
  let environment: Properties = {};
  const commandEvent = (exitCode: number): SpooledEvent => {
    const last = lastWalletResponse;
    return telemetryEvent("cli_command", {
      // An unknown command's flags may be anything typed, so only a known command's flag names are kept.
      ...environment, command: state.command, ...(state.subcommand ? { subcommand: state.subcommand } : {}), flags: state.command === "other" ? [] : flags,
      exit_code: Math.min(255, Math.max(0, Math.trunc(exitCode))), duration_ms: Math.round(performance.now()), transport: state.transport,
      ...(state.profileKind ? { profile_kind: state.profileKind } : {}), ...(state.runId ? { run_id: state.runId } : {}),
      // A failure carries its own status and IDs; a success reports the last wallet answer.
      ...state.error ?? { ...(last.status ? { http_status: last.status } : {}), ...(last.requestId ? { request_id: last.requestId } : {}),
        ...(last.callId ? { call_id: last.callId } : {}) },
    });
  };
  if (enabled) {
    const id = (() => { try { return installIdSync(); } catch { return undefined; } })();
    useInstallId(id);
    if (id) flushSpoolInBackground({ origin: reportOrigin, installId: id, version });
    environment = runEnvironment(process.env, { stdin: isatty(0), stdout: isatty(1) }, { version, standalone: compiledCli });
    // After an auto-update hand-off the updated child records this command itself (auto_update: child), so the parent stays quiet.
    process.once("exit", code => { if (!state.autoUpdate) appendSpoolSync([withOrigin(commandEvent(code))]); });
  }
  // A profile on a preview or local wallet reports there, not to production.
  function withOrigin(event: SpooledEvent): SpooledEvent { return state.origin ? { ...event, origin: state.origin } : event; }
  const login = (event: string, extra: Properties) => {
    if (!enabled || !state.login) return;
    appendSpoolSync([withOrigin(telemetryEvent(event, { ...environment, method: state.login.method, ...(state.login.auth ? { auth: state.login.auth } : {}),
      ...extra }))]);
  };
  return {
    enabled,
    /** The command as parsed: allow-listed name and subcommand only. */
    command(command: string | undefined, args: string[]) {
      state.command = commandName(command, known);
      state.subcommand = state.command === "other" ? undefined : subcommandName(state.command, args[0]);
      if (state.command === "mcp") state.transport = "mcp_stdio";
    },
    /** Arguments were accepted; later plain errors are not input errors. */
    running() { state.phase = "run"; },
    profile(kind: ProfileKind) { state.profileKind = kind; },
    /** The wallet this command talks to; its events are posted there. */
    wallet(baseUrl: string) { try { const origin = walletOrigin(baseUrl); if (origin !== reportOrigin()) state.origin = origin; } catch { /* default origin */ } },
    run(runId: string) { state.runId = runId; },
    failed(error: unknown) { state.error = classifyError(error, state.phase); },
    /** This process hands over to the updated CLI, which records the same command itself. */
    autoUpdate() { state.autoUpdate = true; },
    loginStarted(method: LoginMethod) {
      state.login = { method, started: performance.now() };
      login("cli_login_started", {});
    },
    loginAuth(auth: LoginAuth) { if (state.login) state.login.auth = auth; },
    loginCompleted(reused: boolean) {
      if (state.login && reused) state.login.method = "reused";
      login("cli_login_completed", { reused, duration_ms: Math.round(performance.now() - (state.login?.started ?? 0)) });
    },
    loginFailed(error: unknown) {
      if (!state.login) return;
      login("cli_login_failed", { reason: loginFailureReason(error, state.login.method), ...classifyError(error, "run"),
        duration_ms: Math.round(performance.now() - state.login.started) });
    },
  };
}
