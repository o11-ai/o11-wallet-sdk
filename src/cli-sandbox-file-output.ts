import { writeFile } from 'node:fs/promises';
import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';

type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
/** Commands whose answer is a file's bytes, base64 in JSON: snapshot-file and artifact (Boat). */
export const sandboxFileOutputActions = ['snapshot-file', 'snapshots-file', 'snapshot-pull', 'artifact'];
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** The decoded bytes, when the answer carries them. */
export function sandboxFileBytes(result: SandboxResult) {
  const data = record(result.data);
  return data.encoding === 'base64' && typeof data.content === 'string' ? Buffer.from(data.content, 'base64') : undefined;
}
/** UTF-8 text without NUL bytes, or undefined for binary content. */
export function sandboxFileText(bytes: Uint8Array) {
  if (bytes.includes(0)) return undefined;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return undefined; }
}

/**
 * --out FILE writes the decoded bytes (the flag never reaches o11). Without it, UTF-8 text prints as is and binary
 * content stays in the JSON answer with a hint. --json always prints the JSON answer.
 */
export async function sandboxFileOutput(client: SandboxClient, input: SandboxInput, jsonOutput: boolean) {
  const { out, ...params } = input.params;
  if (out !== undefined && (typeof out !== 'string' || !out)) throw new Error('Use --out LOCAL_FILE');
  const result = await client.sandbox({ ...input, params });
  const bytes = sandboxFileBytes(result);
  if (!bytes) return { result, printed: false };
  const { content: _content, ...rest } = record(result.data);
  if (typeof out === 'string') {
    await writeFile(out, bytes);
    return { result: { ...result, data: { ...rest, out, bytes: bytes.length } }, printed: false };
  }
  if (jsonOutput) return { result, printed: false };
  const text = sandboxFileText(bytes);
  if (text === undefined) return { result: { ...result, data: { ...rest, notice: 'Binary file. Save it with --out LOCAL_FILE, or print base64 with --json.' } }, printed: false };
  process.stdout.write(text);
  return { result, printed: true };
}
