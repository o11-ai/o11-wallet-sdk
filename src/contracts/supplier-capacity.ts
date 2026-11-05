import { z } from "zod";

const id = z.string().trim().min(1).max(250);
export const nativeQuantitySchema = z.string().regex(/^(0|[1-9]\d{0,20})(\.\d{1,9})?$/);
export const supplierMeterQuantitySchema = z.object({
  meterId: id, unit: id, quantity: nativeQuantitySchema,
}).strict();
export type SupplierMeterQuantity = z.infer<typeof supplierMeterQuantitySchema>;

const credentialSourceSchema = z.object({
  kind: z.literal("team_configuration"), accountId: id, configurationId: z.uuid(),
  configurationRevision: z.number().int().positive(), environment: z.enum(["development", "production"]),
  expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
}).strict();

export const supplierAccountSchema = z.object({
  id, provider: id, credentialProvider: id, fundingProvider: id,
  credentialsRef: id, slot: id.default("primary"), revision: id.default("1"),
  credentialSource: credentialSourceSchema.optional(),
  credentialVersions: z.array(z.object({
    credentialsRef: id, revision: id, source: credentialSourceSchema.optional(),
    state: z.enum(["active", "draining", "retired"]),
  }).strict()).max(1000).optional(),
  state: z.enum(["active", "draining", "retired"]).default("active"),
  mode: z.enum(["observe", "enforce"]).default("observe"),
  allowedToolIds: z.array(id).max(10_000).default([]),
  meters: z.array(z.object({
    id, unit: id, kind: z.enum(["prepaid", "quota", "postpaid"]),
    pool: z.enum(["free", "purchased", "unknown"]).default("unknown"),
    required: z.boolean().default(true),
  }).strict()).max(100).default([]),
  trialAllowance: z.object({
    successfulCallsPerWorkspaceDay: z.number().int().positive().max(1_000_000),
    eligibleToolIds: z.array(id).min(1).max(10_000),
  }).strict().optional(),
  pacing: z.object({
    requests: z.number().int().positive().max(1_000_000),
    perMs: z.number().int().positive().max(86_400_000),
    maxConcurrentRequests: z.number().int().positive().max(100_000).optional(),
    maxConcurrentRuns: z.number().int().positive().max(100_000).optional(),
  }).strict().optional(),
  capacitySignals: z.array(z.object({
    kind: z.enum(["balance", "quota", "authentication", "burst", "concurrency"]),
    status: z.number().int().min(400).max(599),
    bodyContains: z.string().min(1).max(250),
  }).strict()).max(100).default([]),
}).strict().superRefine((account, ctx) => {
  if (!account.credentialVersions) return;
  const references = new Set<string>();
  for (const [index, version] of account.credentialVersions.entries()) {
    if (references.has(version.credentialsRef)) ctx.addIssue({ code: "custom", path: ["credentialVersions", index], message: "Credential references must identify one immutable version." });
    references.add(version.credentialsRef);
    if (version.source && (version.source.accountId !== account.id || version.credentialsRef !== `team:${version.source.configurationId}:${version.source.configurationRevision}`
        || version.revision !== `team:${version.source.configurationId}:${version.source.configurationRevision}`)) ctx.addIssue({ code: "custom", path: ["credentialVersions", index], message: "Credential provenance must match its supplier account and immutable reference." });
  }
  const selected = account.credentialVersions.find(version => version.credentialsRef === account.credentialsRef);
  if (!selected || selected.revision !== account.revision || JSON.stringify(selected.source) !== JSON.stringify(account.credentialSource)
      || account.state === "active" && selected.state !== "active") ctx.addIssue({ code: "custom", path: ["credentialVersions"], message: "The selected credential must match the current account revision and provenance." });
});
export type SupplierAccount = z.infer<typeof supplierAccountSchema>;

export const supplierAccountSlotsSchema = z.array(supplierAccountSchema).max(10_000).superRefine((rows, ctx) => {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) ctx.addIssue({ code: "custom", message: "Supplier account IDs must be unique." });
    ids.add(row.id);
  }
});

export const supplierObservationSchema = z.object({
  accountId: id, meterId: id, unit: id, remaining: nativeQuantitySchema,
  observedAt: z.string().datetime({ offset: true }), validUntil: z.string().datetime({ offset: true }),
  /** Set only when supplier evidence proves that earlier completed usage is reflected. */
  coveredThrough: z.string().datetime({ offset: true }).optional(),
  source: id, sourceRevision: id,
}).strict().superRefine((row, ctx) => {
  if (Date.parse(row.validUntil) <= Date.parse(row.observedAt)) ctx.addIssue({ code: "custom", message: "A capacity observation needs a positive validity window." });
  if (row.coveredThrough && Date.parse(row.coveredThrough) > Date.parse(row.observedAt)) ctx.addIssue({ code: "custom", message: "Usage coverage cannot be later than its observation." });
});
export type SupplierObservation = z.infer<typeof supplierObservationSchema>;

export type SupplierCapacityState = "held" | "unknown" | "settled" | "released";
export type SupplierCapacityDecision = { allowed: true; observedOnly: boolean; warnings: string[] };
export type SupplierPermitDecision =
  | { allowed: true; permitId: string; leaseExpiresAt: string }
  | { allowed: false; retryAt: string; reason: "pacing" | "concurrency" | "cooldown" };

/** Decimal native units use an exact nine-place fixed scale, independently of money. */
export function nativeQuantity(value: number | string): string {
  const text = typeof value === "number" ? (Number.isFinite(value) && value >= 0 ? value.toFixed(9).replace(/\.?0+$/, "") || "0" : "") : value;
  if (typeof value === "number" && Number(text) !== value) throw new RangeError("Supplier native units need an exact decimal with at most nine places.");
  return nativeQuantitySchema.parse(text);
}
export function quantityAtoms(value: string): bigint {
  const [whole, fraction = ""] = nativeQuantitySchema.parse(value).split(".");
  return BigInt(whole!) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
}
export function atomsQuantity(value: bigint): string {
  if (value < 0n) throw new RangeError("Native quantities cannot be negative.");
  return `${value / 1_000_000_000n}.${(value % 1_000_000_000n).toString().padStart(9, "0")}`.replace(/\.?0+$/, "");
}
