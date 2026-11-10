import { existsSync } from "node:fs";
import { join } from "node:path";
import { OstackError } from "./errors.js";
import { isRecord } from "./paths.js";
import { parseSchedule, storeSchedule, type ScheduleSpec } from "./schedule.js";

/**
 * The one file the CLI owns in a workspace folder: what only this computer knows (which modules this folder runs,
 * where schedules were created, which release was reviewed). The team's notes and settings live in the wallet.
 */
export const STATE_FILE = "ostack.json";
export const STATE_FORMAT = 3;
/** Where 0.6 and older kept everything locally. Kept after the upgrade so `setup import` can copy it to the team. */
export const PREVIOUS_STATE_FILE = "ostack.pre-0.7.json";

/** A host (claude, codex, cron) where a schedule was created, so status can say what exists and where. */
export type Installed = { name: string; at: string };

export type ScheduleState = { spec: ScheduleSpec; enabled: boolean; installed: Record<string, Installed> };

export type State = {
  format: number;
  /** The ostack version whose changes this person reviewed with ostack-setup. */
  reviewed: string;
  modules: string[];
  /** Workflow schedules by ref ("gtm/outbound"). A workflow without an entry uses its module's default, unscheduled. */
  schedules: Record<string, ScheduleState>;
};

export function defaultState(version: string, modules: string[]): State {
  return { format: STATE_FORMAT, reviewed: version, modules: [...modules].sort(), schedules: {} };
}

/** Reads ostack.json. Files from 0.6 and older are upgraded in place; `migrated` tells the caller to save a backup and the new layout. */
export async function readState(root: string): Promise<{ state: State; migrated: boolean; raw: unknown }> {
  const path = join(root, STATE_FILE);
  let raw: unknown;
  try {
    raw = await Bun.file(path).json();
  } catch {
    throw new OstackError("invalid_workspace", `${path} is not valid JSON. Restore it from git or run "o11 ostack init" again.`);
  }
  if (!isRecord(raw)) throw new OstackError("invalid_workspace", `${path} must be a JSON object.`);
  const modules = Array.isArray(raw.modules)
    ? raw.modules.filter((item): item is string => typeof item === "string")
    : isRecord(raw.modules) ? Object.keys(raw.modules) : ["gtm"];
  const schedules: Record<string, ScheduleState> = {};
  if (isRecord(raw.schedules)) {
    for (const [ref, value] of Object.entries(raw.schedules)) {
      if (!isRecord(value) || !isRecord(value.spec)) continue;
      const installed: Record<string, Installed> = {};
      if (isRecord(value.installed)) {
        for (const [host, entry] of Object.entries(value.installed)) {
          if (isRecord(entry) && typeof entry.name === "string") installed[host] = { name: entry.name, at: String(entry.at ?? "") };
        }
      }
      schedules[ref] = { spec: parseSchedule(value.spec), enabled: value.enabled !== false, installed };
    }
  }
  const state: State = {
    format: STATE_FORMAT,
    reviewed: typeof raw.reviewed === "string" ? raw.reviewed : "0.0.0",
    modules: modules.sort(),
    schedules,
  };
  return { state, migrated: raw.format !== STATE_FORMAT, raw };
}

export async function writeState(root: string, state: State): Promise<void> {
  const schedules = Object.fromEntries(
    Object.entries(state.schedules).map(([ref, entry]) => [ref, { ...entry, spec: storeSchedule(entry.spec) }]),
  );
  await Bun.write(join(root, STATE_FILE), `${JSON.stringify({ ...state, schedules }, null, 2)}\n`);
}

/** Saves the pre-0.7 file once, untouched, before its layout is replaced. */
export async function backupPreviousState(root: string, raw: unknown): Promise<void> {
  const backup = join(root, PREVIOUS_STATE_FILE);
  if (!existsSync(backup)) await Bun.write(backup, `${JSON.stringify(raw, null, 2)}\n`);
}
