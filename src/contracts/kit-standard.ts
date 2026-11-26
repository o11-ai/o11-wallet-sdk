import { z } from "zod";
import type { KitObjectRef } from "./kit-objects.js";

/**
 * Kit Standard v1. A kit is a folder of plain files an agent reads: `kit.md` (this manifest in a YAML header, then a
 * short guide), Agent Skills under `skills/<name>/SKILL.md`, and any other folders the author wants (`scripts/`,
 * `references/`, `assets/`, `templates/` and so on), with text files of any kind and binary files of the types in
 * kit-objects.ts. The standard is Apache-2.0; each kit declares its own license.
 */
export const KIT_STANDARD_VERSION = 1;

/** Agent Skills naming: 1-64 lowercase letters, digits and single hyphens, not starting or ending with one. */
export const KIT_NAME = /^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
/** A file path inside a kit: relative, `/`-separated, no `..`, dot-files only as `.gitkeep`-style names. */
export const KIT_PATH = /^(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*){0,7}$/;
const HOST = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export const KIT_LIMITS = { files: 300, fileBytes: 256 * 1024, totalBytes: 2 * 1024 * 1024, skillLines: 500 } as const;

/**
 * What a kit tells people about itself: tools it suggests (agents may use any others a job needs), the sites its
 * text links to, and the effects it has outside the chat.
 */
export const KIT_EFFECTS = ["read", "write", "send", "spend", "publish"] as const;
export type KitEffect = (typeof KIT_EFFECTS)[number];

export const kitUsesSchema = z.object({
  tools: z.array(z.string().min(1).max(120)).max(100).default([]),
  hosts: z.array(z.string().regex(HOST, "Use a host name such as api.example.com or *.example.com.")).max(100).default([]),
  effects: z.array(z.enum(KIT_EFFECTS)).max(KIT_EFFECTS.length).default([]),
});
export type KitUses = z.infer<typeof kitUsesSchema>;

/** A URL's host in kit text. Use with `matchAll` only: the pattern is global. */
export const KIT_URL_HOST = /\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;
const KIT_TEXT_SAFE_HOSTS = new Set(["o11.ai", "go.o11.ai", "agentskills.io", "github.com", "example.com"]);
/** A host kit text may name: declared in `uses.hosts` (exactly or by `*.` wildcard), or always allowed. */
export function kitHostDeclared(declared: readonly string[], host: string) {
  return KIT_TEXT_SAFE_HOSTS.has(host) || declared.some((pattern) => pattern === host || (pattern.startsWith("*.") && host.endsWith(pattern.slice(1))));
}

/** A setting the kit declares. The wallet shows a form for them; the agent reads the team's and the member's values. */
export const kitSettingSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use lowercase letters, digits and underscores."),
  label: z.string().min(1).max(80),
  type: z.enum(["text", "number", "boolean", "choice"]),
  choices: z.array(z.string().min(1).max(80)).min(2).max(20).optional(),
  default: z.union([z.string().max(500), z.number(), z.boolean()]).optional(),
  scope: z.enum(["team", "person"]).default("team"),
  help: z.string().max(300).optional(),
}).refine((setting) => (setting.type === "choice") === !!setting.choices, { message: "A choice setting lists its choices; other types do not." });
export type KitSetting = z.infer<typeof kitSettingSchema>;
export type KitSettingValue = string | number | boolean;

/** A workflow is one job the kit does, started from one of its skills. Extra keys stay for the kit's own tooling. */
export const kitWorkflowSchema = z.looseObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  skill: z.string().regex(KIT_NAME),
  summary: z.string().max(300).default(""),
});

export const kitManifestSchema = z.looseObject({
  kit: z.literal(KIT_STANDARD_VERSION),
  name: z.string().regex(KIT_NAME, "Use 1-64 lowercase letters, digits and single hyphens."),
  title: z.string().min(1).max(60),
  summary: z.string().min(1).max(300),
  release: z.string().regex(SEMVER, "Use a release number such as 1.0.0."),
  license: z.string().min(1).max(60),
  /** The skill an agent starts with. Defaults to the first workflow's skill, then the only skill. */
  entry: z.string().regex(KIT_NAME).optional(),
  workflows: z.array(kitWorkflowSchema).max(20).default([]),
  settings: z.array(kitSettingSchema).max(30).default([]),
  uses: kitUsesSchema.default({ tools: [], hosts: [], effects: [] }),
});
export type KitManifest = z.infer<typeof kitManifestSchema>;

/**
 * A file of a kit as submitted or served. A text file has its content; a binary file (an image, PDF, font, template,
 * audio or video; see kit-objects.ts) has empty content and `object`, the stored file it names by SHA-256.
 */
export type KitFile = { path: string; content: string; object?: KitObjectRef };

export type KitIssueLevel = "error" | "warning";
export type KitIssueCode =
  | "manifest_missing" | "manifest_invalid" | "path_invalid" | "too_many_files" | "file_too_large" | "kit_too_large"
  | "binary_file" | "hidden_text" | "skill_invalid" | "skill_long" | "skill_permissions" | "workflow_skill_missing" | "entry_missing"
  | "host_undeclared" | "has_scripts" | "no_skills" | "binary_type" | "binaries_too_large";
/** One finding of the checks. Errors block a submission; warnings go to the reviewer. */
export type KitIssue = { level: KitIssueLevel; code: KitIssueCode; path: string | null; message: string };
export type KitCheckResult = { manifest: KitManifest | null; issues: KitIssue[]; digest: string | null };
