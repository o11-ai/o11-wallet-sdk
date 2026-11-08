import { invocationReferenceMatches } from "./contracts/invocation-lifecycle.js";

export type PollableInvocation = {
  id: string;
  state: string;
  polling?: { recommendedAfterMs: number };
  result?: unknown;
};
export type InvocationWaitOptions = {
  timeoutMs?: number;
  /** First delay between status reads. Later reads grow 1.5x up to maxIntervalMs. */
  intervalMs?: number;
  /** Caps backoff after failed reads, including jitter. Server Retry-After can require a longer delay. */
  maxIntervalMs?: number;
};
export type InvocationWaitResult<T> = {
  invocationId: string;
  outcome: "completed" | "action_required" | "timed_out";
  receipt?: T;
  lastReadError?: unknown;
};
export type InvocationReadRetry = { retryable: boolean; retryAfterMs?: number };
export class InvocationWaitTimeoutError extends Error {
  readonly resumeCommand: string;
  constructor(readonly invocationId: string, cause?: unknown) {
    super(`Waiting ended before status was available. Retrieve existing invocation ${invocationId}.`, { cause });
    this.name = "TimeoutError";
    this.resumeCommand = `o11 status ${invocationId}`;
  }
}
type Runtime = {
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  requestTimeoutMs?: number;
  classifyError: (error: unknown) => InvocationReadRetry;
};

/** Retry-After is either whole seconds or an HTTP date. It never authorizes another submission. */
export function retryAfterMilliseconds(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const milliseconds = Number(text) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

const pending = new Set(["queued", "executing", "waiting"]);
const terminal = new Set(["succeeded", "failed", "cancelled"]);
const positive = (value: number) => Number.isFinite(value) && value > 0;

/** Financial settlement can finish before generated files reach owned storage. */
export function mediaWaitState(result: unknown): "pending" | "action_required" | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return;
  const root = result as Record<string, unknown>;
  const delivery = root.mediaDelivery;
  if (delivery && typeof delivery === "object" && "status" in delivery && delivery.status === "unavailable")
    return "action_required";
  if (!Array.isArray(root.media)) return;
  const states = root.media.flatMap((entry: unknown) => entry && typeof entry === "object" &&
    "id" in entry && typeof entry.id === "string" && "status" in entry && typeof entry.status === "string" ? [entry.status] : []);
  if (states.some(state => ["failed", "expired"].includes(state))) return "action_required";
  if (states.some(state => ["queued", "working"].includes(state))) return "pending";
}

function boundedStatusRead<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => { signal.removeEventListener("abort", aborted); reject(signal.reason); };
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    Promise.resolve().then(() => { signal.throwIfAborted(); return read(); }).then(
      value => { signal.removeEventListener("abort", aborted); resolve(value); },
      error => { signal.removeEventListener("abort", aborted); reject(error); },
    );
  });
}

/** Wait only reads an existing invocation. Its deadline never stops the supplier job. */
export async function waitForInvocationReceipt<T extends PollableInvocation>(
  invocationId: string,
  read: (timeoutMs: number, signal: AbortSignal) => Promise<T>,
  options: InvocationWaitOptions,
  runtime: Runtime,
): Promise<InvocationWaitResult<T>> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const maxIntervalMs = options.maxIntervalMs ?? Math.max(intervalMs, 10_000);
  const requestLimit = runtime.requestTimeoutMs ?? 30_000;
  if (![timeoutMs, intervalMs, maxIntervalMs, requestLimit].every(positive) || maxIntervalMs < intervalMs)
    throw new Error("Wait durations must be positive numbers and maxIntervalMs must cover intervalMs");
  const now = runtime.now ?? (() => performance.now());
  const sleep = runtime.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const random = runtime.random ?? Math.random;
  const deadline = now() + timeoutMs;
  let receipt: T | undefined;
  let lastReadError: unknown;
  let failures = 0;
  let pendingReads = 0;
  const timedOut = (): InvocationWaitResult<T> => ({
    invocationId, outcome: "timed_out", ...(receipt ? { receipt } : {}),
    ...(lastReadError === undefined ? {} : { lastReadError }),
  });
  const delay = (attempt: number, floor = 0) => {
    const backoff = Math.min(maxIntervalMs, intervalMs * 2 ** Math.min(attempt, 20));
    const jitter = 1 + Math.min(1, Math.max(0, random())) * 0.2;
    return Math.max(Number.isFinite(floor) && floor > 0 ? floor : 0, Math.min(maxIntervalMs, Math.round(backoff * jitter)));
  };
  while (now() < deadline) {
    const requestTimeout = Math.max(1, Math.ceil(Math.min(requestLimit, deadline - now())));
    const signal = AbortSignal.timeout(requestTimeout);
    let nextDelay: number;
    try {
      const current = await boundedStatusRead(signal, () => read(requestTimeout, signal));
      if (!invocationReferenceMatches(invocationId, current.id)) throw new Error("Status response belongs to a different invocation");
      invocationId = current.id;
      receipt = current;
      failures = 0;
      lastReadError = undefined;
      const media = current.state === "succeeded" ? mediaWaitState(current.result) : undefined;
      if (media === "action_required") return { invocationId, outcome: "action_required", receipt };
      if (!pending.has(current.state) && media !== "pending") return {
        invocationId, outcome: terminal.has(current.state) ? "completed" : "action_required", receipt,
      };
      // Polling is only the fallback: 1s, then 1.5x per read up to the cap. A longer server cadence, such as a
      // scheduled retry, still sets the floor. Backoff with jitter applies only to failed reads.
      const advised = current.polling?.recommendedAfterMs;
      const schedule = Math.min(maxIntervalMs, Math.round(intervalMs * 1.5 ** Math.min(pendingReads++, 20)));
      nextDelay = Math.max(schedule, advised !== undefined && positive(advised) ? advised : 0);
    } catch (error) {
      lastReadError = error;
      if (signal.aborted && now() >= deadline) return timedOut();
      const retry = runtime.classifyError(error);
      if (!retry.retryable) throw error;
      nextDelay = delay(failures++, retry.retryAfterMs);
    }
    const remaining = deadline - now();
    if (remaining <= 0) return timedOut();
    await sleep(Math.min(nextDelay, remaining));
  }
  return timedOut();
}
