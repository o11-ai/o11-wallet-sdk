import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { OstackError } from "./errors.js";
import { isRecord } from "./paths.js";

/** "team" files and settings are shared by the workspace; "me" ones belong to the signed-in person. */
export type FileScope = "team" | "me";
/** A playbook file as it is now. `versionId` names this exact text, so a CRM record can point at what was sent. */
export type RemoteFile = { path: string; content: string; version: number; versionId: string; updatedAt: string; updatedBy: string | null };
export type RemoteFileVersion = {
  id: string; scope: FileScope; path: string; version: number; content: string; current: boolean; createdAt: string; createdBy: string | null;
};
export type Answer = { version: string; skipped: boolean };
/** Each playbook's own settings by id, such as gtm's send mode and limits. Core stores them; the playbook reads them. */
export type PlaybookValues = Record<string, unknown>;
export type RemoteSettings = {
  timezone: string | null;
  presets: string[] | null;
  setupAnswers: Record<string, Answer>;
  playbooks: Record<string, PlaybookValues>;
};
/** A partial change. A null clears a value (a person's own value then falls back to the team's); playbook values merge by key. */
export type SettingsPatch = {
  timezone?: string | null;
  presets?: string[] | null;
  setupAnswers?: Record<string, Answer | null>;
  playbooks?: Record<string, PlaybookValues>;
};
export type RemoteSetup = {
  me: { id: string; name: string; email: string };
  role: string;
  canManage: boolean;
  workspace: { id: string; name: string };
  files: { team: RemoteFile[]; mine: RemoteFile[] };
  settings: { team: RemoteSettings; mine: RemoteSettings };
  cards: { id: string; name: string; status: string }[];
};
/** Sent, replied and meetings since a run started, per template file version id. */
export type TemplateCounts = Record<string, { sent?: number; replied?: number; meetings?: number }>;

/** What the o11 wallet CLI provides: the team's playbook setup through the signed-in wallet key. */
export interface PlaybookRemote {
  /** The wallet origin, such as https://go.o11.ai. */
  origin: string;
  /** The o11 CLI release that runs this ostack, shown by doctor next to ostack's own version. */
  cliVersion?: string;
  setup(): Promise<RemoteSetup>;
  saveFile(input: { scope: FileScope; path: string; content: string; baseVersion: number | null }): Promise<RemoteFile>;
  deleteFile(input: { scope: FileScope; path: string; baseVersion: number }): Promise<void>;
  /** One saved version of a file by its id, such as the template a CRM record says was sent. */
  fileVersion(id: string): Promise<RemoteFileVersion>;
  saveSettings(input: { scope: FileScope; values: SettingsPatch }): Promise<RemoteSettings>;
  startRun(input: { workflow: string; scheduled: boolean; audience?: string | null }): Promise<{ id: string; startedAt: string }>;
  endRun(input: { id: string; summary?: string; counts?: Record<string, number>; templateCounts?: TemplateCounts }): Promise<{ id: string; endedAt: string }>;
  /** Counts a skills install for the signed-in workspace. Best effort: skipped when signed out or offline. */
  reportInstall?(input: InstallReport): Promise<void>;
  /** The workspace's videos. Absent on wallet CLIs older than videos in o11. */
  videos?: VideoRemote;
}

export type VideoFormat = "product-demo" | "irl" | "reel";
export type VideoFileRole = "video" | "preview" | "poster";
/** One stored file of a version: a cut in one shape, its preview loop or its poster. */
export type RemoteVideoFile = { id: string; role: VideoFileRole; sizeBytes: number; width: number | null; height: number | null; durationMs: number | null };
/** One uploaded cut. `urls` are short-lived links to the main cut, present once the version is ready. */
export type RemoteVideoVersion = {
  id: string; number: number; status: "uploading" | "ready" | "abandoned"; templateSlug: string | null; changeNote: string | null;
  createdAt: string; files: RemoteVideoFile[];
  urls: { video: string; download: string; preview: string | null; poster: string | null } | null;
};
/** A video the team is making: what they asked for, the template the next version follows, and its versions. */
export type RemoteVideo = {
  id: string; title: string; format: VideoFormat; templateSlug: string | null; brief: Record<string, unknown>;
  latestVersion: RemoteVideoVersion | null; versionCount: number; updatedAt: string;
};
export type RemoteVideoDetail = RemoteVideo & { versions: RemoteVideoVersion[] };
export type VideoFileInput = { role: VideoFileRole; contentType: string; sizeBytes: number; width?: number; height?: number; durationMs?: number };
export type VideoUploadPart = { partNumber: number; etag: string };

/** Videos and their versions in the o11 workspace. A version uploads in parts: start, send each file's parts, complete. */
export interface VideoRemote {
  list(): Promise<RemoteVideo[]>;
  get(id: string): Promise<RemoteVideoDetail>;
  create(input: { title: string; format: VideoFormat; templateSlug: string | null }): Promise<RemoteVideoDetail>;
  /** A partial change. `brief` replaces the whole brief, so callers merge into the current one first. */
  update(id: string, patch: { title?: string; templateSlug?: string | null; brief?: Record<string, unknown> }): Promise<RemoteVideoDetail>;
  /** Files upload in the order given; the first video is the main cut. */
  startVersion(videoId: string, input: { files: VideoFileInput[]; changeNote?: string }): Promise<{
    id: string; number: number; partBytes: number; files: { id: string; role: VideoFileRole; parts: number }[];
  }>;
  uploadPart(versionId: string, fileId: string, partNumber: number, bytes: Uint8Array<ArrayBuffer>): Promise<VideoUploadPart>;
  /** Every file's parts, keyed by file id. */
  completeVersion(versionId: string, parts: Record<string, VideoUploadPart[]>): Promise<{ id: string; number: number }>;
  abandonVersion(versionId: string): Promise<void>;
}

export type InstallReport = {
  version: string;
  hosts: ("claude" | "codex" | "cursor" | "gemini")[];
  installed: number;
  updated: number;
  skipped: number;
};

let current: PlaybookRemote | undefined;

export function useRemote(remote: PlaybookRemote): void {
  current = remote;
}

export function remote(): PlaybookRemote {
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
    // Copies saved before 0.8 hold notes instead of files; they are skipped until the next online read.
    if (!isRecord(value) || value.origin !== origin || !isRecord(value.settings) || !isRecord(value.files)) return null;
    return value as SetupSnapshot;
  } catch {
    return null;
  }
}

/** The person's own value wins over the team's, key by key inside each playbook; answers from both count. */
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

export function requireOnline(setup: SetupSnapshot, action: string): void {
  if (setup.offline) throw new OstackError("offline", `The wallet cannot be reached, so ${action} has to wait. Nothing was changed.`);
}

export function requireManager(setup: RemoteSetup, action: string): void {
  if (!setup.canManage) {
    throw new OstackError("forbidden", `Only workspace owners and admins can ${action}. Ask one of them, or pass --me to change it just for you.`);
  }
}
