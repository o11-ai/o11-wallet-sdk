import { invocationReferenceSchema, invocationShortIdSchema } from "./invocation-lifecycle.js";
import { z } from 'zod';
import { resultOutcomeSchema } from './receipts.js';
import { reportKinds, reportStatuses } from './report-values.js';
import { executionFailureSchema } from './invocation-lifecycle.js';

export const reportKindSchema = z.enum(reportKinds);
export const reportStatusSchema = z.enum(reportStatuses);
export const reportOutcomeSchema = z.enum(['none', 'acknowledged', 'provider_issue', 'input_issue', 'no_issue', 'other']);
const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const references = {
  runId: z.uuid().optional(),
  invocationIds: z.array(invocationReferenceSchema).max(20).default([]),
  contextInvocationIds: z.array(invocationReferenceSchema).max(20).default([]),
  requestIds: z.array(z.uuid()).max(20).default([]),
  searchIds: z.array(z.uuid()).max(20).default([]),
  toolIds: z.array(text(250)).max(20).default([]),
  discoverQueries: z.array(text(500)).max(8).default([]),
};
export const createReportSchema = z.strictObject({ requestId: z.uuid(), kind: reportKindSchema,
  reason: text(4000), intent: text(2000).optional(), ...references,
}).refine(value => value.kind !== 'dispute' || value.invocationIds.length > 0,
  { message: 'A dispute needs at least one invocation from this connection and card.', path: ['invocationIds'] });
export const getReportSchema = z.strictObject({ id: z.uuid(), historyCursor: z.string().max(1000).optional() });
export const listReportsSchema = z.strictObject({ status: z.union([reportStatusSchema, z.literal('all')]).default('all'),
  kind: z.union([reportKindSchema, z.literal('all')]).default('all'), cursor: z.string().max(1000).optional(),
  limit: z.number().int().min(1).max(50).default(25) });
export const addReportInfoSchema = z.strictObject({ id: z.uuid(), requestId: z.uuid(),
  expectedRevision: z.number().int().positive(), message: text(4000), ...references });
export const reportInvocationSchema = z.object({ id: z.uuid(), shortId: invocationShortIdSchema.optional(), toolId: z.string(), provider: z.string(), state: z.string(),
  reservedMicros: z.string(), billedMicros: z.string().nullable(), createdAt: z.iso.datetime(),
  holdState: z.enum(['pending', 'held', 'settled', 'released', 'declined', 'expired']).optional(),
  heldMicros: z.string().regex(/^\d+$/).optional(),
  role: z.enum(['reported', 'context']), resultOutcome: resultOutcomeSchema.optional(),
  resultAvailable: z.boolean().optional(), canResume: z.boolean().optional(),
  nextAction: z.enum(['poll', 'inspect_result', 'request_approval', 'request_manager_review', 'none']).optional(),
  runId: z.uuid().optional(), credentialMode: z.enum(['platform', 'customer']).optional(),
  failure: executionFailureSchema.optional(),
  error: z.string().max(1000).nullable().optional(), upstreamStatus: z.string().regex(/^\d{3}$/).optional() });
export const reportRequestSchema = z.object({ requestId: z.uuid(), operation: z.string(), outcome: z.string().optional(),
  errorCode: z.string().optional(), runId: z.uuid().optional(), callId: z.uuid().optional() });
export const reportEvidenceSchema = z.object({ discoverQueries: z.array(z.string()), requestIds: z.array(z.uuid()),
  searchIds: z.array(z.uuid()), toolIds: z.array(z.string()), invocations: z.array(reportInvocationSchema),
  runs: z.array(z.object({ runId: z.uuid(), attachedCount: z.number().int().nonnegative().max(20),
    truncated: z.boolean() })).default([]),
  requests: z.array(reportRequestSchema).default([]) });
