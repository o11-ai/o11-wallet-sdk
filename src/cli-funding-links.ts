import { z } from 'zod';

// The wallet adds addFundsUrl to INSUFFICIENT_BALANCE and dashboardUrl to a card limit only a person can raise
// (public-api-errors.ts). A link is printed only when it is a plain http(s) address on the wallet this CLI uses.
const walletLink = z.url({ protocol: /^https?$/ }).max(2000);
const link = (response: unknown, key: 'addFundsUrl' | 'dashboardUrl', walletOrigin: string | undefined) => {
  if (!walletOrigin || typeof response !== 'object' || response === null || !(key in response)) return undefined;
  const value: unknown = Reflect.get(response, key);
  // URL parsing would silently drop tabs and newlines; a link carrying any control character is refused instead.
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(value) || !walletLink.safeParse(value).success) return undefined;
  const url = new URL(value);
  return url.origin === walletOrigin ? url.href : undefined;
};

/** The wallet's funding links, for JSON error output. A malformed or foreign link is dropped on its own. */
export function fundingLinks(response: unknown, walletOrigin: string | undefined) {
  const addFundsUrl = link(response, 'addFundsUrl', walletOrigin), dashboardUrl = link(response, 'dashboardUrl', walletOrigin);
  return { ...(addFundsUrl ? { addFundsUrl } : {}), ...(dashboardUrl ? { dashboardUrl } : {}) };
}
/** The next step for a 402 or a card limit, with the link to share with the person who can act on it. */
export function fundingNextStep(response: unknown, cli: string, walletOrigin: string | undefined) {
  const { addFundsUrl, dashboardUrl } = fundingLinks(response, walletOrigin);
  // The topup link comes back to the wallet signed in after payment; the billing page asks the person to sign in first.
  if (addFundsUrl) return `Run ${cli} topup AMOUNT (USD) --no-open --no-wait for a payment link to share: after paying it opens the wallet signed in. Or add funds at ${addFundsUrl}. Then retry.`;
  if (dashboardUrl) return `A person can raise this card's limit at ${dashboardUrl}. Then retry.`;
  return undefined;
}
