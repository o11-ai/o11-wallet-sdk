import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { oneOf, optional, required, type Args } from "../../lib/args.js";
import { OstackError } from "../../lib/errors.js";
import { print } from "../../lib/output.js";
import type { RemoteVideoDetail, RemoteVideoFile } from "../../lib/remote.js";
import { libraryFiles, type LibraryVideo } from "./library.js";
import { ASPECTS, libraryFilm, nearestAspect, videoReference, type Aspect } from "./links.js";
import { pageUrl, videos } from "./videos.js";

const EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

/** A short, safe file name from a title, such as "inbox-launch". */
const fileStem = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "video";

/** Streams a link to a file, so a long cut never sits in memory. */
async function save(link: string, path: string): Promise<number> {
  const response = await fetch(link, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!response.ok) throw new OstackError("download_failed", `The download answered ${response.status}. Run the command again; links last six hours.`);
  return Bun.write(path, response);
}

async function downloadFilm(film: LibraryVideo, dir: string) {
  const path = join(dir, `${fileStem(film.slug.split("/")[1] ?? film.slug)}.mp4`);
  const sizeBytes = await save(libraryFiles(film).video, path);
  print({ film: film.slug, title: film.title, publisher: film.publisher, saved: [{ path, sizeBytes }], source: film.source });
}

/** The cuts of one version to save: the main one, one shape, or every shape. */
function pickCuts(files: RemoteVideoFile[], aspect: Aspect | "all" | undefined) {
  const cuts = files.filter((file) => file.role === "video");
  const shaped = cuts.map((file) => ({ file, aspect: file.width && file.height ? nearestAspect(file.width, file.height) : null }));
  if (aspect === "all") return shaped;
  if (!aspect) return shaped.slice(0, 1);
  const match = shaped.filter((cut) => cut.aspect === aspect);
  if (!match.length) {
    const have = shaped.map((cut) => cut.aspect ?? "unknown").join(", ");
    throw new OstackError("not_found", `This version has no ${aspect} cut (it has ${have}). Pass --aspect all, or one of those.`);
  }
  return match;
}

async function downloadVideo(video: RemoteVideoDetail, args: Args, dir: string) {
  const wanted = optional(args, "version");
  const ready = video.versions.filter((version) => version.status === "ready");
  const version = wanted ? ready.find((item) => item.number === Number(wanted)) : ready.sort((a, b) => b.number - a.number)[0];
  if (!version) {
    throw new OstackError("not_found", wanted ? `Version ${wanted} of "${video.title}" is not ready or does not exist.` : `"${video.title}" has no finished cut yet.`);
  }
  const aspect = optional(args, "aspect") === "all" ? "all" : optional(args, "aspect") ? oneOf(args, "aspect", ASPECTS) : undefined;
  const saved: { path: string; aspect: string | null; width: number | null; height: number | null; sizeBytes: number }[] = [];
  for (const { file, aspect: shape } of pickCuts(version.files, aspect)) {
    if (file.downloadUrl === undefined) throw new OstackError("update_cli", 'This o11 CLI predates video downloads. Update it: run "o11 update".');
    if (!file.downloadUrl) throw new OstackError("not_found", "That cut has no download link yet. Try again in a minute.");
    const extension = EXTENSIONS[file.contentType ?? ""] ?? "mp4";
    const path = join(dir, `${fileStem(video.title)}-v${version.number}${shape ? `-${shape.replace(":", "x")}` : ""}.${extension}`);
    saved.push({ path, aspect: shape, width: file.width, height: file.height, sizeBytes: await save(file.downloadUrl, path) });
  }
  print({ video: video.id, title: video.title, version: version.number, template: video.templateSlug, saved, url: pageUrl(video.id) });
}

/**
 * `o11 ostack launch-videos download <video link or id | film link or slug> [--version <n>] [--aspect <shape>|all]
 * [--dir <path>]`
 * Saves a cut to study or reuse: a library film, or one of the team's videos (its newest finished version by default,
 * the main cut unless --aspect picks a shape or all of them).
 */
export async function downloadCommand(args: Args): Promise<void> {
  const reference = videoReference(args.positionals[1] ?? required(args, "video"));
  const dir = resolve(optional(args, "dir") ?? ".");
  mkdirSync(dir, { recursive: true });
  if (reference.kind === "film") return downloadFilm(libraryFilm(reference.slug), dir);
  return downloadVideo(await videos().get(reference.id), args, dir);
}
