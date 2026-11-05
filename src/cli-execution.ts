import { invocationShortIdSchema } from "./contracts/invocation-lifecycle.js";
import { lstat, open, rm, type FileHandle } from 'node:fs/promises';
import { ToolClient, ToolClientError, type InvocationReceipt } from './client.js';
import { callArguments, callRequest } from './cli-call.js';
import { mediaWaitState } from './invocation-wait.js';

export type ExecutionCommand = 'call' | 'status' | 'wait';
const usage = 'Use call TOOL_ID or status CALL_ID with [--wait [SECONDS]] [-o NEW_FILE]; wait CALL_ID also accepts --timeout MS';
export function executionArguments(command: ExecutionCommand, values: string[]) {
  if (!values[0] || values[0].startsWith('-')) throw new Error(usage);
  const requestArguments = [values[0]];
  let timeoutMs: number | undefined, output: string | undefined;
  for (let index = 1; index < values.length; index++) {
    const flag = values[index]!;
    if (flag === '-w' || flag === '--wait' || command === 'wait' && flag === '--timeout') {
      if (timeoutMs !== undefined) throw new Error('Supply one wait timeout');
      if (flag === '--timeout') {
        const value = values[++index];
        timeoutMs = value === undefined ? NaN : Number(value);
      } else {
        const next = values[index + 1];
        timeoutMs = next !== undefined && /^\d+(?:\.\d+)?$/.test(next) ? Number(values[++index]) * 1000 : 60_000;
      }
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
        throw new Error('Wait timeout must be positive and fit within 2147483647 milliseconds');
    } else if (flag === '-o' || flag === '--output') {
      if (output !== undefined) throw new Error('Supply one output file');
      output = values[++index];
      if (!output || output.startsWith('-')) throw new Error('Supply a new output file after -o');
    } else {
      if (command !== 'call') throw new Error(usage);
      requestArguments.push(flag);
      // Preserve provider argument values even when they resemble an execution flag.
      if (!['--allow-write', '--accept-recurring'].includes(flag)) {
        const value = values[++index];
        if (value === undefined) throw new Error(usage);
        requestArguments.push(value);
      }
    }
  }
  if (command === 'call') callArguments(requestArguments);
  else if (requestArguments.length !== 1) throw new Error(usage);
  return { requestArguments, timeoutMs: command === 'wait' ? timeoutMs ?? 60_000 : timeoutMs, output };
}

function unsuccessful(receipt: InvocationReceipt) {
  return ['failed', 'cancelled', 'unknown', 'awaiting_approval'].includes(receipt.state) || Boolean(receipt.resultOutcome) ||
    ['partial', 'failed'].includes(receipt.outputQuality?.status ?? '') || mediaWaitState(receipt.result) === 'action_required';
}
function settled(receipt: InvocationReceipt) {
  return !['queued', 'executing', 'waiting'].includes(receipt.state) &&
    !(receipt.state === 'succeeded' && mediaWaitState(receipt.result) === 'pending');
}
function resumeCommand(id: string, context: { profile?: string; cardId?: string }) {
  const quote = (value: string) => /^[a-zA-Z0-9_-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
  return ['o11', ...(context.profile ? ['--profile', context.profile] : []), 'status', id,
    ...(context.cardId ? ['--card', context.cardId] : [])].map(quote).join(' ');
}
async function removeEmptyOutput(path: string, handle: FileHandle) {
  const [reserved, current] = await Promise.all([handle.stat(), lstat(path).catch(() => undefined)]);
  if (current && !current.isSymbolicLink() && current.dev === reserved.dev && current.ino === reserved.ino) await rm(path);
}

/** Reserve a private new file before paid submission; stdout always retains the receipt. */
export async function executeInvocation(client: ToolClient, command: ExecutionCommand, values: string[], context: { profile?: string; cardId?: string }) {
  const options = executionArguments(command, values);
  const output = options.output ? await open(options.output, 'wx', 0o600) : undefined;
  let saved = false;
  try {
    const original = command === 'call' ? await client.callTool(await callRequest(options.requestArguments))
      : options.timeoutMs === undefined ? await client.getInvocation(options.requestArguments[0]!) : undefined;
    const id = original?.id ?? options.requestArguments[0]!;
    const idempotencyKey = original && 'idempotencyKey' in original ? original.idempotencyKey : undefined;
    let receipt = original;
    let outcome: 'completed' | 'action_required' | 'timed_out' | undefined;
    if (options.timeoutMs !== undefined) {
      if (receipt && settled(receipt)) outcome = receipt.state === 'succeeded' && mediaWaitState(receipt.result) === 'action_required'
        ? 'action_required' : ['succeeded', 'failed', 'cancelled'].includes(receipt.state) ? 'completed' : 'action_required';
      else {
        try {
          const waited = await client.waitForInvocationResult(id, { timeoutMs: options.timeoutMs });
          receipt = waited.receipt;
          outcome = waited.outcome;
        } catch (error) {
          const ambiguous = error instanceof ToolClientError && error.status === 409 && invocationShortIdSchema.safeParse(id).success;
          return { result: { ...(original ?? { id }), ...(idempotencyKey ? { idempotencyKey } : {}),
            wait: { outcome: 'action_required', resumeCommand: resumeCommand(original?.shortId ?? id, context),
              message: ambiguous ? 'This short ID matches more than one call. Use the full id from its receipt or history.'
                : 'Status could not be read. Resume this invocation; do not submit another call.' } }, exitCode: 2 };
        }
      }
    }
    const shortId = receipt?.shortId ?? original?.shortId;
    const result = { ...(shortId ? { shortId } : {}), ...(receipt ?? original ?? { id }), ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(outcome ? { wait: { outcome, resumeCommand: resumeCommand(shortId ?? id, context) } } : {}) };
    let exitCode = outcome && outcome !== 'completed' || receipt && unsuccessful(receipt) ? 2 : 0;
    if (output && options.output) {
      let error: string | undefined;
      if (receipt && ['succeeded', 'failed', 'cancelled'].includes(receipt.state) && settled(receipt) && receipt.result !== undefined && receipt.result !== null) {
        try { await output.writeFile(JSON.stringify(receipt.result, null, 2) + '\n'); saved = true; }
        catch { error = 'Output could not be saved. Retrieve this invocation again; do not submit another call.'; exitCode = 2; }
      }
      return { result: { ...result, outputFile: { path: options.output, saved, ...(error ? { error } : {}) } }, exitCode };
    }
    return { result, exitCode };
  } finally {
    if (output) {
      try { if (!saved && options.output) await removeEmptyOutput(options.output, output); }
      finally { await output.close(); }
    }
  }
}
