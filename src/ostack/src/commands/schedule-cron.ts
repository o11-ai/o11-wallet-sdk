import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { optional, type Args } from "../lib/args.js";
import { codexRunEffort } from "../lib/codex-effort.js";
import { OstackError } from "../lib/errors.js";
import { WALLET_LAUNCHER_DIR, walletOnPath } from "../lib/o11-path.js";
import { print } from "../lib/output.js";
import { isRecord } from "../lib/paths.js";
import { AGENT_ENV, headlessAgent } from "../lib/headless-agent.js";
import { SANDBOX_NAME, shellQuote } from "../lib/sandbox-setup.js";
import { PROXY_KEY_PATH } from "../lib/sandbox-status.js";
import { machineCron } from "../lib/schedule.js";
import { writeState } from "../lib/state.js";
import { systemTimeZone } from "../lib/time.js";
import type { Workspace } from "../lib/workspace.js";
import { CLAUDE_EFFORT, effective, instruction, scheduleEntries, scheduleKey, taskName } from "./schedule.js";

export type CronAgent = "claude" | "codex";

const CRON_BEGIN = (root: string) => `# >>> ostack ${root}`;
const CRON_END = (root: string) => `# <<< ostack ${root}`;

/**
 * The crontab block for every enabled schedule in this workspace. Each run starts the agent headless with the
 * workspace prompt. Times are converted to this computer's clock: Debian's cron ignores CRON_TZ, and the run guard
 * checks the workspace time itself. `refresh` (an Ostack sandbox) adds a line that reinstalls the block every 15
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
  const lines = [CRON_BEGIN(workspace.root), `PATH=${[...new Set((process.env.PATH ?? "/usr/bin:/bin").split(":").filter(Boolean))].join(":")}`];
  for (const entry of scheduleEntries(workspace)) {
    const { spec, enabled } = effective(workspace, entry.workflow, entry.audience);
    if (!spec || !enabled) continue;
    // The same /goal instruction the Desktop and Codex tasks store, so a headless run also keeps going until it is done.
    const run = headlessAgent(agent, binary, workspace.root, shellQuote(instruction(workspace, entry)), codexEffort ?? CLAUDE_EFFORT);
    for (const cron of machineCron(spec, workspace.timezone, machine, now)) lines.push(`${cron} ${agent === "codex" ? `${AGENT_ENV}; ` : ""}cd ${workspace.root} && ${run} >> ${join(logs, `${taskName(entry)}.log`)} 2>&1`);
  }
  if (refresh) lines.push(`*/15 * * * * cd ${workspace.root} && ${o11} ostack schedule cron install --agent ${agent} --refresh >/dev/null 2>&1`);
  lines.push(CRON_END(workspace.root));
  return lines;
}

/** Longer than this between two 15-minute refreshes means cron did not run: the sandbox was stopped or paused. */
export const STOPPED_GAP_MS = 20 * 60_000;
/** How long the refresh waits for o11's AI proxy to answer the key check. */
export const PROXY_PROBE_TIMEOUT_MS = 10_000;

const isProxySignIn = (record: unknown) => isRecord(record) && record.source === "o11-proxy";

/**
 * The fallback for when the key check can't tell: o11 revokes a sandbox's stand-in keys whenever it stops, so the first
 * refresh after cron missed its ticks (or the first one ever) places a new one. Only a sign-in o11 placed through its
 * proxy is touched; the sandbox's own long-lived login is left alone.
 */
export function needsProxyKey(record: unknown, lastTick: number | null, now: number): boolean {
  return isProxySignIn(record) && (lastTick === null || now - lastTick > STOPPED_GAP_MS);
}

/** The agent's stand-in key and o11 AI proxy URL, where `o11 sandbox login` wrote them. */
export type ProxyKey = { baseUrl: string; token: string };
/** "revoked": the proxy refused the key. "valid": it accepted it. "unknown": no key found, or no answer in time. */
export type ProxyProbe = "valid" | "revoked" | "unknown";

const readText = (path: string) => {
  try { return readFileSync(path, "utf8"); } catch { return null; }
};

/** Claude: ANTHROPIC_BASE_URL and CLAUDE_CODE_OAUTH_TOKEN in settings.json env. Codex: O11_AI_KEY in codex.env and the "o11" provider's base_url in config.toml. */
export function readProxyKey(agent: CronAgent, home: string): ProxyKey | null {
  if (agent === "claude") {
    for (const dir of [join(home, ".claude"), join(home, ".local", "share", "o11", "agents", "claude")]) {
      let settings: unknown = null;
      try { settings = JSON.parse(readText(join(dir, "settings.json")) ?? "null"); } catch { /* Not JSON. */ }
      const env = isRecord(settings) && isRecord(settings.env) ? settings.env : {};
      const baseUrl = env.ANTHROPIC_BASE_URL, token = env.CLAUDE_CODE_OAUTH_TOKEN ?? env.ANTHROPIC_AUTH_TOKEN;
      if (typeof baseUrl === "string" && baseUrl.includes("/v1/ai-proxy/") && typeof token === "string" && token) return { baseUrl, token };
    }
    return null;
  }
  const token = /^O11_AI_KEY=['"]?([^'"\s]+)/m.exec(readText(join(home, ".config", "o11", "agent-env", "codex.env")) ?? "")?.[1];
  if (!token) return null;
  for (const dir of [join(home, ".codex"), join(home, ".local", "share", "o11", "agents", "codex")]) {
    const section = /^\[model_providers\.o11\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(readText(join(dir, "config.toml")) ?? "")?.[1];
    const baseUrl = section && /^\s*base_url\s*=\s*"([^"]+)"/m.exec(section)?.[1];
    if (baseUrl) return { baseUrl, token };
  }
  return null;
}

/**
 * One request through o11's AI proxy with the key, on a path the proxy authenticates before it forwards and that costs
 * nothing: Anthropic's count_tokens for Claude, the model list for Codex. The proxy passes the provider's own answers
 * through, a 401 from a rejected Claude or ChatGPT sign-in included, so only the proxy's own refusal counts as revoked:
 * the X-O11-Proxy-Error: invalid_placeholder header, or on older wallets a 401 without X-Accel-Buffering (which every
 * forwarded answer carries) and, for Codex, its `invalid_placeholder` code.
 * Any other answer means the proxy took the key; no answer means nothing is known.
 */
export async function probeProxyKey(agent: CronAgent, key: ProxyKey, fetcher: typeof fetch = fetch): Promise<ProxyProbe> {
  const base = key.baseUrl.replace(/\/+$/, "");
  const request: RequestInit = agent === "claude"
    ? { method: "POST", headers: { authorization: `Bearer ${key.token}`, "content-type": "application/json", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5", messages: [{ role: "user", content: "." }] }) }
    : { method: "GET", headers: { authorization: `Bearer ${key.token}` } };
  try {
    const response = await fetcher(`${base}/${agent === "claude" ? "v1/messages/count_tokens" : "models"}`, { ...request, redirect: "manual", signal: AbortSignal.timeout(PROXY_PROBE_TIMEOUT_MS) });
    // Wallets since this release mark their own refusals; older ones are told apart by the forwarding header.
    const marked = response.headers.get("x-o11-proxy-error");
    if (marked !== null) { await response.body?.cancel().catch(() => undefined); return marked === "invalid_placeholder" ? "revoked" : "valid"; }
    if (response.status !== 401 || response.headers.has("x-accel-buffering")) {
      await response.body?.cancel().catch(() => undefined);
      return "valid";
    }
    if (agent === "claude") { await response.body?.cancel().catch(() => undefined); return "revoked"; }
    const body: unknown = await response.json().catch(() => null);
    return isRecord(body) && isRecord(body.error) && body.error.code === "invalid_placeholder" ? "revoked" : "valid";
  } catch {
    return "unknown";
  }
}

export type ProxyKeyRefresh = {
  home?: string; now?: number; fetch?: typeof fetch;
  run?: (command: string[], env: Record<string, string | undefined>) => void;
};

/**
 * Re-places the agent's stand-in key on this Ostack sandbox when o11 revoked it (the sandbox stopped, even between two
 * refreshes), with `o11 sandbox login ostack --login <agent>` (the sandbox's own key sees only this sandbox). Each
 * refresh asks the proxy whether the current key still works; a working key is never replaced, since that would cut off
 * a run in progress. Without --approve or --code it never starts a sign-in the person has to approve. It runs with no
 * local Claude or Codex login in its environment, so only the proxy path can place anything. Never throws: the refresh
 * still installs the schedules.
 */
export async function refreshProxyKey(root: string, agent: CronAgent, o11: string, options: ProxyKeyRefresh = {}): Promise<"kept" | "replaced" | "failed"> {
  const now = options.now ?? Date.now();
  const result = await placeProxyKey(root, agent, o11, now, options);
  // What the sandbox status reports to the person's agent: a failed placement means the agent can't run until signed in.
  try { mkdirSync(join(root, ".ostack"), { recursive: true }); writeFileSync(join(root, PROXY_KEY_PATH), `${JSON.stringify({ agent, result, at: new Date(now).toISOString() })}\n`); } catch { /* Best effort. */ }
  return result;
}

async function placeProxyKey(root: string, agent: CronAgent, o11: string, now: number, options: ProxyKeyRefresh): Promise<"kept" | "replaced" | "failed"> {
  const home = options.home ?? homedir();
  const recordPath = join(home, ".local", "share", "o11", "logins", `${agent}.json`);
  const tickPath = join(root, ".ostack", "cron-tick");
  try {
    const before = readText(recordPath);
    let record: unknown = null;
    try { record = before ? JSON.parse(before) : null; } catch { /* No record. */ }
    const last = Number(readText(tickPath));
    let replace = needsProxyKey(record, Number.isFinite(last) && last > 0 ? last : null, now);
    if (!replace && isProxySignIn(record)) {
      const key = readProxyKey(agent, home);
      replace = key !== null && await probeProxyKey(agent, key, options.fetch) === "revoked";
    }
    if (replace) {
      const env: Record<string, string | undefined> = { ...process.env, CODEX_HOME: join(tmpdir(), "o11-no-local-login"), CLAUDE_CODE_OAUTH_TOKEN: undefined, ANTHROPIC_API_KEY: undefined };
      const run = options.run ?? ((command, runEnv) => { Bun.spawnSync(command, { env: runEnv, stdout: "ignore", stderr: "ignore", timeout: 180_000 }); });
      run([o11, "sandbox", "login", SANDBOX_NAME, "--login", agent], env);
      // The sign-in record is rewritten only when a new key was placed; otherwise the next refresh tries again.
      if (readText(recordPath) === before) return "failed";
    }
    mkdirSync(join(root, ".ostack"), { recursive: true });
    writeFileSync(tickPath, String(now));
    return replace ? "replaced" : "kept";
  } catch {
    return "failed";
  }
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
    // An Ostack sandbox's refresh: its stand-in key for o11's AI proxy goes when the sandbox stops.
    const key = refresh ? await refreshProxyKey(workspace.root, agent, walletOnPath().path ?? "o11") : undefined;
    const block = await cronBlock(workspace, agent, refresh);
    const installed = block.filter((line) => /^[\d*]/.test(line) && !line.includes(" ostack schedule cron install ")).length;
    const { rest, block: current } = splitBlock(readCrontab(), workspace.root);
    // An Ostack sandbox reinstalls every 15 minutes; nothing changes when nothing did.
    if (current && current.join("\n") === block.join("\n")) return print({ installed, unchanged: true, ...(key ? { proxy_key: key } : {}), lines: block });
    mkdirSync(join(workspace.root, ".ostack", "logs"), { recursive: true });
    writeCrontab([...rest, ...block]);
    const at = new Date().toISOString();
    for (const { workflow, audience } of scheduleEntries(workspace)) {
      if (effective(workspace, workflow, audience).enabled) {
        (workspace.state.schedules[scheduleKey(workflow, audience)] ??= { installed: {} }).installed.cron = { name: `crontab (${agent})`, at };
      }
    }
    await writeState(workspace.root, workspace.state);
    return print({ installed, ...(key ? { proxy_key: key } : {}), lines: block });
  }
  if (action === "remove") {
    removeCronBlock(workspace.root);
    for (const entry of Object.values(workspace.state.schedules)) delete entry.installed.cron;
    await writeState(workspace.root, workspace.state);
    return print({ removed: true });
  }
  throw new OstackError("unknown_command", "Use: o11 ostack schedule cron show|install|remove [--agent claude|codex].");
}
