import type { z } from 'zod';
import type { topUpStatusSchema } from './contracts/public-api.js';
import { ToolClientError, TopUpRequestError } from './client-errors.js';

export type TopUpStatus = z.infer<typeof topUpStatusSchema>;
export type TopUpWaitOptions = {
  waitMs?: number;
  signal?: AbortSignal;
  expectedAmountMicros?: string;
  intervalMs?: number;
  maxIntervalMs?: number;
  onPending?: (status: TopUpStatus) => void;
};
export type TopUpWaitResult = { outcome: 'paid' | 'failed' | 'timed_out'; receipt?: TopUpStatus };

/** Only committed, unreversed wallet credit confirms a successful payment. */
export const topUpPaid = (status: TopUpStatus) => status.status === 'paid' && status.creditCommitted && status.paidAt !== null
  && BigInt(status.amountMicros) > 0n && BigInt(status.creditedMicros) === BigInt(status.amountMicros);

function abortable<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(signal.reason); };
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    Promise.resolve().then(() => { signal.throwIfAborted(); return read(); }).then(
      value => { signal.removeEventListener('abort', aborted); resolve(value); },
      error => { signal.removeEventListener('abort', aborted); reject(error); });
  });
}
const delay = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const aborted = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); reject(signal?.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, milliseconds);
  signal?.addEventListener('abort', aborted, { once: true });
  if (signal?.aborted) aborted();
});

/** Reads one checkout's durable funding status. Waiting never creates a checkout or retries a payment. */
export async function waitForTopUp(
  requestId: string, read: (signal: AbortSignal) => Promise<TopUpStatus>, options: TopUpWaitOptions = {},
): Promise<TopUpWaitResult> {
  const waitMs = options.waitMs ?? 600_000, interval = options.intervalMs ?? 500, maximum = options.maxIntervalMs ?? 5_000;
  if (![waitMs, interval, maximum].every(value => Number.isFinite(value) && value > 0) || maximum < interval)
    throw new Error('Top-up wait durations must be positive and maxIntervalMs must cover intervalMs');
  const deadline = performance.now() + waitMs;
  let receipt: TopUpStatus | undefined, attempt = 0, previous: string | undefined;
  while (performance.now() < deadline) {
    options.signal?.throwIfAborted();
    const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
    const timeout = AbortSignal.timeout(Math.min(30_000, remaining));
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let next: TopUpStatus | undefined, retryAfter = 0;
    try { next = await abortable(signal, () => read(signal)); }
    catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof ToolClientError) {
        if (error.status === 501 || ![408, 429].includes(error.status) && error.status < 500)
          throw new TopUpRequestError(requestId, error, { reason: 'HTTP_ERROR' });
        retryAfter = error.retryAfterMs ?? 0;
      } else if (!(error instanceof TypeError) && !(error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))) {
        throw error;
      }
    }
    if (next) {
      if (next.requestId !== requestId || options.expectedAmountMicros !== undefined && next.amountMicros !== options.expectedAmountMicros)
        throw new TopUpRequestError(requestId, new Error('The payment status does not match this request'),
          { reason: 'CHECKOUT_MISMATCH', fields: [next.requestId !== requestId ? 'requestId' : 'amountMicros'] });
      receipt = next;
      if (topUpPaid(next)) return { outcome: 'paid', receipt };
      if (!['pending', 'paid'].includes(next.status)) return { outcome: 'failed', receipt };
      const fingerprint = JSON.stringify([next.status, next.failureReason, next.paymentRetryable, next.creditedMicros, next.creditCommitted]);
      if (fingerprint !== previous) { previous = fingerprint; options.onPending?.(next); }
    }
    const remainingDelay = deadline - performance.now();
    if (remainingDelay <= 0) break;
    await delay(Math.min(remainingDelay, Math.max(retryAfter, Math.min(maximum, interval * 2 ** Math.min(attempt++, 10)))), options.signal);
  }
  return { outcome: 'timed_out', ...(receipt ? { receipt } : {}) };
}
