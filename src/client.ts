import {
  parseReceipt,
  balanceSchema,
  discoverySchema,
  compactDiscoverySchema,
  type InvocationReceipt,
} from "./contracts/receipts.js";
import { z } from "zod";
import { publicOperationSchemas, topUpResultSchema, topUpLimitsSchema } from "./contracts/public-api.js";
import { reportOperationSchemas, reportDetailSchema, reportPageSchema } from "./contracts/reports.js";
import { agentPermissionsSchema, managementOperationSchemas } from "./contracts/agent-permissions.js";
import { purchaseRequestSchema, purchaseOperationSchemas, purchaseSummarySchema, purchaseDetailSchema } from "./contracts/purchases.js";
import { executionAccountSchema } from "./contracts/execution-account.js";
import { invocationReferenceSchema, invocationReferenceMatches, invocationHistoryInputSchema, invocationHistoryPageSchema, type InvocationHistoryInput } from "./contracts/invocation-lifecycle.js";
import { invocationRunInputSchema, invocationRunSchema } from "./contracts/invocation-run.js";
import { InvocationWaitTimeoutError, retryAfterMilliseconds, waitForInvocationReceipt, type InvocationWaitOptions } from "./invocation-wait.js";
export { InvocationWaitTimeoutError } from "./invocation-wait.js";
import { authorizationRemediationSchema, connectionSummarySchema, type AuthorizationRemediation } from "./contracts/provider-authorization.js";
import { serializedTokenProvider, type AccessTokenProvider } from "./token-provider.js";
export { serializedTokenProvider, type AccessTokenProvider } from "./token-provider.js";
import {
  toolDefinitionSchema,
  type InvocationOptions,
  type ToolInputOptions,
} from "./contracts/index.js";
export type { InvocationOptions, ToolInputOptions } from "./contracts/index.js";
export type { InvocationReceipt } from "./contracts/receipts.js";

export class ToolClientError extends Error {
  readonly authorization?: AuthorizationRemediation;
  constructor(
    public readonly status: number,
    public readonly response: unknown,
    public readonly retryAfterMs?: number,
  ) {
    super(`o11 returned HTTP ${status}`);
    this.name = "ToolClientError";
    const parsed = typeof response === "object" && response !== null && "authorization" in response
      ? authorizationRemediationSchema.safeParse(response.authorization) : undefined;
    if (parsed?.success) this.authorization = parsed.data;
  }
}
export class ToolCallError extends Error {
  constructor(public readonly idempotencyKey: string, public readonly cause: unknown) {
    super('Tool call failed. Reuse the idempotency key if the submission outcome is uncertain.');
    this.name = 'ToolCallError';
  }
}
export class TopUpRequestError extends Error {
  constructor(public readonly requestId: string, public readonly cause: unknown) {
    super("Checkout request failed. Reuse this request ID and amount to retry.");
    this.name = "TopUpRequestError";
  }
}
export type ToolCallOptions = z.input<typeof publicOperationSchemas.call>;
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
  private async call(operation: string, input: unknown, timeoutMs = this.options.timeoutMs ?? 30_000, signal = AbortSignal.timeout(Math.ceil(timeoutMs))): Promise<unknown> {
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
        },
        body,
      },
    );
    let response = await send();
    // A wallet 401 precedes execution. Preserve the exact body and idempotency key on this one retry.
    if (response.status === 401 && this.tokenProvider?.refreshAccessToken) {
      await response.body?.cancel();
      token = await this.tokenProvider.refreshAccessToken(token);
      if (!token || /[\r\n]/.test(token)) throw new Error("The wallet token provider returned an invalid token");
      response = await send();
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
      const discovery = await selected.discover("");
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
    return z.object({ id: z.uuid() }).parse(await this.call("update_card", managementOperationSchemas.update_card.parse(input)));
  }
  async apiKeys(cursor?: string) { return this.call("api_keys", { cursor }); }
  async createApiKey(input: z.input<typeof managementOperationSchemas.create_api_key>) {
    return z.object({ id: z.uuid(), token: z.string().nullable(), created: z.boolean() }).parse(await this.call("create_api_key", managementOperationSchemas.create_api_key.parse(input)));
  }
  async revokeApiKey(id: string) { return this.call("revoke_api_key", { id: z.uuid().parse(id) }); }
  async cards(cursor?: string) {
    return z.object({ items: z.array(z.object({ id: z.uuid(), name: z.string(), walletId: z.uuid(), walletName: z.string(), status: z.string(), expiresAt: z.string().nullable() })), cursor: z.string().optional() }).parse(await this.call("cards", { cursor }));
  }
  async discover(
    query: string,
    options?: { cursor?: string; provider?: string; limit?: number },
  ) {
    const limit = options?.limit === undefined ? {} : { limit: publicOperationSchemas.discover.shape.limit.parse(options.limit) };
    return discoverySchema.parse(
      await this.call("discover", { query, ...options, ...limit }),
    );
  }
  async inspect(id: string) {
    return toolDefinitionSchema.parse(await this.call("inspect", { id }));
  }
  async discoverCompact(query: string, options?: { cursor?: string; provider?: string; limit?: number }) {
    const input = publicOperationSchemas.discover.parse({ query, ...options, format: "compact" });
    return compactDiscoverySchema.parse(await this.call("discover", input));
  }
  async searchItems(input: z.input<typeof publicOperationSchemas.search_items>) {
    return this.call("search_items", publicOperationSchemas.search_items.parse(input));
  }
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
  async topUp(amountCents: number, requestId: string = crypto.randomUUID()) {
    const input = publicOperationSchemas.topup.parse({ amountCents, requestId });
    try {
      const result = topUpResultSchema.parse(await this.call("topup", input));
      if (result.requestId !== input.requestId || result.amountMicros !== (BigInt(input.amountCents) * 10_000n).toString()
        || this.options.cardId && result.cardId !== this.options.cardId) throw new Error("The checkout does not match this request");
      return result;
    }
    catch (error) { throw new TopUpRequestError(input.requestId, error); }
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
  async callTool(request: ToolCallOptions) {
    const input = publicOperationSchemas.call.parse({ ...request, idempotencyKey: request.idempotencyKey ?? crypto.randomUUID() });
    try {
      const result = await this.call('call', input);
      return { ...parseReceipt(result), idempotencyKey: input.idempotencyKey! };
    } catch (error) {
      // Preserve the request identity on timeout; never submit a fresh purchase automatically.
      throw new ToolCallError(input.idempotencyKey!, error);
    }
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
    return waitForInvocationReceipt(resolved, async (timeout, signal) => {
      const receipt = parseReceipt(await this.call("get_invocation", { id: resolved }, timeout, signal));
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
    return { ...result, resumeCommand: `o11 status ${result.receipt?.shortId ?? result.invocationId}` };
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
      .object({ estimatedMicros: z.string(), variable: z.boolean(),
        quoteContext: z.string().regex(/^[a-f0-9]{64}$/).optional(), executionAccount: executionAccountSchema.optional(),
        credentialMode: z.enum(["platform", "customer"]).optional(), chargeBasis: z.string().optional() })
      .parse(await this.call("quote", { toolId, input, ...options }));
  }
  cancel(id: string) {
    return this.call("cancel", { id });
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
