import { cloneHeygen } from './avatar-heygen.js';
import { cloneCaptions } from './avatar-captions.js';
import { cloneRunway } from './avatar-runway.js';
import { captureSchema, getCapture, pollRead, providerName, step, summary, type AvatarDeps, type AvatarOutcome, type Capture, type CloneOptions } from './avatar-steps.js';
export { captureSchema, type AvatarClient, type AvatarDeps, type AvatarOutcome, type AvatarResult, type CloneOptions } from './avatar-steps.js';

export const recordingPoll = { intervalMs: 4_000, slowIntervalMs: 10_000, slowAfterMs: 120_000, timeoutMs: 1_800_000 };

/** What the link asks the person to do, in the order the page asks it. */
export function linkAsk(collect: readonly string[], seconds: number) {
  const asks = [collect.includes('video') ? `record a ${seconds} second video` : collect.includes('voice') ? 'record your voice' : '',
    collect.includes('photos') ? 'add your photos' : ''].filter(Boolean);
  return asks.join(' and ') || `record a ${seconds} second video`;
}

/** Waits for the video to be recorded: every 4 s, every 10 s after two minutes, for up to 30 minutes. */
async function waitForRecording(deps: AvatarDeps, initial: Capture) {
  const started = deps.now(), quiet = { noticed: false };
  let capture = initial;
  while (capture.status === 'awaiting_recording' || capture.status === 'uploading') {
    const elapsed = deps.now() - started;
    if (elapsed >= recordingPoll.timeoutMs) return { capture, timedOut: true };
    await deps.sleep(elapsed >= recordingPoll.slowAfterMs ? recordingPoll.slowIntervalMs : recordingPoll.intervalMs);
    const next = await pollRead(deps, () => getCapture(deps, capture.capture_id), capture.capture_id, quiet);
    if (!next) continue;
    if (next.status === 'uploading' && capture.status !== 'uploading') deps.notice('Video received. Uploading.');
    capture = next;
  }
  return { capture, timedOut: false };
}

/** Records (or resumes) a capture, then hands the saved files to the chosen provider. */
export async function cloneAvatar(deps: AvatarDeps, options: CloneOptions): Promise<AvatarOutcome> {
  const provider = deps.provider;
  let capture: Capture;
  if (options.captureId) capture = await getCapture(deps, options.captureId);
  else {
    capture = captureSchema.parse(await step(deps, 'o11.avatar.capture.create', { body: { name: options.name!,
      ...(options.script ? { script: options.script } : {}), seconds: options.seconds,
      ...(options.collect ? { collect: options.collect } : {}), ...(options.photos ? { photos: options.photos } : {}) }, write: true }));
    if (!capture.url) throw new Error('The recording link was not returned. Try again in a minute.');
    if (!deps.attach) {
      deps.notice(`Open this link and ${linkAsk(capture.collect ?? options.collect ?? ['video'], capture.seconds ?? options.seconds)}: ${capture.url}`);
      if (options.open) await deps.open(capture.url);
    }
    deps.notice(`To pick this up later: ${deps.resume(capture.capture_id, deps.connectionId)}`);
  }
  // A rerun after the take was saved skips the upload, so the same command resumes safely.
  if (deps.attach && (capture.status === 'awaiting_recording' || capture.status === 'uploading')) {
    if (!capture.url) throw new Error('The capture has no recording link, so files cannot be attached.');
    await deps.attach(capture);
    capture = await getCapture(deps, capture.capture_id);
  } else if (deps.attach && capture.status !== 'expired') deps.notice('The files were already saved. Continuing.');
  if (capture.status === 'awaiting_recording' || capture.status === 'uploading') {
    const waited = await waitForRecording(deps, capture);
    capture = waited.capture;
    if (waited.timedOut) return { exitCode: 2, result: summary(capture, provider, { message: 'No video was recorded in 30 minutes.',
      resumeCommand: deps.resume(capture.capture_id, deps.connectionId) }) };
  }
  if (capture.status === 'expired') return { exitCode: 1, result: summary(capture, provider,
    { message: 'The recording link expired before a video arrived. Run o11 avatar clone --name NAME for a new link.' }) };
  if (provider === 'captions') return cloneCaptions(deps, capture);
  const started = capture.avatars?.[provider];
  if (!deps.connectionId && started?.status !== 'ready') return { exitCode: 2, result: summary(capture, provider, {
    media: { media_id: capture.media_id ?? null, source_url: capture.source_url ?? null, portrait_url: capture.portrait_url ?? null,
      audio_url: capture.audio_url ?? null, content_type: capture.content_type ?? null, size_bytes: capture.size_bytes ?? null },
    message: `Video recorded. Add --connection ID with your ${providerName(provider)} connection (o11 connections ${provider}) to ${started ? 'follow' : 'create'} the avatar.`,
    resumeCommand: deps.resume(capture.capture_id) }) };
  return provider === 'runway' ? cloneRunway(deps, capture, options) : cloneHeygen(deps, capture, options);
}
