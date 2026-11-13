import { closeSync, existsSync, mkdtempSync, openSync, readSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { oneOf, optional, required, type Args } from "../../lib/args.js";
import { OstackError } from "../../lib/errors.js";
import { print, printText } from "../../lib/output.js";
import { remote, type VideoFileInput, type VideoRemote, type VideoUploadPart } from "../../lib/remote.js";
import { FORMATS } from "./kit.js";
import { libraryFiles, libraryRecipe, libraryVideo, VIDEO_LIBRARY } from "./library.js";
import { ffmpeg, makePreviewAndPoster, makeWebCopy, needsWebCopy, probe, runs } from "./media.js";

/** The video's page in o11: where the team picks its template, edits the brief and watches every cut. */
const pageUrl = (id: string) => `${remote().origin}/wallet/ostack/launch-videos/${id}`;

const BRIEF_TEXT = ["goal", "audience", "storyboard", "material", "notes"] as const;
const ASPECTS = ["16:9", "9:16", "4:5", "1:1"] as const;
/** A brief part a format adds, in camelCase, such as a UGC video's creator or hook. */
const PART_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/;
const MAX_WAIT_SECONDS = 600;

/** Videos live in the o11 workspace; a CLI older than them says how to update. */
function videos(): VideoRemote {
  const client = remote().videos;
  if (!client) throw new OstackError("update_cli", 'This o11 CLI predates videos in o11. Update it: run "o11 update".');
  return client;
}

/** A film template's recipe: study the film, keep its shape and look, fill it with the team's own material. */
function recipe(slug: string): string {
  const film = libraryVideo(slug);
  if (!film) throw new OstackError("not_found", `No template "${slug}". Run "o11 ostack launch-videos templates --search <text>" to find one.`);
  return libraryRecipe(film);
}

/**
 * `o11 ostack launch-videos templates [--format irl|reel|product-demo] [--search <text>]`
 * Films from the library whose title or publisher matches --search; without it, only how many there are.
 */
export async function templatesCommand(args: Args): Promise<void> {
  const format = optional(args, "format") ? oneOf(args, "format", FORMATS) : undefined;
  const search = optional(args, "search")?.toLowerCase();
  const films = VIDEO_LIBRARY.filter((film) => !format || film.format === format);
  if (!search) {
    print({ films: films.length, hint: 'Add --search <text> to list films by title or publisher.' });
    return;
  }
  print({
    films: films.filter((film) => `${film.title} ${film.publisher} ${film.company}`.toLowerCase().includes(search))
      .map((film) => ({ slug: film.slug, title: film.title, publisher: film.publisher, seconds: film.seconds, watch: libraryFiles(film).video })),
  });
}

/** `o11 ostack launch-videos template <slug>`: the recipe a version follows. */
export async function templateCommand(args: Args): Promise<void> {
  printText(recipe(args.positionals[1] ?? required(args, "slug")));
}

/** `o11 ostack launch-videos videos`: the workspace's videos, most recently changed first. */
export async function videosCommand(): Promise<void> {
  const list = await videos().list();
  print({ videos: list.map(({ id, title, format, templateSlug, versionCount, updatedAt }) => ({ id, title, format, template: templateSlug, versions: versionCount, updatedAt })) });
}

/**
 * `o11 ostack launch-videos video <id> [--wait <seconds>]`: the brief, the template's recipe and every version, in
 * one read. --wait (up to 600) first waits for someone to pick a template on the video's page.
 */
export async function videoCommand(args: Args): Promise<void> {
  const id = args.positionals[1] ?? required(args, "id");
  const wait = optional(args, "wait");
  const seconds = wait === undefined ? 0 : Number(wait);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_WAIT_SECONDS) throw new OstackError("invalid_flag", `--wait takes 0 to ${MAX_WAIT_SECONDS} seconds.`);
  const client = videos();
  const until = Date.now() + seconds * 1000;
  let found = await client.get(id);
  while (!found.templateSlug && Date.now() < until) {
    await new Promise((done) => setTimeout(done, Math.min(3000, until - Date.now())));
    found = await client.get(id);
  }
  const film = found.templateSlug ? libraryVideo(found.templateSlug) : null;
  print({
    ...found, url: pageUrl(found.id), recipe: film ? libraryRecipe(film) : null,
    ...(seconds && !found.templateSlug ? { waiting: `No template picked yet. Ask the user to pick one at ${pageUrl(found.id)}, or to say to start blank.` } : {}),
  });
}

