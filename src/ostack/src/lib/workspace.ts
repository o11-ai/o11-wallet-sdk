import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { OstackError } from "./errors.js";
import { loadSetup, type RemoteSettings, type SetupSnapshot } from "./remote.js";
import { backupPreviousState, readState, STATE_FILE, writeState, type State } from "./state.js";
import { LOCAL_DIR, teamView, type LocalFileReader, type LocalTreeReader, type TeamView } from "./team-view.js";
import { systemTimeZone } from "./time.js";

export { audienceFolder, DEFAULT_AUDIENCE, LOCAL_DIR } from "./team-view.js";
/** Where 0.6 and older kept the team's files. `setup import` copies them to the wallet. */
export const LEGACY_CUSTOM_DIR = "custom";
/** Where 0.6 and older kept campaign folders on this computer, and 0.7 kept them at the top of the team setup. */
export const LEGACY_CAMPAIGNS_DIR = "campaigns";
export type LocalWorkspace = { root: string; state: State; migrated: boolean };
export type Workspace = LocalWorkspace & TeamView & { setup: SetupSnapshot; settings: RemoteSettings; localFiles: LocalFileReader };

/** custom.local/ (folder null) or custom.local/<playbook>/ in a workspace folder: its markdown files by name. */
export function localFileReader(root: string): LocalFileReader {
  return async (folder) => {
    const dir = folder === null ? join(root, LOCAL_DIR) : join(root, LOCAL_DIR, folder);
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const names = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
    return Promise.all(names.map(async (file) => {
      const path = join(dir, file);
      return { file, path, text: await Bun.file(path).text() };
    }));
  };
}

/** At most this many local files are listed per playbook, so a stray folder cannot flood an agent's context. */
const LOCAL_TREE_LIMIT = 500;

/** Every file under custom.local/<playbook>/ at any depth, hidden ones aside. A NUL byte early on marks a file binary. */
export function localTreeReader(root: string): LocalTreeReader {
  return async (playbook) => {
    const dir = join(root, LOCAL_DIR, playbook);
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    const paths = entries.filter((entry) => entry.isFile())
      .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
      .filter((path) => !path.split("/").some((part) => part.startsWith(".")))
      .sort().slice(0, LOCAL_TREE_LIMIT);
    return Promise.all(paths.map(async (path) => {
      const diskPath = join(dir, ...path.split("/"));
      const file = Bun.file(diskPath);
      return { path: `${playbook}/${path}`, diskPath, sizeBytes: file.size, binary: (await file.slice(0, 8000).bytes()).includes(0) };
    }));
  };
}

export function findWorkspaceRoot(start: string): string | null {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, STATE_FILE))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** The workspace folder alone, for commands that never need the team's setup. */
export async function loadLocalWorkspace(): Promise<LocalWorkspace> {
  const start = process.env.OSTACK_WORKSPACE ?? process.cwd();
  const root = findWorkspaceRoot(start);
  if (!root) {
    const known = knownWorkspaces();
    const hint = known.length > 0 ? ` Known workspaces: ${known.join(", ")}. cd into one, or pass --workspace.` : ' Run "o11 ostack init" or pass --workspace.';
    throw new OstackError("no_workspace", `No ${STATE_FILE} found in ${start} or its parents.${hint}`, { known });
  }
  const { state, migrated, backup, raw } = await readState(root);
  if (migrated) {
    if (backup) await backupPreviousState(root, raw);
    await writeState(root, state);
  }
  rememberWorkspace(root);
  return { root, state, migrated };
}

/** The workspace folder plus the team's files and settings from the wallet (or its saved copy when offline). */
export async function loadWorkspace(): Promise<Workspace> {
  const local = await loadLocalWorkspace();
  const setup = await loadSetup(local.root);
  const localFiles = localFileReader(local.root);
  return { ...local, ...teamView(setup, systemTimeZone(), localFiles, localTreeReader(local.root)), setup, localFiles };
}

export function enabledPlaybooks(workspace: LocalWorkspace): string[] {
  return [...workspace.state.playbooks].sort();
}

export function requirePlaybook(workspace: LocalWorkspace, id: string): void {
  if (!workspace.state.playbooks.includes(id)) {
    throw new OstackError("playbook_not_enabled", `The ${id} playbook is not enabled in this workspace. Run "o11 ostack playbooks add ${id}".`);
  }
}

/** Workspaces created on this machine, so an agent opened elsewhere can find them. */
const REGISTRY = () => join(homedir(), ".ostack", "workspaces");

export function knownWorkspaces(): string[] {
  if (!existsSync(REGISTRY())) return [];
  const lines = readFileSync(REGISTRY(), "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
  return [...new Set(lines)].filter((root) => existsSync(join(root, STATE_FILE)));
}

export function rememberWorkspace(root: string): void {
  if (knownWorkspaces().includes(root)) return;
  mkdirSync(dirname(REGISTRY()), { recursive: true });
  appendFileSync(REGISTRY(), `${root}\n`);
}

export function checkName(value: string, what: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new OstackError("invalid_flag", `A ${what} name must be lowercase letters, numbers and dashes.`);
  }
  return value;
}
