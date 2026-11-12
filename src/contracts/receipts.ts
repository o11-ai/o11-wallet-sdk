import { z } from "zod";
import { supplierPriceReferenceSchema } from "./supplier-price-reference.js";
import { moneySchema, platformAccountHealthSchema } from "./index.js";
import { executionAccountSchema } from "./execution-account.js";
import { priceRangeShape, publishedTariffSchema, tariffRateSchema } from "./published-tariff.js";
import { publishedInputSchema } from "./published-input.js";
import { executionFailureSchema, invocationLifecycleSchema, invocationShortIdSchema, invocationShortId } from "./invocation-lifecycle.js";
import { toolHealthSummarySchema } from "./health.js";
import { resultOutcomeSchema, providerResultOutcome, outputQualitySchema, emailConfidenceSchema } from "./result-outcome.js";
export { resultOutcomeSchema, providerResultOutcome, type ResultOutcome } from "./result-outcome.js";
/** Why a settled call cost what it did: charged, answered from a cached identical request, or free. */
export const receiptBillingSchema = z.object({
  basis: z.enum(["charged", "cached", "no_charge"]),
  note: z.string(),
  /** The provider charged more than the call's hold. The caller paid at most the hold; o11 reviews the price. */
  exceededHold: z.literal(true).optional(),
});
export type ReceiptBilling = z.infer<typeof receiptBillingSchema>;
export const receiptSchema = z.object({
  ...invocationLifecycleSchema.partial().shape,
  id: z.string().uuid(),
  shortId: invocationShortIdSchema.optional(),
  runId: z.uuid().optional(),
  cardId: z.uuid().optional(),
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
  /** Settled calls only; optional so older servers and clients stay compatible. */
  billing: receiptBillingSchema.optional(),
  executionAccount: executionAccountSchema.nullable().optional(),
  providerJobId: z.string().nullable(),
  result: z.unknown(),
  error: z.string().nullable(),
  failure: executionFailureSchema.optional(),
  resultOutcome: resultOutcomeSchema.optional(),
  outputQuality: outputQualitySchema.optional(),
  /** Email results only: the provider's verification label on one documented scale (see email-confidence.ts). */
  emailConfidence: emailConfidenceSchema.optional(),
  /** awaiting_approval only: what a person must approve, where, and by when. */
  message: z.string().optional(),
  approval: z.object({ status: z.literal("pending"), expiresAt: z.iso.datetime(), url: z.url() }).optional(),
  /** Status reads only: the stored request, secrets redacted. Optional so older servers stay compatible. */
  request: z.object({
    input: z.object({ pathParams: z.record(z.string(), z.unknown()), queryParams: z.record(z.string(), z.unknown()),
      headers: z.record(z.string(), z.unknown()), body: z.unknown().optional() }),
    credentialMode: z.enum(["platform", "customer"]), connectionId: z.string().optional(),
    maxCostMicros: moneySchema, allowWrite: z.boolean(), acceptRecurring: z.boolean(),
  }).optional(),
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
const discoveryMatchingSchema = z.object({ method: z.literal("capability_rewrite"), query: z.string() });

export const compactDiscoverySchema = z.object({
  query: z.string(),
  count: z.number().int().nonnegative(),
  total_matches: z.number().int().nonnegative(),
  matching: discoveryMatchingSchema.optional(),
  results: z.array(z.object({
    endpoint_id: z.string(), name: z.string(), provider: z.string(), bulk: z.literal(true).optional(),
    usd_per_call: z.number().nonnegative().nullable(), price_text: z.string().nullable().optional(), no_key_needed: z.boolean(),
    score: z.number().nonnegative().nullable(), works: z.number().min(0).max(1).nullable(),
    samples: z.number().int().nonnegative().nullable(),
    usable_rate: z.number().min(0).max(1).nullable().optional(),
    usable_samples: z.number().int().nonnegative().nullable().optional(),
  })),
  cursor: z.string().optional(),
  access: z.object({ availableToolCount: z.number().int().nonnegative(), unavailableToolIds: z.array(z.string()) }).optional(),
  next: z.string(),
});
export const discoverySchema = z.object({
  // Optional: wallets before these fields still parse.
  query: z.string().optional(),
  total_matches: z.number().int().nonnegative().optional(),
  fallback: z.literal("discover").optional(),
  notices: z.array(z.string()).optional(),
  matching: discoveryMatchingSchema.optional(),
  access: z.object({ availableToolCount: z.number().int().nonnegative(), unavailableToolIds: z.array(z.string()) }).optional(),
  items: z.array(
    z.object({
      id: z.string(),
      endpoint: z.string().optional(),
      name: z.string(),
      provider: z.string(),
      score: z.number().nullable().optional(),
      bulk: z.literal(true).optional(),
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
        ...priceRangeShape,
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
