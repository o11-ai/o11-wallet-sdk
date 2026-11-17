import { z } from "zod";

export const resourceRequestSchema = z.object({
  method: z.enum(["GET", "POST", "DELETE", "PATCH"]),
  baseUrl: z.url(),
  path: z.string().min(1),
  statePath: z.string().optional(),
  /** States that mean the resource still exists, for suppliers whose ready state reads like an ending ("completed"). */
  liveStates: z.array(z.string().min(1)).min(1).optional(),
  body: z.json().optional(),
});
const binding = z.object({
  resource: z.string().min(1),
  inputPath: z.string().min(1),
  optional: z.boolean().default(false),
  parentInputPath: z.string().optional(),
  readyStates: z.array(z.string().min(1)).min(1).optional(),
});
export const resourcePlanSchema = z.object({
  uses: z.array(binding).default([]),
  provisions: z
    .array(
      z.object({
        resource: z.string().min(1),
        externalIdPaths: z.array(z.string()).min(1),
        identifierPath: z.string().min(1).optional(),
        parentInputPath: z.string().optional(),
        /** A companion resource the supplier may omit; the call still succeeds without it. */
        optional: z.boolean().optional(),
        release: resourceRequestSchema,
        verify: resourceRequestSchema.optional(),
        billing: z
          .enum(["supplier_account", "prepaid"])
          .default("supplier_account"),
      }),
    )
    .default([]),
  releases: z.array(binding).default([]),
});
export type ResourcePlan = z.infer<typeof resourcePlanSchema>;
