import { optional, required, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import { print } from "../lib/output.js";
import { remote, requireManager, requireOnline, type SettingsPatch } from "../lib/remote.js";
import { writeState } from "../lib/state.js";
import { setupProgress } from "../lib/setup-progress.js";
import { loadQuestions, type SetupQuestion } from "../lib/steps.js";
import { VERSION } from "../lib/version.js";
import { enabledPlaybooks, loadWorkspace, type Workspace } from "../lib/workspace.js";
import { importCommand, legacyFiles, localUploads } from "./setup-import.js";

export type SetupStatus = Awaited<ReturnType<typeof setupStatus>>;

/** `setup status`: what the interview still needs, plus this folder's own settings still to upload to the wallet. */
export async function setupStatus(workspace: Workspace, only?: string) {
  const enabled = enabledPlaybooks(workspace);
  // `--playbook seo` scopes the interview to one playbook, so someone can set up a part of ostack on its own.
  if (only && !enabled.includes(only)) {
    throw new OstackError("playbook_not_enabled", `The ${only} playbook is not enabled in this workspace. Run "o11 ostack playbooks add ${only}" first.`, { enabled });
  }
  const progress = await setupProgress(workspace, only ? [only] : enabled, workspace.state.reviewed);
  const [legacy, local] = await Promise.all([legacyFiles(workspace.root), localUploads(workspace)]);
  return {
    ...progress,
    // Files and settings this folder kept before teams (0.6 and older). `setup import` copies them to the wallet.
    local_setup_to_import: legacy.length,
    // This person's custom.local/ files and older schedules, which only this computer has. `setup import` uploads
    // them as their own, so cloud chats and their other computers use them too.
    my_local_setup_to_upload: local.files.length + local.schedules.length,
  };
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
  if (sub === "status") return print(await setupStatus(workspace, optional(args, "playbook")));
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
  throw new OstackError("unknown_command", "Use: o11 ostack setup status [--playbook <id>]|answer <question> [--skip]|reviewed|reset [--question <id>]|import [--dry-run].");
}
