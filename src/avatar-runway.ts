import { z } from 'zod';
import { AvatarStepFailed, pollRead, providerEntry, retryHint, retryKeySuffix, step, summary, updateCapture,
  type AvatarDeps, type AvatarOutcome, type Capture, type CloneOptions } from './avatar-steps.js';

/** Runway returns the saved voice or avatar itself: { id, status }. READY means it can be used. */
const savedSchema = z.looseObject({ id: z.string().min(1), status: z.string().optional(), failureReason: z.string().nullish(), failure: z.string().nullish() });
export const runwayPoll = { intervalMs: 10_000, timeoutMs: 1_800_000 };
export const runwayKey = (captureId: string, kind: 'voice' | 'avatar', suffix = '') => `avatar-capture:${captureId}:runway:${kind}${suffix}`;
export const defaultPersonality = 'You speak clearly and warmly, in the first person, as the person in the recording.';
/** Shown on the recording page, so they never name the provider. */
const voiceFailed = 'The voice could not be made from this recording.';
const avatarFailed = 'The avatar could not be made from this recording.';
/** One read of a saved Runway voice or avatar. */
export const readRunway = async (deps: AvatarDeps, kind: 'voice' | 'avatar', id: string) =>
  savedSchema.parse(await step(deps, `runway.${kind}.get`, { path: { id }, customer: true }));
const failedState = (status?: string) => /^(FAILED|ERROR|CANCELLED)$/i.test(status ?? '');

const failed = async (deps: AvatarDeps, captureId: string, stored: string, reason: string): Promise<AvatarOutcome> => {
  const capture = await updateCapture(deps, captureId, { status: 'failed', error: stored });
  return { exitCode: 1, result: summary(capture, 'runway', { message: `${reason} ${retryHint(deps, captureId)}` }) };
};
/** Creates once under the capture's key; a failed create replays for that key, so it marks the capture failed. */
async function create(deps: AvatarDeps, capture: Capture, kind: 'voice' | 'avatar', body: Record<string, unknown>, suffix: string) {
  try {
    return savedSchema.parse(await step(deps, kind === 'voice' ? 'runway.voice.clone' : 'runway.avatar.create', {
      body: z.json().parse(body), idempotencyKey: runwayKey(capture.capture_id, kind, suffix), customer: true, write: true, recurring: true }, capture.capture_id)).id;
  } catch (error) {
    if (!(error instanceof AvatarStepFailed)) throw error;
    return failed(deps, capture.capture_id, kind === 'voice' ? voiceFailed : avatarFailed, error.message);
  }
}
/** Reads the saved voice or avatar every 10 s until READY, for the time left of the 30-minute wait. */
async function waitReady(deps: AvatarDeps, capture: Capture, kind: 'voice' | 'avatar', id: string, deadline: number) {
  const quiet = { noticed: false };
  let previous = '';
  for (;;) {
    const saved = await pollRead(deps, () => readRunway(deps, kind, id), capture.capture_id, quiet);
    if (saved) {
      if (saved.status !== previous) { previous = saved.status ?? ''; deps.notice(`${kind === 'voice' ? 'Voice' : 'Avatar'}: ${saved.status ?? 'unknown'}.`); }
      if (saved.status === 'READY') return 'ready' as const;
      if (failedState(saved.status)) return failed(deps, capture.capture_id, kind === 'voice' ? voiceFailed : avatarFailed,
        `The ${kind} failed${saved.failureReason ?? saved.failure ? `: ${saved.failureReason ?? saved.failure}` : '.'}`);
    }
    if (deps.now() >= deadline) return { exitCode: 2 as const, result: summary(capture, 'runway', { message: `The ${kind} is still being made.`,
      resumeCommand: deps.resume(capture.capture_id, deps.connectionId) }) };
    await deps.sleep(runwayPoll.intervalMs);
  }
}

