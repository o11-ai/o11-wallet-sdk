import { oneOf, optional, required, type Args } from "../lib/args.js";
import { codexRunEffort } from "../lib/codex-effort.js";
import { OstackError } from "../lib/errors.js";
import { listAudiences } from "../lib/layers.js";
import { findWorkflow, loadPlaybooks, type Workflow } from "../lib/playbooks.js";
import { print } from "../lib/output.js";
import { remote, requireOnline } from "../lib/remote.js";
import { describeSchedule, parseSchedule, runsPerDay, scheduleRules, shiftSchedule, slotLabel, toCron, toRRule, withoutDays, withSlot, zoneOffset } from "../lib/schedule.js";
import { parseDays } from "../lib/time.js";
import { writeState, type ScheduleState } from "../lib/state.js";
import { effectiveSchedule, savedSchedule, scheduleAudience, type EffectiveSchedule } from "../lib/workflow-schedules.js";
import { systemTimeZone } from "../lib/time.js";
import { DEFAULT_AUDIENCE, enabledPlaybooks, loadWorkspace, type Workspace } from "../lib/workspace.js";
import { audienceOf } from "./customize.js";
import { cronCommand } from "./schedule-cron.js";

export const HOSTS = ["claude", "codex", "cron"] as const;
type Host = (typeof HOSTS)[number];

/** A workflow to schedule: per-audience workflows (outbound) once for each audience, the others once. */
type Entry = { workflow: Workflow; audience: string };

export function scheduleEntries(workspace: Workspace): Entry[] {
  const enabled = enabledPlaybooks(workspace);
  return loadPlaybooks().filter((playbook) => enabled.includes(playbook.id)).flatMap((playbook) => playbook.workflows.flatMap((workflow) =>
    (workflow.perAudience ? listAudiences(workspace, playbook.id) : [DEFAULT_AUDIENCE]).map((audience) => ({ workflow, audience }))));
}

/** "gtm/outbound" for the default audience, "gtm/outbound@customers" for another audience: the key in ostack.json. */
export function scheduleKey(workflow: Workflow, audience: string = DEFAULT_AUDIENCE): string {
  return audience === DEFAULT_AUDIENCE ? workflow.ref : `${workflow.ref}@${audience}`;
}

const audienceFlag = (audience: string) => (audience === DEFAULT_AUDIENCE ? "" : ` --audience ${audience}`);

/** The schedule a workflow runs on: this person's own from the wallet, one this computer kept before, or the default. */
export function effective(workspace: Workspace, workflow: Workflow, audience: string = DEFAULT_AUDIENCE): EffectiveSchedule {
  return effectiveSchedule(savedSchedule(workspace.setup.schedules, workflow, audience), workspace.state.schedules[scheduleKey(workflow, audience)], workflow);
}

/** Where this computer created the workflow's tasks; the entry is made when first needed. */
function localEntry(workspace: Workspace, workflow: Workflow, audience: string): ScheduleState {
  return (workspace.state.schedules[scheduleKey(workflow, audience)] ??= { installed: {} });
}

export function taskName({ workflow, audience }: Entry): string {
  return `ostack-${workflow.playbook}-${workflow.id}${audience === DEFAULT_AUDIENCE ? "" : `-${audience}`}`;
}

/**
 * The whole instruction a scheduled task stores: a `/goal`, so the agent keeps taking turns until the run is really
 * finished instead of stopping after the first one, and a separate model checks that finish line after each turn.
 * The goal's text is also the directive for the first turn. It only calls `o11 ostack prompt`, so updates never
 * require editing the task. No % (cron reads it as a newline) and no single quote (the crontab line quotes it).
 */
export function instruction(workspace: Workspace, { workflow, audience }: Entry): string {
  const flag = audienceFlag(audience);
  return [
    `/goal Run \`o11 ostack prompt ${workflow.ref}${flag}\` in ${workspace.root} and follow the instructions it prints exactly, to the end.`,
    `The goal is met when \`o11 ostack run end ${workflow.ref}${flag}\` has recorded this run and you have written the report its skill asks for,`,
    "or when the run stopped early the way those instructions allow (run start reported not_due or run_in_progress, or a doctor check failed) and you reported that.",
    "Keep going while due work remains inside the daily limits; never send anything twice to finish faster.",
  ].join(" ");
}

/**
 * Highest reasoning effort for scheduled runs. Claude Code also reads `effort: max` from the skill. Codex uses max
 * when its model list says the configured model offers it, otherwise xhigh (codex-effort.ts).
 */
export const CLAUDE_EFFORT = "max";


