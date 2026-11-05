import { z } from "zod";
import { publicOperationSchemas, stripeCheckoutUrlSchema } from "./contracts/public-api.js";

const topUpUsage = "Use o11 topup [AMOUNT|-a AMOUNT] [--no-open] [--request-id UUID]. Omit AMOUNT to read funding limits.";
export function topUpArguments(args: string[]) {
  let amount: string | undefined, noBrowser = false, requestId: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (['--no-browser', '--no-open'].includes(flag) && !noBrowser) { noBrowser = true; continue; }
    if (flag === '--request-id' && !requestId) { requestId = z.uuid().parse(args[++index]); continue; }
    if (flag === '-a' || flag === '--amount') {
      if (amount !== undefined) throw new Error(topUpUsage);
      amount = args[++index];
      if (!amount) throw new Error(topUpUsage);
    } else if (index === 0 && !flag.startsWith('-') && amount === undefined) amount = flag;
    else throw new Error(topUpUsage);
  }
  if (amount === undefined) {
    if (requestId || noBrowser) throw new Error(topUpUsage);
    return { amountCents: undefined, noBrowser, requestId: undefined };
  }
  if (amount.length > 80 || !/^(0|[1-9]\d{0,6})(\.\d+)?$/.test(amount)) throw new Error(topUpUsage);
  const [whole = "0", fraction = ""] = amount.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0')) + (Number(fraction[2] ?? '0') >= 5 ? 1n : 0n);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(topUpUsage);
  const amountCents = Number(cents);
  if (!publicOperationSchemas.topup.safeParse({ amountCents, requestId: requestId ?? "00000000-0000-4000-8000-000000000000" }).success)
    throw new Error('Enter USD 5.00–1000.00 after rounding to the nearest cent.');
  return { amountCents, noBrowser, requestId: requestId ?? crypto.randomUUID() };
}

export function checkoutBrowserCommand(value: string, platform = process.platform): string[] {
  const url = stripeCheckoutUrlSchema.parse(value);
  return platform === "darwin" ? ["open", url] : platform === "win32"
    ? ["rundll32", "url.dll,FileProtocolHandler", url] : ["xdg-open", url];
}

export async function openCheckout(value: string, noBrowser: boolean) {
  const command = checkoutBrowserCommand(value);
  if (noBrowser) return false;
  try {
    const child = Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    return await Promise.race([child.exited.then(code => code === 0), new Promise<boolean>(resolve => {
      const timer = setTimeout(() => resolve(true), 1500);
      timer.unref();
    })]);
  } catch { return false; }
}
