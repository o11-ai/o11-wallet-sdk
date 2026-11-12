import { z } from "zod";

/**
 * A team's Ostack playbook setup, which `o11 ostack` reads before every run and the wallet's Ostack page edits:
 * markdown files, a few settings, and a record of each run. Team values are shared by the workspace; a member's own
 * values refine them. Each playbook (gtm for outbound) keeps its own settings.
 */
export const fileScopeSchema = z.enum(["team", "me"]);
export type FileScope = z.infer<typeof fileScopeSchema>;

/** company.md, gtm/write.md, gtm/audiences/customers/template-a.md. Up to three folders, lowercase. */
export const PLAYBOOK_FILE_PATH = /^(?:[a-z0-9][a-z0-9-]*\/){0,3}[a-z0-9][a-z0-9_-]*\.md$/;
export const playbookFilePathSchema = z.string().max(240).regex(PLAYBOOK_FILE_PATH);
export const playbookFileContentSchema = z.string().max(64 * 1024);
/** An audience folder's name, such as customers. The default audience's files sit in the playbook's own folder. */
export const audienceNameSchema = z.string().max(60).regex(/^[a-z0-9][a-z0-9-]*$/);
export const setupQuestionIdSchema = z.string().max(80).regex(/^(?:[a-z0-9-]+\/)?[a-z0-9-]+$/);
export const workflowRefSchema = z.string().max(80).regex(/^[a-z0-9-]+\/[a-z0-9-]+$/);
export const playbookIdSchema = z.string().max(40).regex(/^[a-z0-9][a-z0-9-]*$/);

/** A file as it is now. `versionId` names this exact text, so a CRM record can point at what was sent. */
export const playbookFileSchema = z.object({
  path: playbookFilePathSchema,
  content: z.string(),
  version: z.number().int().positive(),
  versionId: z.uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});
export type PlaybookFile = z.infer<typeof playbookFileSchema>;

/** One saved version of a file, kept after later edits and after the file is deleted. */
export const playbookFileVersionSchema = z.object({
  id: z.uuid(),
  scope: fileScopeSchema,
  path: playbookFilePathSchema,
  version: z.number().int().positive(),
  content: z.string(),
  current: z.boolean(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
});
export type PlaybookFileVersion = z.infer<typeof playbookFileVersionSchema>;

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

/** "weekdays 08:00-18:00", or "any" for always open. */
export const sendWindowSchema = z.string().max(80).regex(/^(?:any|\S+ \d{1,2}:\d{2}-\d{1,2}:\d{2})$/);
export const followUpDaysSchema = z.array(z.number().int().min(1).max(90)).max(19);

/** GTM's settings. A missing field uses the shipped default; null clears a saved value. An audience's own files can override them. */
export const gtmSettingsSchema = z.object({
  sendMode: z.enum(["draft", "send"]).nullable(),
  limits: gtmLimitsSchema.nullable(),
  /** Days after the previous message for each follow-up. Empty turns follow-ups off. */
  followUpDays: followUpDaysSchema.nullable(),
  sendWindow: sendWindowSchema.nullable(),
  /** The address this member sends from. Member only. */
  senderEmail: z.string().max(254).nullable(),
  /** Which leads this member works, such as "companies A-M". Member only. */
  leadAssignment: z.string().max(500).nullable(),
}).partial();
export type GtmSettings = z.infer<typeof gtmSettingsSchema>;

/** Settings by playbook. Each playbook's settings are stored in its own table, such as ostack_gtm_setting. */
export const playbookSettingsByIdSchema = z.object({ gtm: gtmSettingsSchema.optional() }).strict();
export type PlaybookSettingsById = z.infer<typeof playbookSettingsByIdSchema>;

export const setupAnswerSchema = z.object({ version: z.string().max(20).regex(/^\d+\.\d+\.\d+$/), skipped: z.boolean() });
export type SetupAnswer = z.infer<typeof setupAnswerSchema>;

/** A preset is a ready-made set of files a playbook ships, such as "gtm/gmail". */
export const presetRefSchema = z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/);

