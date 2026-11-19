import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { optional, required, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import { findWorkflow, getPlaybook } from "../lib/playbooks.js";
import { requireAccess } from "../lib/access.js";
import { print } from "../lib/output.js";
import { remote, type TemplateCounts } from "../lib/remote.js";
import { describeSchedule, isDue } from "../lib/schedule.js";
import { listAudiences } from "../lib/layers.js";
import { addNeed, clearNeeds, NEED_KINDS, type NeedKind } from "../lib/needs.js";
import { loadQuestions } from "../lib/steps.js";
import { DEFAULT_AUDIENCE, enabledPlaybooks, loadWorkspace, type Workspace } from "../lib/workspace.js";
import { audienceOf } from "./customize.js";
import { effective, scheduleKey } from "./schedule.js";

const STALE_HOURS = 3;

/** `--counts sent=4,drafted=2,replies=1` */
function parseCounts(value: string | undefined): Record<string, number> | undefined {
  if (!value) return undefined;
  const entries = value.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name = "", count = ""] = part.split("=");
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(name.trim()) || !/^\d{1,7}$/.test(count.trim())) {
      throw new OstackError("invalid_flag", "--counts is name=number pairs, such as sent=4,drafted=2.");
    }
    return [name.trim(), Number(count.trim())] as const;
  });
  return Object.fromEntries(entries);
}

const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES = ["sent", "replied", "meetings"] as const;

/**
 * `--template-counts '{"<version id>":{"sent":4,"replied":1}}'`: what happened since the run started, per template
 * version id (the o11_template value on each CRM record). Numbers only; the people stay in the CRM.
 */
