import { z } from "zod";
import { moneySchema } from "./index";
export const receiptSchema = z.object({
  id: z.string().uuid(),
  toolId: z.string(),
  toolName: z.string(),
  state: z.enum([
    "awaiting_approval",
    "queued",
    "executing",
    "waiting",
    "succeeded",
    "failed",
    "unknown",
    "cancelled",
  ]),
  canResume: z.boolean().default(false),
  reservedMicros: moneySchema,
  billedMicros: moneySchema.nullable(),
  settlementBasis: z
    .enum(["catalog", "provider", "operator", "none"])
    .nullable(),
  providerJobId: z.string().nullable(),
  result: z.unknown(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type InvocationReceipt = z.infer<typeof receiptSchema>;
export const balanceSchema = z.object({
  availableMicros: moneySchema,
  reservedMicros: moneySchema,
  status: z.enum(["active", "suspended"]),
});
export const discoverySchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      provider: z.string(),
      description: z.string().optional(),
      availability: z.enum(["configured", "requires_adapter"]).optional(),
      requiresCustomerCredentials: z.boolean().optional(),
      platformAccountAvailable: z.boolean().optional(),
      effect: z.enum(["read", "write"]).optional(),
      price: z.object({
        micros: moneySchema.nullable(),
        basis: z.enum(["free", "call", "variable"]),
        evidence: z.string(),
        requiresSupplierRate: z.boolean().optional(),
        unit: z.string().optional(),
        rates: z.array(z.object({ micros: moneySchema, unit: z.string(), per: z.number().positive() })).optional(),
      }),
    }),
  ),
  cursor: z.string().optional(),
});
