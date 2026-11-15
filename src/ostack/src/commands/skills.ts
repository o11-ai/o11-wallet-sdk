import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Args } from "../lib/args.js";
import { contentFolders, listContent } from "../lib/content.js";
import { OstackError } from "../lib/errors.js";
import { loadPlaybooks, type Playbook } from "../lib/playbooks.js";
import { canUse, grantedFeatures } from "../lib/access.js";
import { print } from "../lib/output.js";
import { remote } from "../lib/remote.js";
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

/** Marks a skill folder written by this CLI, with the ostack version and content hash it holds. Folders without it are never touched. */
const MARKER = ".o11-ostack";

type Shipped = { name: string; playbook: Playbook | null; files: { path: string; text: string }[] };

/** Every shipped skill: core ones in skills/, each playbook's in playbooks/<id>/skills/. Names are unique across them. */
function shippedSkills(): Shipped[] {
  return [
    ...contentFolders("skills").map((name) => ({ name, playbook: null, files: listContent(`skills/${name}`) })),
    ...loadPlaybooks().flatMap((playbook) => contentFolders(`${playbook.dir}/skills`)
      .map((name) => ({ name, playbook, files: listContent(`${playbook.dir}/skills/${name}`) }))),
  ];
}

/**
 * Whether a skill may be on this computer: yes for core and open playbooks, and for a beta playbook only with a grant.
 * Null when the grants could not be read (signed out or offline): beta skills already there are kept and refreshed,
 * and none are added.
 */
function allowed(skill: Shipped, granted: string[] | null): boolean | null {
  if (!skill.playbook || skill.playbook.access !== "beta") return true;
  return granted === null ? null : canUse(granted, skill.playbook);
}

const hostDir = (host: Host) => join(homedir(), SKILL_HOSTS[host]);

/**
 * A skill's files as one agent should get them. Only Claude Code reads `effort:` in a SKILL.md's front matter (it
 * runs the skill at that reasoning effort), so other agents get the file without it rather than a key their skill
 * loader may refuse; their scheduled tasks set the effort instead (`o11 ostack schedule spec`).
 */
export function forHost(host: Host, files: { path: string; text: string }[]): { path: string; text: string }[] {
  if (host === "claude") return files;
  return files.map((file) => {
    if (!file.path.endsWith("SKILL.md")) return file;
    const end = file.text.indexOf("\n---", 3);
    if (!file.text.startsWith("---\n") || end < 0) return file;
    return { ...file, text: file.text.slice(0, end).replace(/^effort:.*\n?/m, "") + file.text.slice(end) };
  });
}

function installedVersion(dir: string): string | null {
  const marker = join(dir, MARKER);
  return existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
}

/** The version plus a hash of the skill's files, so a content change in the same release still refreshes installed copies. */
function stamp(files: { path: string; text: string }[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) hash.update(`${file.path}\0${file.text}\0`);
  return `${VERSION} ${hash.digest("hex").slice(0, 12)}`;
}

function writeSkill(dir: string, files: { path: string; text: string }[]): void {
  rmSync(dir, { recursive: true, force: true });
  for (const file of files) {
    const target = join(dir, ...file.path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.text);
  }
  writeFileSync(join(dir, MARKER), `${stamp(files)}\n`);
}

type Result = { host: Host; skill: string; status: "installed" | "updated" | "current" | "skipped" | "removed"; path: string; reason?: string };

function installHost(host: Host, onlyRefresh: boolean, granted: string[] | null): Result[] {
  const root = hostDir(host);
  const results: Result[] = [];
  const shipped = shippedSkills();
  for (const shippedSkill of shipped) {
    const skill = { ...shippedSkill, files: forHost(host, shippedSkill.files) };
    const dir = join(root, skill.name);
    const link = lstatSafe(dir);
    const version = installedVersion(dir);
    const may = allowed(skill, granted);
    if (may === false) {
      // A beta playbook this person no longer has (or never had): take out the copy this CLI wrote.
      if (version !== null) {
        rmSync(dir, { recursive: true, force: true });
        results.push({ host, skill: skill.name, status: "removed", path: dir, reason: "beta access not granted" });
      }
      continue;
    }
    if ((onlyRefresh || may === null) && version === null) continue;
    if (link && !link.isSymbolicLink() && version === null) {
      results.push({ host, skill: skill.name, status: "skipped", path: dir, reason: "a folder not written by o11 is already there" });
      continue;
    }
    if (version === stamp(skill.files)) {
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
    return HOSTS.flatMap((host) => installHost(host, true, null)).filter((result) => result.status !== "current");
  } catch {
    return [];
  }
}

/** Tells the signed-in workspace how many skills were installed: counts and agent names only. Never fails the install. */
async function reportInstall(hosts: Host[], results: Result[]): Promise<void> {
  const count = (status: Result["status"]) => results.filter((result) => result.status === status).length;
  try {
    await remote().reportInstall?.({ version: VERSION, hosts, installed: count("installed"), updated: count("updated"), skipped: count("skipped") });
  } catch {
    /* Signed out or offline: the install itself already succeeded. */
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
    const granted = await grantedFeatures();
    const results = hosts.flatMap((host) => installHost(host, false, granted));
    await reportInstall(hosts, results);
    return print({ version: VERSION, results, next: 'Agents: read the installed ostack-setup/SKILL.md (path above) and follow it now; this session may not load new skills until it restarts. People: ask your agent to "set up ostack".' });
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
