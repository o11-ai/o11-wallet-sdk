import { z } from "zod";

/**
 * Ostack videos: every video a team makes is a video in o11. The user's agent does the editing on their computer and
 * uploads each finished cut as a version, made of one or more files (the cut in each shape it was made in, a preview
 * loop and a poster). o11 stores videos, briefs and versions, and serves them back for watching and downloading.
 * Templates are films from the public library that ship with the playbook.
 */

/**
 * The kinds of video the playbooks make. The database keeps any lowercase slug, so adding a kind (UGC, ads) is a
 * change to this list, not to the database.
 */
export const VIDEO_FORMATS = ["product-demo", "irl", "reel"] as const;
export const videoFormatSchema = z.enum(VIDEO_FORMATS);
export type VideoFormat = z.infer<typeof videoFormatSchema>;

export const VIDEO_ASPECTS = ["16:9", "9:16", "4:5", "1:1"] as const;
export const videoAspectSchema = z.enum(VIDEO_ASPECTS);
export type VideoAspect = z.infer<typeof videoAspectSchema>;

/** A template's id: a library film's slug, `<format>/<company>-<id>`, such as `product-demo/raycast-1a2b3c4d`. */
export const videoTemplateSlugSchema = z.string().max(80).regex(/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/);

const briefText = (max: number) => z.string().trim().max(max);

/** A brief part a format adds by name, in camelCase, such as a UGC video's `creator` or `hook`. */
export const videoBriefPartNameSchema = z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/);
export const MAX_FORMAT_PARTS = 12;

/**
 * What the team wants for one video, in their words. Every part is optional; the agent asks for what it still needs.
 * The core parts suit every format; `formatParts` holds the parts one kind of video adds, so a new kind needs no new
 * fields. What is true for every video (fonts, colors, voice, music) lives in the brand kit, not here.
 */
export const videoBriefSchema = z.object({
  /** What the video should make the viewer do or feel. */
  goal: briefText(2_000).optional(),
  audience: briefText(1_000).optional(),
  /** Scene by scene: what is on screen and what is said. */
  storyboard: briefText(12_000).optional(),
  /** What the video is made from: the screens or flows to capture (with links), or the footage to cut. */
  material: briefText(4_000).optional(),
  /** Anything for this video only that differs from the brand kit. */
  notes: briefText(4_000).optional(),
  lengthSeconds: z.number().int().min(5).max(600).optional(),
  aspect: videoAspectSchema.optional(),
  formatParts: z.record(videoBriefPartNameSchema, briefText(4_000))
    .refine((parts) => Object.keys(parts).length <= MAX_FORMAT_PARTS, `Keep a brief to ${MAX_FORMAT_PARTS} format parts.`)
    .optional(),
}).strict();
export type VideoBrief = z.infer<typeof videoBriefSchema>;

export const videoTitleSchema = z.string().trim().min(1).max(120);

export const createVideoSchema = z.object({
  title: videoTitleSchema,
  format: videoFormatSchema,
  /** Null starts blank: the agent works from the brief alone. */
  templateSlug: videoTemplateSlugSchema.nullable().default(null),
  brief: videoBriefSchema.default({}),
});
export type CreateVideo = z.infer<typeof createVideoSchema>;

/** A partial change. A new template applies to the next version; versions already made keep theirs. */
export const updateVideoSchema = z.object({
  title: videoTitleSchema.optional(),
  templateSlug: videoTemplateSlugSchema.nullable().optional(),
  brief: videoBriefSchema.optional(),
});
export type UpdateVideo = z.infer<typeof updateVideoSchema>;

/**
 * What each file of a version is for: `video` is a finished cut (a version may hold one per shape), `preview` a short
 * muted loop and `poster` a still. The database keeps any lowercase slug, so a new role (captions) is a change here.
 */
export const VIDEO_FILE_ROLES = ["video", "preview", "poster"] as const;
export const videoFileRoleSchema = z.enum(VIDEO_FILE_ROLES);
export type VideoFileRole = z.infer<typeof videoFileRoleSchema>;

export const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
export const MAX_POSTER_BYTES = 2 * 1024 * 1024;
/** Videos are kept at 1080p at most: the short side of the frame never passes 1080 pixels. */
export const MAX_SHORT_SIDE = 1080;
/** The cuts one version can hold, one per shape. */
export const MAX_VERSION_CUTS = 4;
/** The public video library's files: `<origin>/<format>/<company>/<id>/{video.mp4,preview.mp4,poster.webp}`. */
export const VIDEO_LIBRARY_ORIGIN = "https://videos.o11.ai";
/** Each upload request carries one part; storage needs every part but the last to be at least 5 MiB. */
export const VIDEO_PART_BYTES = 16 * 1024 * 1024;
/** An upload not completed within a day is abandoned: its version never shows and its number is not reused. */
export const VIDEO_UPLOAD_HOURS = 24;

const FILE_RULES: Record<VideoFileRole, { types: readonly string[]; maxBytes: number }> = {
  video: { types: ["video/mp4", "video/quicktime", "video/webm"], maxBytes: MAX_VIDEO_BYTES },
  preview: { types: ["video/mp4", "video/webm"], maxBytes: MAX_PREVIEW_BYTES },
  poster: { types: ["image/webp", "image/jpeg", "image/png", "image/avif"], maxBytes: MAX_POSTER_BYTES },
};

