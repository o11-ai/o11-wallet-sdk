import {
  receiptSchema,
  balanceSchema,
  discoverySchema,
  type InvocationReceipt,
} from "./contracts/receipts";
import { z } from "zod";
import {
  toolDefinitionSchema,
  invocationSchema,
  type InvocationOptions,
  type ToolInputOptions,
} from "./contracts/index";
export type { InvocationOptions, ToolInputOptions } from "./contracts/index";
export type { InvocationReceipt } from "./contracts/receipts";

export class ToolClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly response: unknown,
  ) {
    super(`o11 returned HTTP ${status}`);
    this.name = "ToolClientError";
  }
}
export class ToolClient {
  private readonly baseUrl: URL;
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey: string;
      cardId?: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
    },
  ) {
    this.baseUrl = new URL(options.baseUrl);
    if (this.baseUrl.username || this.baseUrl.password || this.baseUrl.search || this.baseUrl.hash)
      throw new Error("Use a wallet origin without credentials, query parameters, or a fragment");
    if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0))
      throw new Error("timeoutMs must be a positive number");
    if (
      this.baseUrl.protocol !== "https:" &&
      !(
        this.baseUrl.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(this.baseUrl.hostname)
      )
    )
      throw new Error("Use HTTPS for o11 API access");
  }
  private async call(operation: string, input: unknown, timeoutMs = this.options.timeoutMs ?? 30_000, signal = AbortSignal.timeout(Math.ceil(timeoutMs))): Promise<unknown> {
    const response = await (this.options.fetch ?? fetch)(
      new URL(`/v1/${operation}`, this.baseUrl),
      {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(operation === "cards" ? input : { ...(input as Record<string, unknown>), ...(this.options.cardId ? { cardId: this.options.cardId } : {}) }),
      },
    );
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      if (response.ok) throw new Error("The wallet returned invalid JSON");
      result = { error: "INVALID_RESPONSE" };
    }
    if (!response.ok) throw new ToolClientError(response.status, result);
    return result;
  }
  withCard(cardId: string) { return new ToolClient({ ...this.options, cardId: z.uuid().parse(cardId) }); }
  async cards(cursor?: string) {
    return z.object({ items: z.array(z.object({ id: z.uuid(), name: z.string(), walletId: z.uuid(), walletName: z.string(), status: z.string(), expiresAt: z.string().nullable() })), cursor: z.string().optional() }).parse(await this.call("cards", { cursor }));
  }
  async discover(
    query: string,
    options?: { cursor?: string; provider?: string },
  ) {
    return discoverySchema.parse(
      await this.call("discover", { query, ...options }),
    );
  }
  async inspect(id: string) {
    return toolDefinitionSchema.parse(await this.call("inspect", { id }));
  }
  async connections(provider?: string) {
    return z
      .array(
        z.object({
          id: z.string().uuid(),
          provider: z.string(),
          name: z.string(),
        }),
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
  async invoke(request: InvocationOptions) {
    return receiptSchema.parse(
      await this.call("invoke", invocationSchema.parse(request)),
    );
  }
  async getInvocation(id: string) {
    return receiptSchema.parse(await this.call("get_invocation", { id }));
  }
  async waitForInvocation(
    id: string,
    options: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<InvocationReceipt> {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const intervalMs = options.intervalMs ?? 2_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0)
      throw new Error("Wait durations must be positive numbers");
    const deadline = performance.now() + timeoutMs;
    const pending = new Set(["queued", "executing", "waiting"]);
    let result: InvocationReceipt | undefined;
    do {
      const requestTimeout = Math.min(this.options.timeoutMs ?? 30_000, Math.max(1, deadline - performance.now()));
      const signal = AbortSignal.timeout(Math.ceil(requestTimeout));
      try {
        result = receiptSchema.parse(await this.call("get_invocation", { id }, requestTimeout, signal));
      } catch (error) {
        if (result && signal.aborted && performance.now() >= deadline &&
          error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return result;
        throw error;
      }
      if (!pending.has(result.state)) return result;
      const remaining = deadline - performance.now();
      if (remaining <= 0) return result;
      await new Promise<void>(resolve => setTimeout(resolve, Math.min(intervalMs, remaining)));
    } while (performance.now() < deadline);
    return result;
  }
  async quote(toolId: string, input: ToolInputOptions,
    options: { credentialMode?: "platform" | "customer"; connectionId?: string } = {},
  ) {
    return z
      .object({ estimatedMicros: z.string(), variable: z.boolean(),
        credentialMode: z.enum(["platform", "customer"]).optional(), chargeBasis: z.string().optional() })
      .parse(await this.call("quote", { toolId, input, ...options }));
  }
  cancel(id: string) {
    return this.call("cancel", { id });
  }
  resources() {
    return this.call("resources", {});
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
