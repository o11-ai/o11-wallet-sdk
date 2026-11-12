import { optional, required, type Args } from "../lib/args.js";
import { readContent } from "../lib/content.js";
import { OstackError } from "../lib/errors.js";
import { playbookFiles, stepAliases } from "../lib/layers.js";
import { print } from "../lib/output.js";
import { remote, requireManager, requireOnline, type SettingsPatch } from "../lib/remote.js";
import { writeState } from "../lib/state.js";
import { loadQuestions, loadSteps, type SetupQuestion } from "../lib/steps.js";
import { compareVersions, VERSION } from "../lib/version.js";
import { DEFAULT_AUDIENCE, enabledPlaybooks, loadWorkspace, type Workspace } from "../lib/workspace.js";
import { importCommand, legacyFiles } from "./setup-import.js";
import { teamSummary } from "./customize.js";

export type SetupStatus = Awaited<ReturnType<typeof setupStatus>>;

/**
 * What the setup interview still needs to cover. Team questions are for owners and admins and are answered once
 * for everyone; personal questions are answered by each teammate. Also lists customized steps whose default changed
 * since this person last reviewed, and files that need attention.
 */
export async function setupStatus(workspace: Workspace) {
  const playbooks = enabledPlaybooks(workspace);
  const { team, mine } = workspace.setup.settings;
  const reviewed = workspace.state.reviewed;
  const unanswered = loadQuestions(playbooks)
    .filter((question) => !(question.scope === "team" ? team.setupAnswers : mine.setupAnswers)[question.id])
    .map((question) => ({ ...question, new_since_setup: compareVersions(question.since, reviewed) > 0 }));
  const changed: { step: string; changed: string; change: string }[] = [];
  const unknown: { layer: string; path: string; step: string }[] = [];
  const renamed: { layer: string; path: string; old: string; current: string }[] = [];
  const misplaced: { layer: string; path: string; move_to: string }[] = [];
  for (const playbook of playbooks) {
    const steps = loadSteps(playbook);
    const ids = new Set(steps.map((step) => step.id));
    const aliases = stepAliases(steps);
    const files = (await playbookFiles(workspace, playbook, DEFAULT_AUDIENCE, steps)).filter(({ file }) => file.source !== "preset");
    const customized = new Set(files.flatMap(({ target }) => ("step" in target ? [target.step] : [])));
    for (const step of steps) {
      if (customized.has(step.id) && compareVersions(step.changed, reviewed) > 0) changed.push({ step: step.ref, changed: step.changed, change: step.change });
    }
    for (const { file, target, legacy } of files) {
      if ("step" in target && !ids.has(target.step)) unknown.push({ layer: file.layer, path: file.path, step: `${playbook}/${target.step}` });
      const old = file.file.slice(0, -3).replace(/^(before|after)-/, "");
      const current = aliases.get(old);
      if (current) renamed.push({ layer: file.layer, path: file.path, old, current });
      if (legacy) misplaced.push({ layer: file.layer, path: file.path, move_to: `${playbook}/${file.file}` });
    }
  }
  // Audience folders from 0.7 sat at the top level; they belong under their playbook now.
  for (const source of ["team", "me"] as const) {
    for (const file of workspace.setup.files[source === "team" ? "team" : "mine"]) {
      if (file.path.startsWith("campaigns/")) misplaced.push({ layer: source, path: file.path, move_to: `gtm/audiences/${file.path.slice("campaigns/".length).replace(/^main\//, "default/")}` });
    }
  }
  const legacy = await legacyFiles(workspace.root);
  return {
    version: VERSION,
    reviewed,
    release_notes: releaseNotes(reviewed),
    team: teamSummary(workspace),
    playbooks,
    timezone: workspace.timezone,
    pending_questions: unanswered.filter((question) => question.scope === "personal" || workspace.setup.canManage),
    // Team questions an owner or admin still has to answer. Teammates cannot answer them.
    team_pending: workspace.setup.canManage ? [] : unanswered.filter((question) => question.scope === "team").map((question) => question.id),
    changed_defaults: changed,
    // Files around a step that does not exist (a typo, or a step a release removed).
    unknown_steps: unknown,
    // Files still named for a step's old name. They keep working; saving them under the new name keeps things tidy.
    renamed_steps: renamed,
    // Step files from before playbooks at the top level, and audience folders from 0.7. They keep working; saving
    // them under move_to keeps things tidy.
    misplaced_files: misplaced,
    // Files and settings this folder kept before teams (0.6 and older). `setup import` copies them to the wallet.
    local_setup_to_import: legacy.length,
  };
}

