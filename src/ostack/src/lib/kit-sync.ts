import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { OstackError } from "./errors.js";
import { kitSkillMarker, kitSkills, kitSkillStamp, type KitSkill, type KitSkillFile } from "./kit-skills.js";
import { remote, type InstalledKit } from "./remote.js";

/**
 * Marks a skill folder written from an added kit: the kit, release and content hash it holds on the first line, then
 * the seller and whether o11 reviewed the release (kitSkillMarker). Folders without it are never touched.
 */
export const KIT_MARKER = ".o11-kit";

/** One agent's skills folder, and how a skill's text files are adjusted for that agent (forHost in skills.ts). */
export type KitTarget = { host: string; root: string; adjust: (files: { path: string; text: string }[]) => { path: string; text: string }[] };
export type KitResult = {
  host: string; kit: string; skill: string; path: string;
  status: "installed" | "updated" | "current" | "skipped" | "removed" | "failed"; reason?: string;
};

/** A marker that is a folder or cannot be read: the folder is treated as not written by o11 and left alone. */
const UNREADABLE = Symbol("unreadable marker");
/** A folder's whole marker, null when it has none, or UNREADABLE. */
const readMarker = (dir: string): string | null | typeof UNREADABLE => {
  const marker = join(dir, KIT_MARKER);
  try {
    return existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
  } catch {
    return UNREADABLE;
  }
};
const stampOf = (marker: string) => marker.split("\n")[0]?.trim() ?? "";
const exists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/** The kit folders this CLI wrote in a skills folder: name, kit and stamp. */
export function kitSkillFolders(root: string): { skill: string; kit: string; stamp: string; path: string }[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => !name.startsWith(".")).flatMap((skill) => {
    const marker = readMarker(join(root, skill));
    if (marker === null || marker === UNREADABLE) return [];
    const stamp = stampOf(marker);
    return [{ skill, kit: stamp.split(" ")[0] ?? "", stamp, path: join(root, skill) }];
  });
}

/** Downloads each binary file once per run, from the wallet's own signed link, and checks its hash. */
function downloader(origin: string) {
  const cache = new Map<string, Promise<Uint8Array>>();
  return (binary: { sha256: string; sizeBytes: number; url: string }) => {
    let pending = cache.get(binary.sha256);
    if (!pending) {
      pending = (async () => {
        const url = new URL(binary.url);
        if (origin !== "unknown" && url.origin !== origin) throw new OstackError("invalid_input", "A kit file link points outside the wallet.");
        const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) }).catch(() => {
          throw new OstackError("offline", "A kit file could not be downloaded.");
        });
        if (!response.ok) throw new OstackError("offline", `A kit file download answered HTTP ${response.status}. Run the sync again.`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== binary.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== binary.sha256)
          throw new OstackError("invalid_input", "A downloaded kit file did not match its hash.");
        return bytes;
      })();
      cache.set(binary.sha256, pending);
    }
    return pending;
  };
}

/** Writes the folder next to its final place, then swaps it in, so an agent never reads half a skill. */
async function writeKitSkill(root: string, skill: string, files: KitSkillFile[], marker: string, download: ReturnType<typeof downloader>) {
  const contents = await Promise.all(files.map(async (file) => ("text" in file ? file.text : await download(file.binary))));
  // Unique per run, so two syncs at once never write into each other's staging folder.
  const dir = join(root, skill), staging = join(root, `.o11-kit-staging-${skill}-${process.pid}-${randomBytes(4).toString("hex")}`);
  try {
    files.forEach((file, index) => {
      const target = join(staging, ...file.path.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents[index] ?? "");
    });
    writeFileSync(join(staging, KIT_MARKER), `${marker}\n`);
    rmSync(dir, { recursive: true, force: true });
    renameSync(staging, dir);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Copies every kit the workspace added into each agent's skills folder: one folder per skill, merged with the team's
 * and this person's files, binary files downloaded. Skill names ostack ships, folders o11 did not write, and a name
 * an earlier kit (by name) already took are skipped. Folders of kits no longer added are removed. One skill failing
 * never stops the others.
 */
export async function syncKits(targets: KitTarget[], shipped: ReadonlySet<string>, kits?: InstalledKit[]): Promise<KitResult[]> {
  const client = remote();
  if (!kits && !client.installedKits) throw new OstackError("unsupported", 'This o11 CLI cannot list kits yet. Run "o11 update".');
  const added = kits ?? await client.installedKits!();
  const download = downloader(client.origin);
  const skills = added.flatMap(kitSkills);
  const results: KitResult[] = [];
  for (const target of targets) {
    const claimed = new Map<string, string>();
    for (const skill of skills) {
      const dir = join(target.root, skill.skill);
      const base = { host: target.host, kit: skill.kit, skill: skill.skill, path: dir };
      if (shipped.has(skill.skill)) {
        results.push({ ...base, status: "skipped", reason: "ostack ships a skill with this name" });
        continue;
      }
      if (claimed.has(skill.skill)) {
        results.push({ ...base, status: "skipped", reason: `kit ${claimed.get(skill.skill)} has a skill with this name` });
        continue;
      }
      const marker = readMarker(dir);
      if (marker === UNREADABLE) {
        results.push({ ...base, status: "skipped", reason: `its ${KIT_MARKER} marker could not be read, so o11 leaves this folder alone` });
        continue;
      }
      if (marker === null && exists(dir)) {
        results.push({ ...base, status: "skipped", reason: "a folder not written by o11 is already there" });
        continue;
      }
      claimed.set(skill.skill, skill.kit);
      const files = adjusted(target, skill);
      const written = kitSkillMarker(skill, kitSkillStamp({ ...skill, files }));
      if (marker === written) {
        results.push({ ...base, status: "current" });
        continue;
      }
      try {
        mkdirSync(target.root, { recursive: true });
        await writeKitSkill(target.root, skill.skill, files, written, download);
        results.push({ ...base, status: marker === null ? "installed" : "updated" });
      } catch (error) {
        results.push({ ...base, status: "failed", reason: error instanceof Error ? error.message : "Could not write this skill." });
      }
    }
    for (const folder of kitSkillFolders(target.root)) {
      if (claimed.has(folder.skill)) continue;
      rmSync(folder.path, { recursive: true, force: true });
      results.push({ host: target.host, kit: folder.kit, skill: folder.skill, path: folder.path, status: "removed", reason: "the workspace no longer has this kit or skill" });
    }
  }
  return results;
}

/** Text files as this agent reads them (SKILL.md headers verbatim, but for keys only Claude Code reads); binary files as they are. */
function adjusted(target: KitTarget, skill: KitSkill): KitSkillFile[] {
  const texts = target.adjust(skill.files.flatMap((file) => ("text" in file ? [file] : [])));
  const byPath = new Map(texts.map((file) => [file.path, file]));
  return skill.files.map((file) => ("text" in file ? byPath.get(file.path) ?? file : file));
}

/** Removes every kit folder this CLI wrote in these skills folders. */
export function removeKitSkills(roots: string[]): string[] {
  return roots.flatMap((root) => kitSkillFolders(root).map((folder) => {
    rmSync(folder.path, { recursive: true, force: true });
    return folder.path;
  }));
}
