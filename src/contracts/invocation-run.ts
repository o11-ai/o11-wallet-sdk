import { z } from "zod";
import { moneySchema } from "./money.js";
import { maxInvocationHoldSeconds } from "./invocation-lifecycle.js";

/** The route attempt reason when the run's ceiling refused that provider's hold. */
export const RUN_CEILING_REASON = "run ceiling reached";
export const invocationRunInputSchema = z.strictObject({ runId: z.uuid(),
  waitSeconds: z.number().int().min(0).max(maxInvocationHoldSeconds).optional()
    .describe("While calls in the run are still running, wait up to this many seconds for them to finish (or for one to need action) before answering, instead of polling repeatedly.") });
export const invocationRunSchema = z.object({
  runId: z.uuid(), cardId: z.uuid(),
  counts: z.object({ total: z.number().int().nonnegative(), pending: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(), needsAction: z.number().int().nonnegative() }),
  wallet: z.object({ billedMicros: moneySchema, reservedMicros: moneySchema,
    unsettledInvocations: z.number().int().nonnegative() }),
  external: z.object({ status: z.enum(["unknown", "none"]), invocations: z.number().int().nonnegative() }),
  coverage: z.object({ scope: z.literal("card_run"), since: z.iso.datetime().nullable(),
    through: z.iso.datetime().nullable(), historicalUncorrelatedExcluded: z.literal(true) }),
  budget: z.object({ enforcement: z.literal("card_and_ancestor_allowances"), runIdCreatesBudget: z.literal(false) }),
  // Set once a call sends runMaxMicros with this run id; older wallets omit it.
  ceiling: z.object({ limitMicros: moneySchema, spentMicros: moneySchema, heldMicros: moneySchema,
    remainingMicros: moneySchema }).nullable().optional(),
});
export type InvocationRun = z.infer<typeof invocationRunSchema>;
