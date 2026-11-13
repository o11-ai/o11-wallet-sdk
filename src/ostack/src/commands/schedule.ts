import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { oneOf, optional, required, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import { listAudiences } from "../lib/layers.js";
import { findWorkflow, loadPlaybooks, type Workflow } from "../lib/playbooks.js";
import { WALLET_LAUNCHER_DIR, walletOnPath } from "../lib/o11-path.js";
import { print } from "../lib/output.js";
import { describeSchedule, parseSchedule, runsPerDay, shiftSchedule, slotLabel, toCron, toRRule, withoutDays, withSlot, zoneOffset, type ScheduleSpec } from "../lib/schedule.js";
import { parseDays } from "../lib/time.js";
import { writeState } from "../lib/state.js";
import { systemTimeZone } from "../lib/time.js";
import { DEFAULT_AUDIENCE, enabledPlaybooks, loadWorkspace, type Workspace } from "../lib/workspace.js";
import { audienceOf } from "./customize.js";

export const HOSTS = ["claude", "codex", "cron"] as const;
type Host = (typeof HOSTS)[number];

/** A workflow to schedule: per-audience workflows (outbound) once for each audience, the others once. */
type Entry = { workflow: Workflow; audience: string };

function entries(workspace: Workspace): Entry[] {
  const enabled = enabledPlaybooks(workspace);
  return loadPlaybooks().filter((playbook) => enabled.includes(playbook.id)).flatMap((playbook) => playbook.workflows.flatMap((workflow) =>
    (workflow.perAudience ? listAudiences(workspace, playbook.id) : [DEFAULT_AUDIENCE]).map((audience) => ({ workflow, audience }))));
}

/** "gtm/outbound" for the default audience, "gtm/outbound@customers" for another audience: the key in ostack.json. */
export function scheduleKey(workflow: Workflow, audience: string = DEFAULT_AUDIENCE): string {
  return audience === DEFAULT_AUDIENCE ? workflow.ref : `${workflow.ref}@${audience}`;
}

const audienceFlag = (audience: string) => (audience === DEFAULT_AUDIENCE ? "" : ` --audience ${audience}`);

/** The schedule a workflow runs on: the user's own, or the playbook's default until they set one. Other audiences start unscheduled. */
export function effective(workspace: Workspace, workflow: Workflow, audience: string = DEFAULT_AUDIENCE): { spec: ScheduleSpec | null; enabled: boolean; source: "custom" | "default" } {
  const own = workspace.state.schedules[scheduleKey(workflow, audience)];
  if (own) return { spec: own.spec, enabled: own.enabled, source: "custom" };
  return { spec: workflow.schedule, enabled: false, source: "default" };
}

function taskName({ workflow, audience }: Entry): string {
  return `ostack-${workflow.playbook}-${workflow.id}${audience === DEFAULT_AUDIENCE ? "" : `-${audience}`}`;
}

/** The whole instruction a scheduled task stores. It only calls `o11 ostack prompt`, so updates never require editing the task. */
function instruction(workspace: Workspace, { workflow, audience }: Entry): string {
  return `Run \`o11 ostack prompt ${workflow.ref}${audienceFlag(audience)}\` in ${workspace.root} and follow the instructions it prints exactly.`;
}

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
      permission_mode: "Auto, or Accept edits with ostack and your mail/CRM tools always allowed after the first Run now",
      ask: `Create ${names.length === 1 ? "a local scheduled task" : "local scheduled tasks"} ${list(cron, "on the cron schedule")}, in the folder ${base.folder}, in local time, with these instructions: ${base.instructions}`,
      after: `Click Run now once on a task, approve each tool with "always allow", then run: ${installed}`,
      timezone_note: timezoneNote,
    };
  }
  if (host === "codex") {
    const rrule = toRRule(local);
    return {
      ...base,
      host,
      where: "Codex app, Automations (a standalone, local project automation on this folder, not a worktree)",
      tasks: names.map((name, index) => ({ name, rrule: rrule[index] })),
      sandbox: "workspace-write with network access, so the run can reach your mail and CRM tools",
      ask: `Create ${names.length === 1 ? "a standalone automation" : "standalone automations"} ${list(rrule, "on the schedule")}, for the project ${base.folder}, running locally (not in a worktree), with these instructions: ${base.instructions}`,
      after: `Run one once from the Automations page and check its result, then run: ${installed}`,
      timezone_note: timezoneNote,
    };
  }
  return { ...base, host, cron: toCron(spec), install: "o11 ostack schedule cron install", timezone_note: timezoneNote };
}