/** The changelog sections newer than the version this person last reviewed. */
function releaseNotes(reviewed: string): { version: string; notes: string }[] {
  return (readContent("CHANGELOG.md") ?? "")
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [heading = "", ...rest] = section.split("\n");
      return { version: heading.trim(), notes: rest.join("\n").trim() };
    })
    .filter((entry) => compareVersions(entry.version, reviewed) > 0);
}

function findQuestion(workspace: Workspace, id: string): SetupQuestion {
  const questions = loadQuestions(enabledPlaybooks(workspace));
  const matches = questions.filter((question) => question.id === id || (!id.includes("/") && question.id.endsWith(`/${id}`)));
  const exact = matches.find((question) => question.id === id);
  if (exact) return exact;
  if (matches.length === 1) return matches[0]!;
  throw new OstackError("unknown_question", `No single setup question "${id}".`, { questions: questions.map((question) => question.id) });
}

async function saveAnswers(workspace: Workspace, scope: "team" | "me", answers: NonNullable<SettingsPatch["setupAnswers"]>): Promise<void> {
  if (Object.keys(answers).length === 0) return;
  if (scope === "team") requireManager(workspace.setup, "answer team setup questions");
  await remote().saveSettings({ scope, values: { setupAnswers: answers } });
}

export async function setupCommand(args: Args): Promise<void> {
  const sub = args.positionals[1] ?? "status";
  if (sub === "import") return importCommand(args);
  const workspace = await loadWorkspace();
  if (sub === "status") return print(await setupStatus(workspace));
  if (sub === "reviewed") {
    workspace.state.reviewed = VERSION;
    await writeState(workspace.root, workspace.state);
    return print({ reviewed: VERSION });
  }
  requireOnline(workspace.setup, "recording setup answers");
  if (sub === "answer") {
    const question = findQuestion(workspace, args.positionals[2] ?? required(args, "question"));
    const scope = question.scope === "team" ? "team" : "me";
    await saveAnswers(workspace, scope, { [question.id]: { version: VERSION, skipped: args.flags.skip === true } });
    return print({ answered: question.id, scope, skipped: args.flags.skip === true });
  }
  if (sub === "reset") {
    const id = optional(args, "question");
    const questions = id ? [findQuestion(workspace, id)] : loadQuestions(enabledPlaybooks(workspace));
    const { team, mine } = workspace.setup.settings;
    const mineReset = Object.fromEntries(questions.filter((question) => question.scope === "personal" && mine.setupAnswers[question.id]).map((question) => [question.id, null]));
    const teamReset = Object.fromEntries(questions.filter((question) => question.scope === "team" && team.setupAnswers[question.id]).map((question) => [question.id, null]));
    // Teammates reset only their own answers; resetting everything never touches the team's unless you manage it.
    await saveAnswers(workspace, "me", mineReset);
    if (id || workspace.setup.canManage) await saveAnswers(workspace, "team", teamReset);
    return print({ reset: id ?? "all", questions: [...Object.keys(mineReset), ...(id || workspace.setup.canManage ? Object.keys(teamReset) : [])] });
  }
  throw new OstackError("unknown_command", "Use: o11 ostack setup status|answer <question> [--skip]|reviewed|reset [--question <id>]|import [--dry-run].");
}
