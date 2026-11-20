import { z } from "zod";
import { sandboxRequestSchema } from "./sandboxes.js";
import { invocationSchema, inputSchema, moneySchema } from "./index.js";
import { purchaseOperationSchemas, purchaseOperationDescriptions } from "./purchases.js";
import { managementOperationSchemas, managementOperationDescriptions } from "./agent-permissions.js";
import { reportOperationSchemas, reportOperationDescriptions } from "./reports.js";
import { invocationHistoryInputSchema, invocationReferenceSchema, maxInvocationHoldSeconds } from "./invocation-lifecycle.js";
import { invocationRunInputSchema } from "./invocation-run.js";

const id = z.strictObject({ id: z.string().uuid() });
/**
 * Why a result was not useful. `wrong`: about another person or company. `inaccurate`: the right one, wrong details.
 * `missing_fields`: requested fields absent; `fields` names them. `off_target`: not what was asked for.
 */
export const resultRatingIssues = ["empty", "wrong", "inaccurate", "stale", "missing_fields", "off_target"] as const;
export type ResultRatingIssue = typeof resultRatingIssues[number];
export const maxRatingsPerBatch = 50;
/** One rating of one completed call. An issue applies only to a result that was not useful. */
export const resultRatingSchema = z.strictObject({
  invocationId: invocationReferenceSchema,
  useful: z.boolean(),
  issue: z.enum(resultRatingIssues).optional().describe("Only when useful is false: empty, wrong (another person or company), inaccurate (right one, wrong details), stale, missing_fields or off_target."),
  fields: z.array(z.string().trim().min(1).max(100)).min(1).max(20).optional().describe("Output fields that were wrong or missing."),
  reason: z.string().max(300).optional(),
}).refine(rating => rating.useful === false || rating.issue === undefined && rating.fields === undefined,
  { message: "issue and fields apply only when useful is false", path: ["issue"] });
/** Why `rate_results` did not store one rating. The other ratings in the call are unaffected. */
export const ratingRejections = ["not_found", "not_completed", "ambiguous_reference", "duplicate"] as const;
export type RatingRejection = typeof ratingRejections[number];

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
  sandbox: sandboxRequestSchema,
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
  inspect: z.strictObject({ id: z.string(), format: z.enum(["compact", "detailed"]).optional()
    .describe("o11.* routes only. Omitted or detailed returns the full inspection. Compact returns about a third of it: each route option's first sentence and each provider's price, calls, hit rate and median time, without its call history.") }),
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
    waitSeconds: z.number().int().min(0).max(maxInvocationHoldSeconds).optional()
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
  rate_result: resultRatingSchema,
  rate_results: z.strictObject({
    ratings: z.array(resultRatingSchema).min(1).max(maxRatingsPerBatch)
      .describe(`Up to ${maxRatingsPerBatch} ratings, one per call. Each is accepted or rejected on its own.`),
  }),
  ...serviceOperationSchemas,
};

/** Earlier operation names, still accepted so existing agents and SDKs keep working. They are not listed. */
export const publicOperationAliases: Record<string, keyof typeof publicOperationSchemas> = { discover: "find_tools", search_items: "search_tools" };
export const canonicalOperation = (name: string): string => Object.hasOwn(publicOperationAliases, name) ? publicOperationAliases[name]! : name;

export function publicOperationJsonSchema(name: keyof typeof publicOperationSchemas) {
  const schema = z.toJSONSchema(publicOperationSchemas[name], { io: "input" });
  return name === "cards" ? schema : withCardId(schema);
}
function withCardId<S extends { properties?: Record<string, unknown> }>(schema: S) {
  return {
    ...schema,
    properties: { ...schema.properties, cardId: {
      type: "string" as const, format: "uuid",
      description: "Card to use. Required when this connection has multiple cards. List cards first.",
    } },
  };
}

/**
 * MCP only: several independent `call`s in one request, so they run at once even where a client runs non-read-only
 * tools one at a time. Each element is exactly `call`'s input and is admitted, limited and billed as its own call.
 */
export const callManyToolName = "call_many";
export const maxCallsPerBatch = 10;
export const callManySchema = z.strictObject({
  calls: z.array(publicOperationSchemas.call).min(1).max(maxCallsPerBatch)
    .describe(`1 to ${maxCallsPerBatch} calls, each with exactly call's fields.`),
});
export const callManyJsonSchema = () => withCardId(z.toJSONSchema(callManySchema, { io: "input" }));
export const callManyDescription = `Run up to ${maxCallsPerBatch} independent calls at once, such as 10 email finds, instead of separate calls: {"calls":[{"tool":"...","params":{...}},...]}. Each element takes call's fields and is limited and billed as its own call. Results come back in order in one response, each a call result or error, so batch small results (email finds, verifications, metrics) and call tools with large records (company or profile enrichment, search pages) separately. One still running after 45 seconds returns a pending receipt: send one get_invocation per pending id in the same turn, with the receipt's waitSeconds.`;

