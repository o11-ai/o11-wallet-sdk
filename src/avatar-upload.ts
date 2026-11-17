import { z } from 'zod';

/** Reads local files; tests pass a fake so nothing touches disk. size is undefined for a missing file. */
export type CaptureFileReader = { size: (path: string) => Promise<number | undefined>; read: (path: string, start: number, end: number) => Promise<Uint8Array<ArrayBuffer>> };
export type UploadFile = { kind: string; path: string; contentType: string; sizeBytes: number; sha256: string };
export type HeadlessFiles = { video?: string; audio?: string; portrait?: string; images: string[] };
type Role = 'video' | 'audio' | 'image';

const rules: Record<Role, { types: Record<string, string>; maxBytes: number; message: string }> = {
  video: { types: { mp4: 'video/mp4', webm: 'video/webm' }, maxBytes: 32_000_000, message: 'Use an mp4 or webm video under 32 MB.' },
  audio: { types: { mp3: 'audio/mpeg', wav: 'audio/wav' }, maxBytes: 10_000_000, message: 'Use an mp3 or wav audio file under 10 MB.' },
  image: { types: { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }, maxBytes: 5_000_000, message: 'Use a jpg or png image under 5 MB.' },
};
const extension = (path: string) => /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? '';
/** The content type comes from the extension; anything else is refused before a capture is created. */
export function fileType(path: string, role: Role) {
  const type = rules[role].types[extension(path)];
  if (!type) throw new Error(`${path}: ${rules[role].message}`);
  return type;
}
export const defaultReader: CaptureFileReader = {
  async size(path) { const file = Bun.file(path); return await file.exists() ? file.size : undefined; },
  async read(path, start, end) { return new Uint8Array(await Bun.file(path).slice(start, end).arrayBuffer()); },
};
export const sha256Hex = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * Which file goes where. A video link takes the video, a portrait and audio, so with --video only the portrait
 * (--portrait, else the first --image) is sent. Without a video the images are photos, and the first is also the portrait.
 */
export function uploadPlan(files: HeadlessFiles) {
  const portrait = files.portrait ?? files.images[0];
  const photos = files.video ? [] : files.images.length ? files.images : portrait ? [portrait] : [];
  const ignored = files.video ? files.images.filter(path => path !== portrait) : [];
  const collect = [files.video ? 'video' : files.audio ? 'voice' : '', photos.length ? 'photos' : ''].filter(Boolean);
  const planned: [string, string, Role][] = [
    ...(files.video ? [['video', files.video, 'video'] as [string, string, Role]] : []),
    ...(files.audio ? [['audio', files.audio, 'audio'] as [string, string, Role]] : []),
    ...(portrait ? [['portrait', portrait, 'image'] as [string, string, Role]] : []),
    ...photos.map((path, index): [string, string, Role] => [`photo_${index + 1}`, path, 'image']),
  ];
  return { planned, ignored, collect, ...(photos.length ? { photos: photos.length } : {}) };
}
export const headlessCollect = (files: HeadlessFiles) => {
  const { collect, photos } = uploadPlan(files);
  return { collect, ...(photos ? { photos } : {}) };
};

/** Checks every file (exists, type, size), hashes it whole and names its upload kind. Nothing is sent. */
export async function prepareFiles(files: HeadlessFiles, reader: CaptureFileReader): Promise<UploadFile[]> {
  const prepared: UploadFile[] = [], hashes = new Map<string, string>();
  for (const [kind, path, role] of uploadPlan(files).planned) {
    const contentType = fileType(path, role), sizeBytes = await reader.size(path);
    if (sizeBytes === undefined) throw new Error(`${path} was not found.`);
    if (sizeBytes < 1 || sizeBytes > rules[role].maxBytes) throw new Error(`${path}: ${rules[role].message}`);
    // The whole-file hash lets the wallet resume this same upload on a rerun instead of starting a new one.
    const sha256 = hashes.get(path) ?? await sha256Hex(await reader.read(path, 0, sizeBytes));
    hashes.set(path, sha256);
    prepared.push({ kind, path, contentType, sizeBytes, sha256 });
  }
  return prepared;
}

const pageSchema = z.looseObject({ uploads: z.record(z.string(), z.looseObject({ partSizeBytes: z.number().int().positive(),
  parts: z.array(z.looseObject({ index: z.number().int().min(0), sizeBytes: z.number().int().positive(), status: z.string(), uploadUrl: z.string().optional() })) })).optional() });
const errorSchema = z.looseObject({ error: z.looseObject({ code: z.string().optional(), message: z.string().optional() }) });
export const partBackoffMs = [500, 1500, 4000];
export const uploadTimeouts = { jsonMs: 30_000, partMs: 120_000 };
export type AttachDeps = { fetch: typeof fetch; reader: CaptureFileReader; notice: (line: string) => void; sleep: (milliseconds: number) => Promise<void> };

/** Uploads the files and saves the take through the recording page's routes, authorized by the link's token. */
export async function attachFiles(link: string, captureId: string, files: UploadFile[], deps: AttachDeps) {
  const url = new URL(link), token = url.searchParams.get('token');
  if (!token) throw new Error('The recording link has no token, so files cannot be attached. Use the link instead.');
  const route = (action: string) => new URL(`/api/avatar-captures/${encodeURIComponent(captureId)}/${action}`, url.origin);
  const post = async (action: string, body: unknown) => {
    const response = await deps.fetch(route(action), { method: 'POST', redirect: 'error', body: JSON.stringify(body),
      signal: AbortSignal.timeout(uploadTimeouts.jsonMs), headers: { 'Content-Type': 'application/json', 'X-Capture-Token': token } });
    const answer: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const said = errorSchema.safeParse(answer);
      throw new Error(said.success && said.data.error.message ? said.data.error.message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 300)
        : `The recording could not be saved (HTTP ${response.status}). Try again.`);
    }
    return answer;
  };
  for (const file of files) {
    const plan = pageSchema.parse(await post('upload', { kind: file.kind, sizeBytes: file.sizeBytes, contentType: file.contentType, sha256: file.sha256 }))
      .uploads?.[file.kind];
    if (!plan) throw new Error(`The ${file.kind} upload did not start. Try again.`);
    // Ready parts appear only when the wallet resumed this same file (same hash, size and type).
    for (const part of plan.parts) {
      if (part.status === 'ready') continue;
      if (!part.uploadUrl) throw new Error(`The ${file.kind} upload has no link for part ${part.index + 1}. Try again.`);
      const start = part.index * plan.partSizeBytes, bytes = await deps.reader.read(file.path, start, start + part.sizeBytes);
      const digest = await sha256Hex(bytes);
      for (let attempt = 0; ; attempt++) {
        const sent = await deps.fetch(part.uploadUrl, { method: 'PUT', redirect: 'error', body: bytes, signal: AbortSignal.timeout(uploadTimeouts.partMs),
          headers: { 'X-Content-SHA256': digest } }).then(response => response.ok, () => false);
        if (sent) break;
        if (attempt >= partBackoffMs.length) throw new Error(`Part ${part.index + 1} of the ${file.kind} did not upload. Run the same command again to resume.`);
        await deps.sleep(partBackoffMs[attempt]!);
      }
    }
    deps.notice(`Uploaded the ${file.kind.replace('_', ' ')}.`);
  }
  await post('submit', {});
}
