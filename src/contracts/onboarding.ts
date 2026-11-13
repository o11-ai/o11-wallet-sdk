/** Suggestions only. Setup never executes these tasks or authorizes spending. */
export const onboardingStarterPrompts = [
  {
    id: "find-contacts",
    title: "Find and enrich 5 leads",
    prompt: "Based on my ICP, find 5 leads and use waterfall enrichment with Apollo, Hunter, and other providers to get their verified work emails.",
  },
  {
    id: "research-accounts",
    title: "Find accounts with buying signals",
    prompt: "Find 5 accounts matching my ICP that are hiring, raising money, or looking for a new tool. Show me the buying signals and who to contact.",
  },
  {
    id: "research-and-create",
    title: "Research competitors and make an ad",
    prompt: "Research my competitors’ ads on X, TikTok, and Instagram and create an ad for my product based on what you find.",
  },
] as const;

/**
 * One optional question once o11 works: never a setup step, never before the user's own task is done. Ostack ships
 * inside the o11 CLI, so a yes only adds its skills to the agent.
 */
const ostackOfferInstructions = `Last, once setup is verified and you have finished the user's own task or written the "Try:" list, ask one optional question, unless the user came here to set up Ostack or \`o11 ostack skills status\` shows its skills already installed: "Would you also like Ostack? It's o11's open-source framework for company growth and going to market: it finds leads and sends and follows up on outreach from your own tools, and makes launch videos, reels and product demos. It takes a few seconds." On yes, run \`o11 ostack skills install\`, then say they can ask for any of it anytime, such as "make me a launch video" or "set up ostack for my team"; do not start Ostack's setup interview unasked. On no, say "Okay, no problem." and move on: do not save the answer or ask again in this session. Ostack never blocks or changes the o11 setup.`;

export const onboardingCompletionInstructions = `Install the supported o11 CLI and configure MCP using this agent's private API key and saved profile. Import a supplied setup key through login --key-stdin; use the profile's stdio MCP bridge without browser authorization or a second login. Verify access without spending with setup --verify-mcp when supported. Initialize MCP and call a read-only wallet tool in the current agent session when the host supports it. Report CLI access, the MCP bridge check and current-session MCP access separately. A configured server or a separately tested bridge does not prove MCP tools are loaded here. If the environment cannot run one connection, state the remaining step and continue the original task through the verified connection. Keep working access and fix only the failing step.

If the user supplied a task, continue it with its original filters, output and budget. Otherwise report the verified connection, available tools and actual balance briefly, then write "Try:" followed by the three prompts below as quoted bullet points. Keep the full prompts; do not replace them with a "Starter tasks" summary or append an inputs-and-budget warning to the suggestions. Suggestions are not permission to execute. When the user chooses a task, resolve tools from the live catalog and call them with provider inputs. Existing card and allowance limits apply; ask only for missing task inputs, not a spending limit for each call. Never promise that every named provider or output is available.

${ostackOfferInstructions}`;
