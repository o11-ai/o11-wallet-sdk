// The reference film library: every film o11 hosts at videos.o11.ai, each usable as a video template.
// library.json is written by scripts/video-library-publish.ts; it lists only what is live in R2. No Node imports here:
// the wallet app reads this file too.
import LIBRARY from "../../../content/playbooks/launch-videos/library.json";

export const LIBRARY_ORIGIN = "https://videos.o11.ai";

export type LibraryVideo = {
  slug: string; // "<format>/<company>-<id>", the template slug a project stores
  format: "product-demo" | "irl" | "reel";
  title: string;
  company: string; // slug for paths, such as "the-browser-company"
  publisher: string; // who published the film, as they name themselves ("The Browser Company")
  publisherId: string | null; // their YouTube channel id; their logo is at logos/<id>.webp
  seconds: number | null;
  width: number | null;
  height: number | null;
  source: string; // where the film was first published
  path: string; // "<format>/<company>/<id>" in the bucket
};

export const VIDEO_LIBRARY = LIBRARY as LibraryVideo[];

export const libraryVideo = (slug: string) => VIDEO_LIBRARY.find((video) => video.slug === slug) ?? null;

export const libraryFiles = (video: Pick<LibraryVideo, "path">) => ({
  video: `${LIBRARY_ORIGIN}/${video.path}/video.mp4`,
  preview: `${LIBRARY_ORIGIN}/${video.path}/preview.mp4`,
  poster: `${LIBRARY_ORIGIN}/${video.path}/poster.webp`,
});

/** The publisher's logo, 96px WebP, or null when unknown. */
export const publisherLogo = (video: Pick<LibraryVideo, "publisherId">) => (video.publisherId ? `${LIBRARY_ORIGIN}/logos/${video.publisherId}.webp` : null);

/** The YouTube channel id in a channel URL. */
export const channelId = (url: string | null) => url?.match(/\/channel\/(UC[\w-]+)/)?.[1] ?? null;

/** The recipe for a film template: study the film, keep its structure, and fill it with the team's own material. */
export function libraryRecipe(video: LibraryVideo): string {
  const length = video.seconds ? `${video.seconds}s` : "its length";
  return [
    `Make this video in the style of "${video.title}" by ${video.publisher}.`,
    "",
    "## Study the film first",
    `- Download it: ${libraryFiles(video).video} (${length}, first published at ${video.source}).`,
    "- Watch it start to finish, then pull a frame every two seconds with ffmpeg and write down each shot: what is on",
    "  screen, how long it holds, how it enters and leaves, and what the words say.",
    "",
    "## Keep",
    "- The shape: the order of shots, the pacing, the cut rhythm and where the music lifts.",
    "- The look: type size and weight, motion, transitions and framing.",
    "",
    "## Replace",
    "- Every shot, word, logo and color with the team's own, from the brand kit and this video's brief.",
    `- Aim for about ${length} unless the brief sets a length.`,
  ].join("\n");
}
