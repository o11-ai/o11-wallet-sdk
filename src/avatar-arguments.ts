import { z } from 'zod';
import { avatarProviders, providerName, type AvatarProvider } from './avatar-steps.js';
import { fileType, headlessCollect, type HeadlessFiles } from './avatar-upload.js';

const usage = 'Use o11 avatar clone --name NAME [--provider captions|heygen|runway] [--connection ID] [--video FILE] [--audio FILE] [--image FILE], '
  + 'o11 avatar clone --capture-id ID [--connection ID], o11 avatar status --capture-id ID [--provider P --connection ID], '
  + 'or o11 avatar video --capture-id ID [--connection ID] [--audio-url URL | --audio FILE] [--yes]. Run o11 avatar --help.';
const videoUsage = 'Use o11 avatar video --capture-id ID [--connection ID] [--audio-url URL | --audio FILE] [--yes]';
const valued = ['--name', '--script', '--seconds', '--capture-id', '--connection', '--provider', '--personality', '--video', '--audio', '--portrait', '--photos',
  '--audio-url'] as const;
type Valued = typeof valued[number];
const collectable = ['video', 'voice', 'photos'] as const;
export type AvatarArguments = { action: 'clone' | 'status' | 'video'; provider: AvatarProvider; audioUrl?: string; yes?: boolean; retry?: boolean; captureId?: string; connectionId?: string; name?: string;
  script?: string; seconds: number; open: boolean; wait: boolean; personality?: string; collect?: string[]; photos?: number; files?: HeadlessFiles };

export function avatarArguments(args: string[]): AvatarArguments {
  const [action, ...flags] = args;
  if (action !== 'clone' && action !== 'status' && action !== 'video') throw new Error(usage);
  const values: Partial<Record<Valued, string>> = {}, images: string[] = [], collect: string[] = [];
  let open = true, wait = true, yes = false, retry = false;
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index]!;
    if (flag === '--yes' && !yes && action === 'video') { yes = true; continue; }
    if (flag === '--retry' && !retry && action === 'clone') { retry = true; continue; }
    if (flag === '--no-open' && open && action === 'clone') { open = false; continue; }
    if (flag === '--no-wait' && wait && action === 'clone') { wait = false; continue; }
    const value = flags[index + 1];
    if (flag === '--image' || flag === '--collect') {
      if (!value || value.startsWith('--')) throw new Error(`Supply a value after ${flag}`);
      index++;
      if (flag === '--image') images.push(value); else collect.push(...value.split(',').map(item => item.trim()).filter(Boolean));
      continue;
    }
    if (!(valued as readonly string[]).includes(flag)) throw new Error(usage);
    const name = flag as Valued;
    if (values[name] !== undefined || !value || value.startsWith('--')) throw new Error(`Supply ${flag} once, followed by its value`);
    values[name] = value;
    index++;
  }
  if (action === 'video') return videoArguments(values, images.length > 0 || collect.length > 0, yes);
  if (values['--audio-url'] !== undefined) throw new Error('--audio-url is for o11 avatar video');
  const provider = values['--provider'] ?? 'captions';
  if (!(avatarProviders as readonly string[]).includes(provider)) throw new Error('--provider takes heygen, runway or captions');
  const chosen = provider as AvatarProvider, captureId = values['--capture-id'], connectionId = values['--connection'];
  if (captureId !== undefined && !z.uuid().safeParse(captureId).success) throw new Error('--capture-id takes the capture ID the clone command printed');
  if (connectionId !== undefined && !z.uuid().safeParse(connectionId).success)
    throw new Error(`--connection takes a connection ID. List your ${providerName(chosen)} connections with o11 connections ${chosen}.`);
  if (values['--personality'] !== undefined && (chosen !== 'runway' || values['--personality'].length > 10_000))
    throw new Error('--personality applies to --provider runway, up to 10,000 characters');
  const fresh = ['--name', '--script', '--seconds', '--photos'].some(flag => values[flag as Valued] !== undefined) || collect.length > 0;
  const fileFlags = values['--video'] !== undefined || values['--audio'] !== undefined || values['--portrait'] !== undefined || images.length > 0;
  if (action === 'status') {
    if (!captureId || fresh || fileFlags || values['--personality'] !== undefined) throw new Error('Use o11 avatar status --capture-id ID [--provider P --connection ID]');
    return { action, provider: chosen, captureId, connectionId, seconds: 30, open: false, wait: false };
  }
  if (retry && (!captureId || chosen === 'captions' || !connectionId))
    throw new Error('Use --retry with --capture-id ID --provider heygen|runway --connection ID, after a failed create');
  if (captureId && fresh) throw new Error('--name, --script, --seconds, --collect and --photos start a new capture. Use --capture-id alone to resume one.');
  if (!captureId && !values['--name']?.trim()) throw new Error('Use o11 avatar clone --name NAME to start, or --capture-id ID to resume');
  const seconds = values['--seconds'] === undefined ? 90 : Number(values['--seconds']);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) throw new Error('--seconds takes a whole number from 5 to 120');
  if (values['--name'] !== undefined && values['--name'].trim().length > 100) throw new Error('--name takes up to 100 characters');
  let files: HeadlessFiles | undefined;
  if (fileFlags) {
    if (collect.length || values['--photos'] !== undefined) throw new Error('--collect and --photos are for the recording link. With files, what is collected follows the files given.');
    if (images.length > 5) throw new Error('Supply up to 5 --image files');
    files = { video: values['--video'], audio: values['--audio'], portrait: values['--portrait'], images };
    if (!files.video && !files.audio && !images.length) throw new Error('--portrait needs --video, --audio or --image as well');
    // Types are checked here; existence and size are checked before anything is created.
    if (files.video) fileType(files.video, 'video');
    if (files.audio) fileType(files.audio, 'audio');
    for (const path of [...images, ...files.portrait ? [files.portrait] : []]) fileType(path, 'image');
    requireFiles(chosen, files);
  }
  if (collect.some(item => !(collectable as readonly string[]).includes(item))) throw new Error('--collect takes video, voice or photos');
  const photos = values['--photos'] === undefined ? undefined : Number(values['--photos']);
  if (photos !== undefined && (!Number.isInteger(photos) || photos < 1 || photos > 5)) throw new Error('--photos takes a whole number from 1 to 5');
  const derived = files && !captureId ? headlessCollect(files) : undefined;
  return { action, provider: chosen, captureId, connectionId, name: values['--name']?.trim(), script: values['--script'], seconds, open, wait, retry,
    personality: values['--personality'], files, ...(derived ? derived : { ...(collect.length ? { collect: [...new Set(collect)] } : {}), ...(photos ? { photos } : {}) }) };
}

