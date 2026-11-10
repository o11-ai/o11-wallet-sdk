/** The ostack release bundled in this CLI. Keep it equal to packages/ostack/package.json. */
export const VERSION = "0.7.0";

/** Compares dotted versions numerically: negative when a < b, zero when equal. */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
