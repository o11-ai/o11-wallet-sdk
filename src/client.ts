import {
  parseReceipt,
  balanceSchema,
  discoverySchema,
  compactDiscoverySchema,
  type InvocationReceipt,
} from "./contracts/receipts.js";
import { z } from "zod";
import { publicOperationSchemas, topUpResultSchema, topUpLimitsSchema, topUpStatusSchema } from "./contracts/public-api.js";
import { reportOperationSchemas, reportDetailSchema, reportPageSchema } from "./contracts/reports.js";
import { agentPermissionsSchema, managementOperationSchemas } from "./contracts/agent-permissions.js";
import { purchaseRequestSchema, purchaseOperationSchemas, purchaseSummarySchema, purchaseDetailSchema } from "./contracts/purchases.js";
import { executionAccountSchema } from "./contracts/execution-account.js";
import { invocationReferenceSchema, invocationReferenceMatches, invocationHistoryInputSchema, invocationHistoryPageSchema, type InvocationHistoryInput } from "./contracts/invocation-lifecycle.js";
import { invocationRunInputSchema, invocationRunSchema } from "./contracts/invocation-run.js";
import { InvocationWaitTimeoutError, mediaWaitState, retryAfterMilliseconds, waitForInvocationReceipt, type InvocationWaitOptions } from "./invocation-wait.js";
export { InvocationWaitTimeoutError } from "./invocation-wait.js";
import { waitForTopUp, type TopUpWaitOptions } from "./topup-wait.js";
export { type TopUpStatus, type TopUpWaitOptions, type TopUpWaitResult } from "./topup-wait.js";
import { connectionSummarySchema } from "./contracts/provider-authorization.js";
import { ToolCallError, ToolClientError, TopUpRequestError, type TopUpFailureField } from "./client-errors.js";
export { ToolCallError, ToolClientError, TopUpRequestError } from "./client-errors.js";
import { serializedTokenProvider, TokenNotRenewableError, type AccessTokenProvider } from "./token-provider.js";
import { lostSubmission, streamToolCall, type StreamToolOptions } from "./call-streamed.js";
export { streamCall, CallStreamError, type CallStreamEvent, type CallStreamOptions } from "./call-stream.js";
export { serializedTokenProvider, type AccessTokenProvider } from "./token-provider.js";
import {
  toolDefinitionSchema,
  type InvocationOptions,
  type ToolInputOptions,
} from "./contracts/index.js";
export type { InvocationOptions, ToolInputOptions } from "./contracts/index.js";
export type { InvocationReceipt } from "./contracts/receipts.js";

/**
 * A route quote's plan: `order` is the providers a call made now would try, in that order; `compare` is one row per
 * provider in the same order (price, recorded calls, success and hit rates, answer time, checks passed). Present only when
 * the quoted tool is a route. Fields the server adds later are kept as sent.
 */
export const quoteRouteSchema = z.looseObject({
  capMicros: z.string().optional(), cheapestMicros: z.string().optional(), routeOrder: z.string().optional(),
  order: z.array(z.looseObject({ toolId: z.string(), vendor: z.string().optional(), quoteMicros: z.string(), free: z.boolean().optional(),
    hitRate: z.number().optional(), expectedCostMicros: z.string().optional() })).optional(),
  compare: z.array(z.looseObject({ toolId: z.string(), priceMicros: z.number(), priceBasis: z.string().optional(), calls: z.number(),
    successRate: z.number(), hitRate: z.number(), medianSeconds: z.number(), timedCalls: z.number().optional(),
    daysSinceLastSuccess: z.number().nullable().optional(),
    verified: z.object({ checked: z.number(), passed: z.number() }).nullable().optional() })).optional(),
  dropped: z.array(z.looseObject({ toolId: z.string(), why: z.string() })).optional(),
});
export type QuoteRoute = z.infer<typeof quoteRouteSchema>;

