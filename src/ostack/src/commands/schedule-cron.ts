import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { optional, type Args } from "../lib/args.js";
import { codexRunEffort } from "../lib/codex-effort.js";
import { OstackError } from "../lib/errors.js";
import { WALLET_LAUNCHER_DIR, walletOnPath } from "../lib/o11-path.js";
import { print } from "../lib/output.js";
import { machineCron } from "../lib/schedule.js";
import { writeState } from "../lib/state.js";
import { systemTimeZone } from "../lib/time.js";
import type { Workspace } from "../lib/workspace.js";
import { CLAUDE_EFFORT, effective, instruction, scheduleEntries, scheduleKey, taskName } from "./schedule.js";

export type CronAgent = "claude" | "codex";

const CRON_BEGIN = (root: string) => `# >>> ostack ${root}`;
const CRON_END = (root: string) => `# <<< ostack ${root}`;
const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/** Loads the agent env file o11 writes (Codex's key for o11's AI proxy), for shells that read no profile, like cron. */
export const AGENT_ENV = 'if [ -r "$HOME/.config/o11/agent-env/codex.env" ]; then set -a; . "$HOME/.config/o11/agent-env/codex.env"; set +a; fi';

/**
 * How a scheduled run starts the agent headless. Setup checks on the hosted computer start it the same way, so a check
 * that passes there means a scheduled run can reach the same tools.
 */
export function headlessAgent(agent: CronAgent, binary: string, root: string, prompt: string, effort: string): string {
  return agent === "claude"
    ? `${binary} -p ${shellQuote(prompt)} --effort ${effort} --permission-mode auto --permission-prompts none`
    : `${binary} exec --cd ${root} --sandbox workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=${effort} ${shellQuote(prompt)}`;
}

/**
 * The crontab block for every enabled schedule in this workspace. Each run starts the agent headless with the
 * workspace prompt. Times are converted to this computer's clock: Debian's cron ignores CRON_TZ, and the run guard
 * checks the workspace time itself. `refresh` (the hosted computer) adds a line that reinstalls the block every 15
 * minutes, so schedules changed elsewhere (the wallet's playbook page) and daylight saving reach its cron.
 */
export async function cronBlock(workspace: Workspace, agent: CronAgent, refresh = false): Promise<string[]> {
  const { path: o11, wallet } = walletOnPath();
  const binary = Bun.which(agent);
  if (!o11) throw new OstackError("not_on_path", `o11 is not on PATH. Install the o11 CLI (https://go.o11.ai/skill.md), then put ${WALLET_LAUNCHER_DIR} first on PATH.`);
  if (!wallet) throw new OstackError("not_on_path", `${o11} is not the o11 wallet CLI. Put ${WALLET_LAUNCHER_DIR} first on PATH, then retry.`);
  if (!binary) throw new OstackError("not_on_path", `${agent} is not on PATH, so cron cannot start it.`);
  const logs = join(workspace.root, ".ostack", "logs");
  const codexEffort = agent === "codex" ? codexRunEffort() : null;
  const machine = systemTimeZone();
  const now = new Date();
  const lines = [CRON_BEGIN(workspace.root), `PATH=${process.env.PATH ?? "/usr/bin:/bin"}`];
  for (const entry of scheduleEntries(workspace)) {
    const { spec, enabled } = effective(workspace, entry.workflow, entry.audience);
    if (!spec || !enabled) continue;
    // The same /goal instruction the Desktop and Codex tasks store, so a headless run also keeps going until it is done.
    const run = headlessAgent(agent, binary, workspace.root, instruction(workspace, entry), codexEffort ?? CLAUDE_EFFORT);
    for (const cron of machineCron(spec, workspace.timezone, machine, now)) lines.push(`${cron} ${agent === "codex" ? `${AGENT_ENV}; ` : ""}cd ${workspace.root} && ${run} >> ${join(logs, `${taskName(entry)}.log`)} 2>&1`);
  }
  if (refresh) lines.push(`*/15 * * * * cd ${workspace.root} && ${o11} ostack schedule cron install --agent ${agent} --refresh >/dev/null 2>&1`);
  lines.push(CRON_END(workspace.root));
  return lines;
}

function readCrontab(): string {
  const result = Bun.spawnSync(["crontab", "-l"], { stdout: "pipe", stderr: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString() : "";
}

function splitBlock(crontab: string, root: string): { rest: string[]; block: string[] | null } {
  const lines = crontab.trim() === "" ? [] : crontab.replace(/\n+$/, "").split("\n");
  const start = lines.indexOf(CRON_BEGIN(root));
  const end = lines.indexOf(CRON_END(root));
  return start >= 0 && end > start
    ? { rest: [...lines.slice(0, start), ...lines.slice(end + 1)], block: lines.slice(start, end + 1) }
    : { rest: lines, block: null };
}

function writeCrontab(lines: string[]): void {
  const text = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  const result = Bun.spawnSync(["crontab", "-"], { stdin: new TextEncoder().encode(text), stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new OstackError("cron_failed", `crontab refused the change: ${result.stderr.toString().trim()}`);
}

/** Removes this workspace's block from this computer's crontab. Returns whether there was one; never writes otherwise. */
export function removeCronBlock(root: string): boolean {
  if (!Bun.which("crontab")) return false;
  const { rest, block } = splitBlock(readCrontab(), root);
  if (!block) return false;
  writeCrontab(rest);
  return true;
}

/** `o11 ostack schedule cron show|install|remove [--agent claude|codex] [--refresh]`. */
export async function cronCommand(workspace: Workspace, args: Args): Promise<void> {
  const action = args.positionals[2] ?? "show";
  const agent = (optional(args, "agent") ?? "claude") as CronAgent;
  if (!["claude", "codex"].includes(agent)) throw new OstackError("invalid_flag", "--agent must be claude or codex.");
  const refresh = args.flags.refresh === true;
  if (action === "show") return print({ lines: await cronBlock(workspace, agent, refresh) });
  if (action === "install") {
    const block = await cronBlock(workspace, agent, refresh);
    const installed = block.filter((line) => /^[\d*]/.test(line) && !line.includes(" ostack schedule cron install ")).length;
    const { rest, block: current } = splitBlock(readCrontab(), workspace.root);
    // The hosted computer reinstalls every 15 minutes; nothing changes when nothing did.
    if (current && current.join("\n") === block.join("\n")) return print({ installed, unchanged: true, lines: block });
    mkdirSync(join(workspace.root, ".ostack", "logs"), { recursive: true });
    writeCrontab([...rest, ...block]);
    const at = new Date().toISOString();
    for (const { workflow, audience } of scheduleEntries(workspace)) {
      if (effective(workspace, workflow, audience).enabled) {
        (workspace.state.schedules[scheduleKey(workflow, audience)] ??= { installed: {} }).installed.cron = { name: `crontab (${agent})`, at };
      }
    }
    await writeState(workspace.root, workspace.state);
    return print({ installed, lines: block });
  }
  if (action === "remove") {
    removeCronBlock(workspace.root);
    for (const entry of Object.values(workspace.state.schedules)) delete entry.installed.cron;
    await writeState(workspace.root, workspace.state);
    return print({ removed: true });
  }
  throw new OstackError("unknown_command", "Use: o11 ostack schedule cron show|install|remove [--agent claude|codex].");
}
