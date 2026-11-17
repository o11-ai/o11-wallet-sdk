import { z } from 'zod';
import { ToolCallError, ToolClientError } from './client.js';
import { AvatarStepFailed, AvatarStepPending, getCapture, providerEntry, step, summary, updateCapture,
  type AvatarDeps, type AvatarOutcome, type Capture } from './avatar-steps.js';

/** Each started block of this many seconds is one unit of price; the video is as long as the speech audio. */
export const blockSeconds = 6;
/** What the o11 wallet is charged per block when no Captions connection is used. Matches the catalog's selling price. */
export const walletBlockDollars = 1.25;
/** What Captions billed a connected key per block in testing ($0.15 per second). Captions publishes no API rate. */
export const ownKeyBlockDollars = 0.9;
export function captionsCost(seconds: number, ownKey = false) {
  return Math.ceil(seconds / blockSeconds) * (ownKey ? ownKeyBlockDollars : walletBlockDollars);
}
const dollars = (amount: number) => `$${amount.toFixed(2)}`;
export const costGateDollars = 1;
const pricing = 'A video costs $1.25 from your o11 wallet for each started 6 seconds, and it is as long as the speech audio: '
  + '5 seconds is $1.25, 14 seconds is $3.75, 30 seconds is $6.25. With --connection, Captions bills your own key instead '
  + '(about $0.90 per 6 seconds) and the wallet is not charged.';

/** Captions keeps no avatar: the saved portrait plus speech audio is sent with every video, so the capture is ready at once. */
export async function cloneCaptions(deps: AvatarDeps, initial: Capture): Promise<AvatarOutcome> {
  // A voice recording is complete on its own: it has no face, so there is no video to offer yet.
  if (!initial.portrait_url && initial.audio_url && !initial.source_url) return { exitCode: 0, result: summary(initial, 'captions', {
    message: 'Voice sample saved. Find it in the wallet under Resources, or read its audio link with o11 avatar status. '
      + 'To make videos of this person, also save their face: o11 avatar clone --name NAME records a talking video.' }) };
  if (!initial.portrait_url) return { exitCode: 1, result: summary(initial, 'captions', {
    message: 'This recording has no portrait. Record again with o11 avatar clone --name NAME, or attach one with --image FILE.' }) };
  const capture = providerEntry(initial, 'captions')?.status === 'ready' ? initial : await updateCapture(deps, initial.capture_id, { status: 'ready' });
  return { exitCode: 0, result: summary(capture, 'captions', {
    message: 'Ready. Captions keeps no avatar: each video sends this portrait and a speech clip. Captions has no text-to-speech, so the speech '
      + `must be audio; ${capture.audio_url ? "the recording's own audio is used unless you pass another"
        : 'this recording has no speech audio, so pass one with --audio FILE or --audio-url URL'}. A video takes about 2.5 minutes. ${pricing}`,
    nextCommand: deps.command(['avatar', 'video', '--capture-id', capture.capture_id, ...(deps.connectionId ? ['--connection', deps.connectionId] : []),
      ...(capture.audio_url ? [] : ['--audio', 'SPEECH.wav'])]) }) };
}

export type VideoOptions = { captureId: string; audioUrl?: string; yes: boolean;
  /** --audio FILE: its whole-file hash, its measured length, and the upload that returns its saved audio link. */
  audioFile?: { sha256: string; seconds?: number; upload: (name: string) => Promise<string> };
  /** Measures a linked clip (HEAD and WAV header); undefined when the link does not answer. */
  measure: (url: string, contentType?: string | null) => Promise<number | undefined> };
export type VideoOutcome = { exitCode: 0 | 1 | 2; result: Record<string, unknown> };
const videoSchema = z.looseObject({ downloadUrl: z.string().min(1).optional(), metadata: z.unknown().optional() });
export const videoWaitMs = 600_000;
export const captionsMaxSeconds = 60;
/** A link without its signature, so a reissued link to the same file names the same source. */
const unsigned = (link: string) => { try { const url = new URL(link); return url.origin + url.pathname; } catch { return link; } };
/**
 * Same capture, same speech and same portrait give the same key, so a rerun after a dropped connection returns the
 * call already made instead of paying for a second video.
 */
