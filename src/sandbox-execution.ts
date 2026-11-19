import { sandboxCommandActions, sandboxCommandResult, type SandboxInput, type SandboxResult } from './contracts/sandboxes.js';

type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
type Json = SandboxInput['params'][string];
const object = (value: unknown): Record<string, Json> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json> : {};
function commandData(result: SandboxResult) {
  const data = object(result.data);
  return { ...object(data.process), ...object(data.command), ...data };
}
function code(result: SandboxResult) {
  const value = commandData(result).exitCode;
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}
function projected(input: SandboxInput, result: SandboxResult): SandboxResult {
  if (result.sandbox?.provider !== 'vercel' || input.action === 'exec' || !sandboxCommandActions.some(action => action === input.action) || code(result) === undefined) return result;
  const streams = sandboxCommandOutput(result);
  try { return { ...result, data: { ...commandData(result), ...object(sandboxCommandResult(input.action, input.params, { ...streams, exitCode: code(result)! })) } }; }
  catch { return { ...result, status: 'failed', data: { ...commandData(result), error: 'INVALID_COMMAND_RESULT' } }; }
}
async function waitForAgents(client: SandboxClient, submitted: SandboxResult, options: {
  timeoutMs?: number; signal?: AbortSignal; delay?: (milliseconds: number) => Promise<void>;
}) {
  const initial = object(submitted.data), setup = object(initial.agents);
  if (!submitted.sandbox || !['pending', 'dispatching', 'running', 'unknown'].includes(String(setup.status))) return submitted;
  const id = submitted.sandbox.id, until = Date.now() + (options.timeoutMs ?? 180_000);
  const pause = options.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let agents = setup;
  while (!options.signal?.aborted && Date.now() < until) {
    if (agents.status === 'unknown') break;
    try {
      const current = await client.sandbox({ action: 'info', id, params: {} });
      agents = object(object(current.data).agents);
      if (agents.status === 'ready') return { ...submitted, sandbox: current.sandbox ?? submitted.sandbox, data: { ...initial, agents } };
      // The sandbox exists, runs and bills; only the agent install failed. Say so instead of reporting the create as failed.
      if (agents.status === 'failed') return { ...submitted, sandbox: current.sandbox ?? submitted.sandbox, status: 'attention', data: { ...initial, agents,
        warning: `The sandbox is running and billing, but Claude Code and Codex didn't install (${String(agents.failureCode ?? 'setup_failed')}). Install them yourself with o11 sandbox exec, or delete it with o11 sandbox delete ${id}.` } };
    } catch { break; }
    await pause(1000);
  }
  return { ...submitted, status: 'pending', data: { ...initial, agents, recovery: { action: 'agents-status', id, params: {} } } };
}

/** Submit once. Waiting only reads the saved command and never repeats exec. */
export async function executeSandboxCommand(client: SandboxClient, input: SandboxInput, options: {
  timeoutMs?: number; signal?: AbortSignal; delay?: (milliseconds: number) => Promise<void>;
} = {}): Promise<SandboxResult> {
  const submitted = await client.sandbox(input);
  if (['create', 'fork', 'resume', 'get-or-create'].includes(input.action)) return waitForAgents(client, submitted, options);
  // Vercel runs files move, delete and info as files-rename, files-rm and files-stat commands; wait for them the same way.
  const vercelFile = submitted.sandbox?.provider === 'vercel' ? ({ 'files-move': 'files-rename', 'files-delete': 'files-rm', 'files-info': 'files-stat' } as Record<string, string>)[input.action] : undefined;
  if (vercelFile) input = { ...input, action: vercelFile, params: Object.fromEntries(Object.entries(input.params).filter(([key]) => key !== 'overwrite')) };
  const initial = commandData(submitted);
  const commandAction = ['exec', 'agent-exec'].includes(input.action) || submitted.sandbox?.provider === 'vercel' && sandboxCommandActions.some(action => action === input.action);
  if (!commandAction || input.params.detached === true || code(submitted) !== undefined
    || ['unknown', 'failed', 'attention'].includes(submitted.status ?? '')) return projected(input, submitted);
  const commandId = typeof initial.commandId === 'string' ? initial.commandId : undefined;
  if (!commandId || !submitted.sandbox) return submitted;
  // o11 resolves the recorded session; callers cannot select a different session.
  const params = { commandId };
  // --timeout-seconds N stops the command in the sandbox after N seconds; wait that long, plus time to collect the result.
  const limit = Number(input.params.timeoutSeconds);
  // Vercel's exec --timeout MS kills the command with SIGKILL (exit 137) when it runs out.
  const vercelLimit = submitted.sandbox.provider === 'vercel' && typeof input.params.timeout === 'number' && input.params.timeout > 0 ? input.params.timeout : undefined;
  const started = Date.now(), timeout = options.timeoutMs ?? (Number.isInteger(limit) && limit > 0 ? Math.max(120_000, (limit + 30) * 1000)
    : vercelLimit ? Math.max(120_000, vercelLimit + 30_000) : 120_000);
  const pause = options.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let current = submitted;
  while (!options.signal?.aborted && Date.now() - started < timeout) {
    try {
      current = await client.sandbox({ action: 'command-status', id: submitted.sandbox.id, params });
      if (code(current) !== undefined) {
        let logs: Record<string, Json> = {};
        try { logs = object((await client.sandbox({ action: 'logs', id: submitted.sandbox.id, params })).data); }
        catch { /* Keep the finished command and its exit status when logs are unavailable. */ }
        // E2B and Boat stop the command with timeout(1), which exits 124.
        const e2bLimit = submitted.sandbox.provider === 'e2b' && typeof input.params.timeout === 'number' ? input.params.timeout : undefined;
        const timedOut = code(current) === 124 && (Number.isInteger(limit) && limit > 0 && submitted.sandbox.provider !== 'vercel' || e2bLimit !== undefined);
        // Killed at the deadline: report it as a timeout, exit 124 like timeout(1), instead of a bare 137.
        const vercelTimedOut = vercelLimit !== undefined && code(current) === 137 && Date.now() - started >= vercelLimit - 1000;
        return projected(input, { ...submitted, status: 'completed', data: { ...initial, ...logs, ...commandData(current), commandId,
          ...(timedOut ? { timedOut: true, notice: e2bLimit === undefined ? `Stopped after ${limit} s (--timeout-seconds). Exit code 124.` : `Stopped after ${e2bLimit} ms (--timeout). Exit code 124.` } : {}),
          ...(vercelTimedOut ? { exitCode: 124, timedOut: true, notice: `Stopped after ${vercelLimit} ms (--timeout). Vercel killed it; exit code 124.` } : {}) } });
      }
      const state = commandData(current).status ?? commandData(current).state;
      if (['failed', 'cancelled', 'killed', 'error'].includes(String(state)))
        return { ...submitted, status: 'failed', data: { ...initial, ...commandData(current), commandId } };
    } catch {
      // A lost status read cannot justify another command submission.
      return { ...submitted, status: 'pending', data: { ...initial, commandId,
        recovery: { action: 'command-status', id: submitted.sandbox.id, params } } };
    }
    await pause(1000);
  }
  return { ...submitted, status: 'pending', data: { ...initial, commandId,
    recovery: { action: 'command-status', id: submitted.sandbox.id, params } } };
}

export function sandboxCommandOutput(result: SandboxResult) {
  const data = commandData(result);
  return { stdout: typeof data.stdout === 'string' ? data.stdout : '',
    stderr: typeof data.stderr === 'string' ? data.stderr : '' };
}
