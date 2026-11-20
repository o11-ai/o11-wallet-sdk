/**
 * How a scheduled run starts the agent headless, shared by cron and the Ostack sandbox's run_check step so a check
 * that passes there means a scheduled run reaches the same tools. Pure: no node: or Bun imports.
 */
export type HeadlessAgent = "claude" | "codex";

/** Loads the agent env file o11 writes (Codex's key for o11's AI proxy), for shells that read no profile, like cron. */
export const AGENT_ENV = 'if [ -r "$HOME/.config/o11/agent-env/codex.env" ]; then set -a; . "$HOME/.config/o11/agent-env/codex.env"; set +a; fi';

/** `prompt` is one shell word, already quoted (or "$VAR"). */
export function headlessAgent(agent: HeadlessAgent, binary: string, root: string, prompt: string, effort: string): string {
  return agent === "claude"
    ? `${binary} -p ${prompt} --effort ${effort} --permission-mode auto --permission-prompts none`
    : `${binary} exec --cd ${root} --sandbox workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=${effort} ${prompt}`;
}