export async function videoKey(captureId: string, audioSource: string, portraitUrl: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${audioSource}|${unsigned(portraitUrl)}`));
  return `avatar-video:${captureId}:${Array.from(new Uint8Array(digest).slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** One Captions video from a capture's fresh portrait and a speech clip, waiting up to 10 minutes for the file. */
export async function makeVideo(deps: AvatarDeps, options: VideoOptions): Promise<VideoOutcome> {
  const capture = await getCapture(deps, options.captureId);
  const base = { capture_id: capture.capture_id, provider: 'captions' }, ownKey = !!deps.connectionId;
  if (capture.status === 'expired') return { exitCode: 1, result: { ...base, message: 'This capture has expired. Record again with o11 avatar clone --name NAME.' } };
  if (!capture.portrait_url) return { exitCode: 1, result: { ...base, message: 'This capture has no portrait. Record again, or attach one with o11 avatar clone --image FILE.' } };
  let audioUrl = options.audioUrl, seconds: number | undefined, source: string;
  if (options.audioFile) { seconds = options.audioFile.seconds; source = `file:${options.audioFile.sha256}`; }
  else if (audioUrl) { seconds = await options.measure(audioUrl); source = `url:${unsigned(audioUrl)}`; }
  else {
    audioUrl = capture.audio_url ?? undefined;
    if (!audioUrl) return { exitCode: 1, result: { ...base, message: 'This capture has no speech audio. Pass --audio-url URL or --audio FILE.' } };
    // The measured clip when its link answers; otherwise the length the recording was set to.
    seconds = await options.measure(audioUrl, capture.audio_content_type) ?? capture.seconds ?? undefined;
    source = `url:${unsigned(audioUrl)}`;
  }
  if (seconds !== undefined) {
    const rounded = Math.round(seconds), cost = captionsCost(seconds, ownKey);
    if (seconds > captionsMaxSeconds) return { exitCode: 1, result: { ...base, audio_seconds: rounded,
      message: 'Captions takes at most 60 seconds of speech. Pass --audio FILE with a shorter clip.' } };
    deps.notice(ownKey ? `The speech is about ${rounded} seconds, so the video costs about ${dollars(cost)} on your Captions key.`
      : `The speech is about ${rounded} seconds, so the video costs ${dollars(cost)} from your o11 wallet.`);
    if (cost > costGateDollars && !options.yes) return { exitCode: 2, result: { ...base, audio_seconds: rounded, estimated_cost_usd: Number(cost.toFixed(2)),
      message: `Nothing was sent. Rerun with --yes to spend about ${dollars(cost)}, or pass a shorter clip with --audio-url URL or --audio FILE. ${pricing}`,
      resumeCommand: deps.command(['avatar', 'video', '--capture-id', capture.capture_id, ...(deps.connectionId ? ['--connection', deps.connectionId] : []),
        ...(options.audioUrl ? ['--audio-url', options.audioUrl] : []), '--yes']) } };
  } else deps.notice(`The clip's length could not be read. Captions takes at most 60 seconds of speech. ${pricing}`);
  if (options.audioFile) audioUrl = await options.audioFile.upload(capture.name ?? 'Speech');
  // Who pays is part of the key: a rerun on your own key is a different call from one the wallet was asked to pay for.
  const idempotencyKey = await videoKey(capture.capture_id, ownKey ? source : `wallet|${source}`, capture.portrait_url);
  deps.notice('Making the video. This takes about 2.5 minutes.');
  let invocationId: string | undefined, result: unknown;
  try {
    // On o11's account the stated length sizes the hold, so it is the top of the clip's last block; the charge follows the measured audio.
    const body: Record<string, string | number> = { audio_url: audioUrl!, image_url: capture.portrait_url };
    if (!ownKey && seconds !== undefined) body.audio_seconds = Math.min(captionsMaxSeconds, Math.max(1, Math.ceil(seconds / blockSeconds)) * blockSeconds);
    result = await step(deps, 'captions.avatar.video', { body, customer: ownKey, write: true,
      idempotencyKey, waitMs: videoWaitMs, onReceipt: id => { invocationId = id; } });
  } catch (error) {
    if (error instanceof AvatarStepFailed) return { exitCode: 1, result: { ...base, ...(invocationId ? { invocation_id: invocationId } : {}),
      message: `The video failed. ${error.message} Check the audio (WAV or MP3, 1 to 60 seconds)${ownKey ? ' and your Captions account' : ''}, then try again.${ownKey ? ''
        : ' If o11 has no Captions account yet, pass your own with --connection ID (o11 connections captions).'}` } };
    if (error instanceof AvatarStepPending) invocationId = error.invocationId;
    // o11's Captions account is not set up everywhere. Nothing was sent or charged; the person's own key still works.
    else if (!ownKey && error instanceof ToolCallError && error.cause instanceof ToolClientError && error.cause.status === 400
      && (error.cause.response as { error?: unknown } | undefined)?.error === 'NOT_CONFIGURED')
      return { exitCode: 1, result: { ...base, message: "o11's Captions account is not available here yet, so nothing was sent or charged. "
        + 'Use your own Captions key: connect it in the wallet, find its ID with o11 connections captions, then run this again with --connection ID.',
        resumeCommand: deps.command(['avatar', 'video', '--capture-id', capture.capture_id, '--connection', 'CONNECTION_ID',
          ...(options.audioUrl ? ['--audio-url', options.audioUrl] : []), ...(options.yes ? ['--yes'] : [])]) } };
    else throw error;
  }
  const video = videoSchema.safeParse(result);
  if (!video.success || !video.data.downloadUrl) return { exitCode: 2, result: { ...base, ...(invocationId ? { invocation_id: invocationId } : {}), idempotency_key: idempotencyKey,
    message: 'The video is still being made. Running the same command again returns this same call, not a new video.',
    ...(invocationId ? { resumeCommand: deps.command(['status', invocationId, '--wait']) } : {}) } };
  return { exitCode: 0, result: { ...base, invocation_id: invocationId ?? null, download_url: video.data.downloadUrl,
    message: `Your video is ready: ${video.data.downloadUrl}` } };
}
