import { optional, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import { print } from "../lib/output.js";
import { hostChoice } from "../lib/host-choice.js";
import { remote, type HostedMachine, type HostProvider, type HostRemote } from "../lib/remote.js";
import { hostReport, leaveLocalSchedules, prepareHostedSchedules, recordHostedSchedules } from "./host-sync.js";
import { needsPerson, orchestratorAgent, signInOf, withPersonSteps } from "./host-signin.js";
import { AGENT_ENV, headlessAgent } from "./schedule-cron.js";
import { browserOpenScript, browserSetupScript } from "../lib/host-browser.js";

/**
 * `o11 ostack host`: the person's own always-on computer (a Linux desktop in an o11 sandbox, paid from their o11
 * credits) where ostack, its schedules and its browser sign-ins live. The agent the person talks to sets it up and
 * directs it; the person only opens a link when a site needs them to sign in.
 */
const DEFAULT_NAME = "ostack";
const WORKSPACE = "$HOME/ostack";
const PATHS = `export PATH="$HOME/.local/bin:$HOME/.local/share/o11-wallet/bin:$PATH"\n${AGENT_ENV}`;
/** Best effort: o11 installs cron when it prepares the computer; a restart can leave the daemon stopped. */
const START_CRON = "pgrep -x cron >/dev/null || pgrep -x crond >/dev/null || sudo -n service cron start >/dev/null 2>&1 || sudo -n cron >/dev/null 2>&1 || true";
const shell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

function hostRemote(): HostRemote {
  const host = remote().host;
  if (!host) throw new OstackError("not_supported", 'This o11 CLI cannot run a hosted ostack computer. Run "o11 update".');
  return host;
}
const nameOf = (args: Args) => optional(args, "name") ?? DEFAULT_NAME;
/**
 * Unset: o11 picks, an E2B desktop first and Boat when E2B can't start one. --provider (or
 * O11_OSTACK_HOST_PROVIDER) pins one, only when the person asks.
 */
const providerOf = (args: Args): HostProvider | undefined => {
  const value = optional(args, "provider") ?? process.env.O11_OSTACK_HOST_PROVIDER;
  if (value === undefined || value === "auto") return undefined;
  if (value !== "boat" && value !== "e2b") throw new OstackError("invalid_flag", "Use --provider boat or e2b.");
  return value;
};
/**
 * Why a computer is not running. A failed one never started. A stopped one ran out of credits or was stopped; o11
 * doesn't say which, so host setup resumes it, and a refusal to pay means the credits ran out.
 */
function stopped(machine: HostedMachine) {
  if (machine.state === "failed") return { cause: "failed" as const, text: `The hosted computer ${machine.name} failed to start. Run "o11 ostack host setup" again.` };
  return { cause: "stopped" as const, text: `The hosted computer ${machine.name} stopped, usually because the o11 credits ran out. Run "o11 ostack host setup" to resume it. If o11 says the wallet can't pay, ask the person to add credits, then run it again.` };
}
async function existing(host: HostRemote, name: string, provider: HostProvider | undefined) {
  const machine = await host.find(name, provider);
  if (!machine) throw new OstackError("not_found", `There is no hosted ostack computer named ${name}. Run "o11 ostack host setup".`);
  if (["stopped", "failed"].includes(machine.state)) {
    const why = stopped(machine);
    throw new OstackError("host_stopped", why.text, { cause: why.cause });
  }
  return machine;
}
async function step(host: HostRemote, id: string, label: string, command: string, timeoutMs?: number) {
  const result = await host.run(id, `set -eu\n${PATHS}\n${command}`, timeoutMs);
  if (result.exitCode !== 0) throw new OstackError("host_step_failed", `${label} failed on the hosted computer (exit ${result.exitCode ?? "unknown"}).`, {
    step: label, stderr: result.stderr.trim().slice(-1200), stdout: result.stdout.trim().slice(-600),
  });
  return result.stdout.trim();
}

/** Creates or resumes the computer, signs it in, installs ostack and its skills, and makes the workspace folder. */
async function setup(args: Args) {
  const host = hostRemote();
  // The person chose to keep ostack on their own computer, or the hosted one failed to start twice.
  if (hostChoice(await remote().setup()) === "local") {
    throw new OstackError("host_declined", 'This person runs ostack on their own computer. Schedule there instead. "o11 ostack settings set host hosted --me" changes that, only when they ask.');
  }
  const started = Date.now();
  const { machine, created, resumed, replaced, prepared, fallback } = await host.ensure({ name: nameOf(args), size: optional(args, "size") ?? "small", provider: providerOf(args) });
  const signIns = withPersonSteps(await host.signIn(machine.id, signInOf(args)), args);
  // One call: the skills for both Claude Code and Codex (auto picks agents by their folders, so both are made first),
  // the workspace and cron for schedules. The report after it carries the doctor and what to ask the person.
  await step(host, machine.id, "Installing ostack", [
    'mkdir -p "$HOME/.claude" "$HOME/.codex"',
    "o11 ostack skills install --host auto >/dev/null",
    browserSetupScript(),
    `[ -f ${WORKSPACE}/ostack.json ] || o11 ostack init --dir ${WORKSPACE} >/dev/null`,
    START_CRON].join("\n"));
  print({ host: machine, created, resumed, replaced, prepared: prepared ?? null,
    ...(fallback?.length ? { provider_note: { refused: fallback, say: "For your own notes only; don't mention providers to the person." } } : {}),
    sign_ins: signIns, workspace: "~/ostack", ...(await hostReport(host, machine.id)),
    seconds: Math.round((Date.now() - started) / 1000),
    next: [
      ...(needsPerson(signIns) ? ["A sign-in needs the person once. Before o11 ostack host schedule, run o11 ostack host signin for a fresh link, send them its tell_person line, and run its then_run when they are done."] : []),
      ...(replaced ? ["The hosted computer was replaced with a new one, so its site sign-ins are gone. Ask the person to sign in again where a workflow needs it (o11 ostack host open <url>), and run o11 ostack host schedule again."] : []),
      'Finish the ostack-setup interview here, with the person. Its answers are saved in o11, so the hosted computer reads them; never ask the person to type on the hosted computer.',
      'Schedule the workflows on the hosted computer: o11 ostack host schedule (instead of a scheduler on this computer).',
      'When a step needs the person signed in to a site (LinkedIn, email), run o11 ostack host open <url> and send them the link.',
    ] });
}

/** Renews the computer's o11 key and its coding agents' sign-ins, or finishes one with --code. Safe to run any time. */
async function signin(args: Args) {
  const host = hostRemote();
  const machine = await existing(host, nameOf(args), providerOf(args));
  print({ host: machine, sign_ins: withPersonSteps(await host.signIn(machine.id, signInOf(args)), args) });
}

/**
 * Installs the workflows' schedules in the computer's cron, run by a coding agent signed in there, with a line that
 * reinstalls them every 15 minutes. Then stops this computer running them too.
 */
async function schedule(args: Args) {
  const host = hostRemote();
  const machine = await existing(host, nameOf(args), providerOf(args));
  const agent = optional(args, "agent") ?? await orchestratorAgent(host);
  if (agent !== "claude" && agent !== "codex") throw new OstackError("invalid_flag", "Use --agent claude or codex.");
  // --force skips the check, for a sign-in o11 can't see, such as one set up by hand.
  if (host.longLived && args.flags.force !== true && !(await host.longLived(machine.id, agent))) {
    throw new OstackError("sign_in_needed", `${agent} on the hosted computer has no lasting sign-in yet, so scheduled runs would stop. Run o11 ostack host signin --login ${agent}, send the person its tell_person line, run its then_run when they are done, then run host schedule again. If the agent is signed in another way, pass --force.`);
  }
  const synced = await prepareHostedSchedules(host, machine.id);
  await step(host, machine.id, "Starting cron", `${START_CRON}\npgrep -x cron >/dev/null || pgrep -x crond >/dev/null`);
  const installed = await step(host, machine.id, "Installing the schedules", `cd ${WORKSPACE} && o11 ostack schedule cron install --agent ${agent} --refresh`);
  const local = leaveLocalSchedules(synced.workspace);
  await recordHostedSchedules(synced.workspace, machine.name, agent);
  print({ host: machine, agent, cron: parse(installed), ...synced.report, local_cron_removed: local.cron_removed,
    ...(local.tasks.length > 0 ? {
      delete_local_tasks: local.tasks,
      next: "These scheduled tasks on this computer would run a second time. Delete each one in its app (Claude Desktop: Scheduled; Codex: Automations), then run its then_run.",
    } : {}) });
}

/** Opens a page in the computer's browser (when given) and returns a one-use link for the person to take over. */
async function open(args: Args) {
  const host = hostRemote();
  const machine = await existing(host, nameOf(args), providerOf(args));
  const url = args.positionals[2];
  if (url && !/^https:\/\/[^\s'"]+$/.test(url)) throw new OstackError("invalid_input", "Open an https:// address.");
  // The link first: on E2B it starts the desktop, unless the browser already started its display.
  const link = await host.link(machine.id, args.flags.browser === true ? "browser" : "desktop");
  // Every open also (re)writes the browser setup, so a computer set up before it gets it here. The page opens in the
  // profile scheduled runs drive, so the person's sign-in is theirs too.
  await step(host, machine.id, "Opening the page", [browserSetupScript(), browserOpenScript(url ? shell(url) : "")].join("\n"), 300_000);
  print({ host: machine, opened: url ?? null, link: link.url, expires_at: link.expiresAt ?? null,
    say: "Send the person this link. It opens their ostack computer's screen once and expires in a few minutes; make a new one if it lapses." });
}

async function status(args: Args) {
  const host = hostRemote();
  const machine = await host.find(nameOf(args), providerOf(args));
  if (!machine) return print({ host: null, ask_person: [], next: 'Run "o11 ostack host setup".' });
  if (["stopped", "failed"].includes(machine.state)) {
    const why = stopped(machine);
    return print({ host: machine, stopped: why.cause, ask_person: [], orchestrator_actions: [why.text],
      ...(why.cause === "stopped" ? { if_credits_ran_out: "Ask the person: ostack stopped running because your o11 credits ran out. Add credits in the o11 wallet, then tell me." } : {}) });
  }
  // A resumed computer has a new o11 proxy key; put it in place before anything runs there.
  const renewed = await host.refreshProxyLogins?.(machine.id).catch(() => []) ?? [];
  const report = await hostReport(host, machine.id);
  // A login o11 keeps that needs the person again: one approval on this computer, and the hosted computer works again.
  const relogin = renewed.flatMap((item) => {
    const agent = Reflect.get(Object(item), "agent");
    return Reflect.get(Object(item), "loginNeeded") === true && typeof agent === "string" ? [{ kind: "ai_login" as const, agent,
      do: `Run o11 login ${agent} on this computer, send the person its tell_person line, and run its then_run. The hosted computer needs nothing else.` }] : [];
  });
  print({ host: machine, ...(renewed.length > 0 ? { sign_ins: renewed } : {}), ...report, ask_person: [...report.ask_person, ...relogin] });
}

/** Runs a shell command on the computer, for the agent directing it. */
async function run(args: Args) {
  const host = hostRemote();
  const machine = await existing(host, nameOf(args), providerOf(args));
  const command = optional(args, "command");
  if (!command) throw new OstackError("missing_flag", "--command is required.");
  const result = await host.run(machine.id, `${PATHS}\ncd ${WORKSPACE} 2>/dev/null || cd\n${command}`, 600_000);
  print({ host: machine, ...result });
  if (result.exitCode !== 0) process.exitCode = 1;
}

/**
 * Runs a setup question's check there the way a scheduled run starts: the scheduling agent, headless, in ~/ostack,
 * with the same permissions. Mail, CRM and calendar tools that pass here work in scheduled runs.
 */
async function check(args: Args) {
  const host = hostRemote();
  const machine = await existing(host, nameOf(args), providerOf(args));
  const prompt = optional(args, "prompt");
  if (!prompt) throw new OstackError("missing_flag", "--prompt is required: the check to run, in plain words.");
  const agent = optional(args, "agent") ?? await orchestratorAgent(host);
  if (agent !== "claude" && agent !== "codex") throw new OstackError("invalid_flag", "Use --agent claude or codex.");
  const full = `${prompt}\n\nThis is a setup check, not a run: send nothing to anyone but the user, and do not use a browser unless the check names one. End with one line on its own: ${PASSED} or ${FAILED} <why, in a few words>.`;
  const command = headlessAgent(agent, agent, WORKSPACE, full, "medium");
  const result = await host.run(machine.id, `${PATHS}\ncd ${WORKSPACE} || exit 3\n${command}`, 600_000);
  const passed = result.exitCode === 0 && checkVerdict(result.stdout);
  print({ host: machine, agent, passed, ...result,
    next: passed ? "Say nothing to the person." : "The ostack-setup skill's On go step 3 says what to ask the person, or where to run the workflow instead." });
  if (!passed) process.exitCode = 1;
}

const PASSED = "CHECK PASSED";
const FAILED = "CHECK FAILED:";
/** The agent's last verdict line; no verdict counts as failed. */
export function checkVerdict(stdout: string): boolean {
  const verdict = stdout.split("\n").map((line) => line.trim().replace(/^[*`_]+|[*`_]+$/g, "")).filter((line) => line.startsWith(PASSED) || line.startsWith(FAILED)).at(-1);
  return verdict?.startsWith(PASSED) ?? false;
}

function parse(text: string): unknown {
  try { return JSON.parse(text); } catch { return text.slice(-2000); }
}

const SUBCOMMANDS: Record<string, (args: Args) => Promise<void>> = { setup, signin, schedule, open, status, run, check };

export async function hostCommand(args: Args): Promise<void> {
  const sub = args.positionals[1] ?? "status";
  const handler = SUBCOMMANDS[sub];
  if (!handler) throw new OstackError("unknown_command", `Unknown host command "${sub}". Use setup, signin, schedule, open, status, run or check.`);
  await handler(args);
}
