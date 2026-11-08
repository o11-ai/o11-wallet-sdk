import { z } from "zod";
import { productSearchInputSchema } from "./product-search.js";

export const purchaseToolId = "o11:commerce:purchase";
const shortText = z.string().trim().min(1).max(500);
export const usdMinorSchema = z.string().regex(/^(0|[1-9]\d{0,8})$/);
export const checkoutAddressSchema = z.strictObject({
  name: shortText, line1: shortText, line2: z.string().max(200).optional(),
  city: shortText, state: z.string().regex(/^[A-Z]{2}$/),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/), country: z.literal("US"),
});
export const checkoutDetailsSchema = z.strictObject({
  email: z.email().max(254).optional(), phone: z.string().regex(/^\+1\d{10}$/).optional(),
  shipping: checkoutAddressSchema.optional(), billing: checkoutAddressSchema.optional(),
  deliveryInstructions: z.string().max(1000).optional(),
  itemInstructions: z.string().max(1000).optional(),
  service: z.strictObject({
    account: shortText.optional(), activationEmail: z.email().optional(),
    seats: z.number().int().min(1).max(10000).optional(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
  }).optional(),
});
export const purchaseRequestSchema = z.strictObject({
  idempotencyKey: z.string().min(1).max(200),
  url: z.url().max(4000),
  item: z.string().trim().min(1).max(1000),
  quantity: z.number().int().min(1).max(100).default(1),
  options: z.record(z.string().max(80), z.string().max(200)).default({})
    .refine(value => Object.keys(value).length <= 20, "Use at most 20 item options"),
  maxTotalMinor: usdMinorSchema.refine(value => BigInt(value) > 0n, "Choose a positive spending limit"),
  currency: z.literal("USD").default("USD"), country: z.literal("US").default("US"),
  details: checkoutDetailsSchema.default({}),
  profileId: z.uuid().optional(),
  recurring: z.strictObject({
    authorized: z.literal(true), maxPeriodMinor: usdMinorSchema,
    maxCommitmentMinor: usdMinorSchema, maxPeriods: z.number().int().min(1).max(120),
    cadence: z.enum(["month", "year"]),
  }).optional(),
});
export type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;
export type CheckoutDetails = z.infer<typeof checkoutDetailsSchema>;
export const purchaseStates = ["queued", "preparing", "requires_input", "requires_action", "payment_unavailable", "failed", "unknown", "cancelled"] as const;
export const purchaseStateSchema = z.enum(purchaseStates);
export const purchaseSummarySchema = z.object({
  id: z.uuid(), walletId: z.uuid(), cardId: z.uuid(), item: z.string(), merchant: z.url(),
  state: purchaseStateSchema, paymentState: z.enum(["not_started", "unavailable"]), purchased: z.literal(false),
  currency: z.literal("USD"), maxTotalMinor: usdMinorSchema, revision: z.number().int().positive(),
  reason: z.string().nullable(), requiredFields: z.array(z.string()), canResume: z.boolean(), canCancel: z.boolean(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const checkoutQuoteSchema = z.strictObject({
  merchant: shortText, sourceUrl: z.url(), currency: z.literal("USD"),
  items: z.array(z.strictObject({
    name: shortText, quantity: z.number().int().positive().max(100),
    variant: z.string().max(500).nullable(), lineTotalMinor: usdMinorSchema,
  })).min(1).max(100),
  subtotalMinor: usdMinorSchema, taxMinor: usdMinorSchema,
  shippingMinor: usdMinorSchema, feesMinor: usdMinorSchema, discountMinor: usdMinorSchema,
  totalMinor: usdMinorSchema, recurring: z.boolean(),
  recurringTerms: z.strictObject({
    cadence: z.enum(["month", "year"]), periodTotalMinor: usdMinorSchema,
    minimumPeriods: z.number().int().min(1).max(120), minimumCommitmentMinor: usdMinorSchema,
  }).nullable(),
  selectedOptions: z.record(z.string().max(80), z.string().max(200)),
  terms: z.string().max(2000), observedAt: z.iso.datetime({ offset: true }),
});
export type CheckoutQuote = z.infer<typeof checkoutQuoteSchema>;
export const preparationResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), quote: checkoutQuoteSchema }),
  z.strictObject({ kind: z.literal("requires_input"), fields: z.array(shortText).min(1).max(20), message: z.string().max(1000) }),
  z.strictObject({ kind: z.literal("requires_action"), reason: z.enum(["authentication", "unsupported_checkout", "request_blocked", "step_limit"]), message: z.string().max(1000) }),
]);
export type PreparationResult = z.infer<typeof preparationResultSchema>;
export const purchaseDetailSchema = purchaseSummarySchema.extend({
  request: purchaseRequestSchema.omit({ idempotencyKey: true }), quote: checkoutQuoteSchema.nullable(),
  merchantOrderId: z.string().nullable(), fulfillment: z.unknown(), nextAction: z.string().nullable(),
  documents: z.array(z.object({ id: z.uuid(), fileId: z.uuid(), kind: z.string(), revision: z.number().int().positive(), sha256: z.string(), capturedAt: z.iso.datetime() })),
  events: z.array(z.object({ id: z.uuid(), kind: z.string(), data: z.record(z.string(), z.unknown()), observedAt: z.iso.datetime() })),
});
export const purchaseOperationSchemas = {
  search_products: productSearchInputSchema,
  purchase: purchaseRequestSchema,
  get_purchase: z.strictObject({ id: z.uuid() }),
  list_purchases: z.strictObject({ cursor: z.string().max(500).optional() }),
  resume_purchase: z.strictObject({ id: z.uuid(), idempotencyKey: z.string().min(1).max(200), details: checkoutDetailsSchema.optional() }),
  cancel_purchase: z.strictObject({ id: z.uuid() }),
  purchase_document: z.strictObject({ id: z.uuid(), documentId: z.uuid() }),
};
export const purchaseOperationDescriptions: Record<keyof typeof purchaseOperationSchemas, string> = {
  search_products: "Find products across thousands of online stores. Each offer names its store, price in USD cents and productUrl. For checkout shopify pass productUrl to purchase; for checkout browser pass storeUrl with the offer's exact title as item.",
  purchase: "Prepare a US/USD purchase within this card's existing permissions and spending limits. Amounts are integer USD cents. Card issuing is stubbed: no order or payment is submitted. Returns a durable purchase ID; poll get_purchase, never create another purchase to poll.",
  get_purchase: "Read this card's purchase, checkout quote, payment state, documents and next action. A prepared checkout is not a completed purchase.",
  list_purchases: "List purchases belonging to this card, newest first. Follow the cursor for more.",
  resume_purchase: "Retry a safely stopped preparation with missing checkout details. Reuses the purchase ID and rechecks permissions and funds. Unknown or active executions cannot be retried.",
  cancel_purchase: "Stop local preparation and release its spending reservation. This does not cancel a merchant order or claim a refund.",
  purchase_document: "Get an expiring download link for a document attached to this card's purchase. Checkout evidence is not a merchant receipt.",
};
