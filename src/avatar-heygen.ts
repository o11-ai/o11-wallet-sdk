import { z } from 'zod';
import { AvatarStepFailed, pollRead, providerEntry, retryHint, retryKeySuffix, step, summary, updateCapture,
  type AvatarDeps, type AvatarOutcome, type Capture, type CloneOptions } from './avatar-steps.js';

const text = z.string().nullish();
const createdSchema = z.looseObject({ data: z.looseObject({
  avatar_item: z.looseObject({ id: z.string().min(1), group_id: text, default_voice_id: text }),
  avatar_group: z.looseObject({ id: z.string().min(1) }).nullish() }) });
const consentLinkSchema = z.looseObject({ data: z.looseObject({ url: z.string().min(1) }) });
const trainingSchema = z.looseObject({ data: z.looseObject({ status: z.string(), error: z.unknown().optional() }) });
const consentSchema = z.looseObject({ data: z.looseObject({ consent_status: z.string().nullable().optional() }) });

export const trainingPoll = { intervalMs: 10_000, timeoutMs: 1_800_000 };
export const createKey = (captureId: string, suffix = '') => `avatar-capture:${captureId}:create${suffix}`;
/** Keyed to the avatar group too, so a consent link after a --retry belongs to the new group. */
export const consentKey = (captureId: string, groupId: string, issuedAt?: number) =>
  `avatar-capture:${captureId}:consent:${groupId}${issuedAt === undefined ? '' : `:${issuedAt}`}`;
/** Shown on the recording page, so it never names the provider. */
export const trainingFailed = 'The avatar could not be trained from this video.';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const readTraining = async (deps: AvatarDeps, avatarId: string) =>
  trainingSchema.parse(await step(deps, 'heygen.avatar.get', { path: { id: avatarId }, customer: true })).data;
export const readConsent = async (deps: AvatarDeps, groupId: string) =>
  consentSchema.parse(await step(deps, 'heygen.avatar.consent.get', { path: { id: groupId }, customer: true })).data.consent_status ?? null;

async function startConsent(deps: AvatarDeps, captureId: string, groupId: string, issuedAt?: number): Promise<string> {
  try {
    const started = consentLinkSchema.parse(await step(deps, 'heygen.avatar.consent.start',
      { path: { id: groupId }, body: {}, idempotencyKey: consentKey(captureId, groupId, issuedAt), customer: true, write: true }, captureId));
    return started.data.url;
  } catch (error) {
    // A failed link request replays under its key; consent links are free to reissue, so ask once more under a new key.
    if (error instanceof AvatarStepFailed && issuedAt === undefined) return startConsent(deps, captureId, groupId, deps.now());
    throw error;
  }
}
const consentNotice = (url: string) => `The person in the video must confirm it is them (link lasts 24 hours): ${url}`;
/** A run stopped between training and saving the consent link gets the link on resume, under the same key. */
async function missingConsent(deps: AvatarDeps, capture: Capture, groupId: string) {
  const url = await startConsent(deps, capture.capture_id, groupId);
  deps.notice(consentNotice(url));
  return updateCapture(deps, capture.capture_id, { consent_url: url });
}
const failed = async (deps: AvatarDeps, captureId: string, reason: string): Promise<AvatarOutcome> => {
  const capture = await updateCapture(deps, captureId, { status: 'failed', error: trainingFailed });
  return { exitCode: 1, result: summary(capture, 'heygen', { message: `${reason} ${retryHint(deps, captureId)}` }) };
};

/** Sends the recording to HeyGen once. The keys come from the capture, so a rerun returns the same avatar. */
async function train(deps: AvatarDeps, capture: Capture, suffix: string): Promise<{ capture: Capture } | { outcome: AvatarOutcome }> {
  let result: unknown;
  try {
    result = await step(deps, 'heygen.avatar.create', {
      body: { type: 'digital_twin', name: capture.name ?? capture.capture_id, file: { type: 'url', url: capture.source_url! } },
      idempotencyKey: createKey(capture.capture_id, suffix), customer: true, write: true, recurring: true }, capture.capture_id);
  } catch (error) {
    // The wallet replays this failure for the capture's key, so a rerun cannot fix it. A new recording gets a new key.
    if (!(error instanceof AvatarStepFailed)) throw error;
    return { outcome: await failed(deps, capture.capture_id, error.message) };
  }
  const created = createdSchema.parse(result).data;
  const groupId = created.avatar_group?.id ?? created.avatar_item.group_id;
  if (!groupId) throw new Error('HeyGen did not return an avatar group, so consent cannot start. Check heygen.avatar.create in o11 history.');
  const consentUrl = await startConsent(deps, capture.capture_id, groupId);
  const updated = await updateCapture(deps, capture.capture_id, { status: 'training', avatar_id: created.avatar_item.id,
    avatar_group_id: groupId, voice_id: created.avatar_item.default_voice_id ?? undefined, consent_url: consentUrl });
  deps.notice('Sending this to our partners. Creating your avatar.');
  deps.notice(consentNotice(consentUrl));
  return { capture: updated };
}

