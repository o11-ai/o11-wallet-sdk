import { z } from "zod";
import { supplierPriceReferenceSchema } from "./supplier-price-reference.js";
import { moneySchema, platformAccountHealthSchema } from "./index.js";
import { executionAccountSchema } from "./execution-account.js";
import { publishedTariffSchema, tariffRateSchema } from "./published-tariff.js";
import { publishedInputSchema } from "./published-input.js";
import { executionFailureSchema, invocationLifecycleSchema, invocationShortIdSchema, invocationShortId } from "./invocation-lifecycle.js";
import { toolHealthSummarySchema } from "./health.js";
import { resultOutcomeSchema, providerResultOutcome, outputQualitySchema } from "./result-outcome.js";
export { resultOutcomeSchema, providerResultOutcome, type ResultOutcome } from "./result-outcome.js";
export const receiptSchema = z.object({
  ...invocationLifecycleSchema.partial().shape,
  id: z.string().uuid(),
  shortId: invocationShortIdSchema.optional(),
  runId: z.uuid().optional(),
  toolId: z.string(),
  toolName: z.string(),
  state: z.enum([
    "awaiting_approval",
    "queued",
    "executing",
    "waiting",
    "succeeded",
    "failed",
    "unknown",
    "cancelled",
  ]),
  canResume: z.boolean().default(false),
  reservedMicros: moneySchema,
  billedMicros: moneySchema.nullable(),
  settlementBasis: z
    .enum(["catalog", "provider", "operator", "none"])
    .nullable(),
  supplierCostMicros: moneySchema.nullable().optional(),
  executionAccount: executionAccountSchema.nullable().optional(),
  providerJobId: z.string().nullable(),
  result: z.unknown(),
  error: z.string().nullable(),
  failure: executionFailureSchema.optional(),
  resultOutcome: resultOutcomeSchema.optional(),
  outputQuality: outputQualitySchema.optional(),
  createdAt: z.iso.datetime(),
});
export type InvocationReceipt = z.infer<typeof receiptSchema>;
export const spendingEligibilitySchema = z.object({
  mode: z.enum(["available", "free_only", "blocked"]),
  reason: z.enum(["wallet_inactive", "wallet_debt", "wallet_unfunded", "allowance_inactive", "allowance_unavailable", "allowance_exhausted", "allowance_exceeded", "hierarchy_invalid"]).optional(),
});
export type SpendingEligibility = z.infer<typeof spendingEligibilitySchema>;
export const balanceSchema = z.object({
  availableMicros: moneySchema,
  reservedMicros: moneySchema,
  status: z.enum(["active", "suspended", "archived"]),
  wallet: z.object({ id: z.uuid(), balanceVisible: z.boolean(), availableMicros: moneySchema.nullable(), reservedMicros: moneySchema.nullable(), debtMicros: moneySchema.nullable() }).optional(),
  card: z.object({ id: z.uuid(), remainingAllowanceMicros: moneySchema.nullable(), availableMicros: moneySchema, reservedMicros: moneySchema }).optional(),
  spending: spendingEligibilitySchema.optional(),
  execution: z.object({ ready: z.boolean(), reason: z.literal("runtime_upgrade_required").optional() }).optional(),
});
export const compactDiscoverySchema = z.object({
  query: z.string(),
  count: z.number().int().nonnegative(),
  total_matches: z.number().int().nonnegative(),
  results: z.array(z.object({
    endpoint_id: z.string(), name: z.string(), provider: z.string(),
    usd_per_call: z.number().nonnegative().nullable(), no_key_needed: z.boolean(),
    score: z.number().nonnegative().nullable(), works: z.number().min(0).max(1).nullable(),
    samples: z.number().int().nonnegative().nullable(),
  })),
  cursor: z.string().optional(),
  access: z.object({ availableToolCount: z.number().int().nonnegative(), unavailableToolIds: z.array(z.string()) }).optional(),
  next: z.string(),
});
export const discoverySchema = z.object({
  matching: z.object({ method: z.literal("capability_rewrite"), query: z.string() }).optional(),
  access: z.object({ availableToolCount: z.number().int().nonnegative(), unavailableToolIds: z.array(z.string()) }).optional(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      provider: z.string(),
      description: z.string().optional(),
      availability: z.enum(["configured", "requires_adapter"]).optional(),
      unavailableReason: z.string().optional(),
      inputContract: publishedInputSchema.optional(),
      requiresCustomerCredentials: z.boolean().optional(),
      platformAccountAvailable: z.boolean().optional(),
      platformAccountHealth: platformAccountHealthSchema.optional(),
      health: toolHealthSummarySchema.optional(),
      platformAccountInstalled: z.boolean().optional(),
      effect: z.enum(["read", "write"]).optional(),
      price: z.object({
        micros: moneySchema.nullable(),
        basis: z.enum(["free", "call", "variable"]),
        evidence: z.string(),
        requiresSupplierRate: z.boolean().optional(),
        supplierQuoteAtExecution: z.boolean().optional(),
        supplierReference: supplierPriceReferenceSchema.optional(),
      modelTokenPricing: z.object({ directoryToolId: z.string().min(1), sourceUrl: z.url(), formula: z.string().min(1) }).optional(),
        tariff: publishedTariffSchema.optional(),
        pricingBasis: z.enum(["supplier_at_cost", "published_tariff"]).optional(),
        unavailableReason: z.string().optional(),
        unit: z.string().optional(),
        rates: z.array(tariffRateSchema).optional(),
      }),
    }),
  ),
  cursor: z.string().optional(),
});

/** Classify historical receipts from servers that predate resultOutcome. */
export function parseReceipt(value: unknown): InvocationReceipt {
  const receipt = receiptSchema.parse(value);
  if (receipt.shortId && receipt.shortId.toLowerCase() !== invocationShortId(receipt.id))
    throw new Error("Receipt shortId does not match its invocation id");
  const resultOutcome = receipt.resultOutcome ?? providerResultOutcome(receipt.toolId, receipt.result);
  return resultOutcome ? { ...receipt, resultOutcome } : receipt;
}
