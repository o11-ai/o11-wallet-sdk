import { z } from 'zod';
import { AvatarStepFailed, AvatarStepPending, getCapture, step, type AvatarDeps, type Capture } from './avatar-steps.js';
import { costGateDollars, videoKey, videoWaitMs, type VideoOptions, type VideoOutcome } from './avatar-captions.js';

/** HeyGen Avatar 6 through OpenRouter: no avatar is trained, each video sends the recording's portrait (and clip) and speech. */
export const avatar6Models = { 'avatar-6': 'openrouter.video.heygen-avatar-6', 'avatar-6-turbo': 'openrouter.video.heygen-avatar-6-turbo' } as const;
export type Avatar6Model = keyof typeof avatar6Models;
export const avatar6Resolutions = ['1080p', '2K'] as const;
export type Avatar6Resolution = typeof avatar6Resolutions[number];
/** OpenRouter's published dollars per second of video (catalog/openrouter-video-models.json); the wallet charges OpenRouter's reported cost. */
const ratePerSecond: Record<Avatar6Model, Record<Avatar6Resolution, number>> = {
  'avatar-6': { '1080p': 0.1, '2K': 0.145 }, 'avatar-6-turbo': { '1080p': 0.05, '2K': 0.0875 } };
export const avatar6MaxSeconds = 300;
/** OpenRouter fetches a reference clip by link up to 50 MB; larger takes send the portrait alone. */
const referenceVideoBytes = 50 * 1024 * 1024;
const videoSchema = z.looseObject({ media: z.array(z.looseObject({ downloadUrl: z.string().min(1).optional(), url: z.string().min(1).optional() })).optional(),
  artifact: z.looseObject({ url: z.string().min(1) }).optional() });
const dollars = (amount: number) => `$${amount.toFixed(2)}`;

export type Avatar6Options = VideoOptions & { model: Avatar6Model; resolution: Avatar6Resolution; expressiveness?: 'default' | 'less'; prompt?: string;
  /** --audio-seconds: the length to hold, when the clip's own length cannot be read exactly. */
  audioSeconds?: number;
  /** --avatar-id: a saved reference avatar (o11.avatar.create) instead of a recording. */
  avatarId?: string;
  /** --audio FILE as typed, so a printed rerun command sends the same clip. */
  audioPath?: string };

const resolvedSchema = z.looseObject({ avatar_id: z.string().min(1), name: z.string().nullish(), status: z.string().nullish(),
  media: z.array(z.looseObject({ kind: z.string(), url: z.string().min(1), content_type: z.string().nullish(), size_bytes: z.number().nullish() })) });
/** A saved reference avatar, resolved to fresh links and read the way a recording is: its first photo, clip and voice sample. */
async function savedAvatar(deps: AvatarDeps, avatarId: string): Promise<Capture> {
  const saved = resolvedSchema.parse(await step(deps, 'o11.avatar.resolve', { body: { avatar_id: avatarId, expires_in_seconds: 7200 } }));
  const first = (kind: string) => saved.media.find(item => item.kind === kind);
  const image = first('image'), video = first('video'), audio = first('audio');
  return { capture_id: saved.avatar_id, name: saved.name, status: saved.status === 'ready' ? 'ready' : 'failed',
    portrait_url: image?.url, portrait_content_type: image?.content_type, source_url: video?.url, content_type: video?.content_type,
    size_bytes: video?.size_bytes, audio_url: audio?.url, audio_content_type: audio?.content_type };
}

/**
 * The hold is the length stated here; the wallet measures the audio again before sending and refuses, at no charge, when the audio
 * runs longer. A WAV header gives the exact length. An MP3 length from its size is an estimate, so it is padded.
 */
export function holdSeconds(seconds: number, exact: boolean) {
  return Math.min(avatar6MaxSeconds, Math.max(1, exact ? Math.ceil(seconds) : Math.ceil(seconds * 1.15) + 1));
}

