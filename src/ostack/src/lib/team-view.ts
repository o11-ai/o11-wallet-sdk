import type { RemoteSettings, RemoteSetup, SetupSnapshot } from "./remote.js";
import { checkTimeZone } from "./time.js";

/** This person's own files on this computer, which take priority over everything in the wallet. */
export const LOCAL_DIR = "custom.local";
/** The audience a run uses unless it names another. Its files sit directly in the playbook's folder (gtm/). */
export const DEFAULT_AUDIENCE = "default";

/** Where an audience's own files live in the team's setup: gtm/audiences/customers/ for the customers audience. */
export function audienceFolder(playbook: string, audience: string): string {
  return `${playbook}/audiences/${audience}`;
}

/** A markdown file in custom.local/ on this computer. `path` is where it is on disk. */
export type LocalFile = { file: string; path: string; text: string };
/** Reads custom.local/ (folder null) or custom.local/<playbook>/. */
export type LocalFileReader = (folder: string | null) => Promise<LocalFile[]>;

/**
 * The team's setup as one person sees it: the wallet's files and settings, their timezone, and their files on this
 * computer when there is one. The CLI builds it from a workspace folder; the wallet builds it for MCP, which has no
 * computer, so `localFiles` is absent there. Everything that reads it works the same in both.
 */
export type TeamView = { setup: SetupSnapshot; settings: RemoteSettings; timezone: string; localFiles?: LocalFileReader };

/** Settings as they apply to this person: their own values over the team's. Presets are the team's only. */
export function effectiveSettings(setup: Pick<RemoteSetup, "settings">): RemoteSettings {
  const { team, mine } = setup.settings;
  const ids = new Set([...Object.keys(team.playbooks), ...Object.keys(mine.playbooks)]);
  return {
    timezone: mine.timezone ?? team.timezone,
    presets: team.presets,
    setupAnswers: { ...team.setupAnswers, ...mine.setupAnswers },
    playbooks: Object.fromEntries([...ids].map((id) => [id, { ...team.playbooks[id], ...mine.playbooks[id] }])),
  };
}

/**
 * The team's setup as this person sees it. `fallbackZone` is used when no timezone is set, or the saved one is
 * unknown here: this computer's clock in the CLI, UTC in the wallet.
 */
export function teamView(setup: SetupSnapshot, fallbackZone: string, localFiles?: LocalFileReader): TeamView {
  const settings = effectiveSettings(setup);
  let timezone = fallbackZone;
  try {
    if (settings.timezone) timezone = checkTimeZone(settings.timezone);
  } catch {
    // An unknown zone saved elsewhere falls back rather than blocking every run.
  }
  return { setup, settings, timezone, ...(localFiles ? { localFiles } : {}) };
}
