import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { OstackError } from "./errors.js";
import { effectiveSettings, loadSetup, type RemoteSettings, type SetupSnapshot } from "./remote.js";
import { backupPreviousState, readState, STATE_FILE, writeState, type State } from "./state.js";
import { checkTimeZone, systemTimeZone } from "./time.js";

/** This person's own files on this computer, which take priority over everything in the wallet. */
export const LOCAL_DIR = "custom.local";
/** Where 0.6 and older kept the team's files. `setup import` copies them to the wallet. */
export const LEGACY_CUSTOM_DIR = "custom";
/** Where 0.6 and older kept campaign folders on this computer, and 0.7 kept them at the top of the team setup. */
export const LEGACY_CAMPAIGNS_DIR = "campaigns";
/** The audience a run uses unless it names another. Its files sit directly in the playbook's folder (gtm/). */
export const DEFAULT_AUDIENCE = "default";

/** Where an audience's own files live in the team's setup: gtm/audiences/customers/ for the customers audience. */
export function audienceFolder(playbook: string, audience: string): string {
  return `${playbook}/audiences/${audience}`;
}

export type LocalWorkspace = { root: string; state: State; migrated: boolean };
export type Workspace = LocalWorkspace & { setup: SetupSnapshot; settings: RemoteSettings; timezone: string };

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
  const settings = effectiveSettings(setup);
  let timezone = systemTimeZone();
  try {
    if (settings.timezone) timezone = checkTimeZone(settings.timezone);
  } catch {
    // An unknown zone saved elsewhere falls back to this computer's clock rather than blocking every run.
  }
  return { ...local, setup, settings, timezone };
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
