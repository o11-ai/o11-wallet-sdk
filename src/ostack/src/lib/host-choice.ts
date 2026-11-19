import { OstackError } from "./errors.js";
import { remote, type RemoteSetup } from "./remote.js";

/**
 * Where this person's ostack runs: "hosted" (the default, their hosted computer in o11) or "local" (their own
 * computer, by their choice or after the hosted computer failed to start twice). Kept as one of their own files in
 * o11, so every computer and chat sees it; the wallet's settings have no field for it yet.
 */
export type HostChoice = "hosted" | "local";
export const HOST_CHOICE_FILE = "where-ostack-runs.md";
const LOCAL_TEXT = "local\n\nOstack runs on this person's own computer. Don't start a hosted computer for them.\n";

export function hostChoice(setup: Pick<RemoteSetup, "files">): HostChoice {
  const file = setup.files.mine.find((item) => item.path === HOST_CHOICE_FILE);
  return file?.content.trim().split("\n")[0]?.trim() === "local" ? "local" : "hosted";
}

export function parseHostChoice(value: string): HostChoice {
  if (value !== "hosted" && value !== "local") throw new OstackError("invalid_flag", "Use: o11 ostack settings set host local|hosted --me.");
  return value;
}

/** Saves the choice. "hosted" removes the file, since hosted is the default. */
export async function saveHostChoice(setup: Pick<RemoteSetup, "files">, choice: HostChoice): Promise<void> {
  const file = setup.files.mine.find((item) => item.path === HOST_CHOICE_FILE);
  if (choice === "local") await remote().saveFile({ scope: "me", path: HOST_CHOICE_FILE, content: LOCAL_TEXT, baseVersion: file?.version ?? null });
  else if (file) await remote().deleteFile({ scope: "me", path: HOST_CHOICE_FILE, baseVersion: file.version });
}
