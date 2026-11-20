import { readContent } from "./content.js";
import { playbookFiles, stepAliases } from "./layers.js";
import { teamSummary } from "./team-context.js";
import { loadQuestions, loadSteps } from "./steps.js";
import { DEFAULT_AUDIENCE, type TeamView } from "./team-view.js";
import { compareVersions, VERSION } from "./version.js";

/**
 * What the setup interview still needs to cover for these playbooks. Team questions are for owners and admins and
 * are answered once for everyone; personal questions are answered by each teammate. Also lists customized steps
 * whose default changed since `reviewed`, the release this person last reviewed, and files that need attention.
 * The CLI keeps `reviewed` in its folder; over MCP the wallet passes the current release, as content there is never old.
 */
/** Questions answered by a setting alone: once the team's value is saved, the question has been covered. */
const ANSWERED_BY_SETTING: Record<string, (settings: TeamView["setup"]["settings"]) => boolean> = {
  timezone: ({ team }) => Boolean(team.timezone),
};

export async function setupProgress(view: TeamView, playbooks: string[], reviewed: string) {
  const { team, mine } = view.setup.settings;
  const unanswered = loadQuestions(playbooks)
    .filter((question) => !(question.scope === "team" ? team.setupAnswers : mine.setupAnswers)[question.id])
    .filter((question) => !ANSWERED_BY_SETTING[question.id]?.(view.setup.settings))
    .map((question) => ({ ...question, new_since_setup: compareVersions(question.since, reviewed) > 0 }));
  const changed: { step: string; changed: string; change: string }[] = [];
  const unknown: { layer: string; path: string; step: string }[] = [];
  const renamed: { layer: string; path: string; old: string; current: string }[] = [];
  const misplaced: { layer: string; path: string; move_to: string }[] = [];
  for (const playbook of playbooks) {
    const steps = loadSteps(playbook);
    const ids = new Set(steps.map((step) => step.id));
    const aliases = stepAliases(steps);
    const files = (await playbookFiles(view, playbook, DEFAULT_AUDIENCE, steps)).filter(({ file }) => file.source !== "preset");
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
    for (const file of view.setup.files[source === "team" ? "team" : "mine"]) {
      if (file.path.startsWith("campaigns/")) misplaced.push({ layer: source, path: file.path, move_to: `gtm/audiences/${file.path.slice("campaigns/".length).replace(/^main\//, "default/")}` });
    }
  }
  return {
    version: VERSION,
    reviewed,
    release_notes: releaseNotes(reviewed),
    team: teamSummary(view),
    playbooks,
    timezone: view.timezone,
    pending_questions: unanswered.filter((question) => question.scope === "personal" || view.setup.canManage),
    // Team questions an owner or admin still has to answer. Teammates cannot answer them.
    team_pending: view.setup.canManage ? [] : unanswered.filter((question) => question.scope === "team").map((question) => question.id),
    changed_defaults: changed,
    // Files around a step that does not exist (a typo, or a step a release removed).
    unknown_steps: unknown,
    // Files still named for a step's old name. They keep working; saving them under the new name keeps things tidy.
    renamed_steps: renamed,
    // Step files from before playbooks at the top level, and audience folders from 0.7. They keep working; saving
    // them under move_to keeps things tidy.
    misplaced_files: misplaced,
  };
}

/** The changelog sections newer than the version this person last reviewed. */
export function releaseNotes(reviewed: string): { version: string; notes: string }[] {
  return (readContent("CHANGELOG.md") ?? "")
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [heading = "", ...rest] = section.split("\n");
      return { version: heading.trim(), notes: rest.join("\n").trim() };
    })
    .filter((entry) => compareVersions(entry.version, reviewed) > 0);
}
