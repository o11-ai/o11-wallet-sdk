import { z } from "zod";

const identifier = z.string().min(1).max(150);
export const authorizationMethodRequirementSchema = z.object({
  id: identifier,
  scopes: z.array(z.string().min(1)).default([]),
  capability: identifier.optional(),
  tokenRole: z.enum(["access_token", "page_access_token"]).default("access_token"),
  resourceKind: identifier.optional(),
  request: z.object({
    baseUrl: z.url().optional(),
    path: z.string().optional(),
    input: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});
export const providerAuthorizationRequirementSchema = z.object({
  version: z.literal(1),
  defaultMethod: identifier.optional(),
  methods: z.array(authorizationMethodRequirementSchema).min(1),
});
export type AuthorizationMethodRequirement = z.infer<typeof authorizationMethodRequirementSchema>;
export type ProviderAuthorizationRequirement = z.infer<typeof providerAuthorizationRequirementSchema>;

export const authorizationCapabilitySchema = z.object({
  id: identifier, label: z.string(), scopes: z.array(z.string()),
});
export const authorizationProfileSchema = z.object({
  version: z.literal(1), provider: identifier, id: identifier, revision: identifier,
  label: z.string(), capabilities: z.array(authorizationCapabilitySchema),
  resourceKind: identifier.optional(),
  appModes: z.array(z.enum(["curated", "customer_app"])),
  configured: z.boolean(),
  reviewState: z.enum(["approved", "app_roles_only", "unknown"]),
});
export type AuthorizationProfile = z.infer<typeof authorizationProfileSchema>;

export const connectionResourceSchema = z.object({
  id: z.string().min(1).max(500), name: z.string().max(500), kind: identifier,
  parentId: z.string().max(500).optional(),
});
export type ConnectionResource = z.infer<typeof connectionResourceSchema>;
export const connectionSetupStateSchema = z.enum([
  "ready", "resource_required", "permission_required", "reconnect_required", "review_required", "unknown",
]);
export const connectionSummarySchema = z.object({
  id: z.uuid(), provider: z.string(), name: z.string(), status: z.enum(["active", "revoked"]),
  authorizationMethod: z.string().nullable(),
  appMode: z.enum(["curated", "customer_app", "legacy"]).nullable(),
  oauthAppId: z.uuid().nullable(),
  authorizationGrantId: z.uuid().nullable(),
  profileRevision: z.string().nullable(),
  grantedScopes: z.array(z.string()), capabilities: z.array(z.string()),
  grantMetadataKnown: z.boolean(), setupState: connectionSetupStateSchema,
  resource: connectionResourceSchema.nullable(), expiresAt: z.string().nullable(), refreshable: z.boolean(),
  credentialVersion: z.number().int().positive(),
  billingResponsibility: z.enum(["platform", "customer", "unknown"]),
  supplierAccountId: z.string().nullable(),
  lastCheckedAt: z.string().nullable(), lastErrorCode: z.string().nullable(),
});
export type ProviderConnectionSummary = z.infer<typeof connectionSummarySchema>;
export const authorizationRemediationSchema = z.object({
  error: z.literal("PROVIDER_AUTHORIZATION_REQUIRED"),
  reason: z.enum(["method_required", "scope_required", "resource_required", "reconnect_required", "review_required", "unsupported_protocol"]),
  provider: z.string(), connectionId: z.uuid().optional(), method: z.string().optional(), capability: z.string().optional(),
  scopes: z.array(z.string()).default([]), message: z.string(),
  action: z.enum(["connect", "reconnect", "select_resource", "upgrade_permissions", "configure_app"]),
  url: z.string(), retryable: z.boolean().default(false),
});
export type AuthorizationRemediation = z.infer<typeof authorizationRemediationSchema>;

export const startProviderAuthorizationSchema = z.object({
  provider: z.string().min(1).max(100), method: identifier.optional(), capability: identifier.optional(),
  appId: z.uuid().optional(), connectionId: z.uuid().optional(), cardId: z.uuid().optional(),
  returnTo: z.string().max(2000).optional(),
});
export const customerOAuthAppInputSchema = z.object({
  provider: z.string().min(1).max(100), method: identifier.optional(), name: z.string().min(1).max(100),
  clientId: z.string().min(1).max(2000), clientSecret: z.string().max(16000).optional(),
  authorizationUrl: z.url().optional(), tokenUrl: z.url().optional(),
  scopes: z.array(z.string().min(1).max(500)).max(100).default([]),
  tokenAuth: z.enum(["body", "basic", "none"]).optional(), pkce: z.boolean().optional(),
  extraCredentials: z.record(z.string().max(100), z.string().max(16000)).default({}),
});
