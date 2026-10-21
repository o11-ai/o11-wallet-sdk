import { z } from "zod";
import { invocationSchema, inputSchema, moneySchema } from "./index";

const id = z.strictObject({ id: z.string().uuid() });
export const serviceOperationSchemas = {
  quote: z.strictObject({
    toolId: z.string().min(1).max(250),
    input: inputSchema,
    credentialMode: z.enum(["platform", "customer"]).optional(),
    connectionId: z.string().uuid().optional(),
  }),
  cancel: id,
  resources: z.strictObject({}).default({}),
  resource_events: id,
  release_resource: id,
  retry_resource: id,
  configure_resource: z.strictObject({
    id: z.string().uuid(),
    autoRenew: z.boolean(),
    maxPeriodChargeMicros: moneySchema,
    inboundInvocationLimitMicros: moneySchema.optional(),
  }),
};

export const publicOperationSchemas = {
  cards: z.strictObject({ cursor: z.string().optional() }),
  discover: z.strictObject({
    query: z.string().max(200).default(""),
    cursor: z.string().optional(),
    provider: z.string().optional(),
  }),
  inspect: z.strictObject({ id: z.string() }),
  connections: z.strictObject({ provider: z.string().max(100).optional() }),
  get_configuration: z.strictObject({ id: z.string() }),
  balance: z.strictObject({}),
  invoke: invocationSchema,
  get_invocation: id,
  ...serviceOperationSchemas,
};

export function publicOperationJsonSchema(name: keyof typeof publicOperationSchemas) {
  const schema = z.toJSONSchema(publicOperationSchemas[name], { io: "input" });
  return name === "cards" ? schema : {
    ...schema,
    properties: { ...schema.properties, cardId: {
      type: "string" as const, format: "uuid",
      description: "Card to use. Required when this connection has multiple cards. List cards first.",
    } },
  };
}

export const publicOperationDescriptions: Record<keyof typeof publicOperationSchemas, string> = {
  cards: "List the cards this connection can use. Specify a returned cardId when checking balance, discovering, quoting, or invoking with access to multiple cards.",
  discover: "Find allowed tools by name or provider. Follow the returned cursor for more results.",
  inspect: "Read one allowed tool's input schema, pricing, and account requirements.",
  connections: "List the connected provider accounts available to this card. Credentials are never returned.",
  get_configuration: "Read the saved account choice and spending limits for an allowed tool.",
  balance: "Read this card's available spending balance and reserved funds, in micro-USD.",
  invoke: "Submit a tool call with an explicit spending maximum and a stable idempotency key.",
  get_invocation: "Retrieve this card's existing call and receipt without executing it again.",
  quote: "Estimate the price of an allowed tool call without submitting it.",
  cancel: "Request cancellation of this card's call. Cancellation is not guaranteed after supplier acceptance.",
  resources: "List services funded by this card. Requires service access.",
  resource_events: "Read the event history of a service funded by this card. Requires service access.",
  release_resource: "Request release of a service and stop future renewals. Requires write and service access.",
  retry_resource: "Request another review of an owned service. Requires write and service access.",
  configure_resource: "Update renewal consent and charge limits for an owned service. Requires write and service access.",
};
