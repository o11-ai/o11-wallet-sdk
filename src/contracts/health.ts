import { z } from "zod";

/** Evidence for this caller's historical executions, never a supplier-wide availability verdict. */
export const toolHealthSchema = z.object({
  scope: z.enum(["card_history", "execution_account_route"]),
  status: z.enum(["unknown", "observed"]),
  windowStartedAt: z.iso.datetime(),
  windowEndedAt: z.iso.datetime(),
  sampleCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  observationUnavailable: z.literal(true).optional(),
  lastObservedAt: z.iso.datetime().nullable(),
  execution: z.object({ succeeded: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
    accountRejected: z.number().int().nonnegative(), rateLimited: z.number().int().nonnegative() }),
  output: z.object({ complete: z.number().int().nonnegative(), partial: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(), empty: z.number().int().nonnegative(), unknown: z.number().int().nonnegative() }),
  latencyMs: z.object({ basis: z.literal("admission_to_completion"), samples: z.number().int().nonnegative(),
    p50: z.number().nonnegative().nullable(), p95: z.number().nonnegative().nullable() }),
});
export type ToolHealth = z.infer<typeof toolHealthSchema>;

export const toolHealthSummarySchema = toolHealthSchema.pick({ scope: true, status: true, sampleCount: true,
  windowStartedAt: true, windowEndedAt: true, truncated: true, observationUnavailable: true, lastObservedAt: true, latencyMs: true });
export type ToolHealthSummary = z.infer<typeof toolHealthSummarySchema>;
export function summarizeToolHealth(health: ToolHealth): ToolHealthSummary {
  return toolHealthSummarySchema.parse(health);
}
