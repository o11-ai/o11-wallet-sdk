import { z } from "zod";
import { catalogToolIds, matchesToolId } from "./record-output-contracts.js";

/**
 * One scale for the email verification labels each provider uses. The provider's own label is kept in
 * `providerLabel`, and the result itself is never changed.
 * - verified: the provider confirmed this mailbox accepts mail.
 * - risky: likely deliverable but not confirmed, for example TryKitt valid-risky (identity found, SMTP check
 *   inconclusive) or a guessed address. Not the same as catch-all.
 * - catch_all: the domain accepts every address, so this mailbox cannot be confirmed.
 * - invalid: the provider found that this address does not receive mail.
 * - unknown: no label, or a label this mapping does not cover.
 */
export const emailConfidenceSchema = z.object({
  status: z.enum(["verified", "risky", "catch_all", "invalid", "unknown"]),
  providerLabel: z.string().nullable(),
  meaning: z.string(),
});
export type EmailConfidence = z.infer<typeof emailConfidenceSchema>;
type Status = EmailConfidence["status"];

const meanings: Record<Status, string> = {
  verified: "The provider confirmed this mailbox accepts mail.",
  risky: "Likely deliverable, but the provider could not confirm the mailbox. Expect some bounces.",
  catch_all: "The domain accepts every address, so this mailbox could not be confirmed.",
  invalid: "The provider found that this address does not receive mail.",
  unknown: "The provider gave no verification label for this address.",
};
const labels = {
  trykitt: { valid: "verified", "valid-risky": "risky", invalid: "invalid" },
  dropleads: { valid: "verified", catch_all: "catch_all", invalid: "invalid" },
  // Hunter: https://hunter.io/api-documentation/v2#email-verifier (webmail and unknown stay unknown).
  hunter: { valid: "verified", accept_all: "catch_all", invalid: "invalid", disposable: "risky" },
  apollo: { verified: "verified" },
  // QuickEnrich gives no label, only `email_verification_date` (see dated below).
  quickenrich: {},
} satisfies Record<string, Record<string, Status>>;
type Provider = keyof typeof labels;
const sources: { toolIds: readonly string[]; provider: Provider; email: readonly string[]; label: readonly string[] }[] = [
  ...["trykitt.people.email.find", "trykitt.people.email.verify"].map(operation => ({
    toolIds: catalogToolIds("trykitt", operation), provider: "trykitt" as const, email: ["email"], label: ["validity"] })),
  { toolIds: catalogToolIds("dropleads", "dropleads.people.enrich.verified"), provider: "dropleads", email: ["person", "email"], label: ["person", "email_status"] },
  ...["hunter.people.email.find", "hunterio#email-finder"].map(operation => ({
    toolIds: catalogToolIds("hunterio", operation), provider: "hunter" as const, email: ["data", "email"], label: ["data", "verification", "status"] })),
  ...["apollo.people.enrich", "apollo#people/match"].map(operation => ({
    toolIds: catalogToolIds("apollo", operation), provider: "apollo" as const, email: ["person", "email"], label: ["person", "email_status"] })),
  { toolIds: catalogToolIds("quickenrich", "quickenrich.people.email.find"), provider: "quickenrich", email: ["data", "email"], label: ["data", "email_verification_date"] },
];

const at = (value: unknown, path: readonly string[]) => path.reduce<unknown>((current, key) =>
  current !== null && typeof current === "object" && !Array.isArray(current) ? Reflect.get(current, key) : undefined, value);
/**
 * QuickEnrich's signal is the date it last verified the mailbox ("N/A" when never). The catalog notes this is not a
 * fresh SMTP check, so the meaning names the date and the agent judges how stale it is.
 */
const dated = /^\d{4}-\d{2}-\d{2}$/;
const confidence = (provider: Provider, label: unknown): EmailConfidence => {
  const providerLabel = typeof label === "string" && label ? label : null;
  if (provider === "quickenrich" && providerLabel !== null && dated.test(providerLabel))
    return { status: "verified", providerLabel, meaning: `The provider verified this mailbox on ${providerLabel}; it was not re-checked for this call.` };
  const map: Record<string, Status> = labels[provider];
  const status: Status = providerLabel !== null && Object.hasOwn(map, providerLabel) ? map[providerLabel]! : "unknown";
  return { status, providerLabel, meaning: meanings[status] };
};

/** Only for results that hold an email address; undefined for other tools and for misses. */
export function emailConfidence(toolId: string, result: unknown): EmailConfidence | undefined {
  // The routed finder records the verifier that checked its answer.
  if (toolId === "o11.people.email.find") {
    const email = at(result, ["output", "email"]), check = at(result, ["route", "verification"]);
    if (typeof email !== "string" || !email.includes("@")) return undefined;
    const provider = at(check, ["provider"]), checked = at(check, ["email"]) === email;
    return checked && typeof provider === "string" && provider in labels
      ? confidence(provider as Provider, at(check, ["status"])) : confidence("quickenrich", undefined);
  }
  const source = sources.find(item => matchesToolId(item.toolIds, toolId));
  const email = source && at(result, source.email);
  if (!source || typeof email !== "string" || !email.includes("@")) return undefined;
  return confidence(source.provider, at(result, source.label));
}
