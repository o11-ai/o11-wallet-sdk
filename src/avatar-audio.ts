/** How long a speech clip runs, from its WAV header or, for MP3, its size. Used to price and limit Captions videos. */
const mp3BytesPerSecond = 16_000; // 128 kbit/s, the common speech bitrate; an estimate only.

/** Seconds of a WAV from its first bytes (RIFF header) and total size, or undefined if the header is not readable. */
export function wavSeconds(header: Uint8Array, totalBytes: number) {
  if (header.length < 44 || String.fromCharCode(...header.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...header.slice(8, 12)) !== 'WAVE') return undefined;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength), byteRate = view.getUint32(28, true);
  if (!byteRate) return undefined;
  // The data chunk follows the format chunk in the files the recording page and common tools write.
  let offset = 12, dataBytes = totalBytes - 44;
  while (offset + 8 <= header.length) {
    const id = String.fromCharCode(...header.slice(offset, offset + 4)), size = view.getUint32(offset + 4, true);
    if (id === 'data') { dataBytes = Math.min(size, totalBytes - offset - 8); break; }
    offset += 8 + size + (size % 2);
  }
  return dataBytes / byteRate;
}
export const mp3Seconds = (totalBytes: number) => totalBytes / mp3BytesPerSecond;

/** A local file: the WAV header when it has one, else the MP3 size estimate. */
export async function fileSeconds(read: (start: number, end: number) => Promise<Uint8Array>, totalBytes: number, contentType: string) {
  if (contentType === 'audio/wav') return wavSeconds(await read(0, Math.min(totalBytes, 512)), totalBytes);
  return contentType === 'audio/mpeg' ? mp3Seconds(totalBytes) : undefined;
}

/**
 * A linked clip: HEAD for its length, then the first bytes for a WAV header. Any refusal or timeout returns undefined,
 * so the caller falls back to the length the recording was set to.
 */
export async function linkSeconds(fetcher: typeof fetch, url: string, contentType?: string | null) {
  try {
    const head = await fetcher(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    const length = Number(head.headers.get('content-length'));
    if (!head.ok || !Number.isFinite(length) || length <= 0) return undefined;
    const type = contentType ?? head.headers.get('content-type') ?? (/\.wav$/i.test(new URL(url).pathname) ? 'audio/wav' : /\.mp3$/i.test(new URL(url).pathname) ? 'audio/mpeg' : '');
    if (type.startsWith('audio/mpeg')) return mp3Seconds(length);
    if (!/^audio\/(x-)?wav/.test(type)) return undefined;
    const first = await fetcher(url, { headers: { Range: 'bytes=0-511' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (!first.ok) return undefined;
    return wavSeconds(new Uint8Array(await first.arrayBuffer()).slice(0, 512), length);
  } catch { return undefined; }
}