/** The CLI cannot take a frame from a video, so a platform that needs a photo or a voice sample must be given one. */
function requireFiles(provider: AvatarProvider, files: HeadlessFiles) {
  const photo = Boolean(files.portrait ?? files.images[0]);
  // A voice sample alone is a complete recording; a video needs a photo because the CLI cannot take a frame from it.
  if (provider === 'captions' && !photo && files.video) throw new Error('Captions needs a photo of the person. Add --image FILE.');
  if (provider === 'runway' && (!photo || !files.audio))
    throw new Error(`Runway needs ${[!photo ? 'a photo of the person (--image FILE)' : '', !files.audio ? 'a voice sample (--audio FILE)' : ''].filter(Boolean).join(' and ')}.`);
  if (provider === 'heygen' && !files.video) throw new Error('HeyGen trains from a talking video. Add --video FILE.');
}

/** o11 avatar video: one Captions video from a capture, with its own audio, a linked clip, or an uploaded file. */
function videoArguments(values: Partial<Record<Valued, string>>, extra: boolean, yes: boolean): AvatarArguments {
  const { '--capture-id': captureId, '--connection': connectionId, '--audio-url': audioUrl, '--audio': audio, ...other } = values;
  if (extra || Object.keys(other).length || !captureId) throw new Error(videoUsage);
  if (!z.uuid().safeParse(captureId).success) throw new Error('--capture-id takes the capture ID the clone command printed');
  if (connectionId !== undefined && !z.uuid().safeParse(connectionId).success) throw new Error('--connection takes a connection ID. List your Captions connections with o11 connections captions.');
  if (audioUrl !== undefined && audio !== undefined) throw new Error('Use --audio-url or --audio, not both');
  if (audioUrl !== undefined && !/^https:\/\/\S+$/.test(audioUrl)) throw new Error('--audio-url takes an https link to a WAV or MP3 file');
  if (audio !== undefined) fileType(audio, 'audio');
  return { action: 'video', provider: 'captions', captureId, connectionId, audioUrl, yes, seconds: 90, open: false, wait: true,
    ...(audio !== undefined ? { files: { audio, images: [] } } : {}) };
}

/** Opens an https link in the default browser. Remote shells, CI and headless Linux print the link only. */
export async function openLink(url: string) {
  let target: URL;
  try { target = new URL(url); } catch { return false; }
  if (target.protocol !== 'https:') return false;
  if (process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.CI || process.env.CODESPACES
    || process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
  const command = process.platform === 'darwin' ? ['open', target.href] : process.platform === 'win32'
    ? ['rundll32', 'url.dll,FileProtocolHandler', target.href] : ['xdg-open', target.href];
  try { void Bun.spawn(command, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }).exited.catch(() => {}); return true; }
  catch { return false; }
}
