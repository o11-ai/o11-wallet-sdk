import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { optional, required, type Args } from "../lib/args.js";
import { contentFolders } from "../lib/content.js";
import { OstackError } from "../lib/errors.js";
import { describePack, modulePacks, packFiles } from "../lib/layers.js";
import { findWorkflow, getModule, loadModules } from "../lib/modules.js";
import { print, printText } from "../lib/output.js";
import { remote, requireManager, requireOnline } from "../lib/remote.js";
import { defaultState, STATE_FILE, writeState } from "../lib/state.js";
import { VERSION } from "../lib/version.js";
import { checkName, enabledModules, findWorkspaceRoot, loadLocalWorkspace, loadWorkspace, LOCAL_DIR, rememberWorkspace, type Workspace } from "../lib/workspace.js";

const IGNORED = [".ostack/", `${LOCAL_DIR}/`, "setup-export/"];

/** Creates a workspace folder on this computer. The team's setup lives in the wallet; this folder holds schedules and personal notes. */
export async function initCommand(args: Args): Promise<void> {
  const root = resolve(optional(args, "dir") ?? process.cwd());
  const existing = findWorkspaceRoot(root);
  if (existing) throw new OstackError("workspace_exists", `${existing} is already an ostack workspace.`, { root: existing });
  const modules = list(optional(args, "modules")) ?? loadModules().map((module) => module.id);
  for (const module of modules) getModule(module);
  await mkdir(join(root, LOCAL_DIR), { recursive: true });
  await writeState(root, defaultState(VERSION, modules));
  rememberWorkspace(root);
  const gitignore = join(root, ".gitignore");
  const ignored = existsSync(gitignore) ? await readFile(gitignore, "utf8") : "";
  const missing = IGNORED.filter((line) => !ignored.split("\n").includes(line));
  if (missing.length > 0) await appendFile(gitignore, `${ignored && !ignored.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`);
  print({
    workspace: root,
    modules,
    files: [join(root, STATE_FILE), join(root, LOCAL_DIR)],
    next: `Agents: work in ${root} (cd there), then run "o11 ostack setup status". People: ask your agent to "set up ostack" so it can interview you.`,
  });
}

function list(value: string | undefined): string[] | undefined {
  return value?.split(",").map((item) => item.trim()).filter(Boolean);
}

/** "gtm/gmail", or "gmail" when exactly one enabled module ships a pack by that name. */
function resolvePack(workspace: Workspace, name: string): { module: string; pack: string } {
  const [first, second] = name.split("/");
  if (second) {
    getModule(first!);
    return { module: first!, pack: checkName(second, "pack") };
  }
  const hits = enabledModules(workspace).filter((module) => packFiles(module, checkName(first!, "pack")));
  if (hits.length === 1) return { module: hits[0]!, pack: first! };
  throw new OstackError(hits.length === 0 ? "pack_not_found" : "ambiguous_pack", `No single pack named "${name}". Use <module>/<pack>.`, {
    packs: shippedPacks(enabledModules(workspace)),
  });
}

function shippedPacks(modules: string[]): string[] {
  return loadModules().filter((module) => modules.includes(module.id)).flatMap((module) => contentFolders(`${module.dir}/packs`).map((name) => `${module.id}/${name}`));
}

/** Packs are the team's: owners and admins add or remove them for everyone. */
export async function packsCommand(args: Args): Promise<void> {
  const sub = args.positionals[1] ?? "list";
  const workspace = await loadWorkspace();
  const modules = enabledModules(workspace);
  if (sub === "list") {
    const available = shippedPacks(modules).map((ref) => describePack(ref.split("/")[0]!, ref.split("/")[1]!));
    return print({ installed: Object.fromEntries(modules.map((module) => [module, modulePacks(workspace, module)])), available });
  }
  const { module, pack } = resolvePack(workspace, args.positionals[2] ?? required(args, "name"));
  const files = packFiles(module, pack);
  if (!files) throw new OstackError("pack_not_found", `No pack named "${pack}".`, { packs: shippedPacks(modules) });
  if (sub === "show") return print({ ...describePack(module, pack), files: files.map(({ path, text }) => ({ file: path.split("/").pop(), text })) });
  if (sub !== "add" && sub !== "remove") throw new OstackError("unknown_command", "Use: o11 ostack packs list|add|remove|show <name>.");
  requireOnline(workspace.setup, "changing packs");
  requireManager(workspace.setup, "change the team's packs");
  const ref = `${module}/${pack}`;
  const current = workspace.setup.settings.team.packs ?? [];
  if (sub === "remove" && !current.includes(ref)) throw new OstackError("pack_not_installed", `Pack "${ref}" is not installed.`, { installed: current });
  const packs = sub === "add" ? [...current.filter((item) => item !== ref), ref] : current.filter((item) => item !== ref);
  await remote().saveSettings({ scope: "team", values: { packs } });
  print({ module, installed: packs.filter((item) => item.startsWith(`${module}/`)), note: "Later packs take priority over earlier ones; the team's notes and yours take priority over every pack." });
}

/** Which modules this folder runs. Adding one is additive: its notes and settings start empty. */
export async function modulesCommand(args: Args): Promise<void> {
  const sub = args.positionals[1] ?? "list";
  const workspace = await loadLocalWorkspace();
  if (sub === "list") {
    return print({
      enabled: enabledModules(workspace),
      available: loadModules().map((module) => ({ id: module.id, name: module.name, summary: module.summary, workflows: module.workflows.map((workflow) => workflow.ref) })),
    });
  }
  const id = args.positionals[2] ?? required(args, "name");
  getModule(id);
  if (sub === "add") workspace.state.modules = [...new Set([...workspace.state.modules, id])].sort();
  else if (sub === "remove") workspace.state.modules = workspace.state.modules.filter((item) => item !== id);
  else throw new OstackError("unknown_command", "Use: o11 ostack modules list|add <id>|remove <id>.");
  await writeState(workspace.root, workspace.state);
  print({ enabled: enabledModules(workspace), ...(sub === "add" ? { next: `Ask your agent to "set up ostack" to answer the ${id} questions.` } : {}) });
}

/**
 * The instruction a scheduled run follows. Schedulers store only a short line that calls this, so the instruction
 * stays current after an update without editing any scheduled task.
 */
export async function promptCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const workflow = findWorkflow(args.positionals[1] ?? required(args, "workflow"), enabledModules(workspace));
  const campaign = checkName(optional(args, "campaign") ?? "main", "campaign");
  const stored = workspace.settings.modules[workflow.module]?.mode;
  const mode = typeof stored === "string" ? ` (mode: ${stored})` : workflow.module === "gtm" ? " (mode: draft)" : "";
  printText(
    [
      `Use the ${workflow.skill} skill for the "${campaign}" campaign in ${workspace.root}${mode}.`,
      campaign === "main" ? "Work in that folder." : `Work in that folder and pass --campaign ${campaign} to every o11 ostack command that takes it.`,
      `This is a scheduled run of ${workflow.ref}. Nobody is present: do not ask questions. Defer problem items with a reason and continue.`,
      `Start with \`o11 ostack run start ${workflow.ref} --scheduled\`. If it reports run_in_progress or not_due, stop and report only that line. Otherwise end with \`o11 ostack run end ${workflow.ref} --summary "<one line>" --counts <name=n,...>\`.`,
      "Finish with the report the skill asks for, plus anything unresolved.",
    ].join("\n"),
  );
}
