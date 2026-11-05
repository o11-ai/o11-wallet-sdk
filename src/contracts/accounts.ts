import type { ToolDefinition } from "./index.js";

export function supportsCustomerAccount(tool: Pick<ToolDefinition, "lifecycle" | "workflowOperation" | "customerAuth">) {
  return tool.lifecycle !== "workspace" && tool.workflowOperation !== "mind.send-email"
    && (tool.lifecycle !== "payment" || Boolean(tool.customerAuth?.length));
}
