import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { optional, required, textInput, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import { print } from "../lib/output.js";
import { remote, requireManager, requireOnline, type NoteScope } from "../lib/remote.js";
import { loadWorkspace, type Workspace } from "../lib/workspace.js";

/** about.md, gtm/write.md, campaigns/fundraising/write.md. Folders and names are lowercase. */
const NOTE_PATH = /^(?:[a-z0-9][a-z0-9-]*\/){0,2}[a-z0-9][a-z0-9_-]*\.md$/;

export function notePath(value: string): string {
  const path = value.endsWith(".md") ? value : `${value}.md`;
  if (!NOTE_PATH.test(path)) {
    throw new OstackError("invalid_path", "A note path is a name such as about.md, gtm/write.md or campaigns/<name>/write.md, in lowercase.");
  }
  return path;
}

function scopeOf(args: Args): NoteScope {
  return args.flags.me === true ? "me" : "team";
}

function notesIn(workspace: Workspace, scope: NoteScope) {
  return scope === "team" ? workspace.setup.notes.team : workspace.setup.notes.mine;
}

function baseVersion(args: Args): number | undefined {
  const value = optional(args, "base-version");
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new OstackError("invalid_flag", "--base-version must be the version number you read.");
  return parsed;
}

/**
 * Team notes are shared by the workspace and changed by owners and admins; --me notes are the signed-in person's own.
 * A write or delete names the version it read, so a change someone else made meanwhile is never overwritten.
 */
export async function notesCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const sub = args.positionals[1] ?? "list";
  const scope = scopeOf(args);
  if (sub === "list") {
    const list = (notes: ReturnType<typeof notesIn>) => notes.map(({ path, version, updatedAt, updatedBy }) => ({ path, version, updated_at: updatedAt, updated_by: updatedBy }));
    return print({ team: list(workspace.setup.notes.team), me: list(workspace.setup.notes.mine), ...(workspace.setup.offline ? { offline: true } : {}) });
  }
  if (sub === "export") return exportNotes(workspace, args);
  const path = notePath(args.positionals[2] ?? required(args, "path"));
  const current = notesIn(workspace, scope).find((note) => note.path === path);
  if (sub === "show") {
    if (!current) throw new OstackError("note_not_found", `No ${scope === "me" ? "personal" : "team"} note at ${path}.`);
    return print({ scope, ...current });
  }
  requireOnline(workspace.setup, "changing notes");
  if (scope === "team") requireManager(workspace.setup, "change the team's notes");
  const base = baseVersion(args);
  if (current && base === undefined) {
    throw new OstackError("base_version_required", `${path} already exists at version ${current.version}. Read it, then pass --base-version ${current.version}.`, { version: current.version });
  }
  if (sub === "write") {
    const text = await textInput(args, "text");
    if (text === undefined || !text.trim()) throw new OstackError("missing_flag", "Pass the note with --text <text> or --text-file <path|->.");
    const saved = await remote().saveNote({ scope, path, body: `${text.trim()}\n`, baseVersion: current ? base! : null });
    return print({ saved: path, scope, version: saved.version });
  }
  if (sub === "delete") {
    if (!current) throw new OstackError("note_not_found", `No ${scope === "me" ? "personal" : "team"} note at ${path}.`);
    await remote().deleteNote({ scope, path, baseVersion: base! });
    return print({ deleted: path, scope });
  }
  throw new OstackError("unknown_command", "Use: o11 ostack notes list | show|write|delete <path> [--me] | export [--dir <folder>].");
}

/** Writes the team's notes and your own as plain markdown files: <dir>/team/... and <dir>/me/... */
async function exportNotes(workspace: Workspace, args: Args): Promise<void> {
  const dir = resolve(optional(args, "dir") ?? join(workspace.root, "setup-export"));
  const written: string[] = [];
  for (const [folder, notes] of [["team", workspace.setup.notes.team], ["me", workspace.setup.notes.mine]] as const) {
    for (const note of notes) {
      const file = join(dir, folder, ...note.path.split("/"));
      mkdirSync(dirname(file), { recursive: true });
      await Bun.write(file, note.body);
      written.push(file);
    }
  }
  const settings = join(dir, "settings.json");
  mkdirSync(dir, { recursive: true });
  await Bun.write(settings, `${JSON.stringify(workspace.setup.settings, null, 2)}\n`);
  print({ dir, files: written.length + 1, settings, ...(workspace.setup.offline ? { offline: `Exported the copy saved at ${workspace.setup.fetched_at}.` } : {}) });
}
