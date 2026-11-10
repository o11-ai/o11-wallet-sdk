import { z } from "zod";

/**
 * The team's Ostack setup that `o11 ostack` reads before every run and the wallet's Ostack page shows:
 * plain-language notes, a few settings, and a record of each run. Team values are shared by the workspace;
 * a member's own values refine them. Each workflow family (module, such as gtm for outbound) keeps its own settings.
 */
export const ostackNoteScopeSchema = z.enum(["team", "me"]);
/** about.md, gtm/write.md, campaigns/fundraising/write.md */
export const ostackNotePathSchema = z.string().max(200).regex(/^(?:[a-z0-9][a-z0-9-]*\/){0,2}[a-z0-9][a-z0-9_-]*\.md$/);
export const ostackNoteBodySchema = z.string().max(64 * 1024);
export const ostackQuestionIdSchema = z.string().max(80).regex(/^(?:[a-z0-9-]+\/)?[a-z0-9-]+$/);
export const ostackWorkflowSchema = z.string().max(80).regex(/^[a-z0-9-]+\/[a-z0-9-]+$/);
export const ostackModuleIdSchema = z.string().max(40).regex(/^[a-z0-9][a-z0-9-]*$/);

export const ostackNoteSchema = z.object({
  path: ostackNotePathSchema,
  body: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const count = (max: number) => z.number().int().min(1).max(max);
export const gtmLimitsSchema = z.object({
  new_per_day: count(1000),
  touches_per_day: count(5000),
  per_company: count(100),
  max_touches: count(20),
}).refine((limits) => limits.touches_per_day >= limits.new_per_day, { message: "touches_per_day must be at least new_per_day" });

/** The outbound (gtm) module's settings. A missing field uses the shipped default; null clears a saved value. */
export const gtmSettingsSchema = z.object({
  mode: z.enum(["draft", "send"]).nullable(),
  limits: gtmLimitsSchema.nullable(),
  followUpDays: z.array(z.number().int().min(1).max(90)).max(19).nullable(),
  /** "weekdays 08:00-18:00", or "any" for always open. */
  sendWindow: z.string().max(80).regex(/^(?:any|\S+ \d{1,2}:\d{2}-\d{1,2}:\d{2})$/).nullable(),
  /** The address this member sends from. Member only. */
  mailbox: z.string().max(254).nullable(),
  /** Which leads this member reaches, such as "companies A-M". Member only. */
  split: z.string().max(500).nullable(),
}).partial();
export type GtmSettings = z.infer<typeof gtmSettingsSchema>;

/** Settings by workflow family (module). Each family's settings are stored in its own table, such as ostack_gtm_setting. */
export const ostackModuleSettingsSchema = z.object({ gtm: gtmSettingsSchema.optional() }).strict();
export type OstackModuleSettings = z.infer<typeof ostackModuleSettingsSchema>;

export const ostackAnswerSchema = z.object({ version: z.string().max(20).regex(/^\d+\.\d+\.\d+$/), skipped: z.boolean() });

export const ostackSettingsSchema = z.object({
  timezone: z.string().min(1).max(64).refine(isTimeZone, { message: "Use an IANA timezone, such as America/New_York" }).nullable(),
  /** Installed packs, such as "gtm/gmail". Team only. */
  packs: z.array(z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/)).max(20).nullable(),
  answered: z.record(ostackQuestionIdSchema, ostackAnswerSchema),
  modules: ostackModuleSettingsSchema,
});
export type OstackSettings = z.infer<typeof ostackSettingsSchema>;

/** A partial change. A null clears a value; module fields merge key by key. */
export const ostackSettingsPatchSchema = z.object({
  timezone: ostackSettingsSchema.shape.timezone.optional(),
  packs: ostackSettingsSchema.shape.packs.optional(),
  answered: z.record(ostackQuestionIdSchema, ostackAnswerSchema.nullable()).optional(),
  modules: ostackModuleSettingsSchema.optional(),
});
export type OstackSettingsPatch = z.infer<typeof ostackSettingsPatchSchema>;

export const ostackSetupSchema = z.object({
  me: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  role: z.string(),
  canManage: z.boolean(),
  workspace: z.object({ id: z.string(), name: z.string() }),
  notes: z.object({ team: z.array(ostackNoteSchema), mine: z.array(ostackNoteSchema) }),
  settings: z.object({ team: ostackSettingsSchema, mine: ostackSettingsSchema }),
  cards: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
});

export const saveOstackNoteSchema = z.object({
  scope: ostackNoteScopeSchema,
  path: ostackNotePathSchema,
  body: ostackNoteBodySchema,
  /** The version the caller read, or null for a note the caller believes does not exist yet. */
  baseVersion: z.number().int().positive().nullable(),
});
export const deleteOstackNoteSchema = z.object({
  scope: ostackNoteScopeSchema,
  path: ostackNotePathSchema,
  baseVersion: z.number().int().positive(),
});
export const saveOstackSettingsSchema = z.object({ scope: ostackNoteScopeSchema, values: ostackSettingsPatchSchema });

export const startOstackRunSchema = z.object({ workflow: ostackWorkflowSchema, scheduled: z.boolean() });
export const endOstackRunSchema = z.object({
  summary: z.string().max(4000).optional(),
  counts: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.number().int().min(0).max(10_000_000)).optional(),
});
export const ostackRunStartedSchema = z.object({ id: z.uuid(), startedAt: z.string() });
export const ostackRunEndedSchema = z.object({ id: z.uuid(), endedAt: z.string() });