export function runwayReady(deps: AvatarDeps, capture: Capture): AvatarOutcome {
  const avatarId = providerEntry(capture, 'runway')?.avatar_id;
  return { exitCode: 0, result: summary(capture, 'runway', { message: 'Your avatar and voice are ready.', ...(avatarId ? { nextCommand: deps.command(['call',
    'runway.avatar.video', '--input', JSON.stringify({ model: 'gwm1_avatars', avatar: { type: 'custom', avatarId }, speech: { type: 'text', text: 'Your script here.' } }),
    '--credential-mode', 'customer', '--connection', deps.connectionId ?? 'CONNECTION_ID', '--allow-write']) } : {}) }) };
}

/** Runway: clone the voice from the speech, wait for it, then save the avatar from the portrait with that voice. No consent step. */
export async function cloneRunway(deps: AvatarDeps, initial: Capture, options: CloneOptions): Promise<AvatarOutcome> {
  let capture = initial;
  const entry = providerEntry(capture, 'runway'), name = capture.name ?? 'Avatar';
  if (entry?.status === 'ready') return runwayReady(deps, capture);
  const retrying = entry?.status === 'failed' && options.retry === true;
  if (entry?.status === 'failed' && !retrying) return { exitCode: 1, result: summary(capture, 'runway', {
    message: `${entry.error ?? avatarFailed} ${retryHint(deps, capture.capture_id)}` }) };
  let voiceId = entry?.voice_id ?? undefined, avatarId = entry?.avatar_id ?? undefined;
  // --retry remakes only what failed: a voice that is not usable, then any avatar built on it.
  const suffix = retrying ? retryKeySuffix(deps) : '';
  if (retrying && voiceId && failedState((await readRunway(deps, 'voice', voiceId)).status)) voiceId = avatarId = undefined;
  if (retrying && avatarId && failedState((await readRunway(deps, 'avatar', avatarId)).status)) avatarId = undefined;
  const missing = [!avatarId && !capture.portrait_url ? 'portrait' : '', !voiceId && !capture.audio_url ? 'audio' : ''].filter(Boolean);
  if (missing.length) return { exitCode: 1, result: summary(capture, 'runway', {
    message: `This recording has no ${missing.join(' or ')}. Record again with o11 avatar clone --name NAME --provider runway, or attach files with --video FILE --audio FILE --image FILE.` }) };
  const deadline = deps.now() + runwayPoll.timeoutMs;
  if (!voiceId) {
    const made = await create(deps, capture, 'voice', { name: name.slice(0, 100), from: { type: 'audio', audio: capture.audio_url } }, suffix);
    if (typeof made !== 'string') return made;
    voiceId = made;
    capture = await updateCapture(deps, capture.capture_id, { status: 'training', voice_id: voiceId });
    deps.notice('Sending this to our partners. Creating your voice and avatar.');
  }
  if (!avatarId) {
    if (!options.wait) return { exitCode: 0, result: summary(capture, 'runway', { message: 'The voice is being made. Run the resume command to create the avatar once it is ready.',
      resumeCommand: deps.resume(capture.capture_id, deps.connectionId) }) };
    const voice = await waitReady(deps, capture, 'voice', voiceId, deadline);
    if (voice !== 'ready') return voice;
    const made = await create(deps, capture, 'avatar', { name: name.slice(0, 50), referenceImage: capture.portrait_url,
      personality: options.personality ?? defaultPersonality, voice: { type: 'custom', id: voiceId } }, suffix);
    if (typeof made !== 'string') return made;
    avatarId = made;
    capture = await updateCapture(deps, capture.capture_id, { status: 'training', avatar_id: avatarId });
  }
  if (!options.wait) return { exitCode: 0, result: summary(capture, 'runway', { message: 'The avatar is being made. Check it with o11 avatar status.',
    resumeCommand: deps.resume(capture.capture_id, deps.connectionId) }) };
  const avatar = await waitReady(deps, capture, 'avatar', avatarId, deadline);
  if (avatar !== 'ready') return avatar;
  return runwayReady(deps, await updateCapture(deps, capture.capture_id, { status: 'ready' }));
}