export const publicOperationDescriptions: Record<keyof typeof publicOperationSchemas, string> = {
  sandbox: "Create and manage E2B, Boat or Vercel sandboxes through o11. Use help for command schemas and operation with requestId for recovery. A connected supplier account pays its provider directly; without one, where o11 turns it on, the sandbox runs on o11's account and is paid from the wallet.",
  ...reportOperationDescriptions,
  ...managementOperationDescriptions,
  ...purchaseOperationDescriptions,
  cards: "List the cards this connection can use. Specify a returned cardId when checking balance, finding tools, quoting, or invoking with access to multiple cards.",
  find_tools: `Step 1 of 3: find_tools, then inspect the chosen id, then call it. Finds the tools this card allows for any external capability: web search, scrape or fetch a web page, people and work email lookup, phone, company data, SEO and backlinks, social media, media generation and more. Check the user's own dedicated tools first. Search one capability at a time with short terms such as "company search", "people search" or "email verification"; for a named provider pass provider, for a given endpoint or tool id inspect it directly, and keep entity filters such as location for the tool's input. The first page returns up to ${discoveryFirstPageSize} matches; follow cursor with the same query, provider and card for up to ${discoveryPageSize} more. Work from a shortlist of three: inspect the closest match first rather than every result or every provider guide. On empty or unsuitable results, simplify the query, try singular or plural, or use the provider filter; check access diagnostics and card permissions before concluding a capability is absent, and never broaden permissions, enable the index or swap a named provider to recover. Results are ordered by relevance, with usable output, reliability and fixed per-call price comparing similar matches; order does not prove fit or the lowest price. score is raw keyword and capability relevance; works is execution reliability (0-1, from at least five recent outcomes); usable_rate is how often calls returned usable output. MCP returns compact results; format detailed returns full discovery metadata (HTTP default).`,
  inspect: "Step 2 of 3: read a tool id from find_tools to get its exact inputs, route options, returned fields, price, billing units, effects, recurring status and account requirements; then call it. Choose on availability, account needs and effects, not search order. For bulk lead enrichment or work email with an open provider, compare two compatible tools on usable results, check whether misses cost money, and test a small sample before the full list; for work email, check the address belongs to the requested company domain and track verification separately.",
  connections: "List the connected provider accounts available to this card. Credentials are never returned.",
  get_configuration: "Read the saved account choice and spending limits for an allowed tool.",
  balance: "Read wallet funds, this card's remaining allowance and spendable balance separately, in micro-USD.",
  topup_status: "Read the committed funding status for requestId in the selected card's wallet, without creating a checkout or contacting Stripe. Paid means the wallet credit was committed; pending is not payment confirmation.",
  topup_limits: "Read current one-time funding limits, checkout availability and the wallet billing URL without creating a checkout.",
  topup: "Request a one-time Stripe-hosted checkout to add USD credits to this selected card's wallet (500–100000 cents). The user completes payment in Stripe; no saved payment method is charged or changed. Reuse requestId and the same amount for retries. Funding does not increase card allowances.",
  call: "Step 3 of 3: run the inspected tool and get its result inline as JSON. Over MCP, run several independent calls at once (such as 10 email finds) with call_many. Example: {\"tool\":\"o11.people.email.find\",\"params\":{\"full_name\":\"Jane Doe\",\"domain\":\"example.com\",\"route\":{\"verify\":true}}}. Fields go at the top level of params; route options go under params.route. Use query/body/path only when the inspected input needs those locations. o11 places inputs, quotes internally and applies the card's spending and permission limits; no spending maximum or idempotency key is needed (optional maxCostMicros lowers the ceiling; USD 1 = 1000000 micros). Platform credentials are the default; use credentialMode customer only with a connectionId the user chose. Set allowWrite or acceptRecurring only when the user authorized that effect; card write and recurring permissions still apply. Never put supplier keys in params. Keep the returned invocation id and idempotencyKey; reuse the key with identical inputs only for an uncertain retry. Over MCP a call still running after 45 seconds (HTTP: 25) returns a pending receipt: then call get_invocation with its id and the receipt's waitSeconds, never a new call. HTTP callers can send Prefer: wait=N (up to 120) or wait=0. Errors: retryable false fails the same way again, so change the input or tool; UNAVAILABLE or BUSY with retryable true can be retried with the same idempotencyKey and inputs; FORBIDDEN and NOT_CONFIGURED clear after a reconnect, card or funding change, or review. Failures are returned without expanding permissions or retrying a purchase.",
  invoke: "Advanced: submit a tool call with an explicit spending maximum and a stable idempotency key; preserve the key, maximum and any quoteContext. Prefer call.",
  get_invocation: "Retrieve this card's existing call by shortId (8 characters) or full UUID without executing it again, with its request (inputs, secrets redacted), state and output. Generated files are in result.media; fetch a ready file from its signed downloadUrl. Set waitSeconds (up to 25) to wait for a pending call to finish instead of polling.",
  list_invocations: "List this selected card's invocation summaries, newest first. Follow cursor with the same filters. Filter runId to recover one task, or parentId (a route or recipe call's full id) to list the calls it made; retrieve full results with get_invocation.",
  get_run: "Read wallet charges and outstanding reservations for this selected card's labeled run. When a call set runMaxMicros, ceiling shows the run's maximum, spent, held and remaining. External supplier charges may be unknown.",
  search_tools: "Search the tool index for one task, written as the user's goal in one plain sentence. Returns at most limit compact summaries (default 3); inspect the closest toolId first. Check match, category and alternatives; confident describes the task category, not certainty that a tool fits. Quality combines classified output, explicit ratings and a prior. Retain searchId for invoke. Use find_tools for a named provider or endpoint.",
  rate_result: "Rate one completed call's result: useful or not, an issue type when it was not, and an optional short reason about the output. Use rate_results for several calls.",
  rate_results: `Rate up to ${maxRatingsPerBatch} completed calls in one request, for example after a long turn. Rating is optional, but always flag a bad result you used as not useful with its issue: empty, wrong (another person or company), inaccurate, stale, missing_fields (name the fields) or off_target. You may rate good results useful. Rate only results you used, without asking the user; keep reasons about the output, with no private data (CLI 0.1.53+: o11 rate ID not-useful --issue empty ID2 useful). Each rating is accepted or rejected on its own, is checked against o11's own evidence before it ranks providers, and never changes billing.`,
  quote: "Estimate the price of an allowed tool call without submitting it. call quotes internally, so use this only to price without running.",
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
