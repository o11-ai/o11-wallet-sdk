import { z } from "zod";

export const moneySchema = z.string().regex(/^(0|[1-9]\d{0,17})$/);

export function dollarsToMicros(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value))
    throw new Error("Invalid USD amount");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function formatMoney(micros: string): string {
  const value = BigInt(moneySchema.parse(micros));
  return `$${value / 1_000_000n}.${(value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0{1,4}$/, "")}`;
}