const CRON_BEGIN = (root: string) => `# >>> ostack ${root}`;
const CRON_END = (root: string) => `# <<< ostack ${root}`;

/** The crontab block for every enabled schedule in this workspace. Each run starts the agent headless with the workspace prompt. */
async function cronBlock(workspace: Workspace, agent: "claude" | "codex"): Promise<string[]> {
  const { path: o11, wallet } = walletOnPath();
  const binary = Bun.which(agent);
  if (!o11) throw new OstackError("not_on_path", `o11 is not on PATH. Install the o11 CLI (https://go.o11.ai/skill.md), then put ${WALLET_LAUNCHER_DIR} first on PATH.`);
  if (!wallet) throw new OstackError("not_on_path", `${o11} is not the o11 wallet CLI. Put ${WALLET_LAUNCHER_DIR} first on PATH, then retry.`);
  if (!binary) throw new OstackError("not_on_path", `${agent} is not on PATH, so cron cannot start it.`);
  const logs = join(workspace.root, ".ostack", "logs");
  const lines = [CRON_BEGIN(workspace.root), `CRON_TZ=${workspace.timezone}`, `PATH=${process.env.PATH ?? "/usr/bin:/bin"}`];
  for (const entry of entries(workspace)) {
    const { spec, enabled } = effective(workspace, entry.workflow, entry.audience);
    if (!spec || !enabled) continue;
    const prompt = `"$(${o11} ostack prompt ${entry.workflow.ref}${audienceFlag(entry.audience)} --workspace ${workspace.root})"`;
    const run =
      agent === "claude"
        ? `${binary} -p ${prompt} --permission-mode auto --permission-prompts none`
        : `${binary} exec --cd ${workspace.root} --sandbox workspace-write ${prompt}`;
    for (const cron of toCron(spec)) lines.push(`${cron} cd ${workspace.root} && ${run} >> ${join(logs, `${taskName(entry)}.log`)} 2>&1`);
  }
  lines.push(CRON_END(workspace.root));
  return lines;
}