function view(workspace: Workspace, entry: Entry) {
  const { workflow, audience } = entry;
  const { spec, enabled, source } = effective(workspace, workflow, audience);
  const timezone = workspace.timezone;
  return {
    workflow: workflow.ref,
    ...(workflow.perAudience ? { audience } : {}),
    summary: workflow.summary,
    enabled,
    source,
    schedule: spec ? describeSchedule(spec, timezone) : null,
    runs_per_day: spec ? runsPerDay(spec) : {},
    cron: spec ? toCron(spec) : null,
    rrule: spec ? toRRule(spec) : null,
    installed: workspace.state.schedules[scheduleKey(workflow, audience)]?.installed ?? {},
  };
}

/** What to create in each host, so the agent creates exactly the same task wherever it runs. */
function hostSpec(workspace: Workspace, entry: Entry, host: Host) {
  const { workflow, audience } = entry;
  const flag = audienceFlag(audience);
  const { spec } = effective(workspace, workflow, audience);
  if (!spec) throw new OstackError("no_schedule", `${scheduleKey(workflow, audience)} has no schedule. Set one with "o11 ostack schedule set ${workflow.ref}${flag}".`);
  const timezone = workspace.timezone;
  const base = {
    workflow: workflow.ref, ...(workflow.perAudience ? { audience } : {}), name: taskName(entry), folder: workspace.root,
    instructions: instruction(workspace, entry), schedule: describeSchedule(spec, timezone),
  };
  const machine = systemTimeZone();
  // Claude Desktop and Codex read schedules in the computer's clock. When it differs from the workspace's, convert,
  // and rely on the run guard for the hour daylight saving can shift it by.
  const offset = machine === timezone ? 0 : zoneOffset(timezone, machine, new Date());
  const local = shiftSchedule(spec, offset);
  const timezoneNote =
    machine === timezone
      ? null
      : `This computer's clock is ${machine}, the workspace's is ${timezone}. The times below are converted to this computer's clock. Each run checks the workspace time itself, so a daylight-saving shift never makes it act at the wrong hour.`;
  // Hosts take one schedule per task, so a schedule with several rules (weekdays and weekends) becomes one task per rule.
  const names = spec.length === 1 ? [base.name] : spec.map((slot) => `${base.name}-${slotLabel(slot)}`);
  const installed = `o11 ostack schedule installed ${workflow.ref}${flag} --host ${host} --name ${names.join(",")}`;
  const list = (rules: string[], kind: string) =>
    names.length === 1
      ? `named "${names[0]}" ${kind} "${rules[0]}"`
      : `(one per rule, identical apart from name and schedule): ${names.map((name, index) => `"${name}" ${kind} "${rules[index]}"`).join("; ")}`;
  if (host === "claude") {
    const cron = toCron(local);
    return {
      ...base,
      host,
      where: "Claude Desktop, Code tab, Scheduled (a local task, so it can reach the workspace and your connectors)",
      tasks: names.map((name, index) => ({ name, cron: cron[index] })),
      permission_mode: "Auto, so each /goal turn runs unattended; or Accept edits with ostack and your mail/CRM tools always allowed after the first Run now",
      effort: `${CLAUDE_EFFORT}: the ostack skills ask for it themselves; also pick it in the task if the app offers an effort setting`,
      ask: `Create ${names.length === 1 ? "a local scheduled task" : "local scheduled tasks"} ${list(cron, "on the cron schedule")}, in the folder ${base.folder}, in local time, with the permission mode Auto, with these instructions exactly as written, starting with /goal: ${base.instructions}`,
      after: `Click Run now once on a task, approve each tool with "always allow", then run: ${installed}`,
      timezone_note: timezoneNote,
    };
  }
  if (host === "codex") {
    const rrule = toRRule(local);
    const effort = codexRunEffort();
    return {
      ...base,
      host,
      where: "Codex app, Automations (a standalone, local project automation on this folder, not a worktree)",
      tasks: names.map((name, index) => ({ name, rrule: rrule[index] })),
      sandbox: "workspace-write with network access, so the run can reach your mail and CRM tools",
      reasoning_effort: `${effort}: Max, or Extra high (xhigh) if the chosen model does not offer Max`,
      goals: "Codex runs /goal only with its goals feature on ([features] goals = true in ~/.codex/config.toml). Without it the same words still guide the run, but nothing makes it keep going after its first turn.",
      ask: `Create ${names.length === 1 ? "a standalone automation" : "standalone automations"} ${list(rrule, "on the schedule")}, for the project ${base.folder}, running locally (not in a worktree), at Max reasoning effort (Extra high if the model does not offer Max), with these instructions exactly as written, starting with /goal: ${base.instructions}`,
      after: `Run one once from the Automations page and check its result, then run: ${installed}`,
      timezone_note: timezoneNote,
    };
  }
  return { ...base, host, cron: toCron(local), install: "o11 ostack schedule cron install", timezone_note: timezoneNote };
}

