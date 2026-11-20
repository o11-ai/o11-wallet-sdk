import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { optional, required, type Args } from "../lib/args.js";
import { contentFolders } from "../lib/content.js";
import { OstackError } from "../lib/errors.js";
import { describePreset, playbookPresets, presetFiles } from "../lib/layers.js";
import { findWorkflow, getPlaybook, loadPlaybooks } from "../lib/playbooks.js";
import { print, printText } from "../lib/output.js";
import { loadSetup, remote, requireManager, requireOnline } from "../lib/remote.js";
import { canUse, requireAccess, usablePlaybooks } from "../lib/access.js";
import { defaultState, STATE_FILE, writeState } from "../lib/state.js";
import { VERSION } from "../lib/version.js";
import { checkName, DEFAULT_AUDIENCE, enabledPlaybooks, findWorkspaceRoot, loadLocalWorkspace, loadWorkspace, LOCAL_DIR, rememberWorkspace, type Workspace } from "../lib/workspace.js";
import { listAudiences } from "../lib/layers.js";
import { BROWSER_LAUNCHER_PATH, BROWSER_MCP } from "../lib/sandbox-setup-browser.js";

/** The sandbox browser launcher (sandbox setup writes it), so scheduled runs know to use the browser MCP. */
const hasSandboxBrowser = () => existsSync(join(homedir(), BROWSER_LAUNCHER_PATH));

const IGNORED = [".ostack/", `${LOCAL_DIR}/`, "setup-export/"];

/**
 * Creates a workspace folder on this computer. The team's setup lives in the wallet; this folder holds schedules and personal files.
 * Without --dir it uses this folder, except the home folder itself, which gets ~/ostack so nothing lands loose in home.
 */
export async function initCommand(args: Args): Promise<void> {
  const cwd = resolve(process.cwd());
  const root = resolve(optional(args, "dir") ?? (cwd === resolve(homedir()) ? join(cwd, "ostack") : cwd));
  const existing = findWorkspaceRoot(root);
  if (existing) throw new OstackError("workspace_exists", `${existing} is already an ostack workspace.`, { root: existing });
  // Every playbook this person may use is on by default: each open one, and each beta one they were granted.
  const playbooks = list(optional(args, "playbooks") ?? optional(args, "modules")) ?? usablePlaybooks({ access: await grantedOrNone() }).map((playbook) => playbook.id);
  for (const playbook of playbooks) getPlaybook(playbook);
  await mkdir(join(root, LOCAL_DIR), { recursive: true });
  await writeState(root, defaultState(VERSION, playbooks));
  rememberWorkspace(root);
  const gitignore = join(root, ".gitignore");
  const ignored = existsSync(gitignore) ? await readFile(gitignore, "utf8") : "";
  const missing = IGNORED.filter((line) => !ignored.split("\n").includes(line));
  if (missing.length > 0) await appendFile(gitignore, `${ignored && !ignored.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`);
  print({
    workspace: root,
    playbooks,
    files: [join(root, STATE_FILE), join(root, LOCAL_DIR)],
    next: `Agents: work in ${root} (cd there), then run "o11 ostack setup status". People: ask your agent to "set up ostack" so it can set it up with you.`,
  });
}

/** Beta grants when the wallet can be read; none when signed out or offline, so only open playbooks are on. */
async function grantedOrNone(): Promise<string[]> {
  try {
    return (await remote().setup()).access ?? [];
  } catch {
    return [];
  }
}

function list(value: string | undefined): string[] | undefined {
  return value?.split(",").map((item) => item.trim()).filter(Boolean);
}

/** "gtm/gmail", or "gmail" when exactly one enabled playbook ships a preset by that name. */
function resolvePreset(workspace: Workspace, name: string): { playbook: string; preset: string } {
  const [first, second] = name.split("/");
  if (second) {
    getPlaybook(first!);
    return { playbook: first!, preset: checkName(second, "preset") };
  }
  const hits = enabledPlaybooks(workspace).filter((playbook) => presetFiles(playbook, checkName(first!, "preset")));
  if (hits.length === 1) return { playbook: hits[0]!, preset: first! };
  throw new OstackError(hits.length === 0 ? "preset_not_found" : "ambiguous_preset", `No single preset named "${name}". Use <playbook>/<preset>.`, {
    presets: shippedPresets(enabledPlaybooks(workspace)),
  });
}

function shippedPresets(playbooks: string[]): string[] {
  return loadPlaybooks().filter((playbook) => playbooks.includes(playbook.id)).flatMap((playbook) => contentFolders(`${playbook.dir}/presets`).map((name) => `${playbook.id}/${name}`));
}

/** Presets are the team's: owners and admins turn them on or off for everyone. */
export async function presetsCommand(args: Args): Promise<void> {
  const sub = args.positionals[1] ?? "list";
  const workspace = await loadWorkspace();
  const playbooks = enabledPlaybooks(workspace);
  if (sub === "list") {
    const available = shippedPresets(playbooks).map((ref) => describePreset(ref.split("/")[0]!, ref.split("/")[1]!));
    return print({ on: Object.fromEntries(playbooks.map((playbook) => [playbook, playbookPresets(workspace, playbook)])), available });
  }
  const { playbook, preset } = resolvePreset(workspace, args.positionals[2] ?? required(args, "name"));
  const files = presetFiles(playbook, preset);
  if (!files) throw new OstackError("preset_not_found", `No preset named "${preset}".`, { presets: shippedPresets(playbooks) });
  if (sub === "show") return print({ ...describePreset(playbook, preset), files: files.map(({ path, text }) => ({ file: path.split("/").pop(), text })) });
  if (sub !== "add" && sub !== "remove") throw new OstackError("unknown_command", "Use: o11 ostack presets list|add|remove|show <name>.");
  requireOnline(workspace.setup, "changing presets");
  requireManager(workspace.setup, "change the team's presets");
  const ref = `${playbook}/${preset}`;
  const current = workspace.setup.settings.team.presets ?? [];
  if (sub === "remove" && !current.includes(ref)) throw new OstackError("preset_not_on", `Preset "${ref}" is not on.`, { on: current });
  const presets = sub === "add" ? [...current.filter((item) => item !== ref), ref] : current.filter((item) => item !== ref);
  await remote().saveSettings({ scope: "team", values: { presets } });
  print({ playbook, on: presets.filter((item) => item.startsWith(`${playbook}/`)), note: "Later presets take priority over earlier ones; the team's files and yours take priority over every preset." });
}

