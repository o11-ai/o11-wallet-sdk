import { authorizationRemediationSchema, type AuthorizationRemediation } from "./contracts/provider-authorization.js";

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
export type TopUpFailureReason = "HTTP_ERROR" | "TIMEOUT" | "NETWORK_ERROR" | "INVALID_CHECKOUT_RESPONSE" | "CHECKOUT_MISMATCH" | "REQUEST_FAILED";
export type TopUpFailureField = "requestId" | "walletId" | "cardId" | "amountMicros" | "currency" | "status" | "url";
export class TopUpRequestError extends Error {
  readonly reason: TopUpFailureReason;
  readonly fields?: TopUpFailureField[];
  constructor(public readonly requestId: string, public readonly cause: unknown,
    details: { reason: TopUpFailureReason; fields?: TopUpFailureField[] } = { reason: "REQUEST_FAILED" }) {
    super("Checkout request failed. Reuse this request ID and amount to retry.");
    this.name = "TopUpRequestError";
    this.reason = details.reason;
    this.fields = details.fields;
  }
}