/** `o11 ostack launch-videos create --title <text> --format <format> [--template <slug>]` */
export async function createCommand(args: Args): Promise<void> {
  const format = oneOf(args, "format", FORMATS);
  const templateSlug = optional(args, "template") ?? null;
  if (templateSlug) recipe(templateSlug);
  const created = await videos().create({ title: required(args, "title"), format, templateSlug });
  print({
    id: created.id, title: created.title, format: created.format, template: created.templateSlug, url: pageUrl(created.id),
    next: templateSlug ? "Send the user the url: every cut you upload plays there."
      : `Send the user the url to pick a template, then run "o11 ostack launch-videos video ${created.id} --wait 300" until one is picked, or the user says to start blank.`,
  });
}

/** Text flags as given, an empty value clearing the field, and a length and shape o11 can keep. */
function briefFlags(args: Args, current: Record<string, unknown>): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const key of BRIEF_TEXT) {
    const value = optional(args, key);
    if (value !== undefined) changes[key] = value.trim() || undefined;
  }
  const length = optional(args, "length");
  if (length !== undefined) {
    const seconds = Number(length);
    if (length && (!Number.isInteger(seconds) || seconds < 5 || seconds > 600)) throw new OstackError("invalid_flag", "--length takes 5 to 600 seconds.");
    changes.lengthSeconds = length ? seconds : undefined;
  }
  if (optional(args, "aspect") !== undefined) changes.aspect = optional(args, "aspect") ? oneOf(args, "aspect", ASPECTS) : undefined;
  const part = optional(args, "part");
  if (part !== undefined) {
    const [name = "", ...rest] = part.split("=");
    if (!PART_NAME.test(name) || !rest.length) throw new OstackError("invalid_flag", "--part takes <name>=<text>, the name in camelCase, such as hook=Open on the empty inbox.");
    const parts = { ...(current.formatParts as Record<string, string> | undefined), [name]: rest.join("=").trim() };
    if (!parts[name]) delete parts[name];
    changes.formatParts = Object.keys(parts).length ? parts : undefined;
  }
  return changes;
}

/**
 * `o11 ostack launch-videos update <id> [--title <text>] [--template <slug>|blank] [--goal|--audience|--storyboard|
 * --material|--notes <text>] [--length <seconds>] [--aspect 16:9|9:16|4:5|1:1] [--part <name>=<text>]`
 * Changes a video's name, template or brief. Brief fields merge into the current brief; an empty value clears one.
 * --part sets one part this kind of video adds to the brief, such as a UGC video's hook.
 */
export async function updateCommand(args: Args): Promise<void> {
  const id = args.positionals[1] ?? required(args, "id");
  const client = videos();
  const patch: { title?: string; templateSlug?: string | null; brief?: Record<string, unknown> } = {};
  const title = optional(args, "title");
  if (title !== undefined) patch.title = title;
  const template = optional(args, "template");
  if (template !== undefined) {
    if (template !== "blank") recipe(template);
    patch.templateSlug = template === "blank" ? null : template;
  }
  const touchesBrief = [...BRIEF_TEXT, "length", "aspect", "part"].some((flag) => optional(args, flag) !== undefined);
  if (touchesBrief) {
    const current = (await client.get(id)).brief;
    const merged: Record<string, unknown> = { ...current, ...briefFlags(args, current) };
    patch.brief = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
  }
  if (!Object.keys(patch).length) throw new OstackError("missing_flag", "Pass at least one of --title, --template, or a brief field such as --goal.");
  const updated = await client.update(id, patch);
  print({ id: updated.id, title: updated.title, template: updated.templateSlug, brief: updated.brief, url: `${pageUrl(updated.id)}?tab=brief` });
}

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".avif": "image/avif",
};

type LocalFile = { path: string; contentType: string; sizeBytes: number };

function fileInfo(path: string): LocalFile {
  const full = resolve(path);
  if (!existsSync(full)) throw new OstackError("not_found", `No file at ${full}.`);
  const contentType = CONTENT_TYPES[extname(full).toLowerCase()];
  if (!contentType) throw new OstackError("invalid_input", `${full} is not a video or image o11 stores (mp4, mov, webm, webp, jpg, png, avif).`);
  return { path: full, contentType, sizeBytes: statSync(full).size };
}

