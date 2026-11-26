import { z } from "zod";
import { KIT_OBJECT_LIMITS, kitObjectHashSchema } from "./kit-objects.js";
import { kitCreateInput, kitFileInput, kitLineInput, kitSlugInput, kitWebsiteInput } from "./kits.js";

/** A kit by name ("acme-seo") or by any link to it: o11.ai/kits/acme-seo, its skill.md, or the wallet's kit page. */
export const kitRefSchema = z.string().trim().min(1).max(300);

/** The kit name a reference points at, or null when it names no kit (a seller page, another site's path). */
export function kitSlugFromRef(ref: string): string | null {
  const text = ref.trim();
  if (kitSlugInput.safeParse(text).success) return text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.indexOf("kits");
  const slug = at >= 0 ? parts[at + 1] : undefined;
  if (!slug || slug === "sellers") return null;
  return kitSlugInput.safeParse(slug).success ? slug : null;
}

const kit = z.object({ kit: kitRefSchema }).strict();
const none = z.object({}).strict();

/** A binary file to upload before `push`: its kit path, SHA-256 and size. */
export const kitUploadInput = z.object({
  path: z.string().min(1).max(240),
  sha256: kitObjectHashSchema,
  size_bytes: z.number().int().min(1).max(KIT_OBJECT_LIMITS.fileBytes),
}).strict();

/**
 * Everything people do with kits outside the wallet's pages, by name: find and add kits, and publish their own as a
 * seller. The o11 CLI (`o11 kit <action>`) and the MCP tool `kit_manage` each map every action here, and the wallet
 * runs each one the same way for both, so the two always do the same things. `write` actions change the workspace.
 */
export const KIT_ACTIONS = {
  list: { write: false, input: none, summary: "Every kit this workspace can add, marking the ones it added." },
  add: { write: true, input: kit, summary: "Add a kit by name or link for the whole workspace. Owners and admins." },
  remove: { write: true, input: kit, summary: "Remove a kit. The team's files and settings for it stay." },
  seller: { write: false, input: none, summary: "This workspace's seller profile and its kits, with where each release stands." },
  profile: {
    write: true,
    input: z.object({
      slug: kitSlugInput.describe("The seller page's address, o11.ai/kits/sellers/<slug>."),
      name: kitLineInput(80),
      website: kitWebsiteInput.nullish(),
      about: z.string().trim().max(280).nullish(),
    }).strict(),
    summary: "Create or change the seller profile buyers see on every kit this workspace publishes. Owners and admins.",
  },
  create: { write: true, input: kitCreateInput.strict(), summary: "Start a private kit with a starter draft that passes the checks." },
  draft: { write: false, input: kit, summary: "Your kit's draft: every file, its release and what the checks found." },
  upload: {
    write: true,
    input: z.object({ uploads: z.array(kitUploadInput).min(1).max(50) }).strict(),
    summary: "Links to upload binary files (images, PDFs, templates) that push then names by sha256.",
  },
  push: {
    write: true,
    input: z.object({ kit: kitRefSchema, files: z.array(kitFileInput).min(1).max(300) }).strict(),
    summary: "Replace your kit's draft with these files and run the checks. Errors block submit; warnings go to the reviewer.",
  },
  try: { write: true, input: kit, summary: "Use your kit's draft in this workspace before you submit it." },
  submit: { write: true, input: kit, summary: "Send the draft to o11 for review. It goes public once a person approves it." },
  withdraw: { write: true, input: kit, summary: "Take a release out of review, back to draft." },
} as const;

export type KitActionName = keyof typeof KIT_ACTIONS;
export type KitActionInput<N extends KitActionName> = z.infer<(typeof KIT_ACTIONS)[N]["input"]>;
export const KIT_ACTION_NAMES = Object.keys(KIT_ACTIONS) as [KitActionName, ...KitActionName[]];
export const kitActionNameSchema = z.enum(KIT_ACTION_NAMES);
export const isWriteKitAction = (name: KitActionName) => KIT_ACTIONS[name].write;