export const videoFileInputSchema = z.object({
  role: videoFileRoleSchema,
  contentType: z.string().max(100),
  sizeBytes: z.number().int().min(1).max(MAX_VIDEO_BYTES),
  width: z.number().int().min(16).max(8192).optional(),
  height: z.number().int().min(16).max(8192).optional(),
  durationMs: z.number().int().min(1).max(3_600_000).optional(),
}).superRefine((file, context) => {
  const rule = FILE_RULES[file.role];
  if (!rule.types.includes(file.contentType)) context.addIssue({ code: "custom", path: ["contentType"], message: `A ${file.role} is one of ${rule.types.join(", ")}.` });
  if (file.sizeBytes > rule.maxBytes) context.addIssue({ code: "custom", path: ["sizeBytes"], message: `A ${file.role} is at most ${rule.maxBytes} bytes.` });
  if (file.width && file.height && Math.min(file.width, file.height) > MAX_SHORT_SIDE) context.addIssue({ code: "custom", path: ["height"], message: "o11 keeps videos at 1080p at most." });
});
export type VideoFileInput = z.infer<typeof videoFileInputSchema>;

/**
 * Reserves the next version. Files upload in the order given; the first `video` is the main cut the page plays, and
 * any others are the same cut in other shapes.
 */
export const startVideoVersionSchema = z.object({
  files: z.array(videoFileInputSchema).min(1).max(MAX_VERSION_CUTS + 2),
  changeNote: z.string().trim().max(1_000).optional(),
}).superRefine(({ files }, context) => {
  const count = (role: VideoFileRole) => files.filter((file) => file.role === role).length;
  if (!count("video")) context.addIssue({ code: "custom", path: ["files"], message: "Send at least one video." });
  if (count("video") > MAX_VERSION_CUTS) context.addIssue({ code: "custom", path: ["files"], message: `Send at most ${MAX_VERSION_CUTS} cuts, one per shape.` });
  if (count("preview") > 1 || count("poster") > 1) context.addIssue({ code: "custom", path: ["files"], message: "Send at most one preview and one poster." });
});
export type StartVideoVersion = z.infer<typeof startVideoVersionSchema>;

export const videoUploadPartSchema = z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) });
export type VideoUploadPart = z.infer<typeof videoUploadPartSchema>;

/** The parts each file's upload returned, keyed by file id, in any order. */
export const completeVideoVersionSchema = z.object({ parts: z.record(z.uuid(), z.array(videoUploadPartSchema).min(1)) });
export type CompleteVideoVersion = z.infer<typeof completeVideoVersionSchema>;

export const videoVersionStartedSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  partBytes: z.number().int().positive(),
  /** One per file, in the order sent. PUT each part to /v1/ostack/videos/versions/<id>/files/<file id>/parts/<n>. */
  files: z.array(z.object({ id: z.uuid(), role: videoFileRoleSchema, parts: z.number().int().positive() })),
});
export type VideoVersionStarted = z.infer<typeof videoVersionStartedSchema>;

const person = z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }).nullable();

/** One stored file. Links are short-lived and present once the version is ready. */
export const videoFileSchema = z.object({
  id: z.uuid(),
  role: videoFileRoleSchema,
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  url: z.string().nullable(),
  downloadUrl: z.string().nullable(),
});
export type VideoFile = z.infer<typeof videoFileSchema>;

export const VIDEO_VERSION_STATUSES = ["uploading", "ready", "abandoned"] as const;

export const videoVersionSchema = z.object({
  id: z.uuid(),
  videoId: z.uuid(),
  number: z.number().int().positive(),
  status: z.enum(VIDEO_VERSION_STATUSES),
  templateSlug: videoTemplateSlugSchema.nullable(),
  /** What changed in this cut, in the agent's or person's words. */
  changeNote: z.string().nullable(),
  createdVia: z.enum(["agent", "person"]),
  createdBy: person,
  createdAt: z.string(),
  readyAt: z.string().nullable(),
  files: z.array(videoFileSchema),
  /** The main cut, preview and poster the page plays, present once the version is ready. */
  urls: z.object({ video: z.string(), download: z.string(), preview: z.string().nullable(), poster: z.string().nullable() }).nullable(),
});
export type VideoVersion = z.infer<typeof videoVersionSchema>;

export const videoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  format: videoFormatSchema,
  templateSlug: videoTemplateSlugSchema.nullable(),
  brief: videoBriefSchema,
  createdBy: person,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** The newest ready version, which the video's page plays. */
  latestVersion: videoVersionSchema.nullable(),
  versionCount: z.number().int().nonnegative(),
});
export type Video = z.infer<typeof videoSchema>;

export const videoDetailSchema = videoSchema.extend({ versions: z.array(videoVersionSchema) });
export type VideoDetail = z.infer<typeof videoDetailSchema>;

export const videoListSchema = z.object({ videos: z.array(videoSchema) });
