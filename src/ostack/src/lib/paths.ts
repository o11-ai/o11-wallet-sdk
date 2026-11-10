export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Splits a markdown file into its YAML frontmatter (if any) and body. */
export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: text };
  const parsed: unknown = Bun.YAML.parse(match[1] ?? "");
  return { data: isRecord(parsed) ? parsed : {}, body: text.slice(match[0].length) };
}
