import { z } from "zod";
import type { KitFile, KitIssue, KitManifest, KitSettingValue, KitUses } from "./kit-standard.js";
import { kitObjectHashSchema } from "./kit-objects.js";

/** How a workspace takes a kit's new releases: right away (the default), after someone accepts, or never. */
export const KIT_UPDATE_POLICIES = ["auto", "ask", "pinned"] as const;
export type KitUpdatePolicy = (typeof KIT_UPDATE_POLICIES)[number];

export const KIT_VERSION_STATUSES = ["draft", "in_review", "rejected", "published", "retired"] as const;
export type KitVersionStatus = (typeof KIT_VERSION_STATUSES)[number];

/** Who publishes a kit as people see it. o11's own kits form the collection the wallet calls Ostack. */
/** Who publishes a kit, as its seller profile page shows them. `about` is the seller's own line about themselves. */
export type KitSeller = { slug: string; name: string; isO11: boolean; website: string | null; listingId: string | null; about: string | null };

/** A kit in the public catalog: the wallet's Kits page and o11.ai/kits. */
export type KitListing = {
  slug: string;
  title: string;
  summary: string;
  release: string;
  license: string;
  seller: KitSeller;
  skills: string[];
  workflows: { id: string; skill: string; summary: string }[];
  uses: KitUses;
  hasSettings: boolean;
  publishedAt: string;
};

/** One file of a published release, without its content, for a tree. Binary files carry their type. */
export type KitTreeEntry = { path: string; bytes: number; contentType?: string };

/** A public kit with its guide, tree and release history, for its page. */
export type KitDetail = KitListing & {
  guide: string;
  files: KitTreeEntry[];
  settings: KitManifest["settings"];
  releases: { release: string; publishedAt: string }[];
};

/**
 * A workspace's install of a kit. `release` is the release it is on: live when it follows updates, else the one it holds
 * ("draft" for a seller trying an unnamed draft). `liveRelease`: the release o11 published, null before the first.
 * `trying`: a seller holds its own unreviewed draft. `updateAvailable`: it holds an older published release than the live one.
 */
export type KitInstallView = {
  kitSlug: string;
  policy: KitUpdatePolicy;
  release: string;
  liveRelease: string | null;
  trying: boolean;
  updateAvailable: boolean;
  /** o11 retired the kit: it left the catalog, and this workspace keeps reading the release it is on. */
  retired: boolean;
  installedAt: string;
};

/** A seller's kit as its editor shows it: the live release and the draft being worked on. */
export type SellerKitView = {
  id: string;
  slug: string;
  title: string;
  visibility: "private" | "public";
  status: "active" | "retired";
  liveRelease: string | null;
  draft: { id: string; status: KitVersionStatus; release: string | null; issues: KitIssue[]; reviewNote: string | null; updatedAt: string } | null;
};

export type KitSettingsValues = Record<string, KitSettingValue>;

/** A workspace that publishes kits, as its own settings page shows it. */
export type SellerProfile = { id: string; slug: string; name: string; website: string | null; listingId: string | null; about: string | null; updatedAt: string };

/** A kit's draft as the editor opens it: every file with its content. */
export type KitDraftView = {
  kitId: string;
  versionId: string;
  status: KitVersionStatus;
  release: string | null;
  issues: KitIssue[];
  reviewNote: string | null;
  files: KitFile[];
  /** When the draft last changed. Edits that send it are refused once someone else has changed the draft since. */
  stamp: string;
};

/** What an edit to a draft returns: the checks' findings and the tree, without file contents. */
export type KitDraftSummary = Omit<KitDraftView, "files" | "reviewNote"> & { files: KitTreeEntry[] };

/** The settings a kit's release declares, the team's values and this member's own (which win). */
export type KitSettingsView = { declared: KitManifest["settings"]; team: KitSettingsValues; mine: KitSettingsValues };

/** The files of the release a workspace is on, and whose they are. */
export type InstalledKitFiles = {
  kit: string;
  title: string;
  release: string;
  seller: string;
  /** o11 reviewed this release (store review, or o11's own repository). A seller's draft is not reviewed. */
  reviewed: boolean;
  retired: boolean;
  files: KitFile[];
};

/** A submitted release waiting for o11's review on team.o11.ai. */
export type KitReviewListing = {
  versionId: string;
  kitSlug: string;
  title: string;
  release: string;
  /** The files' digest at submit: what publish and reject must name, so a release changed since can't slip through. */
  digest: string;
  seller: { slug: string; name: string };
  issues: KitIssue[];
  hasScripts: boolean;
  submittedAt: string;
};

/** One review: the submitted files, the checks' findings and what changed since the live release. */
export type KitReviewDetail = KitReviewListing & {
  status: KitVersionStatus;
  liveRelease: string | null;
  uses: KitUses | null;
  /** Binary files carry a signed link (an hour) to view them. */
  files: (KitFile & { object?: KitFile["object"] & { url?: string } })[];
  diff: { added: string[]; removed: string[]; changed: string[] };
};

export const kitSlugInput = z.string().regex(/^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/);
/** One line of plain text a seller writes: no line breaks or control characters, so it can't pose as instructions. */
export const kitLineInput = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\p{Cc}\p{Cf}]*$/u, "Use one line of plain text.");
/** A seller's website: only http and https links, never javascript: or data:. */
export const kitWebsiteInput = z.url({ protocol: /^https?$/, hostname: z.regexes.domain }).max(300);
/** The draft's stamp as the editor last read it (KitDraftView.stamp). */
export const kitDraftStampInput = z.string().min(1).max(64).optional();
/** A text file with its content, or a binary file by the SHA-256 of bytes already uploaded (kits.objects.prepare). */
export const kitFileInput = z.object({ path: z.string().min(1).max(200), content: z.string().max(256 * 1024).default(""), sha256: kitObjectHashSchema.optional() });
export const kitSettingsInput = z.record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]));
export const kitPolicyInput = z.object({ slug: kitSlugInput, policy: z.enum(KIT_UPDATE_POLICIES), release: z.string().min(1).max(80).optional() });
export const sellerProfileInput = z.object({
  slug: kitSlugInput,
  name: kitLineInput(80),
  website: kitWebsiteInput.nullish(),
  listingId: z.string().min(1).max(120).nullish(),
  about: z.string().trim().max(280).nullish().transform((value) => value || null),
});
export const kitCreateInput = z.object({ slug: kitSlugInput, title: kitLineInput(60) });
export const kitDraftFilesInput = z.object({ kitId: z.uuid(), files: z.array(kitFileInput).max(300), stamp: kitDraftStampInput });

/** Co-marketing call sellers can book when they publish. */
export const KIT_CO_MARKETING_URL = "https://o11.cal.com/aryah/kit-co-marketing";

/** Where provenance labels go: every kit file an agent reads says whose it is and whether o11 reviewed it. */
export type KitProvenance = { kit: string; release: string; seller: string; reviewed: boolean; layer: "kit" | "team" | "mine" };