/** Which playbooks this folder runs. Adding one is additive: its files and settings start empty. */
export async function playbooksCommand(args: Args): Promise<void> {
  const sub = args.positionals[1] ?? "list";
  const workspace = await loadLocalWorkspace();
  if (sub === "list") {
    // Beta playbooks show only to people granted them; signed out, only the open ones show.
    const granted = await loadSetup(workspace.root).then((setup) => setup.access ?? [], () => []);
    return print({
      enabled: enabledPlaybooks(workspace),
      available: loadPlaybooks().filter((playbook) => canUse(granted, playbook)).map((playbook) => ({
        id: playbook.id, name: playbook.name, summary: playbook.summary, ...(playbook.access === "beta" ? { beta: true } : {}),
        workflows: playbook.workflows.filter((workflow) => canUse(granted, playbook, workflow.id)).map((workflow) => workflow.ref),
      })),
    });
  }
  const id = args.positionals[2] ?? required(args, "name");
  const playbook = getPlaybook(id);
  if (sub === "add" && playbook.access === "beta") requireAccess(await loadSetup(workspace.root), playbook);
  if (sub === "add") workspace.state.playbooks = [...new Set([...workspace.state.playbooks, id])].sort();
  else if (sub === "remove") workspace.state.playbooks = workspace.state.playbooks.filter((item) => item !== id);
  else throw new OstackError("unknown_command", "Use: o11 ostack playbooks list|add <id>|remove <id>.");
  await writeState(workspace.root, workspace.state);
  print({ enabled: enabledPlaybooks(workspace), ...(sub === "add" ? { next: `Ask your agent to "set up ostack" to answer the ${id} questions.` } : {}) });
}

/**
 * The instruction a scheduled run follows. Schedulers store only a short line that calls this, so the instruction
 * stays current after an update without editing any scheduled task.
 */
export async function promptCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const workflow = findWorkflow(args.positionals[1] ?? required(args, "workflow"), enabledPlaybooks(workspace));
  const audience = checkName(optional(args, "audience") ?? DEFAULT_AUDIENCE, "audience");
  if (audience !== DEFAULT_AUDIENCE && !workflow.perAudience) {
    throw new OstackError("invalid_flag", `${workflow.ref} covers every audience in one run; it takes no --audience.`);
  }
  if (audience !== DEFAULT_AUDIENCE && !listAudiences(workspace, workflow.playbook).includes(audience)) {
    throw new OstackError("unknown_audience", `No audience named "${audience}".`, { audiences: listAudiences(workspace, workflow.playbook) });
  }
  const stored = workspace.settings.playbooks[workflow.playbook]?.sendMode;
  const mode = typeof stored === "string" ? ` (send mode: ${stored})` : workflow.playbook === "gtm" ? " (send mode: draft)" : "";
  const flag = audience === DEFAULT_AUDIENCE ? "" : ` --audience ${audience}`;
  const target = workflow.perAudience ? `the "${audience}" audience` : "every audience";
  printText(
    [
      `Use the ${workflow.skill} skill for ${target} in ${workspace.root}${mode}.`,
      flag ? `Work in that folder and pass${flag} to every o11 ostack command that takes it.` : "Work in that folder.",
      `This is a scheduled run of ${workflow.ref}. Nobody is present: do not ask questions or wait for an answer, even where the skill says to ask the user. Defer problem items with a reason and continue.`,
      `When something needs the person (a site sign-in, a mail, CRM or calendar tool that is missing or disconnected, an answer the setup lacks, a choice only they can make), record it with \`o11 ostack run need ${workflow.ref}${flag} --kind sign_in|connect|question|choice --ask "<what to ask them>" [--url <https page to sign in on, or to connect the tool>] [--question <setup question id>]\` and skip the work that needs it. Their own agent relays it to them and saves the answer in o11 for the next run.`,
      ...(hasSandboxBrowser() ? [`For anything done in a browser, use the \`${BROWSER_MCP}\` MCP tools: they drive this computer's Chrome, where the person signs in to sites. Work in a page you open and close it when done. If the browser tools fail to start, another run may have the browser: skip that work and say so in the report. If a site shows you signed out, record a sign_in need with its login page as --url and skip that work; never type a password or code.`] : []),
      `Start with \`o11 ostack run start ${workflow.ref}${flag} --scheduled\`. If it reports run_in_progress or not_due, stop and report only that line. Otherwise end with \`o11 ostack run end ${workflow.ref}${flag} --summary "<one line>" --counts <name=n,...> [--template-counts '<json>']\`.`,
      "Finish with the report the skill asks for, plus anything unresolved.",
    ].join("\n"),
  );
}
