import { canUse } from "./access.js";
import { contentFolders, listContent } from "./content.js";
import { loadPlaybooks, type Playbook } from "./playbooks.js";

export type ShippedSkill = { name: string; playbook: Playbook | null; files: { path: string; text: string }[] };

/** Every shipped skill: core ones in skills/, each playbook's in playbooks/<id>/skills/. Names are unique across them. */
export function shippedSkills(): ShippedSkill[] {
  return [
    ...contentFolders("skills").map((name) => ({ name, playbook: null, files: listContent(`skills/${name}`) })),
    ...loadPlaybooks().flatMap((playbook) => contentFolders(`${playbook.dir}/skills`)
      .map((name) => ({ name, playbook, files: listContent(`${playbook.dir}/skills/${name}`) }))),
  ];
}

/**
 * Whether a skill may be used: yes for core and open playbooks, and for a beta playbook only with a grant. Null when
 * the grants could not be read (signed out or offline).
 */
export function skillAllowed(skill: ShippedSkill, granted: readonly string[] | null): boolean | null {
  if (!skill.playbook || skill.playbook.access !== "beta") return true;
  return granted === null ? null : canUse(granted, skill.playbook);
}

/** The skills this person may use, with the description their SKILL.md gives, for agents that read skills over MCP. */
export function skillCatalog(granted: readonly string[]): { name: string; playbook: string | null; description: string; files: string[] }[] {
  return shippedSkills().filter((skill) => skillAllowed(skill, granted) === true).map((skill) => {
    const main = skill.files.find((file) => file.path === "SKILL.md");
    return { name: skill.name, playbook: skill.playbook?.id ?? null, description: main ? skillDescription(main.text) : "", files: skill.files.map((file) => file.path) };
  });
}

/**
 * The one-line `description:` of a SKILL.md. Read as a line, not as YAML: agent skill loaders accept descriptions with
 * an unquoted ": " in them, which strict YAML parsers refuse.
 */
function skillDescription(text: string): string {
  const header = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const line = header.split("\n").find((item) => item.startsWith("description:"));
  return line ? line.slice("description:".length).trim().replace(/^(["'])(.*)\1$/, "$2") : "";
}
