import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** o11 keeps videos at 1080p at most: the short side of the frame never passes 1080 pixels. */
export const MAX_SHORT_SIDE = 1080;
/** Codecs every current browser plays in an MP4 or WebM; anything else gets a playable copy. */
const PLAYABLE_CODECS = new Set(["h264", "vp9", "av1"]);

export const ffmpeg = () => process.env.FFMPEG ?? "ffmpeg";
export const ffprobe = () => process.env.FFPROBE ?? "ffprobe";
export const runs = (command: string) => spawnSync(command, ["-version"], { encoding: "utf8" }).status === 0;

export type VideoFacts = { width?: number; height?: number; durationMs?: number; codec?: string };

export const probeArgs = (path: string) =>
  ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name:format=duration", "-of", "json", path];

/** Reads ffprobe's JSON from `probeArgs`. */
export function parseProbe(stdout: string): VideoFacts {
  const parsed = JSON.parse(stdout) as { streams?: { width?: number; height?: number; codec_name?: string }[]; format?: { duration?: string } };
  const stream = parsed.streams?.[0];
  const seconds = Number(parsed.format?.duration);
  return { width: stream?.width, height: stream?.height, codec: stream?.codec_name, durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined };
}

/** Size, length and codec from ffprobe when it runs; empty when it doesn't. */
export function probe(path: string): VideoFacts {
  const run = spawnSync(ffprobe(), probeArgs(path), { encoding: "utf8" });
  return run.status === 0 ? parseProbe(run.stdout) : {};
}

/** True when the file is above 1080p, or is a container or codec a browser can't play. */
export function needsWebCopy(contentType: string, facts: VideoFacts): boolean {
  const above1080p = facts.width !== undefined && facts.height !== undefined && Math.min(facts.width, facts.height) > MAX_SHORT_SIDE;
  const playable = (contentType === "video/mp4" || contentType === "video/webm") && (!facts.codec || PLAYABLE_CODECS.has(facts.codec));
  return above1080p || !playable;
}

/** ffmpeg arguments for a 1080p-or-smaller H.264 MP4 with AAC sound and fast start, so it plays while it loads. */
export function webCopyArgs(video: string, out: string): string[] {
  const scale = `scale='if(lte(iw,ih),min(${MAX_SHORT_SIDE},iw),-2)':'if(lte(iw,ih),-2,min(${MAX_SHORT_SIDE},ih))'`;
  return ["-y", "-v", "error", "-i", video, "-vf", scale, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];
}

/** ffmpeg arguments for the muted six-second loop a grid plays: 640px wide, fast-start H.264, from one second in. */
export const previewArgs = (video: string, out: string) =>
  ["-y", "-v", "error", "-ss", "1", "-i", video, "-t", "6", "-an", "-vf", "scale=640:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out];

/** ffmpeg arguments for the WebP still shown before a video loads, from one second in. */
export const posterArgs = (video: string, out: string, width: number) =>
  ["-y", "-v", "error", "-ss", "1", "-i", video, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-c:v", "libwebp", "-quality", "80", out];

/** Makes the 1080p copy; false on failure. */
export const makeWebCopy = (video: string, out: string) => spawnSync(ffmpeg(), webCopyArgs(video, out)).status === 0;

/** Makes the preview loop and the poster (1280px by default) in `folder`; each is undefined when ffmpeg fails. */
export function makePreviewAndPoster(video: string, folder: string, posterWidth = 1280): { preview?: string; poster?: string } {
  const preview = join(folder, "preview.mp4"), poster = join(folder, "poster.webp");
  const loop = spawnSync(ffmpeg(), previewArgs(video, preview));
  const still = spawnSync(ffmpeg(), posterArgs(video, poster, posterWidth));
  return { preview: loop.status === 0 ? preview : undefined, poster: still.status === 0 ? poster : undefined };
}