export async function makeAvatar6Video(deps: AvatarDeps, options: Avatar6Options): Promise<VideoOutcome> {
  const capture = options.avatarId ? await savedAvatar(deps, options.avatarId) : await getCapture(deps, options.captureId);
  const base = { ...options.avatarId ? { avatar_id: capture.capture_id } : { capture_id: capture.capture_id }, provider: 'heygen-avatar-6', model: options.model };
  if (capture.status === 'failed') return { exitCode: 1, result: { ...base, message: options.avatarId
    ? 'This saved avatar is not ready. Check it with o11.avatar.resolve.' : 'This recording failed. Record again with o11 avatar clone --name NAME.' } };
  if (deps.connectionId) return { exitCode: 1, result: { ...base, message: 'Avatar 6 runs on o11\'s OpenRouter account and takes no --connection.' } };
  if (capture.status === 'expired') return { exitCode: 1, result: { ...base, message: 'This capture has expired. Record again with o11 avatar clone --name NAME.' } };
  // Avatar 6 takes one photo, one clip, or both. A recorded MP4 under OpenRouter's link limit goes along with the portrait.
  const clip = capture.source_url && capture.content_type === 'video/mp4' && (capture.size_bytes ?? Infinity) <= referenceVideoBytes ? capture.source_url : undefined;
  if (!capture.portrait_url && !clip)
    return { exitCode: 1, result: { ...base, message: 'This capture has no portrait or MP4 clip. Record again, or attach a photo with o11 avatar clone --image FILE.' } };
  // options.measure counts the clip frame by frame, as the wallet does; only the recording's set length is a guess.
  let audioUrl = options.audioUrl, seconds: number | undefined, exact = true, source: string;
  if (options.audioFile) { seconds = options.audioFile.seconds; source = `file:${options.audioFile.sha256}`; }
  else if (audioUrl) { seconds = await options.measure(audioUrl); source = `url:${audioUrl}`; }
  else {
    audioUrl = capture.audio_url ?? undefined;
    if (!audioUrl) return { exitCode: 1, result: { ...base, message: 'This capture has no speech audio. Pass --audio FILE (WAV or MP3).' } };
    seconds = await options.measure(audioUrl, capture.audio_content_type);
    if (seconds === undefined && capture.seconds) { seconds = capture.seconds; exact = false; }
    source = `url:${audioUrl}`;
  }
  const stated = options.audioSeconds ?? (seconds === undefined ? undefined : holdSeconds(seconds, exact));
  if (stated === undefined) return { exitCode: 1, result: { ...base,
    message: 'The speech length could not be read. Pass --audio-seconds N, the clip length in whole seconds rounded up.' } };
  if (seconds !== undefined && seconds > avatar6MaxSeconds) return { exitCode: 1, result: { ...base, audio_seconds: Math.round(seconds),
    message: `Avatar 6 videos on o11 take at most ${avatar6MaxSeconds} seconds of speech. Pass --audio FILE with a shorter clip.` } };
  const cost = stated * ratePerSecond[options.model][options.resolution];
  deps.notice(`The wallet holds ${dollars(cost)} for up to ${stated} seconds at ${options.resolution} and charges what OpenRouter reports for the finished video.`);
  if (cost > costGateDollars && !options.yes) return { exitCode: 2, result: { ...base, audio_seconds: stated, estimated_cost_usd: Number(cost.toFixed(2)),
    message: `Nothing was sent. Rerun with --yes to hold about ${dollars(cost)}, or pass a shorter clip with --audio FILE.`,
    resumeCommand: deps.command(['avatar', 'video', options.avatarId ? '--avatar-id' : '--capture-id', capture.capture_id, '--model', options.model, '--resolution', options.resolution,
      ...(options.expressiveness ? ['--expressiveness', options.expressiveness] : []), ...(options.prompt ? ['--prompt', options.prompt] : []),
      ...(options.audioPath ? ['--audio', options.audioPath] : []), ...(options.audioSeconds ? ['--audio-seconds', String(options.audioSeconds)] : []), '--yes']) } };
  if (options.audioFile) audioUrl = await options.audioFile.upload(capture.name ?? 'Speech');
  const visual = `${capture.portrait_url ?? ''}|${clip ?? ''}`;
  const idempotencyKey = await videoKey(capture.capture_id, `${options.model}|${options.resolution}|${options.expressiveness ?? ''}|${options.prompt ?? ''}|${stated}|${source}`, visual);
  const reference = (type: string, url: string): Record<string, string | Record<string, string>> => ({ type, [type]: { url } });
  const body = {
    resolution: options.resolution, audio_seconds: stated,
    input_references: [...capture.portrait_url ? [reference('image_url', capture.portrait_url)] : [],
      ...clip ? [reference('video_url', clip)] : [], reference('audio_url', audioUrl!)],
    ...(options.prompt ? { prompt: options.prompt } : {}),
    ...(options.expressiveness ? { provider: { options: { heygen: { motion_expressiveness: options.expressiveness } } } } : {}),
  };
  deps.notice(`Making the video with ${options.model === 'avatar-6' ? 'Avatar 6' : 'Avatar 6 Turbo'}. This takes a few minutes.`);
  let invocationId: string | undefined, result: unknown;
  try {
    result = await step(deps, avatar6Models[options.model], { body, write: true, idempotencyKey, waitMs: videoWaitMs, onReceipt: id => { invocationId = id; } });
  } catch (error) {
    if (error instanceof AvatarStepFailed) return { exitCode: 1, result: { ...base, ...(invocationId ? { invocation_id: invocationId } : {}),
      message: `The video failed. ${error.message} Nothing is charged for a failed video.` } };
    if (!(error instanceof AvatarStepPending)) throw error;
    invocationId = error.invocationId;
  }
  const video = videoSchema.safeParse(result);
  const link = video.success ? video.data.media?.[0]?.downloadUrl ?? video.data.media?.[0]?.url ?? video.data.artifact?.url : undefined;
  if (!link) return { exitCode: 2, result: { ...base, ...(invocationId ? { invocation_id: invocationId } : {}), idempotency_key: idempotencyKey,
    message: 'The video is still being made. Running the same command again returns this same call, not a new video.',
    ...(invocationId ? { resumeCommand: deps.command(['status', invocationId, '--wait']) } : {}) } };
  return { exitCode: 0, result: { ...base, invocation_id: invocationId ?? null, download_url: link, message: `Your video is ready: ${link}` } };
}
