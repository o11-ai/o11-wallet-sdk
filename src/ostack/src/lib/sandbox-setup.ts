import { browserOpenScript, browserSetupScript } from "./sandbox-setup-browser.js";
import { aiLoginFinishScript, aiLoginStartScript, type AiLoginAgent } from "./sandbox-ai-login.js";
import { AGENT_ENV, headlessAgent } from "./headless-agent.js";
import { sandboxStatusScript } from "./sandbox-status.js";
import { O11_KEY_DIR, O11_KEY_FILE, o11InstallScript, o11KeyLockScript, o11LoginScript } from "./sandbox-o11-login.js";

/**
 * Ostack on the person's o11 sandbox, set up by an agent that has only the o11 `sandbox` tool (a cloud chat with the
 * o11 connector): the ordered sandbox requests it sends, each a plain action and params. The sandbox's own o11 CLI,
 * signed in with a key o11 issues for that sandbox alone, then runs ostack and its schedules there. Pure, so the wallet
 * serves it over MCP (ostack_read sandbox_setup).
 */
export const SANDBOX_NAME = "ostack";
export const SANDBOX_WORKSPACE = "$HOME/ostack";
/** Puts the sandbox's o11 CLI on PATH for one command. */
export const PATHS = 'export PATH="$HOME/.local/bin:$HOME/.local/share/o11-wallet/bin:$PATH"';
/** Best effort: a restart can leave the cron daemon stopped. */
export const START_CRON = "pgrep -x cron >/dev/null || pgrep -x crond >/dev/null || sudo -n service cron start >/dev/null 2>&1 || sudo -n cron >/dev/null 2>&1 || true";
/** Single-quoted for sh. */
export const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/**
 * A sandbox request, with {sandbox} (the id get-or-create returned), {home} (install_o11's home= value), {lock}
 * (lock_o11_key's lock= value) and {agent} (claude or codex) to fill in, and {code}, {prompt} and {https_url}, which
 * reach the command only through its env, never its text.
 */
export type SandboxSetupRequest = { action: string; id?: string; provider?: string; params: Record<string, unknown> };
export type SandboxSetupStep = { step: string; request: SandboxSetupRequest; then: string };

/** Waits the longest exec allows (25 s); a step that takes longer answers status running (see `next`). */
const exec = (command: string, env?: Record<string, string>): SandboxSetupRequest =>
  ({ action: "exec", id: "{sandbox}", params: { command, wait: 25_000, ...(env ? { env } : {}) } });

/**
 * Installs or upgrades the wallet's o11 CLI (with ostack), checked against the wallet's checksums, then cron. The shared
 * install runs in its own subshell so its umask, trap and exits stay there. Prints home= and o11= lines.
 */
export function installO11Script(origin: string): string {
  return [
    "set -eu", PATHS, `v="$(`, o11InstallScript(origin), `)"`,
    "command -v cron >/dev/null 2>&1 || command -v crond >/dev/null 2>&1 || { a() { sudo -n env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=60 \"$@\"; }; a install -y -q --no-install-recommends cron >/dev/null 2>&1 || { a update -q >/dev/null 2>&1 && a install -y -q --no-install-recommends cron >/dev/null 2>&1; } || true; }",
    START_CRON,
    'printf "home=%s\\no11=%s\\n" "$HOME" "$(printf "%s\\n" "$v" | tail -n 1)"',
  ].join("\n");
}

/**
 * Takes the lock that serializes sign-ins on the sandbox's one key file, so a concurrent `o11 sandbox login` can't
 * swap keys mid-way. Prints lock=, the handle sign_in_o11 releases; without flock it names a marker that only expires.
 */
export function lockO11KeyScript(): string {
  return ["set -eu", `out="$(`, o11KeyLockScript, `)"`,
    `l="$(printf "%s\\n" "$out" | sed -n 2p)"; [ -n "$l" ] || l="$HOME/${O11_KEY_DIR}/o11-key-lock.unserialized"`,
    'printf "lock=%s\\n" "$l"'].join("\n");
}

/** Signs the sandbox's o11 in from the key o11 wrote there, then removes the key file and releases {lock} whatever happens. */
export function signInO11Script(origin: string): string {
  return [PATHS, o11LoginScript(origin, "{lock}")].join("\n");
}