export type ToolCallOptions = z.input<typeof publicOperationSchemas.call>;
/** How long callTool and o11 call wait for a result by default. */
export const defaultCallWaitMs = 600_000;
/** waitMs: 0 answers at once; reattach: false stops after the first answer; onPending sees a running call's receipt. */
export type CallWaitOptions = { waitMs?: number; reattach?: boolean; onPending?: (receipt: InvocationReceipt) => void };
export class ToolClient {
  readonly runId: string;
  private readonly baseUrl: URL;
  private readonly tokenProvider?: AccessTokenProvider;
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey?: string;
      tokenProvider?: AccessTokenProvider;
      cardId?: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
      runId?: string;
      /** The partner customer a partner key acts for, sent as X-Customer. */
      customer?: string;
    },
  ) {
    this.runId = z.uuid().parse(options.runId ?? crypto.randomUUID());
    this.baseUrl = new URL(options.baseUrl);
    if (!options.apiKey && !options.tokenProvider) throw new Error("Supply a wallet API key or token provider");
    this.tokenProvider = options.tokenProvider ? serializedTokenProvider(options.tokenProvider) : undefined;
    if (this.baseUrl.username || this.baseUrl.password || this.baseUrl.search || this.baseUrl.hash)
      throw new Error("Use a wallet origin without credentials, query parameters, or a fragment");
    if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0))
      throw new Error("timeoutMs must be a positive number");
    if (
      this.baseUrl.protocol !== "https:" &&
      !(
        this.baseUrl.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(this.baseUrl.hostname)
      )
    )
      throw new Error("Use HTTPS for o11 API access");
  }
  /** The wallet this client talks to. A batch journal records it, so its keys are never replayed against another wallet. */
  get origin() { return this.baseUrl.origin; }
  /** Wallets released before the rename answer 404 for find_tools; retry once as discover. Hidden search_tools also answers 404, so it is not retried. */
  private async renamedCall(operation: string, legacy: string, input: unknown) {
    try { return await this.call(operation, input); } catch (error) {
      if (!(error instanceof ToolClientError) || error.status !== 404) throw error;
      return this.call(legacy, input);
    }
  }
  private async call(operation: string, input: unknown, timeoutMs = this.options.timeoutMs ?? 30_000, signal = AbortSignal.timeout(Math.ceil(timeoutMs)), extraHeaders: Record<string, string> = {}): Promise<unknown> {
    const clientCallId = crypto.randomUUID();
    const body = JSON.stringify(operation === "cards" ? input : { ...(input as Record<string, unknown>), ...(this.options.cardId ? { cardId: this.options.cardId } : {}) });
    let token = this.tokenProvider ? await this.tokenProvider.getAccessToken() : this.options.apiKey!;
    if (!token || /[\r\n]/.test(token)) throw new Error("The wallet token provider returned an invalid token");
    const send = () => (this.options.fetch ?? fetch)(
      new URL(`/v1/${operation}`, this.baseUrl),
      {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-o11-run-id": this.runId,
          "x-o11-call-id": clientCallId,
          ...(this.options.customer ? { "X-Customer": this.options.customer } : {}),
          ...extraHeaders,
        },
        body,
      },
    );
    let response = await send();
    // A wallet 401 precedes execution. Preserve the exact body and idempotency key on this one retry.
    if (response.status === 401 && this.tokenProvider?.refreshAccessToken) {
      // A key that cannot refresh keeps the server's 401: a definite refusal, not an uncertain submission.
      const renewed = await this.tokenProvider.refreshAccessToken(token)
        .catch((error: unknown) => { if (error instanceof TokenNotRenewableError) return undefined; throw error; });
      if (renewed !== undefined) {
        await response.body?.cancel();
        token = renewed;
        if (!token || /[\r\n]/.test(token)) throw new Error("The wallet token provider returned an invalid token");
        response = await send();
      }
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      if (response.ok) throw new Error("The wallet returned invalid JSON");
      result = { error: "INVALID_RESPONSE" };
    }
    if (!response.ok) throw new ToolClientError(response.status, result, retryAfterMilliseconds(response.headers.get("retry-after")));
    return result;
  }
  withCard(cardId: string) { return new ToolClient({ ...this.options, runId: this.runId, ...(this.tokenProvider ? { tokenProvider: this.tokenProvider } : {}), cardId: z.uuid().parse(cardId) }); }
  async doctor() {
    const cards = await this.cards();
    if (!cards.items.length) return { connected: true as const, cards, ready: false, message: "Saved access works, but no cards are available. Create or approve a card in your wallet." };
    const cardId = this.options.cardId ?? (cards.items.length === 1 ? cards.items[0]!.id : undefined);
    if (!cardId) return { connected: true as const, cards, chooseCard: true as const };
    const selected = this.withCard(cardId);
    try {
      const balance = await selected.balance();
      const checked = { connected: true as const, cards, cardId, balance };
      if (balance.status !== "active" || balance.spending?.mode === "blocked")
        return { ...checked, ready: false, readinessKnown: true,
          message: "Saved access works, but wallet or allowance controls block spending. Review the wallet and this card’s parent allowance." };
      if (balance.execution?.ready === false)
        return { ...checked, ready: false, readinessKnown: true,
          message: "Saved access works, but this server’s execution runtime is not ready for this connection. Ask the operator to upgrade the runtime, then run doctor again." };
      const discovery = await selected.findTools("");
      if (!discovery.items.length && discovery.access && discovery.access.availableToolCount > 0)
        return { ...checked, ready: false, readinessKnown: false, access: discovery.access,
          message: "Saved access works, but discovery returned no tools despite its availability count. Inspect an allowed tool before relying on readiness." };
      const available = discovery.access ? discovery.access.availableToolCount > 0 : discovery.items.length > 0;
      if (!available) return { ...checked, ready: false, readinessKnown: true, access: discovery.access,
        message: "Saved access works, but this card has no available tools. Review its tool permissions in the wallet." };
      if (!balance.execution) return { ...checked, readinessKnown: false, access: discovery.access,
        message: "Saved access and discovery work. This server does not report execution readiness; ask its operator to update diagnostics before relying on this check." };
      if (!balance.spending) return { ...checked, readinessKnown: false, access: discovery.access,
        message: "Saved access and discovery work. This server does not report spending eligibility; quote the selected tool to check its controls." };
      return { ...checked, ready: true, readinessKnown: true, access: discovery.access,
        ...(balance.spending.mode === "free_only" ? { message: "Only zero-cost calls fit the current funds and allowance. Paid calls need funds or more allowance." } : {}) };
    } catch (error) {
      if (!(error instanceof ToolClientError) || ![403, 404, 412].includes(error.status)) throw error;
      return { connected: true as const, cards, cardId, ready: false,
        message: "Saved access works, but card permissions or spending controls block use. Review the card and its parent allowance in the wallet.",
        status: error.status, ...(error.authorization ? { authorization: error.authorization } : {}) };
    }
  }
  async connectionPermissions() {
    return z.object({ permissions: agentPermissionsSchema, issuingBudgetId: z.uuid().nullable() }).parse(await this.call("connection_permissions", {}));
  }
  async createCard(input: z.input<typeof managementOperationSchemas.create_card>) {
    return z.object({ id: z.uuid(), created: z.boolean() }).parse(await this.call("create_card", managementOperationSchemas.create_card.parse(input)));
  }
  async updateCard(input: z.input<typeof managementOperationSchemas.update_card>) {
    // Servers before the card echo return only the id.
    return z.object({ id: z.uuid(), name: z.string().optional(), status: z.string().optional(), limitMicros: z.string().optional() })
      .parse(await this.call("update_card", managementOperationSchemas.update_card.parse(input)));
  }
  async apiKeys(cursor?: string) { return this.call("api_keys", { cursor }); }
  async createApiKey(input: z.input<typeof managementOperationSchemas.create_api_key>) {
    return z.object({ id: z.uuid(), token: z.string().nullable(), created: z.boolean() }).parse(await this.call("create_api_key", managementOperationSchemas.create_api_key.parse(input)));
  }
  async revokeApiKey(id: string) { return this.call("revoke_api_key", { id: z.uuid().parse(id) }); }
  async cards(cursor?: string) {
    return z.object({ items: z.array(z.object({ id: z.uuid(), name: z.string(), walletId: z.uuid(), walletName: z.string(), status: z.string(), expiresAt: z.string().nullable() })), cursor: z.string().optional() }).parse(await this.call("cards", { cursor }));
  }
  async findTools(
    query: string,
    options?: { cursor?: string; provider?: string; limit?: number },
  ) {
    const limit = options?.limit === undefined ? {} : { limit: publicOperationSchemas.find_tools.shape.limit.parse(options.limit) };
    return discoverySchema.parse(
      await this.renamedCall("find_tools", "discover", { query, ...options, ...limit }),
    );
  }
  /** @deprecated Use findTools. */
  async discover(query: string, options?: { cursor?: string; provider?: string; limit?: number }) { return this.findTools(query, options); }
  async inspect(id: string) {
    return toolDefinitionSchema.parse(await this.call("inspect", { id }));
  }
  async findToolsCompact(query: string, options?: { cursor?: string; provider?: string; limit?: number }) {
    const input = publicOperationSchemas.find_tools.parse({ query, ...options, format: "compact" });
    return compactDiscoverySchema.parse(await this.renamedCall("find_tools", "discover", input));
  }
  /** Provider keys for find_tools' provider filter, from the wallet's public catalog listing (no key needed). */
  async providers() {
    const response = await (this.options.fetch ?? fetch)(new URL("/api/catalog/providers", this.baseUrl), {
      redirect: "error", signal: AbortSignal.timeout(Math.ceil(this.options.timeoutMs ?? 30_000)) });
    let result: unknown;
    try { result = await response.json(); } catch { result = { error: "INVALID_RESPONSE" }; }
    if (!response.ok) throw new ToolClientError(response.status, result);
    const rows = z.array(z.object({ provider: z.string(), name: z.string().nullable(), availableCount: z.number() })).parse(result);
    return { providers: rows.filter(row => row.availableCount > 0)
      .map(row => ({ provider: row.provider, name: row.name ?? row.provider, tools: row.availableCount }))
      .sort((a, b) => a.provider.localeCompare(b.provider)) };
  }
  /** @deprecated Use findToolsCompact. */
  async discoverCompact(query: string, options?: { cursor?: string; provider?: string; limit?: number }) { return this.findToolsCompact(query, options); }
  async searchTools(input: z.input<typeof publicOperationSchemas.search_tools>) {
    return this.call("search_tools", publicOperationSchemas.search_tools.parse(input));
  }
  /** @deprecated Use searchTools. */
  async searchItems(input: z.input<typeof publicOperationSchemas.search_tools>) { return this.searchTools(input); }
  async createReport(input: z.input<typeof reportOperationSchemas.create_report>) {
    return reportDetailSchema.parse(await this.call("create_report", reportOperationSchemas.create_report.parse(input)));
  }
  async report(id: string, options: { historyCursor?: string } = {}) {
    return reportDetailSchema.parse(await this.call("get_report", reportOperationSchemas.get_report.parse({ id, ...options })));
  }
  async reports(input: z.input<typeof reportOperationSchemas.list_reports> = {}) {
    return reportPageSchema.parse(await this.call("list_reports", reportOperationSchemas.list_reports.parse(input)));
  }
  async addReportInfo(input: z.input<typeof reportOperationSchemas.add_report_info>) {
    return reportDetailSchema.parse(await this.call("add_report_info", reportOperationSchemas.add_report_info.parse(input)));
  }
  async connections(provider?: string) {
    return z
      .array(
        connectionSummarySchema.partial().required({ id: true, provider: true, name: true }),
      )
      .parse(await this.call("connections", { provider }));
  }
  async configuration(id: string) {
    return z
      .object({
        enabled: z.boolean(),
        credentialMode: z.enum(["platform", "customer"]),
        connectionId: z.string().nullable(),
        maximumMicros: z.string(),
        dailyLimitMicros: z.string().nullable(),
      })
      .nullable()
      .parse(await this.call("get_configuration", { id }));
  }
  async balance() {
    return balanceSchema.parse(await this.call("balance", {}));
  }
  async topUpLimits() {
    return topUpLimitsSchema.parse(await this.call("topup_limits", {}));
  }
  async topUpStatus(requestId: string, options: { signal?: AbortSignal } = {}) {
    const input = publicOperationSchemas.topup_status.parse({ requestId });
    const response = await this.call("topup_status", input, undefined, options.signal);
    const parsed = topUpStatusSchema.safeParse(response);
    if (!parsed.success) {
      const allowed = new Set<TopUpFailureField>(["requestId", "walletId", "cardId", "amountMicros", "currency", "status", "url"]);
      const fields = [...new Set(parsed.error.issues.flatMap(issue =>
        typeof issue.path[0] === "string" && allowed.has(issue.path[0] as TopUpFailureField) ? [issue.path[0] as TopUpFailureField] : []))];
      throw new TopUpRequestError(requestId, parsed.error, { reason: "INVALID_CHECKOUT_RESPONSE", fields });
    }
    const status = parsed.data;
    const fields: TopUpFailureField[] = [];
    if (status.requestId !== requestId) fields.push("requestId");
    if (this.options.cardId && status.cardId !== this.options.cardId) fields.push("cardId");
    if (fields.length) throw new TopUpRequestError(requestId, new Error("The payment status does not match this request"),
      { reason: "CHECKOUT_MISMATCH", fields });
    return status;
  }
  async waitForTopUp(requestId: string, options: TopUpWaitOptions = {}) {
    publicOperationSchemas.topup_status.parse({ requestId });
    return waitForTopUp(requestId, signal => this.topUpStatus(requestId, { signal }), options);
  }
  async topUp(amountCents: number, requestId: string = crypto.randomUUID()) {
    const input = publicOperationSchemas.topup.parse({ amountCents, requestId });
    try {
      const result = topUpResultSchema.parse(await this.call("topup", input));
      const fields: TopUpFailureField[] = [];
      if (result.requestId !== input.requestId) fields.push("requestId");
      if (result.amountMicros !== (BigInt(input.amountCents) * 10_000n).toString()) fields.push("amountMicros");
      if (this.options.cardId && result.cardId !== this.options.cardId) fields.push("cardId");
      if (fields.length) throw new TopUpRequestError(input.requestId, new Error("The checkout does not match this request"),
        { reason: "CHECKOUT_MISMATCH", fields });
      return result;
    } catch (error) {
      if (error instanceof TopUpRequestError) throw error;
      if (error instanceof z.ZodError) {
        const allowed = new Set<TopUpFailureField>(["requestId", "walletId", "cardId", "amountMicros", "currency", "status", "url"]);
        const fields = [...new Set(error.issues.flatMap(issue =>
          typeof issue.path[0] === "string" && allowed.has(issue.path[0] as TopUpFailureField) ? [issue.path[0] as TopUpFailureField] : []))];
        throw new TopUpRequestError(input.requestId, error, { reason: "INVALID_CHECKOUT_RESPONSE", fields });
      }
      const reason = error instanceof ToolClientError ? "HTTP_ERROR"
        : error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name) ? "TIMEOUT"
        : error instanceof TypeError ? "NETWORK_ERROR" : "REQUEST_FAILED";
      throw new TopUpRequestError(input.requestId, error, { reason });
    }
  }
  async purchase(request: z.input<typeof purchaseRequestSchema>) {
    return purchaseSummarySchema.parse(await this.call("purchase", purchaseRequestSchema.parse(request)));
  }
  async getPurchase(id: string) { return purchaseDetailSchema.parse(await this.call("get_purchase", { id })); }
  async purchases(cursor?: string) {
    return z.object({ items: z.array(purchaseSummarySchema), cursor: z.string().optional() }).parse(await this.call("list_purchases", { cursor }));
  }
  async resumePurchase(input: z.input<typeof purchaseOperationSchemas.resume_purchase>) {
    return purchaseSummarySchema.parse(await this.call("resume_purchase", purchaseOperationSchemas.resume_purchase.parse(input)));
  }
  async cancelPurchase(id: string) { return purchaseSummarySchema.parse(await this.call("cancel_purchase", { id })); }
  async purchaseDocument(id: string, documentId: string) {
    return z.object({ url: z.url(), expiresAt: z.iso.datetime() }).parse(await this.call("purchase_document", { id, documentId }));
  }
  async invoke(request: InvocationOptions & { searchId?: string; runId?: string }) {
    return parseReceipt(
      await this.call("invoke", publicOperationSchemas.invoke.parse(request)),
    );
  }
  /**
   * Resolves with the finished receipt. The wallet holds the request while the call runs; if it answers pending, the
   * client re-attaches to the same call (get_invocation held open on the server, no client sleeps) until it finishes or
   * waitMs ends (default 10 minutes), then returns the latest receipt, which can still be pending. waitMs: 0 returns
   * the first receipt at once. onPending runs once, with the pending receipt, before the client re-attaches.
   * reattach: false returns the pending receipt after the first hold, for callers that read the call themselves.
   */
  async callTool(request: ToolCallOptions, options: CallWaitOptions = {}) {
    const input = publicOperationSchemas.call.parse({ ...request, idempotencyKey: request.idempotencyKey ?? crypto.randomUUID() });
    const waitMs = options.waitMs ?? defaultCallWaitMs;
    if (!Number.isFinite(waitMs) || waitMs < 0) throw new Error("waitMs must be 0 or a positive number");
    const started = performance.now();
    // The first hold is at most 60 s, so the pending receipt (and its ID) arrives before a typical 120 s shell timeout.
    // A provider attempt already running in this request can answer later, so the deadline stays long.
    const waitSeconds = Math.min(60, Math.floor(waitMs / 1000));
    const idempotencyKey = input.idempotencyKey!;
    let receipt: InvocationReceipt | undefined;
    for (let attempt = 0; !receipt; attempt++) {
      try {
        // wait=0 also matters: newer wallets hold a call without the header. The key travels in the body and the header.
        receipt = parseReceipt(await this.call('call', input, waitSeconds > 0
          ? Math.max(180_000, (this.options.timeoutMs ?? 30_000) + waitSeconds * 1000) : undefined, undefined,
          { Prefer: `wait=${waitSeconds}`, 'Idempotency-Key': idempotencyKey }));
      } catch (error) {
        // A cut connection or a client timeout leaves the submission unknown. Sending the identical body with the same key
        // again returns the existing call (held like the first request), never a second charge. Server answers are final.
        if (attempt < 2 && lostSubmission(error)) { await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); continue; }
        throw new ToolCallError(idempotencyKey, error);
      }
    }
    return this.finishCall(receipt, idempotencyKey, waitMs - (performance.now() - started), options);
  }
  /** Like callTool, but progress events reach onEvent as they happen; see streamToolCall. */
  async streamTool(request: ToolCallOptions, options: StreamToolOptions = {}) {
    const input = publicOperationSchemas.call.parse({ ...request, idempotencyKey: request.idempotencyKey ?? crypto.randomUUID() });
    return streamToolCall({ baseUrl: this.baseUrl, fetch: this.options.fetch, apiKey: this.options.apiKey, tokenProvider: this.tokenProvider,
      runId: this.runId, customer: this.options.customer, read: id => this.getInvocation(id),
      finish: (receipt, key, remaining) => this.finishCall(receipt, key, remaining, options) },
    { ...input, ...(this.options.cardId ? { cardId: this.options.cardId } : {}) }, input.idempotencyKey!, options.waitMs ?? defaultCallWaitMs, options);
  }
  /** A receipt still running when its first answer came back is read until it finishes or the wait ends. */
  private async finishCall(receipt: InvocationReceipt, idempotencyKey: string, remaining: number, options: CallWaitOptions) {
    const running = ['queued', 'executing', 'waiting'].includes(receipt.state) ||
      receipt.state === 'succeeded' && mediaWaitState(receipt.result) === 'pending';
    if (!running || remaining < 1 || options.reattach === false) return { ...receipt, idempotencyKey };
    options.onPending?.(receipt);
    // The call exists now, so a failed read returns its pending receipt rather than a resubmission hint.
    const waited = await this.invocationWait(receipt.id, { timeoutMs: remaining, holdSeconds: receipt.wait?.waitSeconds })
      .catch(() => undefined);
    return { ...(waited?.receipt ?? receipt), idempotencyKey };
  }
  async getInvocation(id: string) {
    const reference = invocationReferenceSchema.parse(id);
    const receipt = parseReceipt(await this.call("get_invocation", { id: reference }));
    if (!invocationReferenceMatches(reference, receipt.id)) throw new Error("Status response belongs to a different invocation");
    return receipt;
  }
  async invocationHistory(input: InvocationHistoryInput = {}) {
    return invocationHistoryPageSchema.parse(await this.call("list_invocations", invocationHistoryInputSchema.parse(input)));
  }
  async runSummary(runId: string) { return invocationRunSchema.parse(await this.call("get_run", invocationRunInputSchema.parse({ runId }))); }
  private invocationWait(id: string, options: InvocationWaitOptions) {
    let resolved = invocationReferenceSchema.parse(id);
    return waitForInvocationReceipt(resolved, async (timeout, signal, waitSeconds) => {
      // waitSeconds: the server holds the read until the call changes (get_invocation long-poll), so no client sleep.
      const receipt = parseReceipt(await this.call("get_invocation", { id: resolved, ...(waitSeconds ? { waitSeconds } : {}) }, timeout, signal));
      if (!invocationReferenceMatches(resolved, receipt.id)) throw new Error("Status response belongs to a different invocation");
      resolved = receipt.id;
      return receipt;
    }, options, {
      requestTimeoutMs: this.options.timeoutMs,
      classifyError: error => ({
        retryable: error instanceof ToolClientError && (error.status === 429 || error.status >= 500 && error.status <= 599) ||
          error instanceof TypeError || error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name),
        retryAfterMs: error instanceof ToolClientError ? error.retryAfterMs : undefined,
      }),
    });
  }
  async waitForInvocationResult(id: string, options: InvocationWaitOptions = {}) {
    const { lastReadError: _lastReadError, ...result } = await this.invocationWait(id, options);
    const quote = (value: string) => /^[a-zA-Z0-9_-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
    const card = this.options.cardId ? ` --card ${quote(this.options.cardId)}` : '';
    return { ...result, resumeCommand: `o11 status ${result.invocationId}${card}` };
  }
  async waitForInvocation(
    id: string,
    options: InvocationWaitOptions = {},
  ): Promise<InvocationReceipt> {
    const result = await this.invocationWait(id, options);
    if (result.receipt) return result.receipt;
    throw new InvocationWaitTimeoutError(id, result.lastReadError);
  }
  async quote(toolId: string, input: ToolInputOptions,
    options: { credentialMode?: "platform" | "customer"; connectionId?: string; maxCostMicros?: string } = {},
  ) {
    return z
      .object({ estimatedMicros: z.string(), typicalMicros: z.string().optional(), variable: z.boolean(),
        quoteContext: z.string().regex(/^[a-f0-9]{64}$/).optional(), executionAccount: executionAccountSchema.optional(),
        credentialMode: z.enum(["platform", "customer"]).optional(), chargeBasis: z.string().optional(),
        maximumMicros: z.string().optional(), route: quoteRouteSchema.optional(),
        // Wallets before the range fields omit them.
        priceText: z.string().optional(), priceMinMicros: z.string().optional(), priceMaxMicros: z.string().optional(),
        priceAvgMicros: z.string().nullable().optional(), priceAvgN: z.number().nullable().optional() })
      .parse(await this.call("quote", { toolId, input, ...options }));
  }
  cancel(id: string) {
    return this.call("cancel", { id });
  }
  /** Record whether a completed call's result was useful; it ranks providers and never changes billing. */
  rateResult(input: z.input<typeof publicOperationSchemas.rate_result>) {
    return this.call("rate_result", publicOperationSchemas.rate_result.parse(input));
  }
  resources() {
    return this.call("resources", {});
  }
  listResources(input: z.input<typeof publicOperationSchemas.list_resources> = {}) {
    return this.call("list_resources", publicOperationSchemas.list_resources.parse(input));
  }
  getResource(id: string, includeExternal = true) {
    return this.call("get_resource", publicOperationSchemas.get_resource.parse({ id, includeExternal }));
  }
  listResourceEvents(id: string, input: Omit<z.input<typeof publicOperationSchemas.list_resource_events>, "id"> = {}) {
    return this.call("list_resource_events", publicOperationSchemas.list_resource_events.parse({ ...input, id }));
  }
  resourceEvents(id: string) {
    return this.call("resource_events", { id });
  }
  releaseResource(id: string) {
    return this.call("release_resource", { id });
  }
  retryResource(id: string) {
    return this.call("retry_resource", { id });
  }
  configureResource(
    id: string,
    autoRenew: boolean,
    maxPeriodChargeMicros: string,
    inboundInvocationLimitMicros?: string,
  ) {
    return this.call("configure_resource", {
      id,
      autoRenew,
      maxPeriodChargeMicros,
      inboundInvocationLimitMicros,
    });
  }
}
