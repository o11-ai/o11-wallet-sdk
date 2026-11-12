import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { optional, required, textInput, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import { print } from "../lib/output.js";
import { remote, requireManager, requireOnline, type FileScope } from "../lib/remote.js";
import { loadWorkspace, type Workspace } from "../lib/workspace.js";

/** about.md, gtm/write.md, gtm/audiences/customers/template-a.md. Up to three folders, lowercase. */
const FILE_PATH = /^(?:[a-z0-9][a-z0-9-]*\/){0,3}[a-z0-9][a-z0-9_-]*\.md$/;
const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function filePath(value: string): string {
  const path = value.endsWith(".md") ? value : `${value}.md`;
  if (!FILE_PATH.test(path)) {
    throw new OstackError("invalid_path", "A file path is a name such as about.md, gtm/write.md or gtm/audiences/<name>/template-a.md, in lowercase.");
  }
  return path;
}

function scopeOf(args: Args): FileScope {
  return args.flags.me === true ? "me" : "team";
}

function filesIn(workspace: Workspace, scope: FileScope) {
  return scope === "team" ? workspace.setup.files.team : workspace.setup.files.mine;
}

function baseVersion(args: Args): number | undefined {
  const value = optional(args, "base-version");
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new OstackError("invalid_flag", "--base-version must be the version number you read.");
  return parsed;
}

/**
 * Team files are shared by the workspace and changed by owners and admins; --me files are the signed-in person's own.
 * A write or delete names the version it read, so a change someone else made meanwhile is never overwritten.
 * `files show --version <id>` opens one saved version, such as the template a CRM record says was sent.
 */
export async function filesCommand(args: Args): Promise<void> {
  const sub = args.positionals[1] ?? "list";
  const versionId = optional(args, "version");
  if (sub === "show" && versionId) {
    if (!VERSION_ID.test(versionId)) throw new OstackError("invalid_flag", "--version is a file version id, such as the o11_template value on a CRM record.");
    return print(await remote().fileVersion(versionId));
  }
  const workspace = await loadWorkspace();
  const scope = scopeOf(args);
  if (sub === "list") {
    const list = (files: ReturnType<typeof filesIn>) => files.map(({ path, version, versionId: id, updatedAt, updatedBy }) => ({ path, version, version_id: id, updated_at: updatedAt, updated_by: updatedBy }));
    return print({ team: list(workspace.setup.files.team), me: list(workspace.setup.files.mine), ...(workspace.setup.offline ? { offline: true } : {}) });
  }
  if (sub === "export") return exportFiles(workspace, args);
  const path = filePath(args.positionals[2] ?? required(args, "path"));
  const current = filesIn(workspace, scope).find((file) => file.path === path);
  if (sub === "show") {
    if (!current) throw new OstackError("file_not_found", `No ${scope === "me" ? "personal" : "team"} file at ${path}.`);
    return print({ scope, ...current });
  }
  requireOnline(workspace.setup, "changing files");
  if (scope === "team") requireManager(workspace.setup, "change the team's files");
  const base = baseVersion(args);
  if (current && base === undefined) {
    throw new OstackError("base_version_required", `${path} already exists at version ${current.version}. Read it, then pass --base-version ${current.version}.`, { version: current.version });
  }
  if (sub === "write") {
    const text = await textInput(args, "text");
    if (text === undefined || !text.trim()) throw new OstackError("missing_flag", "Pass the file with --text <text> or --text-file <path|->.");
    const saved = await remote().saveFile({ scope, path, content: `${text.trim()}\n`, baseVersion: current ? base! : null });
    return print({ saved: path, scope, version: saved.version, version_id: saved.versionId });
  }
  if (sub === "delete") {
    if (!current) throw new OstackError("file_not_found", `No ${scope === "me" ? "personal" : "team"} file at ${path}.`);
    await remote().deleteFile({ scope, path, baseVersion: base! });
    return print({ deleted: path, scope, note: "Its saved versions stay, so CRM records that point at one still open." });
  }
  throw new OstackError("unknown_command", "Use: o11 ostack files list | show|write|delete <path> [--me] | show --version <id> | export [--dir <folder>].");
}

/** Writes the team's files and your own as plain markdown: <dir>/team/... and <dir>/me/... */
async function exportFiles(workspace: Workspace, args: Args): Promise<void> {
  const dir = resolve(optional(args, "dir") ?? join(workspace.root, "setup-export"));
  const written: string[] = [];
  for (const [folder, files] of [["team", workspace.setup.files.team], ["me", workspace.setup.files.mine]] as const) {
    for (const file of files) {
      const target = join(dir, folder, ...file.path.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      await Bun.write(target, file.content);
      written.push(target);
    }
  }
  const settings = join(dir, "settings.json");
  mkdirSync(dir, { recursive: true });
  await Bun.write(settings, `${JSON.stringify(workspace.setup.settings, null, 2)}\n`);
  print({ dir, files: written.length + 1, settings, ...(workspace.setup.offline ? { offline: `Exported the copy saved at ${workspace.setup.fetched_at}.` } : {}) });
}
