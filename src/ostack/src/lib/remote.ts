import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { OstackError } from "./errors.js";
import { isRecord } from "./paths.js";

/** "team" notes and settings are shared by the workspace; "me" ones belong to the signed-in person. */
export type NoteScope = "team" | "me";
export type RemoteNote = { path: string; body: string; version: number; updatedAt: string; updatedBy: string | null };
export type Answer = { version: string; skipped: boolean };
/** Each module's own settings by id, such as gtm's mode and limits. Core stores them; the module reads them. */
export type ModuleValues = Record<string, unknown>;
export type RemoteSettings = {
  timezone: string | null;
  packs: string[] | null;
  answered: Record<string, Answer>;
  modules: Record<string, ModuleValues>;
};
/** A partial change. A null clears a value (a person's own value then falls back to the team's); module values merge by key. */
export type SettingsPatch = {
  timezone?: string | null;
  packs?: string[] | null;
  answered?: Record<string, Answer | null>;
  modules?: Record<string, ModuleValues>;
};
export type RemoteSetup = {
  me: { id: string; name: string; email: string };
  role: string;
  canManage: boolean;
  workspace: { id: string; name: string };
  notes: { team: RemoteNote[]; mine: RemoteNote[] };
  settings: { team: RemoteSettings; mine: RemoteSettings };
  cards: { id: string; name: string; status: string }[];
};

/** What the o11 wallet CLI provides: the team's setup through the signed-in wallet key. */
export interface OstackRemote {
  /** The wallet origin, such as https://go.o11.ai. */
  origin: string;
  setup(): Promise<RemoteSetup>;
  saveNote(input: { scope: NoteScope; path: string; body: string; baseVersion: number | null }): Promise<RemoteNote>;
  deleteNote(input: { scope: NoteScope; path: string; baseVersion: number }): Promise<void>;
  saveSettings(input: { scope: NoteScope; values: SettingsPatch }): Promise<RemoteSettings>;
  startRun(input: { workflow: string; scheduled: boolean }): Promise<{ id: string; startedAt: string }>;
  endRun(input: { id: string; summary?: string; counts?: Record<string, number> }): Promise<{ id: string; endedAt: string }>;
}

let current: OstackRemote | undefined;

export function useRemote(remote: OstackRemote): void {
  current = remote;
}

export function remote(): OstackRemote {
  if (!current) throw new OstackError("not_signed_in", 'Sign in first: run "o11 login".');
  return current;
}

export type SetupSnapshot = RemoteSetup & { origin: string; fetched_at: string; offline: boolean };

const cacheFile = (root: string) => join(root, ".ostack", "cache", "setup.json");

/**
 * The team's setup, read fresh from the wallet. When the wallet cannot be reached, the copy saved by the last
 * successful read is used instead, so scheduled runs keep working offline. Writes always need the wallet.
 */
export async function loadSetup(root: string): Promise<SetupSnapshot> {
  const client = remote();
  try {
    const setup = await client.setup();
    const snapshot: SetupSnapshot = { ...setup, origin: client.origin, fetched_at: new Date().toISOString(), offline: false };
    mkdirSync(join(root, ".ostack", "cache"), { recursive: true, mode: 0o700 });
    await Bun.write(cacheFile(root), `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
    return snapshot;
  } catch (error) {
    // Someone signed out or removed from the workspace keeps no copy of the team's setup.
    if (error instanceof OstackError && (error.code === "not_signed_in" || error.code === "forbidden")) rmSync(cacheFile(root), { force: true });
    if (!(error instanceof OstackError) || error.code !== "offline") throw error;
    const cached = await readCache(root, client.origin);
    if (!cached) throw new OstackError("offline", `${error.message} No saved copy of the team setup exists yet, so this needs the wallet once.`);
    return { ...cached, offline: true };
  }
}

async function readCache(root: string, origin: string): Promise<SetupSnapshot | null> {
  if (!existsSync(cacheFile(root))) return null;
  try {
    const value: unknown = await Bun.file(cacheFile(root)).json();
    if (!isRecord(value) || value.origin !== origin || !isRecord(value.settings) || !isRecord(value.notes)) return null;
    return value as SetupSnapshot;
  } catch {
    return null;
  }
}

/** The person's own value wins over the team's, key by key inside each module; answers from both count. */
export function effectiveSettings(setup: Pick<RemoteSetup, "settings">): RemoteSettings {
  const { team, mine } = setup.settings;
  const ids = new Set([...Object.keys(team.modules), ...Object.keys(mine.modules)]);
  return {
    timezone: mine.timezone ?? team.timezone,
    packs: team.packs,
    answered: { ...team.answered, ...mine.answered },
    modules: Object.fromEntries([...ids].map((id) => [id, { ...team.modules[id], ...mine.modules[id] }])),
  };
}

export function requireOnline(setup: SetupSnapshot, action: string): void {
  if (setup.offline) throw new OstackError("offline", `The wallet cannot be reached, so ${action} has to wait. Nothing was changed.`);
}

export function requireManager(setup: RemoteSetup, action: string): void {
  if (!setup.canManage) {
    throw new OstackError("forbidden", `Only workspace owners and admins can ${action}. Ask one of them, or pass --me to change it just for you.`);
  }
}
