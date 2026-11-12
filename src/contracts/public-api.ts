import { z } from "zod";
import { invocationSchema, inputSchema, moneySchema } from "./index.js";
import { purchaseOperationSchemas, purchaseOperationDescriptions } from "./purchases.js";
import { managementOperationSchemas, managementOperationDescriptions } from "./agent-permissions.js";
import { reportOperationSchemas, reportOperationDescriptions } from "./reports.js";
import { invocationHistoryInputSchema, invocationReferenceSchema, maxInvocationWaitSeconds } from "./invocation-lifecycle.js";
import { invocationRunInputSchema } from "./invocation-run.js";

const id = z.strictObject({ id: z.string().uuid() });
/**
 * Why a route call or quote was refused before anything was held. Every route refusal carries one. `option_disabled`:
 * an option the call sent, or the tool itself, is turned off for now; the same call without that option still runs.
 */
export const routeRefusalReasons = ["invalid_identity", "route_no_candidate", "route_max_cost", "invalid_field", "invalid_option", "option_disabled"] as const;
export type RouteRefusalReason = typeof routeRefusalReasons[number];
/** Domains Stripe serves hosted checkout from. Live sessions do not always use checkout.stripe.com/c/pay/. */
const stripeCheckoutDomains = ["stripe.com", "link.com"];
const isStripeCheckoutHost = (hostname: string) =>
  stripeCheckoutDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
export const stripeCheckoutUrlSchema = z.url().refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && isStripeCheckoutHost(url.hostname) && !url.port && !url.username && !url.password;
  } catch { return false; }
}, "Expected a Stripe-hosted checkout URL");
export const topUpResultSchema = z.object({
  requestId: z.uuid(), walletId: z.uuid(), cardId: z.uuid(), amountMicros: moneySchema,
  currency: z.literal("USD"), status: z.literal("awaiting_payment"), url: stripeCheckoutUrlSchema,
});
export const topUpStatusSchema = z.object({
  requestId: z.uuid(), walletId: z.uuid(), cardId: z.uuid(), amountMicros: moneySchema,
  currency: z.literal("USD"), status: z.enum(["pending", "paid", "failed", "expired", "partially_refunded", "refunded", "disputed"]),
  creditedMicros: moneySchema, creditCommitted: z.boolean(), paidAt: z.iso.datetime().nullable(),
  failureReason: z.enum(["payment_declined", "authentication_failed", "payment_failed", "checkout_expired", "payment_refunded", "payment_disputed"]).nullable(), paymentRetryable: z.boolean(),
});
export const topUpLimitsSchema = z.object({
  currency: z.literal("USD"), minimumCents: z.number().int().positive(), maximumCents: z.number().int().positive(),
  checkoutAvailable: z.boolean(), dashboardUrl: z.url(),
});
export const serviceOperationSchemas = {
  quote: z.strictObject({
    toolId: z.string().min(1).max(250),
    input: inputSchema,
    credentialMode: z.enum(["platform", "customer"]).default("platform")
      .describe("Use the o11 account by default. Select customer only for an explicitly chosen connected provider account."),
    connectionId: z.string().uuid().optional(),
    maxCostMicros: moneySchema.optional().describe("Wallet maximum in USD micros. Image edits, supplier-priced payments and unbounded-result tools can require a positive maximum. This does not cap the provider's own token use."),
  }),
  cancel: z.strictObject({ id: invocationReferenceSchema }),
  resources: z.strictObject({}).default({}),
  list_resources: z.strictObject({
    provider: z.string().min(1).max(100).optional(), resourceType: z.string().min(1).max(200).optional(),
    state: z.enum(["active", "release_requested", "released", "attention"]).optional(),
    limit: z.number().int().min(1).max(100).default(25), cursor: z.string().max(1000).optional(),
  }).refine(input => !input.resourceType || !!input.provider, { message: "resourceType requires provider", path: ["provider"] }),
  get_resource: z.strictObject({ id: z.uuid(), includeExternal: z.boolean().default(true) }),
  list_resource_events: z.strictObject({ id: z.uuid(), limit: z.number().int().min(1).max(100).default(25), cursor: z.string().max(1000).optional() }),
  resource_events: id,
  release_resource: id,
  retry_resource: id,
  configure_resource: z.strictObject({
    id: z.string().uuid(),
    autoRenew: z.boolean(),
    maxPeriodChargeMicros: moneySchema,
    inboundInvocationLimitMicros: moneySchema.optional(),
  }),
};

export const discoveryFirstPageSize = 10;
export const discoveryPageSize = 50;

