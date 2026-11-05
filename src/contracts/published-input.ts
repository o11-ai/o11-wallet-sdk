import { z } from "zod";

export const publishedInputSchema = z.object({
  source: z.literal("o11"), checkedAt: z.string(), mappingAvailable: z.boolean(),
});
export type PublishedInput = z.infer<typeof publishedInputSchema>;
