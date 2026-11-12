import { parseReceipt, type InvocationReceipt } from "./contracts/receipts.js";
import { CallStreamError, streamCall, type CallStreamEvent } from "./call-stream.js";
import { ToolCallError, ToolClientError } from "./client-errors.js";
import type { CallWaitOptions } from "./client.js";
import { retryAfterMilliseconds } from "./invocation-wait.js";
import { TokenNotRenewableError, type AccessTokenProvider } from "./token-provider.js";

/** The request may or may not have reached the wallet: the connection failed or this client's own deadline ended. */
export function lostSubmission(error: unknown) {
  return error instanceof TypeError || error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name);
}

export type StreamedCallContext = {
  baseUrl: URL;
  fetch?: typeof fetch;
  /** Read before each connection, so a renewed token is used on the next one. */
  headers: () => Promise<Record<string, string>>;
  /** Renews the token after a 401; false when it cannot. */
  renew: () => Promise<boolean>;
  read: (id: string) => Promise<InvocationReceipt>;
  httpError: (status: number, body: unknown, retryAfter?: string | null) => Error;
};
export type StreamedCallOptions = { waitMs: number; onEvent?: (event: CallStreamEvent) => void; signal?: AbortSignal };

/**
 * One streamed call: events reach onEvent as the wallet sees them and the final receipt ends the response. A dropped
 * stream reconnects to the same call with its last event id (streamCall). A submit that got no answer is sent again
 * with the same body and key, which returns the existing call. When the wait ends, or the stream gives up on a call
 * that exists, the call is read once by its id and returned as it stands.
 */
export async function streamedCall(context: StreamedCallContext, body: unknown, options: StreamedCallOptions): Promise<InvocationReceipt> {
  const deadline = AbortSignal.timeout(Math.max(1, Math.ceil(options.waitMs)));
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  let invocationId: string | undefined, renewed = false, callbackFailed = false;
  const onEvent = (event: CallStreamEvent) => {
    if (event.event === "accepted" && typeof event.data.invocationId === "string") invocationId = event.data.invocationId;
    try { options.onEvent?.(event); }
    catch (error) { callbackFailed = true; throw error; }
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const { receipt } = await streamCall({ baseUrl: context.baseUrl, body, headers: context.headers, fetch: context.fetch, onEvent, signal });
      return parseReceipt(receipt);
    } catch (error) {
      if (callbackFailed || options.signal?.aborted) throw error;
      const status = error instanceof CallStreamError ? error.status : undefined;
      const id = invocationId ?? (error instanceof CallStreamError ? error.invocationId : undefined);
      if (id && status === undefined) return context.read(id);
      if (status === 401 && !renewed && await context.renew()) { renewed = true; continue; }
      if (status !== undefined && error instanceof CallStreamError) throw context.httpError(status, error.body, error.retryAfter);
      // A stream that ended before the wallet named the call is as uncertain as a cut connection.
      if (!deadline.aborted && attempt < 2 && (lostSubmission(error) || error instanceof CallStreamError)) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

export type StreamToolOptions = CallWaitOptions & { onEvent?: (event: CallStreamEvent) => void; signal?: AbortSignal };
type ClientParts = {
  baseUrl: URL; fetch?: typeof fetch; apiKey?: string; tokenProvider?: AccessTokenProvider; runId: string; customer?: string;
  read: (id: string) => Promise<InvocationReceipt>;
  /** Reads a still-running call until it finishes or the wait ends, as callTool does. */
  finish: (receipt: InvocationReceipt, idempotencyKey: string, remainingMs: number) => Promise<InvocationReceipt & { idempotencyKey: string }>;
};

/**
 * ToolClient.streamTool: like callTool, but the wallet pushes the call's progress (accepted, plan, each provider
 * attempt, judge) to onEvent as it happens and ends the same response with the final receipt. A dropped stream
 * reconnects to the same call with its last event id, so nothing is missed and nothing polls. A wallet that does not
 * stream answers with the plain receipt; a still-running one is then read until it finishes.
 */
export async function streamToolCall(client: ClientParts, body: unknown, idempotencyKey: string, waitMs: number, options: StreamToolOptions) {
  if (!Number.isFinite(waitMs) || waitMs <= 0) throw new Error("waitMs must be a positive number");
  const started = performance.now();
  let token: string | undefined;
  const headers = async () => {
    token = client.tokenProvider ? await client.tokenProvider.getAccessToken() : client.apiKey!;
    if (!token || /[\r\n]/.test(token)) throw new Error("The wallet token provider returned an invalid token");
    return { Authorization: `Bearer ${token}`, "x-o11-run-id": client.runId, "x-o11-call-id": crypto.randomUUID(),
      "Idempotency-Key": idempotencyKey, ...(client.customer ? { "X-Customer": client.customer } : {}) };
  };
  const renew = async () => {
    if (!client.tokenProvider?.refreshAccessToken || !token) return false;
    return client.tokenProvider.refreshAccessToken(token).then(() => true,
      (error: unknown) => { if (error instanceof TokenNotRenewableError) return false; throw error; });
  };
  let receipt: InvocationReceipt;
  try {
    receipt = await streamedCall({ baseUrl: client.baseUrl, fetch: client.fetch, headers, renew, read: client.read,
      httpError: (status, response, retryAfter) => new ToolClientError(status, response, retryAfterMilliseconds(retryAfter ?? null)) },
    body, { waitMs, onEvent: options.onEvent, signal: options.signal });
  } catch (error) {
    throw new ToolCallError(idempotencyKey, error);
  }
  return client.finish(receipt, idempotencyKey, waitMs - (performance.now() - started));
}
