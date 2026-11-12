import { ToolClient, ToolClientError, TopUpRequestError, type TopUpStatus } from './client.js';
import { cliRecoveryCommand } from './cli-execution.js';
import { topUpArguments, openCheckout } from './cli-wallet.js';
import { topUpPaid } from './topup-wait.js';

type Context = {
  baseUrl: string | URL;
  profile?: string;
  cardId?: string;
  invocation?: readonly string[];
  emit: (value: unknown) => void;
  notice: (value: unknown) => void;
};
const failureMessages: Record<string, string> = {
  failed: 'Payment failed. Wallet funding was not confirmed.',
  expired: 'The checkout expired before payment was confirmed.',
  partially_refunded: 'The payment was partially refunded.',
  refunded: 'The payment was refunded.',
  disputed: 'The payment is disputed.',
};
const retryMessages: Record<string, string> = {
  payment_declined: 'Payment was declined. Try another payment method in the same Stripe checkout. Still waiting for credits.',
  authentication_failed: 'Payment authentication failed. Complete authentication in the same Stripe checkout. Still waiting for credits.',
  payment_failed: 'Payment has not succeeded. Retry in the same Stripe checkout. Still waiting for credits.',
};

export async function executeTopUp(client: ToolClient, args: string[], context: Context) {
  const input = topUpArguments(args);
  if (input.amountCents === undefined) return { result: await client.topUpLimits(), exitCode: 0 };
  const requestId = input.requestId!, amountMicros = (BigInt(input.amountCents) * 10_000n).toString();
  const dollars = `${Math.floor(input.amountCents / 100)}.${String(input.amountCents % 100).padStart(2, '0')}`;
  const resumeCommand = cliRecoveryCommand([...(context.profile ? ['--profile', context.profile] : []),
    'topup', dollars, '--request-id', requestId, '--no-open', ...(context.cardId ? ['--card', context.cardId] : [])], context.invocation);
  const pending = (reason: string, receipt?: TopUpStatus) => ({ result: { ...receipt, success: false, status: 'pending',
    requestId, amountMicros, currency: 'USD', reason, resumeCommand,
    message: reason === 'STATUS_UNSUPPORTED' ? 'The checkout link is ready, but this server cannot confirm payment status. Check Billing before retrying.'
      : 'Wallet funding is not confirmed. Reuse this request ID to check the same checkout.' }, exitCode: 2 });
  const finish = (receipt: TopUpStatus) => topUpPaid(receipt)
    ? { result: { ...receipt, success: true, message: `Added US$${dollars} in credits.` }, exitCode: 0 }
    : { result: { ...receipt, success: false, message: failureMessages[receipt.status] ?? 'Wallet funding was not confirmed.' }, exitCode: 1 };
  const matches = (receipt: TopUpStatus) => {
    if (receipt.amountMicros !== amountMicros) throw new TopUpRequestError(requestId,
      new Error('The checkout does not match this amount'), { reason: 'CHECKOUT_MISMATCH', fields: ['amountMicros'] });
  };
  // Paid checkouts no longer return a Stripe URL. A retry must read durable funding before requesting its existing link.
  if (args.includes('--request-id')) {
    try {
      const status = await client.topUpStatus(requestId, { signal: AbortSignal.timeout(Math.min(input.waitMs ?? 600_000, 30_000)) });
      matches(status);
      if (topUpPaid(status) || !['pending', 'paid'].includes(status.status)) return finish(status);
    } catch (error) {
      if (error instanceof ToolClientError && error.status === 404) { /* A new request, or a server predating status reads. */ }
      else if (error instanceof TypeError || error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name)
        || error instanceof ToolClientError && ([408, 429].includes(error.status) || error.status >= 500)) return pending('STATUS_UNAVAILABLE');
      else if (error instanceof ToolClientError) throw new TopUpRequestError(requestId, error, { reason: 'HTTP_ERROR' });
      else throw error;
    }
  }
  const waitForFunding = async (initial?: TopUpStatus) => {
    if (input.noWait) return pending('PAYMENT_PENDING', initial);
    const noticed = new Set<string>();
    try {
      const waited = await client.waitForTopUp(requestId, { waitMs: input.waitMs, expectedAmountMicros: amountMicros,
        onPending(status) {
          if (status.paymentRetryable && status.failureReason && retryMessages[status.failureReason] && !noticed.has(status.failureReason)) {
            noticed.add(status.failureReason);
            context.notice({ requestId, status: 'pending', currency: 'USD', reason: status.failureReason,
              message: retryMessages[status.failureReason] });
          }
        } });
      return waited.outcome === 'timed_out' ? pending('WAIT_TIMEOUT', waited.receipt) : finish(waited.receipt!);
    } catch (error) {
      if (error instanceof TopUpRequestError && error.cause instanceof ToolClientError && [404, 405, 501].includes(error.cause.status))
        return pending('STATUS_UNSUPPORTED');
      throw error;
    }
  };
  let checkout;
  try { checkout = await client.topUp(input.amountCents, requestId); }
  catch (error) {
    if (error instanceof TopUpRequestError && error.cause instanceof ToolClientError && error.cause.status === 409) {
      let existing: TopUpStatus;
      try { existing = await client.topUpStatus(requestId); }
      catch (readError) {
        if (readError instanceof TypeError || readError instanceof DOMException && ['TimeoutError', 'AbortError'].includes(readError.name)
          || readError instanceof ToolClientError && ([408, 429].includes(readError.status) || readError.status >= 500)) return pending('STATUS_UNAVAILABLE');
        throw error;
      }
      matches(existing);
      if (topUpPaid(existing) || !['pending', 'paid'].includes(existing.status)) return finish(existing);
      if (!input.noWait) context.emit({ ...existing, success: false, waiting: true, resumeCommand,
        next: 'Payment is still being confirmed. Waiting for wallet credits from the same checkout.' });
      return waitForFunding(existing);
    }
    if (!(error instanceof TopUpRequestError) || !(error.cause instanceof ToolClientError) || !(error.cause.status === 403
      || [400, 503].includes(error.cause.status) && typeof error.cause.response === 'object' && error.cause.response !== null
        && 'error' in error.cause.response && error.cause.response.error === 'NOT_CONFIGURED')) throw error;
    const dashboardUrl = await client.topUpLimits().then(limits => limits.dashboardUrl, () => new URL('/billing', context.baseUrl).href);
    return { result: { checkoutAvailable: false, dashboardUrl, requestId,
      message: error.cause.status === 403 ? 'This connection cannot create a checkout link. Open Billing to add USD credits.'
        : 'Card checkout is not available on this wallet. Open Billing to add USD credits.' }, exitCode: 0 };
  }
  if (input.noWait) return { result: { ...checkout, browserOpened: await openCheckout(checkout.url, input.noBrowser), resumeCommand,
    next: 'Complete payment in Stripe. Use the recovery command to confirm wallet credits.' }, exitCode: 0 };
  context.emit({ ...checkout, ...(input.noBrowser ? { browserOpened: false } : {}), waiting: true, resumeCommand,
    next: 'Complete the USD payment in Stripe. Waiting for wallet credits.' });
  await openCheckout(checkout.url, input.noBrowser);
  return waitForFunding();
}
