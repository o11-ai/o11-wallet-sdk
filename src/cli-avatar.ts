import { cliRecoveryCommand } from './cli-execution.js';
import { cloneAvatar } from './avatar-clone.js';
import { readConsent, readTraining } from './avatar-heygen.js';
import { readRunway } from './avatar-runway.js';
import { makeVideo } from './avatar-captions.js';
import { AvatarStepPending, captureSchema, getCapture, step, providerEntry, type AvatarClient, type AvatarDeps, type AvatarOutcome } from './avatar-steps.js';
import { attachFiles, defaultReader, prepareFiles, uploadPlan, type CaptureFileReader } from './avatar-upload.js';
import { fileSeconds, linkSeconds } from './avatar-audio.js';
import { avatarArguments, openLink } from './avatar-arguments.js';
export { avatarArguments, openLink, type AvatarArguments } from './avatar-arguments.js';


export type AvatarContext = {
  profile?: string; cardId?: string; invocation?: readonly string[]; json: boolean; notice: (line: string) => void;
  sleep?: (milliseconds: number) => Promise<void>; now?: () => number; open?: (url: string) => Promise<boolean>;
  fetch?: typeof fetch; reader?: CaptureFileReader;
};
const jsonFields = ['capture_id', 'provider', 'status', 'avatar_id', 'avatar_group_id', 'voice_id', 'consent_url'] as const;

export async function executeAvatar(client: AvatarClient, args: string[], context: AvatarContext): Promise<{ result: unknown; exitCode: number }> {
  const input = avatarArguments(args), reader = context.reader ?? defaultReader, fetcher = context.fetch ?? fetch;
  // Every file is checked and hashed before a capture is created or anything is sent.
  const uploads = input.files ? await prepareFiles(input.files, reader) : undefined;
  const prefix = context.profile ? ['--profile', context.profile] : [], card = context.cardId ? ['--card', context.cardId] : [];
  const command = (values: string[]) => cliRecoveryCommand([...prefix, ...values, ...card], context.invocation);
  const fileArgs = input.files ? [...input.files.video ? ['--video', input.files.video] : [], ...input.files.audio ? ['--audio', input.files.audio] : [],
    ...input.files.portrait ? ['--portrait', input.files.portrait] : [], ...input.files.images.flatMap(path => ['--image', path])] : [];
  const sleep = context.sleep ?? ((milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  const attachDeps = { fetch: fetcher, reader, notice: context.notice, sleep };
  const deps: AvatarDeps = {
    client, provider: input.provider, connectionId: input.connectionId, notice: context.notice, open: context.open ?? openLink, sleep, now: context.now ?? Date.now, command,
    resume: (captureId, connectionId) => command(['avatar', 'clone', '--capture-id', captureId, ...input.provider === 'captions' ? [] : ['--provider', input.provider],
      ...input.provider === 'captions' && !connectionId ? [] : ['--connection', connectionId ?? 'CONNECTION_ID'], ...fileArgs, '--no-open']),
    ...(uploads && input.action === 'clone' ? { attach: capture => attachFiles(capture.url!, capture.capture_id, uploads, attachDeps) } : {}),
  };
  if (input.files && input.action === 'clone') for (const path of uploadPlan(input.files).ignored)
    context.notice(`${path} is not uploaded: a video take keeps one photo, the portrait.`);
  try {
    if (input.action === 'video') {
      const audio = uploads?.[0];
      const video = await makeVideo(deps, { captureId: input.captureId!, audioUrl: input.audioUrl, yes: input.yes === true,
        measure: (url, contentType) => linkSeconds(fetcher, url, contentType),
        ...(audio ? { audioFile: { sha256: audio.sha256, seconds: await fileSeconds((start, end) => reader.read(audio.path, start, end), audio.sizeBytes, audio.contentType),
          upload: async (name: string) => {
            // Each run saves the file as a new voice-only capture; the video key comes from the file's hash, so no second video is billed.
            const voice = captureSchema.parse(await step(deps, 'o11.avatar.capture.create', { body: { name, collect: ['voice'] }, write: true }));
            await attachFiles(voice.url!, voice.capture_id, [audio], attachDeps);
            const saved = await getCapture(deps, voice.capture_id);
            if (!saved.audio_url) throw new Error(`The audio was saved as capture ${voice.capture_id} but has no link yet. Try again shortly.`);
            return saved.audio_url;
          } } } : {}) });
      return { result: video.result, exitCode: video.exitCode };
    }
    if (input.action === 'status') {
      const capture = await getCapture(deps, input.captureId!), entry = providerEntry(capture, input.provider);
      let live: Record<string, string | null> = {};
      if (input.connectionId && input.provider === 'heygen' && entry?.avatar_id && entry.avatar_group_id)
        live = { training: (await readTraining(deps, entry.avatar_id)).status, consent: await readConsent(deps, entry.avatar_group_id) };
      if (input.connectionId && input.provider === 'runway' && entry?.voice_id)
        live = { voice: (await readRunway(deps, 'voice', entry.voice_id)).status ?? null,
          ...(entry.avatar_id ? { avatar: (await readRunway(deps, 'avatar', entry.avatar_id)).status ?? null } : {}) };
      return { exitCode: 0, result: { ...capture, avatars: capture.avatars ?? {}, ...(Object.keys(live).length ? { live: { provider: input.provider, ...live } } : {}) } };
    }
    const outcome: AvatarOutcome = await cloneAvatar(deps, input);
    if (!context.json) return { result: outcome.result, exitCode: outcome.exitCode };
    // --json keeps stdout to the IDs; what to do next still reaches the person on stderr.
    const { message, resumeCommand, nextCommand } = outcome.result;
    if (message) context.notice(message);
    if (resumeCommand) context.notice(`To pick this up later: ${resumeCommand}`);
    if (nextCommand) context.notice(`Make a video: ${nextCommand}`);
    return { result: Object.fromEntries(jsonFields.map(field => [field, outcome.result[field]])), exitCode: outcome.exitCode };
  } catch (error) {
    // A step still running is not a failure: exit 2, as for any other wait, with the call to read later.
    if (!(error instanceof AvatarStepPending)) throw error;
    return { exitCode: 2, result: { status: 'pending', invocation_id: error.invocationId, message: error.message,
      resumeCommand: command(['status', error.invocationId, '--wait']) } };
  }
}