export const playbookSettingsSchema = z.object({
  timezone: z.string().min(1).max(64).refine(isTimeZone, { message: "Use an IANA timezone, such as America/New_York" }).nullable(),
  /** Presets the team turned on. Team only. */
  presets: z.array(presetRefSchema).max(20).nullable(),
  setupAnswers: z.record(setupQuestionIdSchema, setupAnswerSchema),
  playbooks: playbookSettingsByIdSchema,
});
export type PlaybookSettings = z.infer<typeof playbookSettingsSchema>;

/** A partial change. A null clears a value; playbook fields merge key by key. */
export const playbookSettingsPatchSchema = z.object({
  timezone: playbookSettingsSchema.shape.timezone.optional(),
  presets: playbookSettingsSchema.shape.presets.optional(),
  setupAnswers: z.record(setupQuestionIdSchema, setupAnswerSchema.nullable()).optional(),
  playbooks: playbookSettingsByIdSchema.optional(),
});
export type PlaybookSettingsPatch = z.infer<typeof playbookSettingsPatchSchema>;

export const playbookSetupSchema = z.object({
  me: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  role: z.string(),
  canManage: z.boolean(),
  workspace: z.object({ id: z.string(), name: z.string() }),
  files: z.object({ team: z.array(playbookFileSchema), mine: z.array(playbookFileSchema) }),
  settings: z.object({ team: playbookSettingsSchema, mine: playbookSettingsSchema }),
  cards: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
});
export type PlaybookSetup = z.infer<typeof playbookSetupSchema>;

export const saveFileSchema = z.object({
  scope: fileScopeSchema,
  path: playbookFilePathSchema,
  content: playbookFileContentSchema,
  /** The version the caller read, or null for a file the caller believes does not exist yet. */
  baseVersion: z.number().int().positive().nullable(),
});
export const deleteFileSchema = z.object({
  scope: fileScopeSchema,
  path: playbookFilePathSchema,
  baseVersion: z.number().int().positive(),
});
export const saveSettingsSchema = z.object({ scope: fileScopeSchema, values: playbookSettingsPatchSchema });

export const runCountsSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.number().int().min(0).max(10_000_000));
const outcome = z.number().int().min(0).max(1_000_000);
/** What happened since the run started, per template file version id. Numbers only; people stay in the team's CRM. */
export const templateCountsSchema = z.record(z.uuid(), z.object({ sent: outcome, replied: outcome, meetings: outcome }).partial()).refine(
  (value) => Object.keys(value).length <= 50,
  { message: "Report at most 50 templates per run" },
);
export type TemplateCounts = z.infer<typeof templateCountsSchema>;

export const startRunSchema = z.object({
  workflow: workflowRefSchema,
  scheduled: z.boolean(),
  /** The audience this run works, or null for the whole playbook (follow-ups works every audience). */
  audience: audienceNameSchema.nullable().optional(),
});
export const endRunSchema = z.object({
  summary: z.string().max(4000).optional(),
  counts: runCountsSchema.optional(),
  templateCounts: templateCountsSchema.optional(),
});
export const runStartedSchema = z.object({ id: z.uuid(), startedAt: z.string() });
export const runEndedSchema = z.object({ id: z.uuid(), endedAt: z.string() });

/** Where `o11 ostack skills install` copied the skills, for install counts. Never paths or file contents. */
export const skillsInstalledSchema = z.object({
  version: z.string().max(20).regex(/^\d+\.\d+\.\d+$/),
  hosts: z.array(z.enum(["claude", "codex", "cursor", "gemini"])).max(4),
  installed: z.number().int().min(0).max(1000),
  updated: z.number().int().min(0).max(1000),
  skipped: z.number().int().min(0).max(1000),
});

/**
 * The `o11 login --task` the Ostack setup skill passes. People see it on the approval page; the wallet uses it to
 * record that an account created for that connection came for Ostack. Change both together.
 */
export const OSTACK_LOGIN_TASK = "Set up Ostack";
/** The product a connection's task names, matched exactly, or null. */
export function signupIntentFromTask(task: string | null | undefined): "ostack" | null {
  return task === OSTACK_LOGIN_TASK ? "ostack" : null;
}