/** Reads training and consent every 10 s for up to 30 minutes; a rejected consent gets one fresh link. */
async function waitForTraining(deps: AvatarDeps, initial: Capture, avatarId: string, groupId: string): Promise<AvatarOutcome> {
  const started = deps.now(), quiet = { noticed: false };
  let capture = initial, previous = '', reissued = false, training: { status: string; error?: unknown } = { status: 'unknown' };
  let consent: string | null = null;
  for (;;) {
    const read = await pollRead(deps, async () => [await readTraining(deps, avatarId), await readConsent(deps, groupId)] as const, capture.capture_id, quiet);
    if (read) {
      [training, consent] = read;
      const seen = `${training.status}/${consent}`;
      if (seen !== previous) { previous = seen; deps.notice(`Training: ${training.status}. Consent: ${consent ?? 'not started'}.`); }
      if (training.status === 'failed') {
        const reason = typeof training.error === 'string' ? training.error : record(training.error) && typeof training.error.message === 'string'
          ? training.error.message : 'HeyGen could not train this avatar.';
        return failed(deps, capture.capture_id, `Training failed: ${reason}`);
      }
      if (consent === 'rejected' && !reissued) {
        const url = await startConsent(deps, capture.capture_id, groupId, deps.now());
        capture = await updateCapture(deps, capture.capture_id, { consent_url: url });
        reissued = true;
        deps.notice(`Consent was not confirmed. ${consentNotice(url)}`);
      } else if (consent !== 'rejected') reissued = false;
      if (consent === null && !providerEntry(capture, 'heygen')?.consent_url) capture = await missingConsent(deps, capture, groupId);
      // Once the person has confirmed, the recording page stops asking, even while training runs.
      if (consent === 'accepted' && providerEntry(capture, 'heygen')?.consent_url)
        capture = await updateCapture(deps, capture.capture_id, { consent_url: null });
      if (training.status === 'completed' && consent === 'accepted') {
        capture = await updateCapture(deps, capture.capture_id, { status: 'ready' });
        return heygenReady(deps, capture);
      }
    }
    if (deps.now() - started >= trainingPoll.timeoutMs)
      return { exitCode: 2, result: summary(capture, 'heygen', { message: `Still training (${training.status}) or waiting for consent (${consent ?? 'not started'}).`,
        resumeCommand: deps.resume(capture.capture_id, deps.connectionId) }) };
    await deps.sleep(trainingPoll.intervalMs);
  }
}

export function heygenReady(deps: AvatarDeps, capture: Capture): AvatarOutcome {
  const avatarId = providerEntry(capture, 'heygen')?.avatar_id;
  return { exitCode: 0, result: summary(capture, 'heygen', { message: 'Your avatar and voice are ready.', ...(avatarId ? { nextCommand: deps.command(['call',
    'heygen.avatar.video', '--input', JSON.stringify({ type: 'avatar', avatar_id: avatarId, script: 'Your script here.', aspect_ratio: '9:16' }),
    '--credential-mode', 'customer', '--connection', deps.connectionId ?? 'CONNECTION_ID', '--allow-write']) } : {}) }) };
}

/** HeyGen: train from the video, start consent, then wait for both. A recorded capture with a connection arrives here. */
export async function cloneHeygen(deps: AvatarDeps, initial: Capture, options: CloneOptions): Promise<AvatarOutcome> {
  let capture = initial, entry = providerEntry(capture, 'heygen');
  if (entry?.status === 'ready') return heygenReady(deps, capture);
  const retrying = entry?.status === 'failed' && options.retry === true;
  if (entry?.status === 'failed' && !retrying)
    return { exitCode: 1, result: summary(capture, 'heygen', { message: `${entry.error ?? trainingFailed} ${retryHint(deps, capture.capture_id)}` }) };
  if (!entry?.avatar_id || retrying) {
    if (!capture.source_url) return { exitCode: 1, result: summary(capture, 'heygen', { message: 'This recording has no video link. Try again shortly.',
      resumeCommand: deps.resume(capture.capture_id, deps.connectionId) }) };
    const trained = await train(deps, capture, retrying ? retryKeySuffix(deps) : '');
    if ('outcome' in trained) return trained.outcome;
    capture = trained.capture;
    entry = providerEntry(capture, 'heygen');
  }
  const avatarId = entry?.avatar_id, groupId = entry?.avatar_group_id;
  if (!avatarId || !groupId) return { exitCode: 1, result: summary(capture, 'heygen', { message: 'The capture has an avatar but no avatar group, so consent cannot be checked.' }) };
  if (!options.wait) {
    if (!entry?.consent_url && await readConsent(deps, groupId) === null) capture = await missingConsent(deps, capture, groupId);
    return { exitCode: 0, result: summary(capture, 'heygen', { message: 'Training started. Check it with o11 avatar status.',
      resumeCommand: deps.resume(capture.capture_id, deps.connectionId) }) };
  }
  return waitForTraining(deps, capture, avatarId, groupId);
}
