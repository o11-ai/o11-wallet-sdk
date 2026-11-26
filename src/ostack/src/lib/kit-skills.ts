import { createHash } from "node:crypto";
import type { InstalledKit, InstalledKitFile } from "./remote.js";

/**
 * An added kit as the agent skill folders agents read: each `skills/<name>/` becomes a folder `<name>/`, with the
 * kit's files outside `skills/` alongside at their kit paths (kit.md, references/, assets/), so a skill reads them as
 * it would inside the kit. The team's files under `<kit>/` and then this person's replace the kit's at the same path
 * or add new ones; a skill's own file wins over a shared one of the same path. SKILL.md headers are kept as written.
 */
export type KitSkillFile = { path: string; text: string } | { path: string; binary: { sha256: string; sizeBytes: number; url: string } };
/** `seller`, `reviewed` and `retired` are the release's, written to the folder's marker so people can see where a skill came from. */
export type KitSkill = { kit: string; release: string; seller: string; reviewed: boolean; retired: boolean; skill: string; files: KitSkillFile[] };

/** Agent Skills naming, which is also a safe folder name. */
const SKILL_NAME = /^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/;
const ORDER: Record<InstalledKitFile["layer"], number> = { kit: 0, team: 1, mine: 2 };

/** A relative path that stays inside the folder it is written to. */
export function safeRelativePath(path: string): boolean {
  return path.length > 0 && path.length <= 512 && !path.includes("\\") && !path.startsWith("/")
    && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** The kit's files merged with the team's and this person's: later layers replace earlier ones at the same path. */
export function mergedKitFiles(kit: InstalledKit): Map<string, InstalledKitFile> {
  const merged = new Map<string, InstalledKitFile>();
  for (const file of [...kit.files].sort((a, b) => ORDER[a.layer] - ORDER[b.layer])) {
    if (safeRelativePath(file.path)) merged.set(file.path, file);
  }
  return merged;
}

const asSkillFile = (path: string, file: InstalledKitFile): KitSkillFile =>
  (file.binary ? { path, binary: { sha256: file.binary.sha256, sizeBytes: file.binary.sizeBytes, url: file.binary.url } } : { path, text: file.content });

export function kitSkills(kit: InstalledKit): KitSkill[] {
  const merged = mergedKitFiles(kit);
  const names = [...new Set([...merged.keys()].flatMap((path) => path.match(/^skills\/([^/]+)\/SKILL\.md$/)?.[1] ?? []))]
    .filter((name) => SKILL_NAME.test(name)).sort();
  const shared = [...merged.values()].filter((file) => !file.path.startsWith("skills/"));
  return names.map((skill) => {
    const files = new Map<string, KitSkillFile>(shared.map((file) => [file.path, asSkillFile(file.path, file)]));
    const prefix = `skills/${skill}/`;
    for (const file of merged.values()) {
      if (file.path.startsWith(prefix)) files.set(file.path.slice(prefix.length), asSkillFile(file.path.slice(prefix.length), file));
    }
    return { kit: kit.kit, release: kit.release, seller: kit.seller, reviewed: kit.reviewed, retired: kit.retired, skill, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) };
  });
}

/**
 * A skill folder's marker: the stamp on the first line (what sync compares and lists), then the release's seller and
 * whether o11 reviewed it, in words a person reading the folder understands.
 */
export function kitSkillMarker(skill: Pick<KitSkill, "seller" | "reviewed" | "retired">, stamp: string): string {
  const seller = skill.seller.replace(/\s+/g, " ").trim() || "unknown";
  return [stamp, `seller: ${seller}`, `reviewed by o11: ${skill.reviewed ? "yes" : "no"}`, `retired: ${skill.retired ? "yes" : "no"}`].join("\n");
}

/** What a folder holds, as written to its marker: the kit, its release and a hash of every file, so any change refreshes it. */
export function kitSkillStamp(skill: { kit: string; release: string; files: KitSkillFile[] }): string {
  const hash = createHash("sha256");
  for (const file of skill.files) hash.update(`${file.path}\0${"text" in file ? `t:${file.text}` : `b:${file.binary.sha256}`}\0`);
  return `${skill.kit} ${skill.release} ${hash.digest("hex").slice(0, 16)}`;
}