export const reportSummarySchema = z.object({ id: z.uuid(), kind: reportKindSchema, status: reportStatusSchema,
  revision: z.number().int().positive(), reason: z.string(), intent: z.string().nullable(), organizationId: z.string().optional(),
  cardId: z.uuid(), reporterId: z.string().optional(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  publicResolution: z.string().nullable(), outcome: reportOutcomeSchema, invocationCount: z.number().int().nonnegative(),
  workspaceName: z.string().nullable().optional(), cardName: z.string().nullable().optional(), reporterName: z.string().nullable().optional() });
export const reportEventSchema = z.object({ id: z.uuid(), kind: z.enum(['created', 'context_added', 'moderated']),
  createdAt: z.iso.datetime(), actorType: z.enum(['agent', 'staff']), message: z.string().nullable(),
  status: reportStatusSchema.optional(), revision: z.number().int().positive(), outcome: reportOutcomeSchema.optional(),
  internalNote: z.string().nullable().optional(), actorId: z.string().optional(), actorEmail: z.string().optional() });
export const reportDetailSchema = reportSummarySchema.extend({ evidence: reportEvidenceSchema, history: z.array(reportEventSchema),
  historyCursor: z.string().nullable().default(null),
  currentInvocations: z.array(reportInvocationSchema.extend({ observedAt: z.iso.datetime() })).default([]) });
export const reportPageSchema = z.object({ items: z.array(reportSummarySchema), cursor: z.string().nullable(), total: z.number().int().nonnegative() });
export const reportAdminListSchema = listReportsSchema.extend({ action: z.literal('report.list'),
  organizationId: z.string().min(1).max(200).optional(), cardId: z.uuid().optional(), search: z.string().trim().max(200).default('') });
export const reportAdminUpdateSchema = z.strictObject({ action: z.literal('report.update'), id: z.uuid(), requestId: z.uuid(),
  expectedRevision: z.number().int().positive(), status: reportStatusSchema,
  publicResolution: text(4000).optional(), internalNote: text(4000).optional(), outcome: reportOutcomeSchema.optional() })
  .refine(value => !!value.publicResolution || !!value.internalNote, { message: 'Explain this moderation update.', path: ['internalNote'] })
  .refine(value => value.status !== 'needs_info' || !!value.publicResolution,
    { message: 'Explain what information the reporter should provide.', path: ['publicResolution'] })
  .refine(value => !['resolved', 'dismissed'].includes(value.status) || !!value.publicResolution && !!value.outcome && value.outcome !== 'none',
    { message: 'A closed report needs a public explanation and outcome.', path: ['publicResolution'] });
export const reportAdminGetSchema = getReportSchema.extend({ action: z.literal('report.get') });
export const reportAdminInputSchema = z.discriminatedUnion('action', [reportAdminListSchema,
  reportAdminGetSchema, reportAdminUpdateSchema]);
export const reportOperationSchemas = { create_report: createReportSchema, get_report: getReportSchema,
  list_reports: listReportsSchema, add_report_info: addReportInfoSchema };
export const reportReasonInstructions = 'Report each distinct problem when observed, including free calls and issues followed by a successful workaround; proof of a bug is not required. A short symptom is enough. When installed CLI help supports it, use report -t "what went wrong" -r RUN_UUID to attach that run, or --invocation SHORT_ID_OR_UUID for a call; --note FILE is optional. The CLI generates the request ID, saves a private sanitized diagnostic file automatically, and attaches canonical server evidence. Use report --retry REQUEST_UUID to recover an uncertain submission. JSON/MCP callers can send a short reason and owned invocationIds or an advertised runId. Add useful observations already known, but do not require a long checklist before filing. Separate observed facts from suspected causes; keep unknown causes unknown. Never copy conversations, original prompts, credentials, raw provider bodies or secret logs. Do not rerun providers, spend, switch accounts or start a new login solely to report. Continue independent authorized work.';
export const reportOperationDescriptions = {
  create_report: `${reportReasonInstructions} Use feedback for catalog, setup or platform problems; dispute for unusable results after checking the inputs and tool. Reuse one report requestId for identical retries; disputes require owned invocationIds. This does not issue a refund.`,
  get_report: 'Read this connection and card’s report, original evidence and current invocation summaries. Follow historyCursor with the same report ID for older public updates. Internal staff notes are private.',
  list_reports: 'List this connection and card’s reports. Follow cursor for more.',
  add_report_info: 'Add a redacted reply or owned evidence to an existing report. Reuse requestId for retries and supply the current expectedRevision.',
};
export type CreateReport = z.infer<typeof createReportSchema>;
export type ReportEvidence = z.infer<typeof reportEvidenceSchema>;
export type ReportDetail = z.infer<typeof reportDetailSchema>;
export type ReportStatus = z.infer<typeof reportStatusSchema>;
