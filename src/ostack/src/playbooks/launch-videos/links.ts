// Links people paste for videos: a film from the library or one of the team's own videos in o11. Every command that
// takes a film slug or a video id also takes the link, so a link copied into a content calendar works as it is.
import { OstackError } from "../../lib/errors.js";
import { LIBRARY_ORIGIN, libraryVideo, VIDEO_LIBRARY, type LibraryVideo } from "./library.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** The film a library file link points to: `https://videos.o11.ai/<format>/<company>/<id>/video.mp4`. */
function filmAtLibraryPath(url: URL) {
  const path = url.pathname.split("/").filter(Boolean).slice(0, 3).join("/");
  return VIDEO_LIBRARY.find((video) => video.path === path) ?? null;
}

/**
 * A library film from its link on the Launch videos page (`?film=<slug>`), a videos.o11.ai file link, or its slug.
 * Throws when the film is not in the library.
 */
export function libraryFilm(input: string): LibraryVideo {
  const value = input.trim();
  const url = parseUrl(value);
  const slug = url ? (url.searchParams.get("film") ?? (url.origin === LIBRARY_ORIGIN ? filmAtLibraryPath(url)?.slug : null)) : value;
  const film = slug ? libraryVideo(slug) : null;
  if (!film) {
    throw new OstackError("not_found", `No library film at "${value}". Copy a film's link on the Launch videos page, or find one with "o11 ostack launch-videos templates --search <text>".`);
  }
  return film;
}

export const filmSlug = (input: string) => libraryFilm(input).slug;

/** A video's id from its o11 page link (`.../launch-videos/<id>`) or the id itself. */
export function videoId(input: string): string {
  const value = input.trim();
  const url = parseUrl(value);
  const id = url ? url.pathname.split("/").filter(Boolean).find((part) => UUID.test(part)) : value;
  if (!id || !UUID.test(id)) throw new OstackError("invalid_input", `"${value}" is not an o11 video id or link. Copy the link from the video's page in o11.`);
  return id.toLowerCase();
}

/** What a reference link points to: a library film, or one of the team's own videos. */
export type VideoReference = { kind: "film"; slug: string } | { kind: "video"; id: string };

export function videoReference(input: string): VideoReference {
  const value = input.trim();
  const url = parseUrl(value);
  const isFilm = url ? url.searchParams.has("film") || url.origin === LIBRARY_ORIGIN : !UUID.test(value);
  return isFilm ? { kind: "film", slug: filmSlug(value) } : { kind: "video", id: videoId(value) };
}

export const ASPECTS = ["16:9", "9:16", "4:5", "1:1"] as const;
export type Aspect = (typeof ASPECTS)[number];

/** The shape closest to a width and height, such as 9:16 for 1080x1920. */
export function nearestAspect(width: number, height: number): Aspect {
  const ratio = Math.log(width / height);
  const distance = (aspect: Aspect) => {
    const [w = 1, h = 1] = aspect.split(":").map(Number);
    return Math.abs(Math.log(w / h) - ratio);
  };
  return ASPECTS.reduce((best, aspect) => (distance(aspect) < distance(best) ? aspect : best));
}
