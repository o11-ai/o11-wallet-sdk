import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';

type Client = { sandbox(input: SandboxInput): Promise<SandboxResult> };
const CHUNK = 256 * 1024;

/**
 * Streams this process's stdin into a detached sandbox command, as `echo x | e2b sandbox exec ID cmd` does: each chunk is
 * a command-stdin call at the byte offset the sandbox reported, then stdin is closed so the command sees end of input.
 */
export async function pumpSandboxStdin(client: Client, id: string, commandId: string, input: ReadableStream<Uint8Array> = Bun.stdin.stream()) {
  let offset = 0;
  const send = async (bytes?: Uint8Array) => {
    const result = await client.sandbox({ action: 'command-stdin', id, params: { commandId, offset,
      ...(bytes ? { input: Buffer.from(bytes).toString('base64'), encoding: 'base64' } : { close: true }) } });
    const written = (result.data as { bytesWritten?: unknown } | undefined)?.bytesWritten;
    offset = typeof written === 'number' ? written : offset + (bytes?.length ?? 0);
  };
  let pending = new Uint8Array(0);
  for await (const chunk of input) {
    const merged = new Uint8Array(pending.length + chunk.length);
    merged.set(pending); merged.set(chunk, pending.length); pending = merged;
    while (pending.length >= CHUNK) { await send(pending.subarray(0, CHUNK)); pending = pending.slice(CHUNK); }
  }
  if (pending.length) await send(pending);
  await send();
  return offset;
}
/** exec --stdin with input piped in (not a terminal). */
export const pipesStdin = (args: string[]) => args.includes('--stdin') && !process.stdin.isTTY;
