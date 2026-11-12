/**
 * Streams a call: progress events arrive as the server sees them, then the final receipt, in one response. If the
 * connection drops, it reconnects to the same call with the last event id and gets only what it missed. Nothing polls.
 */
export type CallStreamEvent = { event: string; id?: string; data: Record<string, unknown>; receivedAt: number };
export type CallStreamOptions = {
  baseUrl: string | URL;
  /** The `call` request body, exactly as the JSON call takes it. */
  body: unknown;
  /** Authorization and other headers, read before each connection (a refreshed token is picked up on reconnect). */
  headers: () => Promise<Record<string, string>> | Record<string, string>;
  fetch?: typeof fetch;
  onEvent?: (event: CallStreamEvent) => void;
  signal?: AbortSignal;
  /** Reconnects allowed without any new event in between. */
  maxReconnects?: number;
};
export class CallStreamError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown, readonly invocationId?: string,
    /** The refusal's Retry-After header, as sent. */
    readonly retryAfter?: string | null) {
    super(message);
    this.name = "CallStreamError";
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { value };

/** Parses `text/event-stream` blocks as they arrive; comments (keep-alives) are skipped. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Omit<CallStreamEvent, "receivedAt">> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message", id: string | undefined;
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const text = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = text;
        else if (field === "id") id = text;
        else if (field === "data") data.push(text);
      }
      if (!data.length) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(data.join("\n")); } catch { parsed = data.join("\n"); }
      yield { event, ...(id ? { id } : {}), data: record(parsed) };
    }
  }
}

/** The wait was stopped after the wallet admitted the call: no status, so a caller reads the call by its id. */
const stoppedAfterAdmission = (invocationId: string) =>
  new CallStreamError("The call stream stopped before the call finished; read the call by its id", undefined, undefined, invocationId);

const pause = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, milliseconds);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

/** Runs a call over a stream and resolves with its final receipt (the same object a plain JSON call returns). */
export async function streamCall(options: CallStreamOptions): Promise<{ invocationId?: string; receipt: Record<string, unknown> }> {
  const send = options.fetch ?? fetch;
  let invocationId: string | undefined, lastId: string | undefined, quietReconnects = 0;
  const limit = options.maxReconnects ?? 8;
  for (;;) {
    options.signal?.throwIfAborted();
    const headers = { ...await options.headers(), Accept: "text/event-stream, application/json;q=0.5" };
    let response: Response | undefined;
    try {
      response = invocationId
        ? await send(new URL(`/api/invocations/${encodeURIComponent(invocationId)}`, options.baseUrl),
          { headers: { ...headers, ...(lastId ? { "Last-Event-ID": lastId } : {}) }, signal: options.signal })
        : await send(new URL("/v1/call", options.baseUrl), { method: "POST", body: JSON.stringify(options.body), signal: options.signal,
          headers: { ...headers, "Content-Type": "application/json" } });
    } catch (error) {
      // A submit that never reached the server has no invocation to resume; the caller retries with the same idempotency key.
      if (options.signal?.aborted && invocationId) throw stoppedAfterAdmission(invocationId);
      if (!invocationId || options.signal?.aborted || ++quietReconnects > limit) throw error;
      await pause(Math.min(5_000, 250 * 2 ** quietReconnects), options.signal);
      continue;
    }
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("text/event-stream")) {
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw new CallStreamError(`The call failed with HTTP ${response.status}`, response.status, body, invocationId,
        response.headers.get("retry-after"));
      // A server without streaming answers with the receipt itself.
      return { invocationId: invocationId ?? (typeof record(body).id === "string" ? String(record(body).id) : undefined), receipt: record(body) };
    }
    invocationId ??= response.headers.get("location")?.split("/").pop() || undefined;
    let callbackFailed = false;
    try {
      for await (const event of sseEvents(response.body!)) {
        // Progress resets the reconnect budget; a retryable error does not, so a server that keeps failing is backed off and given up on.
        if (event.event !== "error") quietReconnects = 0;
        if (event.id) lastId = event.id;
        if (event.event === "accepted" && typeof event.data.invocationId === "string") invocationId = event.data.invocationId;
        try { options.onEvent?.({ ...event, receivedAt: Date.now() }); }
        catch (error) { callbackFailed = true; throw error; }
        if (event.event === "result") return { invocationId, receipt: event.data };
        if (event.event === "error" && event.data.retryable !== true)
          throw new CallStreamError(String(event.data.message ?? "The call stream failed"), undefined, event.data, invocationId);
      }
    } catch (error) {
      if (callbackFailed) throw error;
      // Stopped once the call exists (named by Location or accepted): the error carries its id, so the caller can read it.
      if (options.signal?.aborted && invocationId && !(error instanceof CallStreamError)) throw stoppedAfterAdmission(invocationId);
      if (error instanceof CallStreamError || options.signal?.aborted || !invocationId) throw error;
    }
    // The stream ended before the receipt (a server time limit or a dropped connection): resume where it stopped.
    if (!invocationId) throw new CallStreamError("The call stream ended before the call was accepted");
    if (++quietReconnects > limit) throw new CallStreamError("The call stream kept dropping; read the call by its id", undefined, undefined, invocationId);
    if (quietReconnects > 1) await pause(Math.min(5_000, 250 * 2 ** quietReconnects), options.signal)
      .catch((error: unknown) => { throw options.signal?.aborted ? stoppedAfterAdmission(invocationId!) : error; });
  }
}
