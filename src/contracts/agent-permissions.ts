import { z } from "zod";
import { moneySchema } from "./index.js";

const positiveMoney = moneySchema.refine(value => BigInt(value) > 0n, "Enter an amount above zero");
const limits = { perCardLimitMicros: positiveMoney, monthlyLimitMicros: positiveMoney };
const withinMonthlyLimit = (value: { perCardLimitMicros: string; monthlyLimitMicros: string }) =>
  BigInt(value.perCardLimitMicros) <= BigInt(value.monthlyLimitMicros);
const limitError = { message: "The card limit cannot exceed the monthly total", path: ["perCardLimitMicros"] };
export const cardCreationLimitsSchema = z.strictObject(limits).refine(withinMonthlyLimit, limitError);
// Persist the resolved wallet and tool ceiling; older grants also retain their source card.
export const cardCreationPermissionSchema = z.strictObject({
  walletId: z.uuid(), sourceCardId: z.uuid().optional(), ...limits,
  toolIds: z.array(z.string().min(1).max(250)).min(1).max(1000),
}).refine(withinMonthlyLimit, limitError);
const legacyCreationConsentSchema = cardCreationPermissionSchema.safeExtend({ sourceCardId: z.uuid() });
const permissionFlags = {
  runTools: z.boolean().default(true),
  manageCreatedCards: z.boolean().default(false),
  manageExistingCards: z.boolean().default(false),
  manageApiKeys: z.boolean().default(false),
};
// Existing connections retain tool access, but receive no management authority.
export const agentPermissionsSchema = z.strictObject({
  ...permissionFlags, createCards: cardCreationPermissionSchema.nullable().default(null),
});
export type AgentPermissions = z.infer<typeof agentPermissionsSchema>;
// Approval supplies limits; the server resolves issuance from the approved wallet scope.
// Full legacy consent remains accepted without broadening its saved tool ceiling.
export const agentPermissionApprovalSchema = z.strictObject({
  ...permissionFlags,
  createCards: z.union([cardCreationLimitsSchema, legacyCreationConsentSchema]).nullable().default(null),
});
export type AgentPermissionApproval = z.infer<typeof agentPermissionApprovalSchema>;

export const managementOperationSchemas = {
  connection_permissions: z.strictObject({}),
  create_card: z.strictObject({
    requestId: z.uuid(), walletId: z.uuid().optional(), name: z.string().trim().min(1).max(100),
    limitMicros: positiveMoney, toolIds: z.array(z.string().min(1).max(250)).min(1).max(1000).optional(),
  }),
  update_card: z.strictObject({
    id: z.uuid(), name: z.string().trim().min(1).max(100).optional(),
    status: z.enum(["active", "paused"]).optional(), limitMicros: moneySchema.optional(),
  }).refine(value => value.name !== undefined || value.status !== undefined || value.limitMicros !== undefined, "Choose a change"),
  api_keys: z.strictObject({ cursor: z.uuid().optional() }),
  create_api_key: z.strictObject({ requestId: z.uuid(), targetCardId: z.uuid(), name: z.string().trim().min(1).max(100) }),
  revoke_api_key: z.strictObject({ id: z.uuid() }),
};
export const managementOperationDescriptions: Record<keyof typeof managementOperationSchemas, string> = {
  connection_permissions: "Read this connection's approved agent permissions and card-creation limits. Does not change access.",
  create_card: "Create a card in this connection’s resolved approved wallet (walletId is optional), within the connection's per-card and shared monthly allowance. Reuse requestId for retries.",
  update_card: "Rename, pause or resume an allowed card. Adjust created-card limits within the approved ceiling; existing-card limits can only be lowered.",
  api_keys: "List keys delegated by this connection, without revealing secrets. Follow cursor for more.",
  create_api_key: "Create a tool-only key for one allowed card. The key inherits this connection's access ceiling and revocation. Reuse requestId for retries; a lost secret must be revoked and replaced.",
  revoke_api_key: "Revoke a key delegated by this connection. Cannot revoke unrelated keys or the parent connection.",
};