function readCrontab(): string {
  const result = Bun.spawnSync(["crontab", "-l"], { stdout: "pipe", stderr: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString() : "";
}

function withoutBlock(crontab: string, root: string): string[] {
  const lines = crontab.trim() === "" ? [] : crontab.replace(/\n+$/, "").split("\n");
  const start = lines.indexOf(CRON_BEGIN(root));
  const end = lines.indexOf(CRON_END(root));
  return start >= 0 && end > start ? [...lines.slice(0, start), ...lines.slice(end + 1)] : lines;
}

function writeCrontab(lines: string[]): void {
  const text = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  const result = Bun.spawnSync(["crontab", "-"], { stdin: new TextEncoder().encode(text), stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new OstackError("cron_failed", `crontab refused the change: ${result.stderr.toString().trim()}`);
}

export async function scheduleCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const sub = args.positionals[1] ?? "list";
  if (sub === "list") {
    print({ timezone: workspace.timezone, workflows: entries(workspace).map((entry) => view(workspace, entry)) });
    return;
  }
  if (sub === "cron") {
    const action = args.positionals[2] ?? "show";
    const agent = (optional(args, "agent") ?? "claude") as "claude" | "codex";
    if (!["claude", "codex"].includes(agent)) throw new OstackError("invalid_flag", "--agent must be claude or codex.");
    if (action === "show") return print({ lines: await cronBlock(workspace, agent) });
    if (action === "install") {
      const block = await cronBlock(workspace, agent);
      mkdirSync(join(workspace.root, ".ostack", "logs"), { recursive: true });
      writeCrontab([...withoutBlock(readCrontab(), workspace.root), ...block]);
      const at = new Date().toISOString();
      for (const { workflow, audience } of entries(workspace)) {
        const entry = workspace.state.schedules[scheduleKey(workflow, audience)];
        if (entry?.enabled) entry.installed.cron = { name: `crontab (${agent})`, at };
      }
      await writeState(workspace.root, workspace.state);
      print({ installed: block.length - 4, lines: block });
      return;
    }
    if (action === "remove") {
      writeCrontab(withoutBlock(readCrontab(), workspace.root));
      for (const entry of Object.values(workspace.state.schedules)) delete entry.installed.cron;
      await writeState(workspace.root, workspace.state);
      print({ removed: true });
      return;
    }
    throw new OstackError("unknown_command", "Use: o11 ostack schedule cron show|install|remove [--agent claude|codex].");
  }
  const workflow = findWorkflow(args.positionals[2] ?? required(args, "workflow"), enabledPlaybooks(workspace));
  const audience = audienceOf(args);
  if (audience !== DEFAULT_AUDIENCE && !workflow.perAudience) throw new OstackError("invalid_flag", `${workflow.ref} covers every audience in one run; it takes no --audience.`);
  if (audience !== DEFAULT_AUDIENCE && !listAudiences(workspace, workflow.playbook).includes(audience)) {
    throw new OstackError("unknown_audience", `No audience named "${audience}".`, { audiences: listAudiences(workspace, workflow.playbook) });
  }
  const key = scheduleKey(workflow, audience);
  const current = effective(workspace, workflow, audience);
  const entry = (workspace.state.schedules[key] ??= {
    spec: current.spec ?? parseSchedule({ days: "weekdays", at: "09:00" }),
    enabled: current.enabled,
    installed: {},
  });
  if (sub === "set") {
    const days = optional(args, "days") ?? "weekdays";
    const at = optional(args, "at");
    const every = optional(args, "every");
    if ((at === undefined) === (every === undefined)) throw new OstackError("missing_flag", "Pass --at HH:MM, or --every <minutes> [--from HH:MM --to HH:MM].");
    const [slot] = at
      ? parseSchedule({ days, at })
      : parseSchedule({ days, every_minutes: every, from: optional(args, "from") ?? "08:00", to: optional(args, "to") ?? "18:00", offset: optional(args, "offset") ?? 7 });
    // Only the days named change; other days keep their rule, so weekdays and weekends can differ.
    entry.spec = withSlot(entry.spec, slot!);
    entry.enabled = true;
  } else if (sub === "off" && optional(args, "days") !== undefined) {
    const rest = withoutDays(entry.spec, parseDays(optional(args, "days")!));
    // Dropping every day turns the schedule off and keeps its last rules for "on".
    if (rest.length > 0) entry.spec = rest;
    else entry.enabled = false;
  } else if (sub === "on" || sub === "off") {
    entry.enabled = sub === "on";
  } else if (sub === "spec") {
    print(hostSpec(workspace, { workflow, audience }, oneOf(args, "host", HOSTS)));
    return;
  } else if (sub === "installed") {
    entry.installed[oneOf(args, "host", HOSTS)] = { name: required(args, "name"), at: new Date().toISOString() };
  } else if (sub === "uninstalled") {
    delete entry.installed[oneOf(args, "host", HOSTS)];
  } else {
    throw new OstackError("unknown_command", "Use: o11 ostack schedule list | set|on|off|spec|installed|uninstalled <workflow> [--audience <name>] [--days <days>] | cron show|install|remove.");
  }
  await writeState(workspace.root, workspace.state);
  const result = view(workspace, { workflow, audience });
  const hosts = Object.keys(result.installed);
  print({ ...result, ...(hosts.length > 0 && sub !== "installed" && sub !== "uninstalled" ? { update_hosts: `Also update the task in: ${hosts.join(", ")} (o11 ostack schedule spec ${workflow.ref}${audienceFlag(audience)} --host <host>).` } : {}) });
}