/** A run's spending maximum: settled charges plus open holds across every call with this run id on this wallet. */
const runMaxSchema = moneySchema.optional().describe("Spending maximum for the whole run, in USD micros: settled charges plus open holds across every call with this runId. Needs runId (or the x-o11-run-id header). Raise it any time; lower it no further than the run has spent and holds. A call past it is refused with reason run_ceiling.");
export const publicOperationSchemas = {
  ...reportOperationSchemas,
  ...managementOperationSchemas,
  ...purchaseOperationSchemas,
  cards: z.strictObject({ cursor: z.string().optional() }),
  find_tools: z.strictObject({
    query: z.string().max(200).default(""),
    cursor: z.string().optional(),
    provider: z.string().optional(),
    format: z.enum(["compact", "detailed"]).optional()
      .describe("MCP defaults to compact results with relevance score, works and samples. Detailed returns full discovery metadata. HTTP defaults to detailed for older clients."),
    limit: z.number().int().min(1).max(discoveryPageSize).optional()
      .describe(`Request fewer results per page. The first page returns up to ${discoveryFirstPageSize}. With a cursor, it returns up to ${discoveryPageSize}.`),
  }),
  inspect: z.strictObject({ id: z.string() }),
  connections: z.strictObject({ provider: z.string().max(100).optional() }),
  get_configuration: z.strictObject({ id: z.string() }),
  balance: z.strictObject({}),
  topup_limits: z.strictObject({}),
  topup_status: z.strictObject({ requestId: z.uuid() }),
  topup: z.strictObject({ requestId: z.uuid(), amountCents: z.number().int().min(500).max(100000) }),
  call: z.strictObject({
    tool: z.string().min(1).max(250),
    params: z.json().optional().describe("Provider parameters. o11 places them using the inspected tool contract."),
    query: z.record(z.string(), z.json()).optional(),
    body: z.json().optional(),
    path: z.record(z.string(), z.string()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    idempotencyKey: z.string().min(1).max(200).optional().describe("Reuse for an uncertain retry; generated when omitted."),
    maxCostMicros: moneySchema.optional().describe("Optional lower spending ceiling. Defaults to the selected card's existing limits and remaining allowance."),
    credentialMode: z.enum(["platform", "customer"]).default("platform"),
    connectionId: z.uuid().optional(),
    allowWrite: z.boolean().default(false),
    acceptRecurring: z.boolean().default(false),
    runId: z.uuid().optional(),
    runMaxMicros: runMaxSchema,
  }),
  // searchId links a purchase to the search that led to it; it is not part of the invocation request.
  invoke: invocationSchema.extend({ searchId: z.uuid().optional(), runId: z.uuid().optional()
    .describe("Reuse one run UUID across this task's calls. This label groups receipts; it does not authorize spending. It caps spending only once a call sets runMaxMicros."),
    runMaxMicros: runMaxSchema }),
  get_invocation: z.strictObject({ id: invocationReferenceSchema,
    waitSeconds: z.number().int().min(0).max(maxInvocationWaitSeconds).optional()
      .describe("Wait up to this many seconds for a pending call to finish before answering, instead of polling repeatedly.") }),
  list_invocations: invocationHistoryInputSchema,
  get_run: invocationRunInputSchema,
  search_tools: z.strictObject({
    request: z.string().trim().min(1).max(500),
    preference: z.number().min(0).max(10).optional()
      .describe("0 ranks by quality alone; higher values give price more weight, never more than quality. Defaults to 3."),
    maxEffectivePriceMicros: moneySchema.optional().describe("Exclude tools whose price per call is higher or unknown, in USD micros."),
    limit: z.number().int().min(1).max(25).default(3),
  }),
  rate_result: z.strictObject({
    invocationId: invocationReferenceSchema,
    useful: z.boolean(),
    reason: z.string().max(300).optional(),
  }),
  ...serviceOperationSchemas,
};

/** Earlier operation names, still accepted so existing agents and SDKs keep working. They are not listed. */
export const publicOperationAliases: Record<string, keyof typeof publicOperationSchemas> = { discover: "find_tools", search_items: "search_tools" };
export const canonicalOperation = (name: string): string => Object.hasOwn(publicOperationAliases, name) ? publicOperationAliases[name]! : name;

export function publicOperationJsonSchema(name: keyof typeof publicOperationSchemas) {
  const schema = z.toJSONSchema(publicOperationSchemas[name], { io: "input" });
  return name === "cards" ? schema : {
    ...schema,
    properties: { ...schema.properties, cardId: {
      type: "string" as const, format: "uuid",
      description: "Card to use. Required when this connection has multiple cards. List cards first.",
    } },
  };
}

export const publicOperationDescriptions: Record<keyof typeof publicOperationSchemas, string> = {
  ...reportOperationDescriptions,
  ...managementOperationDescriptions,
  ...purchaseOperationDescriptions,
  cards: "List the cards this connection can use. Specify a returned cardId when checking balance, finding tools, quoting, or invoking with access to multiple cards.",
  find_tools: `Find allowed tools by provider, endpoint or capability. The first page returns up to ${discoveryFirstPageSize} matches. Follow cursor with the same query, provider and card for up to ${discoveryPageSize} more per page. MCP returns compact results. score measures keyword and capability relevance in raw points. works measures execution reliability (0–1) and needs at least five eligible outcomes. usable_rate measures how often calls returned usable output when o11 can classify it. Both use recent calls on shared o11 provider accounts. The top candidates are ordered by relevance, with usable output, reliability and fixed per-call price used to compare similar matches. Inspect endpoint_id for exact inputs, pricing terms and account requirements. Use format detailed for full discovery metadata. HTTP defaults to detailed.`,
  inspect: "Read a tool ID from search_tools or find_tools to check exact input locations, returned fields, pricing, effects, and account requirements before quote or invoke.",
  connections: "List the connected provider accounts available to this card. Credentials are never returned.",
  get_configuration: "Read the saved account choice and spending limits for an allowed tool.",
  balance: "Read wallet funds, this card's remaining allowance and spendable balance separately, in micro-USD.",
  topup_status: "Read the committed funding status for requestId in the selected card's wallet, without creating a checkout or contacting Stripe. Paid means the wallet credit was committed; pending is not payment confirmation.",
  topup_limits: "Read current one-time funding limits, checkout availability and the wallet billing URL without creating a checkout.",
  topup: "Request a one-time Stripe-hosted checkout to add USD credits to this selected card's wallet (500–100000 cents). The user completes payment in Stripe; no saved payment method is charged or changed. Reuse requestId and the same amount for retries. Funding does not increase card allowances.",
  call: "Call a tool using its discovered short ID and provider params. o11 quotes internally and applies existing card and allowance limits; no spending maximum or idempotency key is required. Use query/body/path for split inputs. Returns the result when the call finishes within 25 seconds. A call still running returns a pending receipt: call get_invocation with waitSeconds (up to 25) instead of polling. HTTP callers can send Prefer: wait=N (up to 120) to wait longer, or wait=0 to answer at once. Failures are returned without expanding permissions or retrying a purchase.",
  invoke: "Submit a tool call with an explicit spending maximum and a stable idempotency key.",
  get_invocation: "Retrieve this card's existing call by shortId (8 characters) or full UUID without executing it again, with its request (inputs, secrets redacted), state and output. Generated files are in result.media; fetch a ready file from its signed downloadUrl. Set waitSeconds (up to 25) to wait for a pending call to finish instead of polling.",
  list_invocations: "List this selected card's invocation summaries, newest first. Follow cursor with the same filters. Filter runId to recover one task, or parentId (a route or recipe call's full id) to list the calls it made; retrieve full results with get_invocation.",
  get_run: "Read wallet charges and outstanding reservations for this selected card's labeled run. When a call set runMaxMicros, ceiling shows the run's maximum, spent, held and remaining. External supplier charges may be unknown.",
  search_tools: "Search the tool index for one task described in words. Returns at most limit compact summaries (default 3); inspect the closest toolId first. Check match, category and alternatives; confident describes the task category, not certainty that a tool fits. Quality combines classified output, explicit ratings and a prior. Retain searchId for invoke. Use find_tools for a named provider or endpoint.",
  rate_result: "Rate whether a completed call's result was useful, with an optional short reason about the output.",
  quote: "Estimate the price of an allowed tool call without submitting it.",
  cancel: "Request cancellation of this card's call by shortId or full UUID. Cancellation is not guaranteed after supplier acceptance.",
  resources: "List services funded by this card. Requires service access.",
  list_resources: "List services funded by this card with provider, resourceType and state filters. Follow cursor with the same filters. Requires service access.",
  get_resource: "Read a service funded by this card, including its external identifier and renewal settings. Stored details only: live external-link joins are unsupported and reported explicitly. Requires service access.",
  list_resource_events: "Read service lifecycle events oldest first, with cursor pagination. Returns event metadata without private supplier evidence. Requires service access.",
  resource_events: "Read the event history of a service funded by this card. Requires service access.",
  release_resource: "Request release of a service and stop future renewals. Requires write and service access.",
  retry_resource: "Request another review of an owned service. Requires write and service access.",
  configure_resource: "Update renewal consent and charge limits for an owned service. Requires write and service access.",
};
