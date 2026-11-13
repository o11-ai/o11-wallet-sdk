import { z } from "zod";
import { supplierPriceReferenceSchema, type SupplierPriceReference } from "./supplier-price-reference.js";
export { supplierPriceReferenceSchema, type SupplierPriceReference } from "./supplier-price-reference.js";
import { resourcePlanSchema, type ResourcePlan } from "./resource-plan.js";
import { moneySchema } from "./money.js";
import { providerAuthorizationRequirementSchema, type ProviderAuthorizationRequirement } from "./provider-authorization.js";
import { providerBillingSchema, type ProviderBilling } from "./execution-account.js";
import { priceRangeShape, publishedTariffSchema, tariffRateSchema, type PublishedTariff } from "./published-tariff.js";
import { publishedInputSchema, type PublishedInput } from "./published-input.js";
import { toolHealthSchema, type ToolHealth } from "./health.js";
import { decisionEvidenceSchema, type DecisionEvidence } from "./decision-evidence.js";
export { moneySchema, dollarsToMicros, formatMoney } from "./money.js";
export { supportsCustomerAccount } from "./accounts.js";

export const platformAccountHealthSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unknown") }),
  z.object({ state: z.enum(["available", "restricted"]), checkedAt: z.iso.datetime(), retryAt: z.iso.datetime() }),
]);
export type PlatformAccountHealth = z.infer<typeof platformAccountHealthSchema>;

