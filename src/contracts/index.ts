import { z } from "zod";
import { resourcePlanSchema, type ResourcePlan } from "./resource-plan";

export const moneySchema = z.string().regex(/^(0|[1-9]\d{0,17})$/);
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
  credentialMode: z.enum(["platform", "customer"]),
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
export type ToolSource = "o11" | "treg" | "agentmuxer" | "custom";
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
    url: string;
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
  providerRequest?: boolean;
  resultProjection?: { path: string; fields: string[]; excludedFields: string[] };
  unavailableReason?: string;
  replacementToolId?: string;
  docsUrl?: string;
  bodyType?: "json" | "form" | "multipart" | "binary";
  providerAsync?: Record<string, unknown>;
  pricingModel?: Record<string, unknown>;
  cliProfileId?: string;
  effect?: "read" | "write";
  credentialProvider?: string;
  credentialFields?: string[];
  price: {
    micros: string | null;
    basis: "free" | "call" | "variable";
    evidence: string;
    requiresSupplierRate?: boolean;
    unit?: string;
    rates?: { micros: string; unit: string; per: number }[];
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
  engineUnit?: Record<string, unknown>;
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
      name: z.enum(["o11", "treg", "agentmuxer", "custom"]),
      id: z.string(),
      revision: z.string(),
      url: z.url(),
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
    providerRequest: z.boolean().optional(),
    resultProjection: z.object({ path: z.string(), fields: z.array(z.string()), excludedFields: z.array(z.string()) }).optional(),
    unavailableReason: z.string().optional(),
    replacementToolId: z.string().optional(),
    docsUrl: z.url().optional(),
    bodyType: z.enum(["json", "form", "multipart", "binary"]).optional(),
    providerAsync: z.record(z.string(), z.unknown()).optional(),
    pricingModel: z.record(z.string(), z.unknown()).optional(),
    cliProfileId: z.string().optional(),
    effect: z.enum(["read", "write"]).optional(),
    credentialProvider: z.string().optional(),
    credentialFields: z.array(z.string().min(1)).optional(),
    price: z.object({
      micros: moneySchema.nullable(),
      basis: z.enum(["free", "call", "variable"]),
      evidence: z.string(),
      requiresSupplierRate: z.boolean().optional(),
      unit: z.string().optional(),
      rates: z.array(z.object({ micros: moneySchema, unit: z.string(), per: z.number().positive() })).optional(),
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
    engineUnit: z.record(z.string(), z.unknown()).optional(),
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
export function supportsCustomerAccount(
  tool: Pick<
    ToolDefinition,
    "lifecycle" | "workflowOperation" | "customerAuth"
  >,
) {
  return (
    tool.lifecycle !== "workspace" &&
    tool.workflowOperation !== "mind.send-email" &&
    (tool.lifecycle !== "payment" || Boolean(tool.customerAuth?.length))
  );
}
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
