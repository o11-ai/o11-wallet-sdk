import { z } from "zod";
import { moneySchema } from "./money.js";

export const invocationRunInputSchema = z.strictObject({ runId: z.uuid() });
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
});
export type InvocationRun = z.infer<typeof invocationRunSchema>;
