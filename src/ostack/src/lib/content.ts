import { CONTENT } from "../../content/index.js";

/**
 * The baseline steps, setup questions, presets and skills ship inside the CLI, so an update of the o11 CLI
 * updates all of them at once. Paths are relative to packages/ostack/content, such as "playbooks/gtm/steps/write.md".
 */
export function readContent(path: string): string | undefined {
  return CONTENT[path];
}

/** Every shipped file under a folder, with paths relative to that folder. */
export function listContent(prefix: string): { path: string; text: string }[] {
  const folder = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return Object.entries(CONTENT)
    .filter(([path]) => path.startsWith(folder))
    .map(([path, text]) => ({ path: path.slice(folder.length), text }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** The names of folders directly inside a folder. */
export function contentFolders(prefix: string): string[] {
  const names = listContent(prefix).flatMap(({ path }) => (path.includes("/") ? [path.split("/")[0]!] : []));
  return [...new Set(names)].sort();
}
