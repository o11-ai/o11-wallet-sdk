import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Args } from "../lib/args.js";
import { contentFolders, listContent } from "../lib/content.js";
import { OstackError } from "../lib/errors.js";
import { loadModules } from "../lib/modules.js";
import { print } from "../lib/output.js";
import { VERSION } from "../lib/version.js";

/** Where each coding agent reads personal skills from. */
export const SKILL_HOSTS = {
  claude: ".claude/skills",
  codex: ".codex/skills",
  cursor: ".cursor/skills",
  gemini: ".gemini/skills",
} as const;
type Host = keyof typeof SKILL_HOSTS;
const HOSTS = Object.keys(SKILL_HOSTS) as Host[];

/** Marks a skill folder written by this CLI, with the ostack version it holds. Folders without it are never touched. */
const MARKER = ".o11-ostack";

/** Every shipped skill: core ones in skills/, each module's in modules/<id>/skills/. Names are unique across them. */
function shippedSkills(): { name: string; files: { path: string; text: string }[] }[] {
  const folders = [
    ...contentFolders("skills").map((name) => `skills/${name}`),
    ...loadModules().flatMap((module) => contentFolders(`${module.dir}/skills`).map((name) => `${module.dir}/skills/${name}`)),
  ];
  return folders.map((folder) => ({ name: folder.split("/").pop()!, files: listContent(folder) }));
}

const hostDir = (host: Host) => join(homedir(), SKILL_HOSTS[host]);

function installedVersion(dir: string): string | null {
  const marker = join(dir, MARKER);
  return existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
}

function writeSkill(dir: string, files: { path: string; text: string }[]): void {
  rmSync(dir, { recursive: true, force: true });
  for (const file of files) {
    const target = join(dir, ...file.path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.text);
  }
  writeFileSync(join(dir, MARKER), `${VERSION}\n`);
}

type Result = { host: Host; skill: string; status: "installed" | "updated" | "current" | "skipped" | "removed"; path: string; reason?: string };

function installHost(host: Host, onlyRefresh: boolean): Result[] {
  const root = hostDir(host);
  const results: Result[] = [];
  const shipped = shippedSkills();
  for (const skill of shipped) {
    const dir = join(root, skill.name);
    const link = lstatSafe(dir);
    const version = installedVersion(dir);
    if (onlyRefresh && version === null) continue;
    if (link && !link.isSymbolicLink() && version === null) {
      results.push({ host, skill: skill.name, status: "skipped", path: dir, reason: "a folder not written by o11 is already there" });
      continue;
    }
    if (version === VERSION) {
      results.push({ host, skill: skill.name, status: "current", path: dir });
      continue;
    }
    // Symlinks from an ostack checkout (0.6 and older) are replaced by copies the CLI keeps up to date.
    if (link?.isSymbolicLink()) rmSync(dir, { force: true });
    mkdirSync(root, { recursive: true });
    writeSkill(dir, skill.files);
    results.push({ host, skill: skill.name, status: link ? "updated" : "installed", path: dir });
  }
  // Skills a release renamed or removed.
  if (existsSync(root)) {
    const names = new Set(shipped.map((skill) => skill.name));
    for (const name of readdirSync(root)) {
      const dir = join(root, name);
      if (!names.has(name) && installedVersion(dir) !== null) {
        rmSync(dir, { recursive: true, force: true });
        results.push({ host, skill: name, status: "removed", path: dir, reason: "no longer shipped" });
      }
    }
  }
  return results;
}

function lstatSafe(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

/** After `o11 update`, the first ostack command rewrites skills this CLI installed earlier. Never fails a command. */
export function refreshInstalledSkills(): Result[] {
  try {
    return HOSTS.flatMap((host) => installHost(host, true)).filter((result) => result.status !== "current");
  } catch {
    return [];
  }
}

function hostsFrom(args: Args): Host[] {
  const value = args.flags.host;
  if (value === undefined) return ["claude"];
  if (value === "auto") return HOSTS.filter((host) => existsSync(dirname(hostDir(host))));
  if (typeof value === "string" && (HOSTS as string[]).includes(value)) return [value as Host];
  throw new OstackError("invalid_flag", `--host must be one of: ${HOSTS.join(", ")}, auto.`);
}

/** `o11 ostack skills install [--host claude|codex|cursor|gemini|auto]`, `skills status`, `skills uninstall`. */
export async function skillsCommand(args: Args): Promise<void> {
  const sub = args.positionals[1] ?? "status";
  if (sub === "install") {
    const hosts = hostsFrom(args);
    if (hosts.length === 0) throw new OstackError("no_agent", "No coding agent folder (~/.claude, ~/.codex, ~/.cursor, ~/.gemini) was found. Pass --host.");
    return print({ version: VERSION, results: hosts.flatMap((host) => installHost(host, false)), next: 'Open your agent in your ostack folder and say "set up ostack".' });
  }
  if (sub === "status") {
    const names = shippedSkills().map((skill) => skill.name);
    const installed = HOSTS.flatMap((host) => names.map((name) => ({ host, skill: name, path: join(hostDir(host), name), version: installedVersion(join(hostDir(host), name)) })))
      .filter((item) => item.version !== null);
    return print({ version: VERSION, skills: names, installed });
  }
  if (sub === "uninstall") {
    const removed: string[] = [];
    for (const host of HOSTS) {
      for (const skill of shippedSkills()) {
        const dir = join(hostDir(host), skill.name);
        if (installedVersion(dir) !== null) {
          rmSync(dir, { recursive: true, force: true });
          removed.push(dir);
        }
      }
    }
    return print({ removed, kept: "Workspaces and the team's setup in the wallet were left alone." });
  }
  throw new OstackError("unknown_command", "Use: o11 ostack skills install [--host claude|codex|cursor|gemini|auto] | status | uninstall.");
}
