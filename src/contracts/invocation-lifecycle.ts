import { z } from "zod";
import { moneySchema } from "./money.js";

/** Short references remain card-scoped aliases; durable receipt IDs stay UUIDs. */
export const invocationShortIdSchema = z.string().regex(/^[0-9a-fA-F]{8}$/);
export const invocationReferenceSchema = z.union([z.uuid(), invocationShortIdSchema])
  .describe("Invocation shortId (8 characters) or full UUID from a receipt or history. Use the same card.");
export const invocationShortId = (id: string) => id.slice(0, 8).toLowerCase();
export function invocationReferenceMatches(reference: string, id: string) {
  return reference.toLowerCase() === id.toLowerCase() ||
    invocationShortIdSchema.safeParse(reference).success && invocationShortId(reference) === invocationShortId(id);
}

export const invocationStateSchema = z.enum([
  "awaiting_approval", "queued", "executing", "waiting", "succeeded", "failed", "unknown", "cancelled",
]);
export const executionFailureSchema = z.object({
  stage: z.enum(['response-recovery', 'dispatch-authorization', 'routing-credential', 'aggregate-execution',
    'aggregate-receipt', 'native-execution', 'credentials', 'supplier-metering', 'pricing',
    'observe-result', 'result-storage', 'billing-finalization']),
  codes: z.array(z.string().regex(/^[A-Z0-9_]{2,50}$/)).max(4),
  occurredAt: z.iso.datetime(),
});
export type ExecutionFailure = z.infer<typeof executionFailureSchema>;
export const invocationLifecycleSchema = z.object({
  polling: z.object({ recommendedAfterMs: z.number().int().nonnegative() }).optional(),
  completedAt: z.iso.datetime().nullable(),
  cancellation: z.object({ supported: z.boolean(), requested: z.boolean() }),
  nextAction: z.enum(["poll", "inspect_result", "request_approval", "request_manager_review", "none"]),
});
export type InvocationLifecycle = z.infer<typeof invocationLifecycleSchema>;
export const invocationHistoryInputSchema = z.strictObject({
  cursor: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(25).default(10),
  state: invocationStateSchema.optional(),
  toolId: z.string().min(1).max(250).optional(),
  runId: z.uuid().optional(),
});
export type InvocationHistoryInput = z.input<typeof invocationHistoryInputSchema>;
export const invocationSummarySchema = z.object({
  id: z.uuid(), shortId: invocationShortIdSchema.optional(), toolId: z.string(), toolName: z.string(), state: invocationStateSchema,
  reservedMicros: moneySchema, billedMicros: moneySchema.nullable(),
  createdAt: z.iso.datetime(), completedAt: z.iso.datetime().nullable(), runId: z.uuid().optional(),
});
export const invocationHistoryPageSchema = z.object({
  items: z.array(invocationSummarySchema), cursor: z.string().optional(),
});