export const inputSchema = z.strictObject({
  pathParams: z.record(z.string(), z.string()).default({}),
  queryParams: z.record(z.string(), z.json()).default({}),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).default({}),
});
export const invocationSchema = z.strictObject({
  toolId: z.string().min(1).max(250),
  idempotencyKey: z.string().min(1).max(200),
  input: inputSchema,
  connectionId: z.string().uuid().optional(),
  quoteContext: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  credentialMode: z.enum(["platform", "customer"]).default("platform")
    .describe("Use the o11 account by default. Select customer only for an explicitly chosen connected provider account."),
  maxCostMicros: moneySchema,
  allowWrite: z.boolean().default(false),
  acceptRecurring: z.boolean().default(false),
});
export type InvocationOptions = z.input<typeof invocationSchema>;
export type ToolInputOptions = z.input<typeof inputSchema>;
export type InvocationRequest = z.infer<typeof invocationSchema>;
export type ToolInput = z.infer<typeof inputSchema>;
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
/** Catalog import sources stay private; public definitions report "o11", and clients accept any name. */
export type ToolSource = string;
export interface ToolDefinition {
  id: string;
  provider: string;
  name: string;
  description: string;
  method: string;
  baseUrl: string;
  path: string;
  input: Record<string, unknown>;
  example: Record<string, unknown>;
  source: {
    name: ToolSource;
    id: string;
    revision: string;
    url?: string;
    aliases?: string[];
  };
  auth: {
    location: "header" | "query" | "body" | "path";
    name: string;
    format: string;
    encoding?: "base64";
  }[];
  customerAuth?: ToolDefinition["auth"];
  identifierNamespace?: "workspace-mailbox";
  bodyEnvelope?: "single-task-array";
  successCondition?: { path: string; equals: Json[] };
  requestDefaults?: Record<string, unknown>;
  requestHeaders?: Record<string, string>;
  querySerialization?: Record<string, "json" | "comma" | "repeat">;
  providerRequest?: boolean;
  resultProjection?: { path: string; fields: string[]; excludedFields: string[] };
  unavailableReason?: string;
  inputContract?: PublishedInput;
  replacementToolId?: string;
  docsUrl?: string;
  documentation?: {
    referenceUrl: string;
    verification: "captured_contract_only" | "partial_upstream_review" | "legacy_contract_unverified";
    upstream?: {
      url: string;
      scope: "reference" | "provider_reference" | "transport_reference" | "partial_contract";
      reachability: "http_200" | "blocked" | "unresolved" | "access_required" | "not_reviewed";
      checkedAt?: string;
    };
  };
  bodyType?: "json" | "form" | "multipart" | "binary";
  providerAsync?: Record<string, unknown>;
  pricingModel?: Record<string, unknown>;
  cliProfileId?: string;
  effect?: "read" | "write";
  credentialProvider?: string;
  credentialFields?: string[];
  authorization?: ProviderAuthorizationRequirement;
  billing?: ProviderBilling;
  price: {
    micros: string | null;
    basis: "free" | "call" | "variable";
    evidence: string;
    requiresSupplierRate?: boolean;
    supplierQuoteAtExecution?: boolean;
    supplierReference?: SupplierPriceReference;
    modelTokenPricing?: { directoryToolId: string; sourceUrl: string; formula: string };
    tariff?: PublishedTariff;
    pricingBasis?: "supplier_at_cost" | "published_tariff";
    unavailableReason?: string;
    unit?: string;
    rates?: z.infer<typeof tariffRateSchema>[];
    /** `$0.01–$0.03 (avg $0.0233)` or `$0.01` (./price-range-text); set where the response read billed history. */
    priceText?: string;
    priceMinMicros?: string;
    priceMaxMicros?: string;
    priceAvgMicros?: string | null;
    priceAvgN?: number | null;
  };
  lifecycle:
    | "http"
    | "async"
    | "resource"
    | "cli"
    | "payment"
    | "workspace"
    | "workflow";
  workflowOperation?:
    | "agentline.update-number"
    | "research.run"
    | "recall.record"
    | "mind.send-email";
  workspaceOperation?:
    | "files.put"
    | "files.cat"
    | "files.ls"
    | "files.mkdir"
    | "files.mv"
    | "files.rm";
  resourcePlan?: ResourcePlan;
  availability: "configured" | "requires_adapter";
  notes: string[];
  internal?: boolean;
  recurring?: boolean;
  requiresCustomerCredentials?: boolean;
  platformAccountAvailable?: boolean;
  platformAccountHealth?: PlatformAccountHealth;
  health?: ToolHealth;
  decisionEvidence?: DecisionEvidence;
  platformAccountInstalled?: boolean;
  engineUnit?: Record<string, unknown>;
  /**
   * Declared outcome rules (the engine's `output.outcomes` shape) for a tool that does not run through the engine,
   * such as a gateway route: copied from the supplier's own reviewed rules, read where the call settles.
   */
  outcomes?: Record<string, unknown>[];
  creditRatesMicros?: Record<string, string>;
}
export const toolDefinitionSchema: z.ZodType<ToolDefinition> = z
  .object({
    id: z.string().min(1),
    provider: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    method: z.string(),
    baseUrl: z.string(),
    path: z.string(),
    input: z.record(z.string(), z.unknown()),
    example: z.record(z.string(), z.unknown()),
    source: z.object({
      name: z.string().min(1),
      id: z.string(),
      revision: z.string(),
      url: z.url().optional(),
      aliases: z.array(z.string()).optional(),
    }),
    auth: z.array(
      z.object({
        location: z.enum(["header", "query", "body", "path"]),
        name: z.string(),
        format: z.string(),
        encoding: z.literal("base64").optional(),
      }),
    ),
    customerAuth: z
      .array(
        z.object({
          location: z.enum(["header", "query", "body", "path"]),
          name: z.string(),
          format: z.string(),
          encoding: z.literal("base64").optional(),
        }),
      )
      .optional(),
    identifierNamespace: z.literal("workspace-mailbox").optional(),
    bodyEnvelope: z.literal("single-task-array").optional(),
    resourcePlan: resourcePlanSchema.optional(),
    successCondition: z
      .object({ path: z.string(), equals: z.array(z.json()) })
      .optional(),
    requestDefaults: z.record(z.string(), z.unknown()).optional(),
    requestHeaders: z.record(z.string(), z.string()).optional(),
    querySerialization: z.record(z.string(), z.enum(["json", "comma", "repeat"])).optional(),
    providerRequest: z.boolean().optional(),
    resultProjection: z.object({ path: z.string(), fields: z.array(z.string()), excludedFields: z.array(z.string()) }).optional(),
    unavailableReason: z.string().optional(),
    inputContract: publishedInputSchema.optional(),
    replacementToolId: z.string().optional(),
    docsUrl: z.url().optional(),
    documentation: z.object({
      referenceUrl: z.url(),
      verification: z.enum(["captured_contract_only", "partial_upstream_review", "legacy_contract_unverified"]),
      upstream: z.object({
        url: z.url(),
        scope: z.enum(["reference", "provider_reference", "transport_reference", "partial_contract"]),
        reachability: z.enum(["http_200", "blocked", "unresolved", "access_required", "not_reviewed"]),
        checkedAt: z.string().optional(),
      }).optional(),
    }).optional(),
    bodyType: z.enum(["json", "form", "multipart", "binary"]).optional(),
    providerAsync: z.record(z.string(), z.unknown()).optional(),
    pricingModel: z.record(z.string(), z.unknown()).optional(),
    cliProfileId: z.string().optional(),
    effect: z.enum(["read", "write"]).optional(),
    credentialProvider: z.string().optional(),
    credentialFields: z.array(z.string().min(1)).optional(),
    authorization: providerAuthorizationRequirementSchema.optional(),
    billing: providerBillingSchema.optional(),
    price: z.object({
      micros: moneySchema.nullable(),
      basis: z.enum(["free", "call", "variable"]),
      evidence: z.string(),
      requiresSupplierRate: z.boolean().optional(),
      supplierQuoteAtExecution: z.boolean().optional(),
      supplierReference: supplierPriceReferenceSchema.optional(),
      modelTokenPricing: z.object({ directoryToolId: z.string().min(1), sourceUrl: z.url(), formula: z.string().min(1) }).optional(),
      tariff: publishedTariffSchema.optional(),
      pricingBasis: z.enum(["supplier_at_cost", "published_tariff"]).optional(),
      unavailableReason: z.string().optional(),
      unit: z.string().optional(),
      rates: z.array(tariffRateSchema).optional(),
      ...priceRangeShape,
    }),
    lifecycle: z.enum([
      "http",
      "async",
      "resource",
      "cli",
      "payment",
      "workspace",
      "workflow",
    ]),
    workflowOperation: z
      .enum([
        "agentline.update-number",
        "research.run",
        "recall.record",
        "mind.send-email",
      ])
      .optional(),
    workspaceOperation: z
      .enum([
        "files.put",
        "files.cat",
        "files.ls",
        "files.mkdir",
        "files.mv",
        "files.rm",
      ])
      .optional(),
    availability: z.enum(["configured", "requires_adapter"]),
    notes: z.array(z.string()),
    internal: z.boolean().optional(),
    recurring: z.boolean().optional(),
    requiresCustomerCredentials: z.boolean().optional(),
    platformAccountAvailable: z.boolean().optional(),
    platformAccountHealth: platformAccountHealthSchema.optional(),
    health: toolHealthSchema.optional(),
    decisionEvidence: decisionEvidenceSchema.optional(),
    platformAccountInstalled: z.boolean().optional(),
    engineUnit: z.record(z.string(), z.unknown()).optional(),
    outcomes: z.array(z.record(z.string(), z.unknown())).optional(),
    creditRatesMicros: z.record(z.string(), moneySchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.availability === "configured" &&
      !["cli", "workspace"].includes(value.lifecycle) &&
      (!value.baseUrl.startsWith("https://") ||
        !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
          value.method,
        ))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Executable tools require an HTTPS destination and HTTP method",
      });
    if (value.lifecycle === "workspace" && !value.workspaceOperation)
      ctx.addIssue({
        code: "custom",
        message: "Workspace tools require a native operation",
      });
    if (value.lifecycle === "workflow" && !value.workflowOperation)
      ctx.addIssue({
        code: "custom",
        message: "Workflow tools require a native operation",
      });
    if (
      value.source.name === "agentmuxer" &&
      value.name.toLowerCase().includes("via parse")
    )
      ctx.addIssue({ code: "custom", message: "Parse listings are excluded" });
  });
