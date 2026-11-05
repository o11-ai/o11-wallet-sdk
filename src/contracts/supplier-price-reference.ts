import { z } from "zod";
import { moneySchema } from "./money.js";

/** Published supplier schedule for display; never a wallet settlement input. */
export const supplierPriceReferenceSchema = z.strictObject({
  sourceUrl: z.url({ protocol: /^https$/ }),
  checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: z.literal("public_schedule"),
  controlsWalletBilling: z.literal(false),
  rates: z.array(z.strictObject({
    micros: moneySchema, unit: z.string().min(1), per: z.number().int().positive(),
    alternative: z.string().min(1).optional(),
  })).min(1),
  note: z.string().min(1),
});
export type SupplierPriceReference = z.infer<typeof supplierPriceReferenceSchema>;