function parseTemplateCounts(value: string | undefined): TemplateCounts | undefined {
  if (!value) return undefined;
  const fail = () => new OstackError("invalid_flag", '--template-counts is JSON such as {"<version id>":{"sent":4,"replied":1,"meetings":0}}.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw fail();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.keys(parsed).length > 50) throw fail();
  const counts: TemplateCounts = {};
  for (const [id, entry] of Object.entries(parsed)) {
    if (!VERSION_ID.test(id) || typeof entry !== "object" || entry === null || Array.isArray(entry)) throw fail();
    const row: TemplateCounts[string] = {};
    for (const [name, count] of Object.entries(entry)) {
      if (!(OUTCOMES as readonly string[]).includes(name) || !Number.isInteger(count) || (count as number) < 0) throw fail();
      row[name as (typeof OUTCOMES)[number]] = count as number;
    }
    counts[id.toLowerCase()] = row;
  }
  return counts;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Setup questions for this workflow's playbook (and the core ones) that nobody has answered yet. */
function unanswered(workspace: Workspace, playbook: string): string[] {
  const { team, mine } = workspace.setup.settings;
  return loadQuestions([playbook])
    .filter((question) => !(question.scope === "team" ? team.setupAnswers : mine.setupAnswers)[question.id])
    .map((question) => question.id);
}

/**
 * One run per workflow and audience at a time on this computer: a lock folder in the workspace, taken atomically and
 * released at the end. Each run is also reported to the wallet so the team sees it on the wallet's Ostack page. Reporting never
 * blocks a run: when the wallet cannot be reached the run goes ahead and the result says it was not recorded.
 */
export async function runCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const sub = args.positionals[1];
  const workflow = findWorkflow(args.positionals[2] ?? required(args, "workflow"), enabledPlaybooks(workspace));
  const audience = audienceOf(args);
  if (audience !== DEFAULT_AUDIENCE && !workflow.perAudience) {
    throw new OstackError("invalid_flag", `${workflow.ref} covers every audience in one run; it takes no --audience.`);
  }
  if (audience !== DEFAULT_AUDIENCE && !listAudiences(workspace, workflow.playbook).includes(audience)) {
    throw new OstackError("unknown_audience", `No audience named "${audience}".`, { audiences: listAudiences(workspace, workflow.playbook) });
  }
  const flag = audience === DEFAULT_AUDIENCE ? "" : ` --audience ${audience}`;
  const needAudience = workflow.perAudience ? audience : null;
  if (sub === "need") {
    const kind = optional(args, "kind") ?? "choice";
    if (!(NEED_KINDS as readonly string[]).includes(kind)) throw new OstackError("invalid_flag", `--kind is one of ${NEED_KINDS.join(", ")}.`);
    const url = optional(args, "url");
    const question = optional(args, "question");
    const need = addNeed(workspace.root, {
      workflow: workflow.ref, audience: needAudience, kind: kind as NeedKind, ask: required(args, "ask"), ...(url ? { url } : {}), ...(question ? { question } : {}),
    });
    print({ recorded: need, next: "Carry on without it: skip or defer what needs it, with the reason in the report. Do not wait for an answer." });
    return;
  }
  const dir = join(workspace.root, ".ostack", "runs");
  const lock = join(dir, `${workflow.playbook}-${workflow.id}${audience === DEFAULT_AUDIENCE ? "" : `-${audience}`}.lock`);
  mkdirSync(dir, { recursive: true });
  if (sub === "start") {
    // A beta playbook runs only with access; the wallet refuses it too, but this stops before any work starts.
    requireAccess(workspace.setup, getPlaybook(workflow.playbook), workflow.id);
    if (args.flags.scheduled === true) {
      const { spec } = effective(workspace, workflow, audience);
      if (spec && !isDue(spec, workspace.timezone, new Date())) {
        throw new OstackError("not_due", `${scheduleKey(workflow, audience)} runs ${describeSchedule(spec, workspace.timezone)}, and this run fired outside that. Do nothing and stop.`);
      }
    }
    if (existsSync(lock)) {
      const started = readFileSync(join(lock, "started"), "utf8").trim();
      const age = (Date.now() - Date.parse(started)) / 36e5;
      if (age < STALE_HOURS) {
        throw new OstackError("run_in_progress", `Another ${workflow.ref} run started at ${started} and has not ended. Stop this run.`, { started_at: started });
      }
      rmSync(lock, { recursive: true, force: true });
    }
    try {
      mkdirSync(lock);
    } catch {
      throw new OstackError("run_in_progress", `Another ${workflow.ref} run just started. Stop this run.`);
    }
    const at = new Date().toISOString();
    writeFileSync(join(lock, "started"), `${at}\n`);
    // What this workflow's last run recorded for the person is replaced by what this run finds.
    clearNeeds(workspace.root, workflow.ref, needAudience);
    const missing = args.flags.scheduled === true ? unanswered(workspace, workflow.playbook) : [];
    let recorded: string | null = null;
    let warning: string | undefined;
    try {
      recorded = (await remote().startRun({
        workflow: workflow.ref, scheduled: args.flags.scheduled === true, audience: workflow.perAudience ? audience : null,
      })).id;
      writeFileSync(join(lock, "run-id"), `${recorded}\n`);
    } catch (error) {
      // Losing beta access stops the run; any other reporting failure lets it go ahead.
      if (error instanceof OstackError && error.code === "feature_not_available") {
        rmSync(lock, { recursive: true, force: true });
        throw error;
      }
      warning = `The run goes ahead but is not recorded in the wallet: ${message(error)}`;
    }
    print({
      workflow: workflow.ref,
      ...(workflow.perAudience ? { audience } : {}),
      started_at: at,
      run_id: recorded,
      ...(warning ? { warning } : {}),
      ...(missing.length > 0 ? {
        unanswered_setup: missing,
        unanswered_note: "Nobody is present, so do not ask. Use a question's default where it has one and skip the work that needs the rest. The person's agent sees these questions on its own; record only other needs with o11 ostack run need.",
      } : {}),
      end_with: `o11 ostack run end ${workflow.ref}${flag} --summary "<one line>" --counts sent=0,drafted=0 --template-counts '{"<version id>":{"sent":0,"replied":0,"meetings":0}}'`,
    });
    return;
  }
  if (sub === "end") {
    const summary = optional(args, "summary")?.slice(0, 4000);
    const counts = parseCounts(optional(args, "counts"));
    const templateCounts = parseTemplateCounts(optional(args, "template-counts"));
    const started = existsSync(lock) ? readFileSync(join(lock, "started"), "utf8").trim() : null;
    const runId = existsSync(join(lock, "run-id")) ? readFileSync(join(lock, "run-id"), "utf8").trim() : null;
    rmSync(lock, { recursive: true, force: true });
    let warning: string | undefined;
    if (runId) {
      try {
        await remote().endRun({ id: runId, ...(summary ? { summary } : {}), ...(counts ? { counts } : {}), ...(templateCounts ? { templateCounts } : {}) });
      } catch (error) {
        warning = `The run ended but its summary is not recorded in the wallet: ${message(error)}`;
      }
    }
    print({ workflow: workflow.ref, ...(workflow.perAudience ? { audience } : {}), started_at: started, ended_at: new Date().toISOString(), run_id: runId, ...(warning ? { warning } : {}) });
    return;
  }
  throw new OstackError("unknown_command", "Use: o11 ostack run start <workflow> [--audience <name>] [--scheduled] | run need <workflow> [--audience <name>] --kind sign_in|connect|question|choice --ask <text> [--url <https>] [--question <id>] | run end <workflow> [--audience <name>] [--summary <text>] [--counts <name=n,...>] [--template-counts <json>].");
}