/** The ostack skills for Claude Code and Codex, the browser profile, the workspace folder and cron. Safe to repeat. */
export function installOstackScript(): string {
  return ["set -eu", PATHS,
    'mkdir -p "$HOME/.claude" "$HOME/.codex"',
    "o11 ostack skills install --host auto >/dev/null",
    browserSetupScript(),
    `[ -f ${SANDBOX_WORKSPACE}/ostack.json ] || o11 ostack init --dir ${SANDBOX_WORKSPACE} >/dev/null`,
    START_CRON,
    `cd ${SANDBOX_WORKSPACE} && o11 ostack doctor`].join("\n");
}

/** Installs the saved schedules in the sandbox's cron, with a line that reinstalls them every 15 minutes. */
export function scheduleScript(agent: AiLoginAgent | "{agent}" = "claude"): string {
  return ["set -eu", PATHS, START_CRON, `cd ${SANDBOX_WORKSPACE} && o11 ostack schedule cron install --agent ${agent} --refresh`].join("\n");
}

/** One script for whichever agent fills {agent}. */
const byAgent = (build: (agent: AiLoginAgent) => string) => ["case '{agent}' in",
  ...(["claude", "codex"] as const).map(agent => `${agent})\n${build(agent)}\n;;`), `*) echo '{"state":"failed","detail":"Use claude or codex"}' ;;`, "esac"].join("\n");

/** Has the agent use the login o11 keeps, through o11's AI proxy with the sandbox's stand-in key. Never --approve, so the sandbox never makes a login of its own. */
const useLogin = () => ["set -eu", PATHS, "o11 sandbox login {sandbox} --login {agent}"].join("\n");

/** Starts the agent the way a scheduled run does (cron's command, efforts and Codex env file) with OSTACK_PROMPT. */
export const runCheckScript = () => ["set -eu", PATHS, `cd ${SANDBOX_WORKSPACE}`, byAgent(agent => agent === "claude"
  ? headlessAgent(agent, agent, SANDBOX_WORKSPACE, '"$OSTACK_PROMPT"', "max")
  // xhigh: the effort every recent Codex model accepts (codex-effort.ts), where a scheduled run picks per model.
  : `${AGENT_ENV}\n${headlessAgent(agent, agent, SANDBOX_WORKSPACE, '"$OSTACK_PROMPT"', "xhigh")}`)].join("\n");

/** Opens OSTACK_URL in the sandbox's Chrome, only when it is an https address. */
export const openSiteScript = () => [PATHS, browserSetupScript(),
  'case "$OSTACK_URL" in https://*) ;; *) echo "Use an https:// address" >&2; exit 2 ;; esac', browserOpenScript('"$OSTACK_URL"')].join("\n");

const STATUS = '{ "action": "command-status", "id": "{sandbox}", "params": { "commandId": "<commandId>" } }';
const LOGS = '{ "action": "logs", "id": "{sandbox}", "params": { "commandId": "<commandId>" } }';

/**
 * With `agent` (the CLI's --agent), the login steps carry only that agent's script and {agent} is filled in; without it
 * (MCP), one script serves both and the agent fills {agent}.
 */
