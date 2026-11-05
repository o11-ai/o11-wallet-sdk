import { z } from "zod";

const identifier = z.string().min(1).max(500);

/** Server-resolved account identity, persisted with the admitted price. Never contains secrets. */
export const executionAccountSchema = z.object({
  version: z.literal(1),
  credentialMode: z.enum(["platform", "customer"]),
  connectionId: z.uuid().optional(),
  credentialProvider: identifier,
  fundingProvider: identifier,
  supplierAccountId: identifier,
  supplierAccountRevision: identifier.optional(),
  supplierCredentialsRef: identifier.optional(),
  billingResponsibility: z.enum(["platform", "customer"]),
  chargePolicy: z.enum(["wallet", "provider_direct"]),
  authorizationMethod: identifier.optional(),
  authorizationGrantId: z.uuid().optional(),
  profileRevision: identifier.optional(),
  resourceId: identifier.optional(),
  resourceKind: identifier.optional(),
  tokenRole: z.enum(["access_token", "page_access_token"]).optional(),
}).strict().superRefine((account, ctx) => {
  if (account.credentialMode === "customer" && !account.connectionId)
    ctx.addIssue({ code: "custom", message: "Customer authorization needs its connection identity." });
  if (account.credentialMode === "platform" && account.connectionId)
    ctx.addIssue({ code: "custom", message: "Platform authorization cannot select a customer connection." });
  if ((account.billingResponsibility === "platform") !== (account.chargePolicy === "wallet"))
    ctx.addIssue({ code: "custom", message: "Supplier billing and customer charge policy disagree." });
});
export type ExecutionAccount = z.infer<typeof executionAccountSchema>;

/** A provider's documented billing policy; callers cannot set this on invocations. */
export const providerBillingSchema = z.object({
  version: z.literal(1),
  customerCredentialBilling: z.enum(["customer", "platform", "connection"]),
  fundingProvider: identifier.optional(),
  supplierAccountId: identifier.optional(),
}).strict();
export type ProviderBilling = z.infer<typeof providerBillingSchema>;

export function executionUsesWallet(account: ExecutionAccount | null | undefined, legacyMode: "platform" | "customer"): boolean {
  return account ? account.chargePolicy === "wallet" : legacyMode === "platform";
}
