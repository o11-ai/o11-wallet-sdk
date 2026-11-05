import { z } from "zod";

export const decisionEvidenceSchema = z.object({
  requiredInputs: z.array(z.object({ location: z.enum(["body", "queryParams", "pathParams", "headers"]), path: z.string() })).max(20),
  inputBasis: z.literal("schema_required_fields"),
  requirementsIncomplete: z.boolean(),
  effect: z.enum(["read", "write"]).optional(),
  recurring: z.boolean().optional(),
  output: z.object({ verification: z.enum(["reviewed_documentation", "unknown"]),
    documentedFields: z.array(z.string()).max(12), sourceUrl: z.url().optional(), reviewedAt: z.string().optional(),
    caveats: z.array(z.string()).max(4) }),
});
export type DecisionEvidence = z.infer<typeof decisionEvidenceSchema>;

const reviewedOutputs: Record<string, DecisionEvidence["output"]> = {
  "exa POST /search": {
    verification: "reviewed_documentation", documentedFields: ["results[].id", "results[].url", "results[].title"],
    sourceUrl: "https://exa.ai/docs/reference/search", reviewedAt: "2026-10-25",
    caveats: ["Documented fields may be absent on individual rows. Inspect the actual result."],
  },
  "exa POST /contents": {
    verification: "reviewed_documentation", documentedFields: ["results[].id", "results[].url", "results[].text", "statuses[].status"],
    sourceUrl: "https://exa.ai/docs/reference/get-contents", reviewedAt: "2026-10-25",
    caveats: ["Each URL can fail inside an outer success. Check statuses and the requested content fields."],
  },
  "apollo POST /mixed_people/api_search": {
    verification: "reviewed_documentation", documentedFields: ["people[].id", "people[].first_name", "people[].last_name_obfuscated", "people[].title", "people[].has_email", "total_entries"],
    sourceUrl: "https://docs.apollo.io/reference/people-api-search", reviewedAt: "2026-10-25",
    caveats: ["Returns prospect previews without email addresses or phone numbers. has_email does not reveal an address."],
  },
  "apollo POST /mixed_companies/search": {
    verification: "reviewed_documentation", documentedFields: ["organizations[].id", "organizations[].name", "organizations[].website_url", "pagination"],
    sourceUrl: "https://docs.apollo.io/reference/organization-search", reviewedAt: "2026-10-25",
    caveats: ["A result page is partial coverage. Preserve company IDs and the actual pagination."],
  },
  "apollo POST /people/match": {
    verification: "reviewed_documentation", documentedFields: ["person.id", "person.name", "person.email", "person.email_status", "person.linkedin_url"],
    sourceUrl: "https://docs.apollo.io/reference/people-enrichment", reviewedAt: "2026-10-25",
    caveats: ["Requires enough identity information to match the intended person. Contact fields can be missing or locked; inspect the actual revealed value and status."],
  },
  "apollo GET /organizations/{organization_id}/job_postings": {
    verification: "reviewed_documentation", documentedFields: ["organization_job_postings[].id", "organization_job_postings[].title", "organization_job_postings[].url", "organization_job_postings[].posted_at", "organization_job_postings[].country"],
    sourceUrl: "https://docs.apollo.io/reference/organization-jobs-postings", reviewedAt: "2026-10-25",
    caveats: ["Requires the Apollo organization ID. Listings support hiring inferences; they do not establish company spending or complete headcount."],
  },
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Compact navigation evidence. Input requirements come from inspect; output fields are documented possibilities. */
export function decisionEvidence(input: {
  provider: string; method: string; endpoint: string; input: Record<string, unknown>;
  effect?: "read" | "write"; recurring?: boolean;
}): DecisionEvidence {
  const requiredInputs: DecisionEvidence["requiredInputs"] = [];
  const locations = ["body", "queryParams", "pathParams", "headers"] as const;
  let requirementsIncomplete = Object.keys(input.input).some(key => !locations.includes(key as typeof locations[number]));
  for (const location of ["body", "queryParams", "pathParams", "headers"] as const) {
    const value = input.input[location];
    if (value === undefined) continue;
    const schema = record(value);
    if (!schema) { requirementsIncomplete = true; continue; }
    if (["$ref", "anyOf", "oneOf", "allOf", "dependentRequired", "if"].some(key => key in schema)) requirementsIncomplete = true;
    const properties = record(schema.properties);
    if (properties && Object.values(properties).some(value => {
      const property = record(value);
      return property && ["$ref", "required", "properties", "items", "prefixItems", "contains", "anyOf", "oneOf", "allOf", "dependentRequired", "if"].some(key => key in property);
    })) requirementsIncomplete = true;
    if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== "string"))) {
      requirementsIncomplete = true; continue;
    }
    for (const path of (schema.required ?? []) as string[]) {
      if (requiredInputs.length === 20) { requirementsIncomplete = true; break; }
      requiredInputs.push({ location, path });
    }
  }
  const endpoint = input.provider === "apollo" ? input.endpoint.replace(/^\/api\/v1(?=\/)/, "") : input.endpoint;
  const output = reviewedOutputs[`${input.provider} ${input.method.toUpperCase()} ${endpoint}`] ?? {
    verification: "unknown" as const, documentedFields: [], caveats: ["No reviewed output contract is published for this endpoint. Inspect actual results before deriving records."],
  };
  return decisionEvidenceSchema.parse({ requiredInputs, inputBasis: "schema_required_fields", requirementsIncomplete,
    effect: input.effect, recurring: input.recurring, output });
}
