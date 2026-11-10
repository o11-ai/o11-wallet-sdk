import { invocationReferenceSchema, invocationShortIdSchema, type invocationHistoryPageSchema } from "./contracts/invocation-lifecycle.js";
import { z } from 'zod';
import { lstat, rename, rm, type FileHandle } from 'node:fs/promises';
import { ToolClient, ToolClientError, type InvocationReceipt } from './client.js';
import { callArguments, callRequest } from './cli-call.js';
import { mediaWaitState } from './invocation-wait.js';
import { reserveOutputFile, resultPreview, saveLargeResult } from './cli-result-file.js';

export type ExecutionCommand = 'call' | 'status' | 'wait';
const usage = 'Use o11 call TOOL_ID [--input JSON|@FILE] or o11 wait INVOCATION_ID [--timeout MS] [--output NEW_FILE]';
export function executionArguments(command: ExecutionCommand, values: string[]) {
  if (!values[0] || values[0].startsWith('-')) throw new Error(usage);
  const requestArguments = [values[0]];
  let timeoutMs: number | undefined, output: string | undefined, detailed = false, noWait = false, overwrite = false;
  for (let index = 1; index < values.length; index++) {
    const flag = values[index]!;
    if (command === 'call' && flag === '--no-wait') {
      if (noWait) throw new Error('Supply --no-wait once');
      noWait = true;
    } else if (flag === '-w' || flag === '--wait' || command === 'wait' && flag === '--timeout') {
      if (timeoutMs !== undefined) throw new Error('Supply one wait timeout');
      if (flag === '--timeout') {
        const value = values[++index];
        timeoutMs = value === undefined ? NaN : Number(value);
      } else {
        const next = values[index + 1];
        timeoutMs = next !== undefined && /^\d+(?:\.\d+)?$/.test(next) ? Number(values[++index]) * 1000 : 60_000;
      }
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
        throw new Error(flag === '--timeout' ? '--timeout takes milliseconds from 1 to 2147483647, for example --timeout 60000'
          : `${flag} takes seconds greater than 0, for example ${flag} 60`);
    } else if (flag === '-o' || flag === '--output') {
      if (output !== undefined) throw new Error('Supply one output file');
      output = values[++index];
      if (!output || output.startsWith('-')) throw new Error('Supply a new output file after -o');
    } else if (flag === '--detailed') {
      if (detailed) throw new Error('Supply --detailed once');
      detailed = true;
    } else if (flag === '--overwrite') {
      if (overwrite) throw new Error('Supply --overwrite once');
      overwrite = true;
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
  else invocationReferenceSchema.parse(requestArguments[0]);
  if (noWait && timeoutMs !== undefined) throw new Error('Use --wait or --no-wait, not both');
  if (overwrite && output === undefined) throw new Error('--overwrite applies to -o FILE');
  // A call waits for its result by default, like a plain HTTP request; --no-wait prints the queued receipt.
  const defaultWait = command === 'wait' || command === 'call' && !noWait ? 60_000 : undefined;
  return { requestArguments, timeoutMs: timeoutMs ?? defaultWait, output, detailed, overwrite };
}

function unsuccessful(receipt: InvocationReceipt) {
  return ['failed', 'cancelled', 'unknown', 'awaiting_approval'].includes(receipt.state) || Boolean(receipt.resultOutcome) ||
    ['partial', 'failed'].includes(receipt.outputQuality?.status ?? '') || mediaWaitState(receipt.result) === 'action_required';
}
function settled(receipt: InvocationReceipt) {
  return !['queued', 'executing', 'waiting'].includes(receipt.state) &&
    !(receipt.state === 'succeeded' && mediaWaitState(receipt.result) === 'pending');
}
export function cliRecoveryCommand(args: string[], invocation: readonly string[] = ['o11']) {
  const windows = process.platform === 'win32';
  const quote = (value: string) => /^[a-zA-Z0-9_-]+$/.test(value) ? value : `'${value.replaceAll("'", windows ? "''" : "'\\''")}'`;
  return (windows ? '& ' : '') + [...invocation, ...args].map(quote).join(' ');
}
/** runIdSupplied is false when this process made up its own run ID, so later calls cannot share it unless told. */
type ExecutionContext = { profile?: string; cardId?: string; runId: string; runIdSupplied?: boolean; invocation?: readonly string[] };
function resumeCommand(reference: Pick<InvocationReceipt, 'id' | 'cardId' | 'runId'>, context: ExecutionContext, options: { timeoutMs?: number; output?: string; detailed?: boolean; overwrite?: boolean }) {
  const cardId = reference.cardId ?? context.cardId;
  const runId = reference.runId ?? context.runId;
  return cliRecoveryCommand([...(context.profile ? ['--profile', context.profile] : []),
    // A wait shorter than the default would time out again for an agent that follows this command.
    'wait', reference.id, '--timeout', String(Math.max(options.timeoutMs ?? 0, 60_000)),
    ...(options.output ? ['--output', options.output, ...(options.overwrite ? ['--overwrite'] : [])] : []),
    ...(options.detailed ? ['--detailed'] : []),
    ...(cardId ? ['--card', cardId] : []), '--run-id', runId], context.invocation);
}
/**
 * Running calls are checked again with the same ID. A call held for a person's approval gets the same command,
 * but only as its resume step: waiting before the approval would just return the held receipt again.
 */
export function invocationFollowup(receipt: InvocationReceipt, context: ExecutionContext, output?: string, detailed?: boolean, overwrite?: boolean): Followup {
  const command = () => resumeCommand(receipt, context, { output, detailed, overwrite });
  if (receipt.state === 'awaiting_approval') return { wait: { outcome: 'action_required', resumeCommand: command() } };
  return settled(receipt) ? {} : { nextCommand: command() };
}
async function removeEmptyOutput(path: string, handle: FileHandle) {
  const [reserved, current] = await Promise.all([handle.stat(), lstat(path).catch(() => undefined)]);
  if (current && !current.isSymbolicLink() && current.dev === reserved.dev && current.ino === reserved.ino) await rm(path);
}

type WaitInfo = { outcome: 'completed' | 'action_required' | 'timed_out'; message?: string; resumeCommand?: string };
type Followup = { wait?: WaitInfo; nextCommand?: string };

function outputSummary(id: string, receipt: InvocationReceipt | undefined, idempotencyKey: string | undefined,
  followup: Followup, outputFile: { path: string; saved: boolean; error?: string }) {
  return {
    id,
    state: receipt?.state,
    billedMicros: receipt?.billedMicros ?? undefined,
    // Once billed, the charge is final and the hold is released; the original reservation would read as a second price.
    ...(receipt?.reservedMicros && receipt.reservedMicros !== '0' && receipt.billedMicros == null ? { reservedMicros: receipt.reservedMicros } : {}),
    supplierCostMicros: receipt?.supplierCostMicros ?? undefined,
    // Says why a settled call cost $0 (a cached answer or a free call); absent from older servers.
    ...(receipt?.billing && receipt.billing.basis !== 'charged' ? { billing: receipt.billing } : {}),
    ...(idempotencyKey && (!receipt || !settled(receipt) || receipt.state === 'unknown') ? { idempotencyKey } : {}),
    ...(receipt?.nextAction && ['request_approval', 'request_manager_review'].includes(receipt.nextAction) ? { nextAction: receipt.nextAction } : {}),
    ...(receipt?.state === 'awaiting_approval' && receipt.approval ? { message: receipt.message, approval: receipt.approval } : {}),
    error: receipt?.error ?? undefined,
    // A retried, then successful step leaves a failure record; showing it on success invites a duplicate paid call.
    failure: receipt?.failure && receipt.state !== 'succeeded' ? { stage: receipt.failure.stage, codes: receipt.failure.codes,
      ...(typeof receipt.failure.retryable === 'boolean' ? { retryable: receipt.failure.retryable } : {}) } : undefined,
    resultOutcome: receipt?.resultOutcome,
    ...(!receipt?.resultOutcome && receipt?.outputQuality && ['partial', 'failed'].includes(receipt.outputQuality.status)
      ? { outputQuality: { status: receipt.outputQuality.status } } : {}),
    ...(followup.wait && followup.wait.outcome !== 'completed'
      ? { wait: { outcome: followup.wait.outcome, message: followup.wait.message,
        // Shown here only when it is not already the next command (a held call resumes after its approval).
        ...(followup.nextCommand ? {} : { resumeCommand: followup.wait.resumeCommand }) } } : {}),
    nextCommand: followup.nextCommand,
    ...(receipt?.request ? { request: resultPreview(receipt.request) } : {}),
    outputFile,
  };
}

/**
 * Before a waited call has answered for this long, one plain line goes to stderr (never stdout), so a shell that kills
 * the wait can still find the call. Agents that merge stderr into a parser rarely wait this long without a terminal.
 */
const keyNoticeMs = () => process.stderr.isTTY ? 5_000 : 20_000;

/**
 * A waited call can hold until the provider answers. If the caller's shell kills it first, the run ID printed here
 * finds the call in history (then o11 wait ID), and the key lets a rerun reuse it instead of paying again.
 */
async function submitCall(client: ToolClient, request: Awaited<ReturnType<typeof callRequest>>, waitMs: number | undefined) {
  const keyed = { ...request, idempotencyKey: request.idempotencyKey ?? crypto.randomUUID() };
  const notice = waitMs ? setTimeout(() => process.stderr.write(`o11: still waiting for ${keyed.tool.replace(/[\u0000-\u001f\u007f]/g, ' ')}. If this command is stopped, `
    + `do not call again: find it with o11 history --run-id ${client.runId}, then o11 wait ID, `
    + `or rerun with --idempotency-key ${keyed.idempotencyKey}.\n`), keyNoticeMs()) : undefined;
  try { return await client.callTool(keyed, { waitMs }); }
  finally { clearTimeout(notice); }
}

/** Reserve a private new file before submission; keep its payload off stdout by default. */
export async function executeInvocation(client: ToolClient, command: ExecutionCommand, values: string[], context: ExecutionContext) {
  const options = executionArguments(command, values);
  const reservation = options.output ? await reserveOutputFile(options.output, options.overwrite) : undefined;
  const output = reservation?.handle;
  let saved = false, closed = false;
  try {
    const started = Date.now();
    const original = command === 'call' ? await submitCall(client, await callRequest(options.requestArguments), options.timeoutMs)
      : options.timeoutMs === undefined ? await client.getInvocation(options.requestArguments[0]!) : undefined;
    const id = original?.id ?? options.requestArguments[0]!;
    const idempotencyKey = original && 'idempotencyKey' in original && typeof original.idempotencyKey === 'string'
      ? original.idempotencyKey : undefined;
    let receipt = original;
    let outcome: 'completed' | 'action_required' | 'timed_out' | undefined;
    if (options.timeoutMs !== undefined) {
      if (receipt && settled(receipt)) outcome = receipt.state === 'succeeded' && mediaWaitState(receipt.result) === 'action_required'
        ? 'action_required' : ['succeeded', 'failed', 'cancelled'].includes(receipt.state) ? 'completed' : 'action_required';
      else {
        try {
          // The submit request may already have spent part of the wait.
          const waited = await client.waitForInvocationResult(id, { timeoutMs: Math.max(1, options.timeoutMs - (Date.now() - started)) });
          receipt = waited.receipt;
          outcome = waited.outcome;
        } catch (error) {
          // A definite refusal for an ID this command did not submit (none, or not this card's): waiting again cannot help.
          if (!original && error instanceof ToolClientError && [401, 403, 404].includes(error.status)) throw error;
          const ambiguous = error instanceof ToolClientError && error.status === 409 && invocationShortIdSchema.safeParse(id).success;
          const followup: Followup = { wait: { outcome: 'action_required',
              message: ambiguous ? 'This short ID matches more than one call. Use the full ID from its receipt or history.'
                : 'Could not read this invocation. Check access to its card and wait again with the same ID.' } };
          const outputFile = options.output ? { path: options.output, saved: false } : undefined;
          return { result: outputFile && !options.detailed ? outputSummary(id, original, idempotencyKey, followup, outputFile)
            : { ...(original ?? { id }), ...(idempotencyKey ? { idempotencyKey } : {}), ...followup, ...(outputFile ? { outputFile } : {}) },
          exitCode: 2 };
        }
      }
    }
    const shortId = receipt?.shortId ?? original?.shortId;
    const reference = { id: receipt?.id ?? id, cardId: receipt?.cardId ?? original?.cardId, runId: receipt?.runId ?? original?.runId };
    // A held call resumes only after a person approves it, so its resume command is not an immediate next step.
    const resume = outcome === 'timed_out' || receipt?.state === 'awaiting_approval' ? resumeCommand(reference, context, options) : undefined;
    const nextCommand = outcome === 'timed_out' ? resume : undefined;
    const followup: Followup = outcome
      ? { wait: { outcome, ...(resume ? { resumeCommand: resume } : {}) }, ...(nextCommand ? { nextCommand } : {}) }
      : receipt ? invocationFollowup(receipt, context, options.output, options.detailed, options.overwrite) : {};
    // First in the receipt so an agent sees it before the result: one run ID per task gives one total.
    const runHint = command === 'call' && context.runIdSupplied === false && reference.runId ? { runHint:
      `Group this task: export O11_RUN_ID=${reference.runId} (or pass --run-id ${reference.runId}) on later calls, then o11 run-status ${reference.runId} totals them.` } : {};
    const shown = receipt ?? original;
    const visible = shown && shown.state === 'succeeded' && !options.detailed ? { ...shown, failure: undefined } : shown;
    const result = { ...(shortId ? { shortId } : {}), ...runHint, ...(visible ?? { id }), ...(idempotencyKey ? { idempotencyKey } : {}), ...followup };
    let exitCode = outcome && outcome !== 'completed' || receipt && unsuccessful(receipt) ? 2 : 0;
    // A large result goes to a new file; the server's result is unchanged. --detailed prints everything.
    if (!options.output && !options.detailed && receipt && settled(receipt) && receipt.result != null) {
      const file = await saveLargeResult(receipt.result, shortId ?? reference.id);
      if (file) return { result: { ...(shortId ? { shortId } : {}), ...runHint,
        ...outputSummary(reference.id, receipt, idempotencyKey, followup, { path: file.path, saved: true }),
        resultBytes: file.bytes, resultPreview: resultPreview(receipt.result),
        note: `The result is ${Math.round(file.bytes / 1024)} KB, so it was saved to ${file.path}. Read fields from that file; add --detailed to print it.` }, exitCode };
    }
    if (output && options.output) {
      let error: string | undefined;
      if (receipt && ['succeeded', 'failed', 'cancelled'].includes(receipt.state) && settled(receipt) && receipt.result !== undefined && receipt.result !== null) {
        try {
          await output.writeFile(JSON.stringify(receipt.result, null, 2) + '\n');
          // --overwrite wrote a sibling file; it replaces the old one only now, so a failed call keeps it.
          if (reservation && reservation.path !== options.output) { await output.close(); closed = true; await rename(reservation.path, options.output); }
          saved = true;
        }
        catch { error = 'Output could not be saved. Retrieve this invocation again; do not submit another call.'; exitCode = 2; }
      }
      const outputFile = { path: options.output, saved, ...(error ? { error } : {}) };
      return { result: options.detailed ? { ...result, outputFile }
        : { ...runHint, ...outputSummary(reference.id, receipt ?? original, idempotencyKey, followup, outputFile) }, exitCode };
    }
    return { result, exitCode };
  } finally {
    if (output && reservation) {
      // A closed handle means the rename failed; the random sibling name is ours alone.
      try { if (!saved) await (closed ? rm(reservation.path, { force: true }) : removeEmptyOutput(reservation.path, output)); }
      finally { if (!closed) await output.close(); }
    }
  }
}

const isoSince = z.iso.datetime({ offset: true });
/** `30m`, `2h`, `1d` or an ISO timestamp, as the ISO lower bound for history. */
export function sinceTimestamp(value: string, now = Date.now()) {
  const relative = /^(\d{1,4})([mhd])$/.exec(value);
  if (relative) {
    const minutes = Number(relative[1]) * { m: 1, h: 60, d: 1440 }[relative[2] as 'm' | 'h' | 'd'];
    if (minutes < 1 || minutes > 90 * 1440) throw new Error('History --since must be from 1m to 90d');
    return new Date(now - minutes * 60_000).toISOString();
  }
  if (!isoSince.safeParse(value).success) throw new Error('Use history --since 30m, 2h, 1d or an ISO timestamp');
  return value;
}

type HistoryPage = z.infer<typeof invocationHistoryPageSchema>;
/** Totals for the calls on this page; complete is false when a cursor leads to more matching calls. */
export function historyTotals(page: HistoryPage) {
  let billed = 0n, reserved = 0n, unsettled = 0;
  const byState: Record<string, number> = {};
  for (const item of page.items) {
    byState[item.state] = (byState[item.state] ?? 0) + 1;
    // A call awaiting approval stores its quote but holds no funds yet.
    if (item.billedMicros === null) { unsettled++; if (item.state !== 'awaiting_approval') reserved += BigInt(item.reservedMicros); }
    else billed += BigInt(item.billedMicros);
  }
  return { calls: page.items.length, billedMicros: billed.toString(), reservedMicros: reserved.toString(),
    unsettledCalls: unsettled, byState, complete: !page.cursor };
}
