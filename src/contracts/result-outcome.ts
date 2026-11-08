import { z } from "zod";
import { catalogToolIds, matchesToolId, recordOutcome } from "./record-output-contracts.js";
export { recordOutputContracts, recordOutcome, emailPattern, missPlaceholders, matchesToolId } from "./record-output-contracts.js";
export { emailConfidence, emailConfidenceSchema, type EmailConfidence } from "./email-confidence.js";

export const resultOutcomeSchema = z.object({
  status: z.enum(["partial", "failed"]), successfulItems: z.number().int().nonnegative(),
  failedItems: z.number().int().positive(), message: z.string(),
});
export type ResultOutcome = z.infer<typeof resultOutcomeSchema>;
/** Exa reports per-URL failures inside a successful HTTP response. Empty searches remain successful. */
export function providerResultOutcome(toolId: string, result: unknown) {
  if (!["o11:exa:exa#contents", "agentmuxer:exa:exa-contents-page-text",
    "exa:exa#contents", "exa:exa-contents-page-text"].includes(toolId)) return undefined;
  const parsed = z.object({ statuses: z.array(z.object({ status: z.enum(["success", "error"]) })).min(1) }).safeParse(result);
  if (!parsed.success) return undefined;
  const failedItems = parsed.data.statuses.filter(item => item.status === "error").length;
  if (!failedItems) return undefined;
  const successfulItems = parsed.data.statuses.length - failedItems;
  return resultOutcomeSchema.parse({ status: successfulItems ? "partial" : "failed", successfulItems, failedItems,
    message: successfulItems ? "Some requested pages could not be retrieved. Inspect result.statuses." : "None of the requested pages could be retrieved. Inspect result.statuses before retrying." });
}

export const outputQualitySchema = z.object({
  status: z.enum(["complete", "partial", "failed", "empty", "unknown"]),
  basis: z.enum(["recorded_outcome", "provider_contract", "upstream_failure", "unclassified"]),
  successfulItems: z.number().int().nonnegative().optional(),
  failedItems: z.number().int().nonnegative().optional(),
});
export type OutputQuality = z.infer<typeof outputQualitySchema>;

export const exaSearchToolIds = [
  "o11:exa:exa#search", "exa:exa#search",
  "agentmuxer:exa:exa-search", "exa:exa-search",
] as const;
export const exaContentsToolIds = [
  "o11:exa:exa#contents", "agentmuxer:exa:exa-contents-page-text",
  "exa:exa#contents", "exa:exa-contents-page-text",
] as const;

/** Reviewed response containers only. These fields establish output shape, never contact verification. */
export const arrayOutputContracts = [
  { toolIds: exaSearchToolIds, path: ["results"], rowFields: ["url"], sourceUrl: "https://exa.ai/docs/reference/search" },
  // apollo.people.search is the catalog's name for the same mixed_people/api_search endpoint.
  { toolIds: ["o11:apollo:apollo#mixed_people/api_search", "apollo:apollo#mixed_people/api_search", ...catalogToolIds("apollo", "apollo.people.search")],
    path: ["people"], rowFields: ["id"], sourceUrl: "https://docs.apollo.io/reference/people-api-search" },
  { toolIds: ["o11:apollo:apollo#mixed_companies/search", "apollo:apollo#mixed_companies/search"],
    path: ["organizations"], rowFields: ["id"], sourceUrl: "https://docs.apollo.io/reference/organization-search" },
  { toolIds: ["o11:apollo:apollo#organizations/{organization_id}/job_postings", "apollo:apollo#organizations/{organization_id}/job_postings"],
    path: ["organization_job_postings"], rowFields: ["id", "title", "url"], sourceUrl: "https://docs.apollo.io/reference/organization-jobs-postings" },
  // Lead ids are numbers; fullName is the string every returned lead carries.
  { toolIds: catalogToolIds("dropleads", "dropleads.people.search"), path: ["data", "leads"], rowFields: ["fullName"],
    sourceUrl: "https://dropleads.readme.io/reference" },
] as const;

