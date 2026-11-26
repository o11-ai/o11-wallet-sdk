import { z } from "zod";

/**
 * Binary files in kits and in a workspace's own kit files: images, PDFs, fonts, office templates, audio and video.
 * Each is stored once per workspace by its SHA-256 and a file names it by that hash; text files keep their content
 * inline. The type comes from the extension, never from the uploader, and executables have no extension here.
 */
export const KIT_BINARY_TYPES: Readonly<Record<string, string>> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon",
  pdf: "application/pdf",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  key: "application/vnd.apple.keynote",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

export const KIT_OBJECT_LIMITS = { fileBytes: 10 * 1024 * 1024, totalBytes: 50 * 1024 * 1024, inlineBytes: 1024 * 1024 } as const;

/** The binary type a path's extension stands for, or null for a text file (or a type kits do not hold). */
export function kitBinaryType(path: string): string | null {
  const extension = path.split("/").at(-1)?.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  return extension ? KIT_BINARY_TYPES[extension] ?? null : null;
}

/** Images an agent can look at directly (MCP image content). */
export const KIT_VIEWABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export const kitObjectHashSchema = z.string().regex(/^[a-f0-9]{64}$/, "Use the file's SHA-256 as 64 lowercase hex characters.");

/** A stored binary file, as a kit file or a workspace file points at it. */
export type KitObjectRef = { sha256: string; sizeBytes: number; contentType: string };

/** Asks for upload links for binary files the workspace does not hold yet. Paths give each file's type. */
export const kitObjectPrepareInput = z.object({
  files: z.array(z.object({
    path: z.string().min(1).max(240),
    sha256: kitObjectHashSchema,
    sizeBytes: z.number().int().min(1).max(KIT_OBJECT_LIMITS.fileBytes),
  })).min(1).max(50),
});
export type KitObjectPrepareInput = z.infer<typeof kitObjectPrepareInput>;

/** For each file: already stored (`stored`), or a link to PUT its exact bytes to within the hour. */
export type KitObjectPrepared = { sha256: string; contentType: string; stored: boolean; uploadUrl: string | null };