export async function scheduleCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const sub = args.positionals[1] ?? "list";
  if (sub === "list") {
    print({ timezone: workspace.timezone, workflows: scheduleEntries(workspace).map((entry) => view(workspace, entry)) });
    return;
  }
  if (sub === "cron") return cronCommand(workspace, args);
  const workflow = findWorkflow(args.positionals[2] ?? required(args, "workflow"), enabledPlaybooks(workspace));
  const audience = audienceOf(args);
  if (audience !== DEFAULT_AUDIENCE && !workflow.perAudience) throw new OstackError("invalid_flag", `${workflow.ref} covers every audience in one run; it takes no --audience.`);
  if (audience !== DEFAULT_AUDIENCE && !listAudiences(workspace, workflow.playbook).includes(audience)) {
    throw new OstackError("unknown_audience", `No audience named "${audience}".`, { audiences: listAudiences(workspace, workflow.playbook) });
  }
  if (sub === "spec") return print(hostSpec(workspace, { workflow, audience }, oneOf(args, "host", HOSTS)));
  if (sub === "installed" || sub === "uninstalled") {
    const entry = localEntry(workspace, workflow, audience);
    if (sub === "installed") entry.installed[oneOf(args, "host", HOSTS)] = { name: required(args, "name"), at: new Date().toISOString() };
    else delete entry.installed[oneOf(args, "host", HOSTS)];
  } else if (sub === "set" || sub === "on" || sub === "off") {
    await changeSchedule(workspace, workflow, audience, sub, args);
  } else {
    throw new OstackError("unknown_command", "Use: o11 ostack schedule list | set|on|off|spec|installed|uninstalled <workflow> [--audience <name>] [--days <days>] | cron show|install|remove.");
  }
  await writeState(workspace.root, workspace.state);
  const result = view(workspace, { workflow, audience });
  const hosts = Object.keys(result.installed);
  const updates = [
    ...(hosts.length > 0 ? [`Also update the task in: ${hosts.join(", ")} (o11 ostack schedule spec ${workflow.ref}${audienceFlag(audience)} --host <host>).`] : []),
  ];
  print({ ...result, ...(updates.length > 0 && sub !== "installed" && sub !== "uninstalled" ? { update_hosts: updates.join(" ") } : {}) });
}

/**
 * `set`, `on` and `off` change this person's schedule in the wallet, so it is the same on every computer and in cloud
 * chats. Only the days named change; other days keep their rule, so weekdays and weekends can differ.
 */
async function changeSchedule(workspace: Workspace, workflow: Workflow, audience: string, sub: "set" | "on" | "off", args: Args): Promise<void> {
  requireOnline(workspace.setup, "changing a schedule");
  const current = effective(workspace, workflow, audience);
  let spec = current.spec ?? parseSchedule({ days: "weekdays", at: "09:00" });
  let enabled = current.enabled;
  if (sub === "set") {
    const days = optional(args, "days") ?? "weekdays";
    const at = optional(args, "at");
    const every = optional(args, "every");
    if ((at === undefined) === (every === undefined)) throw new OstackError("missing_flag", "Pass --at HH:MM, or --every <minutes> [--from HH:MM --to HH:MM].");
    const [slot] = at
      ? parseSchedule({ days, at })
      : parseSchedule({ days, every_minutes: every, from: optional(args, "from") ?? "08:00", to: optional(args, "to") ?? "18:00", offset: optional(args, "offset") ?? 7 });
    spec = withSlot(spec, slot!);
    enabled = true;
  } else if (sub === "off" && optional(args, "days") !== undefined) {
    const rest = withoutDays(spec, parseDays(optional(args, "days")!));
    // Dropping every day turns the schedule off and keeps its last rules for "on".
    if (rest.length > 0) spec = rest;
    else enabled = false;
  } else {
    enabled = sub === "on";
  }
  const saved = await remote().saveSchedule({
    workflow: workflow.ref, audience: scheduleAudience(workflow, audience), rules: scheduleRules(spec), status: enabled ? "active" : "paused",
  });
  workspace.setup.schedules = [...(workspace.setup.schedules ?? []).filter((item) => item !== savedSchedule(workspace.setup.schedules, workflow, audience)), saved];
  // A schedule this computer kept before now lives in the wallet.
  const entry = localEntry(workspace, workflow, audience);
  delete entry.spec;
  delete entry.enabled;
}