const resultRows = z.object({ results: z.array(z.object({ url: z.string().min(1) })) });
const contentsStatuses = z.object({ statuses: z.array(z.object({ status: z.enum(["success", "error"]) })).min(1) });
const unknown = (): OutputQuality => ({ status: "unknown", basis: "unclassified" });

/**
 * Output completeness is not a usefulness rating or a settlement decision. Only reviewed response
 * contracts establish a positive result; arbitrary nonempty JSON and unfamiliar errors stay unknown.
 * Exa contracts: https://exa.ai/docs/reference/search and /get-contents, reviewed 2026-10-25.
 */
export function outputQuality(input: {
  toolId: string;
  state: string;
  result: unknown;
  resultOutcome?: unknown;
  upstreamStatus?: number | null;
  /** A trusted execution adapter rejected before dispatch to the underlying provider. */
  gatewayRejected?: boolean;
}): OutputQuality {
  if (!["succeeded", "failed"].includes(input.state)) return unknown();
  if (input.gatewayRejected) return unknown();
  const recorded = resultOutcomeSchema.safeParse(input.resultOutcome);
  const stored = input.result !== null && typeof input.result === "object" && !Array.isArray(input.result)
    && (Reflect.get(input.result, "delivery") === "stored" || Reflect.get(input.result, "metadataIncomplete") === true);
  const outcome = recorded.success ? recorded.data : stored ? undefined : providerResultOutcome(input.toolId, input.result);
  if (outcome) return {
    status: outcome.status, basis: recorded.success ? "recorded_outcome" : "provider_contract",
    successfulItems: outcome.successfulItems, failedItems: outcome.failedItems,
  };
  if (stored) return unknown();
  // A reviewed single-record miss is a legitimate "nothing found" even when the provider answered 404.
  const record = recordOutcome(input.toolId, input.state, input.result);
  if (record) return { status: record, basis: "provider_contract", successfulItems: record === "complete" ? 1 : 0, failedItems: 0 };
  if (input.state === "failed") {
    // Caller input, credentials, rate limits and an unclassified 404 do not establish endpoint failure.
    return input.upstreamStatus === 408 || Number.isInteger(input.upstreamStatus) && input.upstreamStatus! >= 500 && input.upstreamStatus! <= 599
      ? { status: "failed", basis: "upstream_failure" } : unknown();
  }
  const contents = exaContentsToolIds.some(id => id === input.toolId);
  const contract = arrayOutputContracts.find(item => matchesToolId(item.toolIds, input.toolId));
  if (contract) {
    const body = z.record(z.string(), z.unknown()).safeParse(input.result);
    if (!body.success || body.data.error !== undefined) return unknown();
    const row = z.object(Object.fromEntries(contract.rowFields.map(field => [field, z.string().min(1)])));
    const rows = z.array(row).safeParse(contract.path.reduce<unknown>((value, key) =>
      value !== null && typeof value === "object" && !Array.isArray(value) ? Reflect.get(value, key) : undefined, body.data));
    if (!rows.success) return unknown();
    return { status: rows.data.length ? "complete" : "empty", basis: "provider_contract",
      successfulItems: rows.data.length, failedItems: 0 };
  }
  if (!contents) return unknown();
  if (input.result !== null && typeof input.result === "object" && Object.hasOwn(input.result, "error")) return unknown();
  const rows = resultRows.safeParse(input.result);
  if (!rows.success) return unknown();
  if (contents) {
    const statuses = contentsStatuses.safeParse(input.result);
    if (!statuses.success || statuses.data.statuses.length !== rows.data.results.length ||
      statuses.data.statuses.some(item => item.status !== "success")) return unknown();
  }
  return { status: rows.data.results.length ? "complete" : "empty", basis: "provider_contract",
    successfulItems: rows.data.results.length, failedItems: 0 };
}

/** Neutral observations do not turn unknown output or a legitimate no-match into a failed task. */
export function outputQualitySignal(quality: OutputQuality): "positive" | "negative" | "unknown" {
  if (quality.status === "complete") return "positive";
  if (quality.status === "failed") return "negative";
  return "unknown";
}