/**
 * The file o11 stores: the original when it is a browser-playable video at 1080p or less, else a 1080p H.264 copy
 * made with ffmpeg. o11 never keeps anything above 1080p.
 */
function playableAt1080p(original: LocalFile, scratch: string, name: string): LocalFile {
  if (!needsWebCopy(original.contentType, probe(original.path))) return original;
  const copy = join(scratch, `${name}.mp4`);
  if (!runs(ffmpeg()) || !makeWebCopy(original.path, copy))
    throw new OstackError("invalid_input", `${original.path} is above 1080p or won't play in a browser. Install ffmpeg, or export it as a 1080p H.264 MP4.`);
  return fileInfo(copy);
}

/** The width, height and length o11 records with a file. */
function dimensions(path: string) {
  const { width, height, durationMs } = probe(path);
  return { ...(width ? { width } : {}), ...(height ? { height } : {}), ...(durationMs ? { durationMs } : {}) };
}

/** Sends one file part by part, reading only one part at a time from disk. */
async function sendFile(client: VideoRemote, versionId: string, fileId: string, path: string, partBytes: number, count: number) {
  const parts: VideoUploadPart[] = [];
  const handle = openSync(path, "r");
  try {
    for (let part = 1; part <= count; part++) {
      const size = Math.min(partBytes, statSync(path).size - partBytes * (part - 1));
      const bytes = new Uint8Array(size);
      readSync(handle, bytes, 0, size, partBytes * (part - 1));
      parts.push(await client.uploadPart(versionId, fileId, part, bytes));
    }
  } finally {
    closeSync(handle);
  }
  return parts;
}

/**
 * `o11 ostack launch-videos upload <video-id> <cut> [<same cut in another shape>...] [--preview <file>] [--poster <file>]
 * [--note <text>]`
 * Uploads a finished cut as the video's next version, at 1080p at most. The first cut is the one the page plays; more
 * cuts are the same version in other shapes, such as 9:16 beside 16:9. Without --preview and --poster, ffmpeg makes them.
 */
export async function uploadCommand(args: Args): Promise<void> {
  const videoId = args.positionals[1] ?? required(args, "id");
  const originals = args.positionals.slice(2);
  if (!originals.length) throw new OstackError("missing_flag", "Name the finished cut to upload: upload <video-id> <cut>.");
  const scratch = mkdtempSync(join(tmpdir(), "ostack-video-"));
  try {
    const cuts = originals.map((path, index) => playableAt1080p(fileInfo(path), scratch, `cut-${index + 1}`));
    const main = cuts[0]!;
    const wanted = !optional(args, "preview") || !optional(args, "poster");
    const made: { preview?: string; poster?: string } = wanted && runs(ffmpeg()) ? makePreviewAndPoster(main.path, scratch) : {};
    const previewPath = optional(args, "preview") ?? made.preview;
    const posterPath = optional(args, "poster") ?? made.poster;
    const files: (VideoFileInput & { path: string })[] = [
      ...cuts.map((cut) => ({ role: "video" as const, path: cut.path, contentType: cut.contentType, sizeBytes: cut.sizeBytes, ...dimensions(cut.path) })),
      ...(previewPath ? [{ role: "preview" as const, ...fileInfo(previewPath) }] : []),
      ...(posterPath ? [{ role: "poster" as const, ...fileInfo(posterPath) }] : []),
    ];
    const client = videos();
    const started = await client.startVersion(videoId, {
      files: files.map(({ path: _path, ...file }) => file),
      ...(optional(args, "note") ? { changeNote: optional(args, "note") } : {}),
    });
    try {
      const parts: Record<string, VideoUploadPart[]> = {};
      for (const [index, file] of files.entries()) {
        const reserved = started.files[index]!;
        parts[reserved.id] = await sendFile(client, started.id, reserved.id, file.path, started.partBytes, reserved.parts);
      }
      const done = await client.completeVersion(started.id, parts);
      print({ video: videoId, version: done.number, id: done.id, cuts: cuts.length, preview: Boolean(previewPath), poster: Boolean(posterPath), url: pageUrl(videoId) });
    } catch (error) {
      await client.abandonVersion(started.id).catch(() => undefined);
      throw error;
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