export function sandboxSetupSteps(origin: string, agent?: AiLoginAgent) {
  const login = (build: (agent: AiLoginAgent) => string) => (agent ? build(agent) : byAgent(build));
  const steps: SandboxSetupStep[] = [
    { step: "get_sandbox", request: { action: "get-or-create", provider: "e2b", params: { name: SANDBOX_NAME, template: "ostack", ttl: 86_400, keepRunning: true } },
      then: "Keep sandbox.id as {sandbox}. It stays on, renewed from the person's o11 credits. A new sandbox comes with o11, Claude Code, Codex, Node, Chrome and cron installed; a desktop gives the person a screen for site sign-ins." },
    { step: "install_o11", request: exec(installO11Script(origin)),
      then: "Usually instant: it skips what is already installed. Keep the value after home= (the path alone) as {home}. If it fails or prints no home= line, run it once more; it needs to reach the o11 wallet." },
    { step: "lock_o11_key", request: exec(lockO11KeyScript()),
      then: "Keep the lock= line as {lock}. Exit 75 means another o11 sign-in is running in this sandbox: wait a few minutes and run this step again." },
    { step: "issue_o11_key", request: { action: "o11-key", id: "{sandbox}", params: { path: `{home}/${O11_KEY_FILE}` } },
      then: "o11 writes the sandbox's own key into that file and never returns it. If it fails, run it once more. Then run sign_in_o11 either way: it removes the key file and releases the lock. If this step still failed, start again at lock_o11_key." },
    { step: "sign_in_o11", request: exec(signInO11Script(origin)), then: "Prints signed-in. If it says o11 is not installed, run install_o11 again." },
    { step: "install_ostack", request: exec(installOstackScript()),
      then: "Ends with o11 ostack doctor. Finish the ostack-setup interview here with the person; the sandbox reads the answers from o11. Before check_login, read { \"action\": \"agents-status\", \"id\": \"{sandbox}\", \"params\": {} } (o11 sandbox agents-status {sandbox} with the CLI) every minute until data.agents.status is ready. After 10 minutes, tell the person Ostack can't run on its own yet." },
    { step: "check_login", request: { action: "ai-login-status", params: { provider: "{agent}" } },
      then: "{agent} is the agent that runs the schedules: claude, or codex when the person uses Codex. If data.connected is true and data.needsSignIn is false, go to use_login: the person already has a login o11 keeps." },
    { step: "start_login", request: exec(login(aiLoginStartScript)),
      then: "Send the person its tell_person line as written and wait for them. If it prints state done, go to save_login. If it fails, run it once more." },
    { step: "finish_login", request: exec(login(aiLoginFinishScript), agent === "codex" ? undefined : { OSTACK_LOGIN_CODE: "{code}" }),
      then: "Claude: fill {code} with the code the person sent. Codex: run it after the person says they entered the code, without env. Done on state done. On waiting, run it again; it never types the code twice. On expired or failed, run start_login again for a new link." },
    { step: "save_login", request: { action: "ai-login-save", params: { provider: "{agent}", fromSandbox: "{sandbox}" } },
      then: "o11 keeps the login, renews it and deletes it from the sandbox. Every sandbox of theirs uses it from now on." },
    { step: "use_login", request: exec(useLogin()),
      then: "Run it once: each run makes a new key and cuts off runs in progress. Done when the {agent} result has source o11-proxy. Otherwise run check_login and the steps after it again; after two failures, stop and tell the person Ostack can't run on its own yet. Later, run it only when check_login is done and the sandbox status says the agent login needs signing in." },
    { step: "run_check", request: exec(runCheckScript(), { OSTACK_PROMPT: "{prompt}" }),
      then: "For the ostack-setup checks on go: fill {prompt} with the check and it runs {agent} in ~/ostack the way a scheduled run does. Its output is the check's answer. Skip it otherwise." },
    { step: "turn_on_schedules", request: exec(scheduleScript("{agent}")),
      then: "Only after use_login is done and the person's schedules are saved (ostack_write schedule, or o11 ostack schedule set with the CLI) with a timezone (ostack_read settings or o11 ostack settings show; save one with ostack_write settings or o11 ostack settings set timezone if it is missing). Run again after schedules change, or wait: cron reinstalls them every 15 minutes." },
  ];
  if (agent) for (const step of steps) step.request = JSON.parse(JSON.stringify(step.request).replaceAll("{agent}", agent)) as SandboxSetupRequest;
  return {
    sandbox: SANDBOX_NAME,
    ...(agent ? { agent } : {}),
    steps,
    when_a_site_needs_the_person: [
      { request: exec(openSiteScript(), { OSTACK_URL: "{https_url}" }), then: "Fill {https_url} with the page. Opens it in the sandbox's Chrome profile that scheduled runs use." },
      { request: { action: "desktop", id: "{sandbox}", params: {} }, then: "Send the person the one-use link to sign in there; make a new one if it lapses." },
    ],
    when_the_person_returns: [
      { request: { action: "info", id: SANDBOX_NAME, params: {} },
        then: "Never creates a sandbox. If it is not found or deleted, the person has none: skip the rest. Otherwise keep sandbox.id as {sandbox}; if it is stopped, run get_sandbox first to resume it." },
      { request: exec(sandboxStatusScript()),
        then: "setup.pending_questions lists question ids: read their text with ostack_read setup (o11 ostack setup status with the CLI). Ask the person everything in ask_person and those questions in one short message, after answering what you can yourself. Save the answers on your side (ostack_write, or the CLI); the sandbox reads them from o11 on its next run. Never ask the person to type on the sandbox. If agent_login.needs_sign_in is true, the agent login needs signing in: run check_login and the steps after it. If doctor.failing has the login check, run lock_o11_key, issue_o11_key and sign_in_o11. If doctor or setup is null or doctor.failing has another check, run install_ostack again and read this again. If cron_running is false, run install_o11 again. If schedules_installed is false and schedules are saved, run turn_on_schedules." },
    ],
    next: `Run the steps in order with the o11 sandbox tool, filling in the {placeholders}. A failed step can run again, but use_login only as its then says. If exec answers status running, poll command-status (${STATUS}) until it has an exitCode, then read logs (${LOGS}) for the output. Tell the person only what a step's then says to ask them.`,
  };
}
