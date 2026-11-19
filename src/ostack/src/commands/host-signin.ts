import { optional, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import type { HostRemote } from "../lib/remote.js";

/** The coding agents to sign in there. Unset: the agent running this command (Claude Code, Codex, ...), decided by the o11 CLI. */
const agentsOf = (args: Args): string[] | undefined => {
  const value = optional(args, "login");
  if (value === undefined) return undefined;
  if (value === "none") return [];
  const names = [...new Set(value.split(",").map((name) => name.trim()).filter((name) => name && name !== "o11"))];
  if (names.some((name) => !/^[a-z][a-z0-9-]{1,30}$/.test(name))) throw new OstackError("invalid_flag", "Use --login claude, codex, claude,codex or none.");
  return names;
};

/**
 * The hosted computer runs around the clock, so each agent gets a login that outlasts this computer's short-lived
 * tokens: a one-year token or API key from here, or the computer's own login that the person approves once.
 */
export function signInOf(args: Args) {
  const code = optional(args, "code");
  return { o11: true, agents: code && optional(args, "login") === undefined ? ["claude"] : agentsOf(args), claudeTokenFile: optional(args, "claude-token-file"), approve: true, renew: args.flags.renew === true, ...(code ? { code } : {}) };
}

/** The agent that runs scheduled runs: Codex only when sign-in detects Codex and not Claude Code. */
export async function orchestratorAgent(host: HostRemote): Promise<"claude" | "codex"> {
  const detected = (await host.orchestrator?.()) ?? [];
  return detected.includes("codex") && !detected.includes("claude") ? "codex" : "claude";
}

const SITE: Record<string, string> = { claude: "Claude", codex: "ChatGPT" };
const PLACE = "the computer that runs your ostack while you're away";

/**
 * For each sign-in that needs the person: `tell_person`, the exact line to send them with its link, and `then_run`,
 * the command for the agent once they are done.
 */
export function withPersonSteps(signIns: unknown[], args: Args) {
  const where = [optional(args, "name") ? ` --name ${optional(args, "name")}` : "", optional(args, "provider") ? ` --provider ${optional(args, "provider")}` : ""].join("");
  return signIns.map((entry) => {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const needs = item.needs_person && typeof item.needs_person === "object" ? (item.needs_person as Record<string, unknown>) : undefined;
    if (!needs) return entry;
    const agent = String(item.agent);
    const site = SITE[agent] ?? agent;
    const url = String(needs.url ?? "");
    if (needs.finish === "paste-code") {
      return { ...item,
        tell_person: `Please sign in to ${site} once for ${PLACE}: ${url} Approve it, then paste me the code the page shows.`,
        then_run: `o11 ostack host signin${where} --login ${agent} --code <code>` };
    }
    return { ...item,
      tell_person: `Please sign in to ${site} once for ${PLACE}: open ${url}, sign in if asked, and enter the code ${String(needs.code ?? "")}. If the page refuses the code, turn on device code sign-in in ${site} settings under Security. Tell me when you're done.`,
      then_run: `o11 ostack host signin${where} --login ${agent}` };
  });
}

export const needsPerson = (signIns: unknown[]) => signIns.some((entry) => entry && typeof entry === "object" && "tell_person" in entry);
