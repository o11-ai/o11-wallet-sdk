/**
 * Reviewed single-record outputs (email finders and person enrichment). A hit field establishes a found record;
 * a miss value establishes the provider's documented "nothing found" answer, which is `empty`, never `failed`.
 * Shapes were checked against recorded results on the verification lanes (2026-11-07) and the cited docs.
 */
export type RecordCheck =
  | { path: readonly string[]; kind: "email" | "text" }
  | { path: readonly string[]; equals: string | null };
export type RecordOutputContract = {
  toolIds: readonly string[]; hit: Extract<RecordCheck, { kind: string }>;
  misses: readonly Extract<RecordCheck, { equals: unknown }>[]; sourceUrl: string;
};

/** The ownerless catalog ID; stored IDs may add a routing-owner prefix, which `matchesToolId` accepts. */
export const catalogToolIds = (provider: string, operation: string) => [`${provider}:${operation}`] as const;
/** True when `toolId` is one of `ids`, or one of them behind any routing-owner prefix ("<owner>:<id>"). */
export const matchesToolId = (ids: readonly string[], toolId: string) =>
  ids.some(id => toolId === id || toolId.endsWith(`:${id}`));

export const emailPattern = "^[^@\\s]+@[^@\\s]+$";
/**
 * Placeholders a provider writes into the hit field instead of omitting it. QuickEnrich answers a miss with
 * HTTP 200 "Employee fetched" and `email: "N/A"` (recorded 2026-11-07). Compared after trim, case-insensitive.
 */
export const missPlaceholders = ["n/a", "", "null", "not found"] as const;
export const recordOutputContracts: readonly RecordOutputContract[] = [
  { toolIds: catalogToolIds("trykitt", "trykitt.people.email.find"), hit: { path: ["email"], kind: "email" },
    misses: [{ path: ["email"], equals: "no-results-found" }], sourceUrl: "https://trykitt.ai/pricing" },
  // The routed email finder wraps its served provider's answer in `output`.
  { toolIds: ["o11.people.email.find"], hit: { path: ["output", "email"], kind: "email" },
    misses: [{ path: ["output", "email"], equals: "no-results-found" }, { path: ["output", "email"], equals: null }],
    sourceUrl: "https://trykitt.ai/pricing" },
  { toolIds: catalogToolIds("quickenrich", "quickenrich.people.email.find"), hit: { path: ["data", "email"], kind: "email" },
    misses: [{ path: ["meta", "reason"], equals: "EMPLOYEE_NOT_FOUND" }], sourceUrl: "https://app.quickenrich.io/docs" },
  // A miss arrives as HTTP 404 with error_code PERSON_NOT_FOUND; the call is failed, the answer is still "no match".
  { toolIds: catalogToolIds("dropleads", "dropleads.people.enrich.verified"), hit: { path: ["person", "email"], kind: "email" },
    misses: [{ path: ["error_code"], equals: "PERSON_NOT_FOUND" }], sourceUrl: "https://dropleads.readme.io/reference/post_api-v2-prime-db-leads-enrich" },
  ...[["hunterio", "hunter.people.email.find"], ["hunterio", "hunterio#email-finder"]].map(([provider, operation]) => ({
    toolIds: catalogToolIds(provider!, operation!), hit: { path: ["data", "email"], kind: "email" as const },
    misses: [{ path: ["data", "email"], equals: null }], sourceUrl: "https://hunter.io/api-documentation/v2#email-finder" })),
  // Apollo documents no stable no-match body (match_confidence "none" has no fixed location), so misses stay unknown.
  ...["apollo.people.enrich", "apollo#people/match"].map(operation => ({
    toolIds: catalogToolIds("apollo", operation), hit: { path: ["person", "id"], kind: "text" as const }, misses: [],
    sourceUrl: "https://docs.apollo.io/reference/people-enrichment" })),
];

const at = (value: unknown, path: readonly string[]) => {
  let current: unknown = value;
  for (const key of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, key)) return undefined;
    current = Reflect.get(current, key);
  }
  return current;
};
const email = new RegExp(emailPattern);
/** "complete" for a found record, "empty" for a documented miss, undefined when the shape is not recognized. */
export function recordOutcome(toolId: string, state: string, result: unknown): "complete" | "empty" | undefined {
  const contract = recordOutputContracts.find(item => matchesToolId(item.toolIds, toolId));
  if (!contract) return undefined;
  const value = at(result, contract.hit.path);
  if (contract.misses.some(miss => at(result, miss.path) === miss.equals)) return "empty";
  if (contract.hit.kind === "email" && typeof value === "string"
    && (missPlaceholders as readonly string[]).includes(value.trim().toLowerCase())) return "empty";
  if (state !== "succeeded" || at(result, ["error"]) !== undefined) return undefined;
  return typeof value === "string" && (contract.hit.kind === "email" ? email.test(value) : value.length > 0) ? "complete" : undefined;
}
