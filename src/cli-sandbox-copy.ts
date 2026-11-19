import { open, readFile, stat, unlink } from 'node:fs/promises';
import { z } from 'zod';
import type { ToolClient } from './client.js';

function remote(value: string) {
  if (/^[A-Za-z]:[\\/]/.test(value)) return undefined;
  const split = value.indexOf(':');
  if (split < 1 || !value.slice(split + 1)) return undefined;
  return { id: value.slice(0, split), path: value.slice(split + 1) };
}
export function sandboxCopyArguments(args: string[]) {
  const values = args.filter(value => value !== '--json' && value !== '-j');
  if (!['copy', 'cp', 'scp'].includes(values[0] ?? '')) throw new Error('Use sandbox copy SOURCE TARGET');
  const source = values[1], target = values[2];
  if (!source || !target || source.startsWith('-') || target.startsWith('-')) throw new Error('Use sandbox copy LOCAL_FILE NAME:PATH or NAME:PATH NEW_LOCAL_FILE');
  let requestId: string | undefined;
  if (values.length !== 3) {
    if (values.length !== 5 || values[3] !== '--request-id') throw new Error('Use sandbox copy SOURCE TARGET [--request-id UUID]');
    requestId = z.uuid().parse(values[4]);
  }
  const from = remote(source), to = remote(target);
  if (Boolean(from) === Boolean(to)) throw new Error('Copy requires one local file and one NAME:PATH');
  return { source, target, from, to, requestId };
}
export async function sandboxCopy(client: ToolClient, args: string[]) {
  const { source, target, from, to, requestId } = sandboxCopyArguments(args);
  if (to) {
    if ((await stat(source)).size > 4 * 1024 * 1024) throw new Error('CLI uploads are limited to 4 MiB');
    const bytes = await readFile(source);
    if (bytes.byteLength > 4 * 1024 * 1024) throw new Error('CLI uploads are limited to 4 MiB');
    return client.sandbox({ action: 'files-write', id: to.id, requestId,
      params: { path: to.path, content: bytes.toString('base64'), encoding: 'base64' } });
  }
  const file = await open(target, 'wx', 0o600);
  let complete = false, bytes = 0;
  try {
    const response = await client.sandboxDownload(from!.id, from!.path);
    if (!response.body) throw new Error('The sandbox download has no body');
    const reader = response.body.getReader();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 64 * 1024 * 1024) throw new Error('The sandbox download exceeds 64 MiB');
        let offset = 0;
        while (offset < part.value.byteLength) {
          const written = await file.write(part.value, offset, part.value.byteLength - offset);
          if (!written.bytesWritten) throw new Error('The local download could not be written');
          offset += written.bytesWritten;
        }
      }
    } finally { await reader.cancel().catch(() => undefined); }
    complete = true;
    return { downloaded: true, bytes, path: target };
  } finally {
    await file.close();
    if (!complete) await unlink(target).catch(() => undefined);
  }
}
