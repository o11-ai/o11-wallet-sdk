import { lstat, open, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** Results larger than this go to a file instead of stdout, so one paid record cannot flood an agent's context. */
export const inlineResultBytes = 16_384;
const previewBytes = 4_096;
const kilobytes = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

function preview(value: unknown, depth: number): unknown {
  const text = JSON.stringify(value) ?? '';
  if (text.length <= 512) return value;
  if (typeof value === 'string') return `${value.slice(0, 200)}… (${value.length} characters)`;
  if (value === null || typeof value !== 'object') return value;
  if (depth <= 0) return `[${Array.isArray(value) ? `${value.length} items` : `${Object.keys(value).length} fields`}, ${kilobytes(text.length)}; see outputFile]`;
  if (Array.isArray(value)) return [...value.slice(0, 2).map(item => preview(item, depth - 1)),
    ...(value.length > 2 ? [`[${value.length - 2} more items; see outputFile]`] : [])];
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, preview(child, depth - 1)]));
}

/** Small fields stay readable; large nested objects become a one-line note pointing to the file. */
export function resultPreview(value: unknown) {
  for (const depth of [3, 2, 1]) {
    const shown = preview(value, depth);
    if ((JSON.stringify(shown) ?? '').length <= previewBytes) return shown;
  }
  return preview(value, 0);
}

/**
 * Saves a large settled result to a new private file in the working directory and returns its path,
 * or undefined when it is small enough to print or cannot be saved (the caller then prints it in full).
 */
export async function saveLargeResult(result: unknown, name: string) {
  if ((JSON.stringify(result) ?? '').length <= inlineResultBytes) return undefined;
  const text = JSON.stringify(result, null, 2) + '\n';
  const base = `o11-result-${name.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36) || 'call'}`;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const path = attempt === 1 ? `${base}.json` : `${base}-${attempt}.json`;
    let handle;
    try { handle = await open(path, 'wx', 0o600); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') continue;
      return undefined;
    }
    try {
      await handle.writeFile(text);
      await handle.close();
      return { path, bytes: Buffer.byteLength(text) };
    } catch {
      await handle.close().catch(() => undefined);
      await rm(path).catch(() => undefined);
      return undefined;
    }
  }
  return undefined;
}

/**
 * Reserves -o FILE before anything is submitted, so a name clash costs nothing. With overwrite, the result goes to a
 * new sibling file that replaces FILE only once saved; the caller renames it.
 */
export async function reserveOutputFile(path: string, overwrite: boolean) {
  const shown = JSON.stringify(path);
  if (overwrite) {
    const current = await lstat(path).catch(() => undefined);
    if (current && !current.isFile()) throw new Error(`Output ${shown} is not a regular file. Nothing was sent or charged. Choose a new file name.`);
  }
  const reserved = overwrite ? join(dirname(path), `.${basename(path)}.${crypto.randomUUID().slice(0, 8)}.tmp`) : path;
  try { return { path: reserved, handle: await open(reserved, 'wx', 0o600) }; }
  catch (error) {
    if (!overwrite && error instanceof Error && 'code' in error && error.code === 'EEXIST')
      throw new Error(`Output file ${shown} already exists. Nothing was sent or charged. Choose a new file name, or add --overwrite to replace it.`);
    throw error;
  }
}
