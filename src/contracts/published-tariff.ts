import { z } from "zod";

export const publishedTariffSchema = z.object({
  label: z.string(),
  billingAvailable: z.boolean(),
  checkedAt: z.string().min(1).optional(),
  blocker: z.string().optional(),
});
export type PublishedTariff = z.infer<typeof publishedTariffSchema>;
export const tariffRateSchema = z.object({
  micros: z.string().regex(/^\d+$/), unit: z.string(), per: z.number().positive(),
  alternative: z.string().min(1).optional(),
  when: z.array(z.object({ key: z.string(), equals: z.union([z.string(), z.number(), z.boolean(), z.null()]) })).optional(),
  rounding: z.enum(["linear", "up"]).optional(), offset: z.number().optional(),
});
/** Optional range fields a price carries where the response read billed history (see ./price-range-text). */
export const priceRangeShape = {
  priceText: z.string().optional(),
  priceMinMicros: z.string().regex(/^\d+$/).optional(), priceMaxMicros: z.string().regex(/^\d+$/).optional(),
  priceAvgMicros: z.string().regex(/^\d+$/).nullable().optional(), priceAvgN: z.number().int().nonnegative().nullable().optional(),
};
