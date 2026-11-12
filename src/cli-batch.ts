import { createHash } from 'node:crypto';
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { RUN_CEILING_REASON } from './contracts/invocation-run.js';
import { ToolCallError, ToolClientError, type InvocationReceipt, type ToolClient } from './client.js';
import { loadRows, parseMap, rowParams, rowSource, type FieldMap, type Row } from './cli-batch-rows.js';

const usage = 'Use o11 batch TOOL_ID --rows FILE|INVOCATION_ID [--map FIELD=COLUMN ...] [--input JSON|@FILE] [--run-max USD] [--journal FILE] [--concurrency 1-8] [--max-cost-micros N] [--retry-failed]';
export type BatchArguments = { tool: string; rows: string; map: FieldMap; input?: string; runMaxMicros?: string; journal?: string;
  maxCostMicros?: string; concurrency: number; retryFailed?: boolean };

/** `--run-max 0.25` or `$0.25`: US dollars, up to six decimals, as micros. */
export function dollarsToMicros(value: string | undefined) {
  const match = value?.match(/^\$?(\d{1,9})(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error('--run-max takes US dollars, for example --run-max 0.25');
  return (BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'))).toString();
}
export function batchArguments(values: string[]): BatchArguments {
  const tool = values[0];
  if (!tool || tool.startsWith('-')) throw new Error(usage);
  const parsed: Partial<BatchArguments> & { map: FieldMap } = { tool, map: [] };
  for (let index = 1; index < values.length; index++) {
    const flag = values[index]!;
    if (flag === '--retry-failed') { parsed.retryFailed = true; continue; }
    const value = values[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Supply a value after ${flag}. ${usage}`);
    if (flag === '--map') { parsed.map.push(parseMap(value)); continue; }
    const name = ({ '--rows': 'rows', '--input': 'input', '-i': 'input', '--run-max': 'runMaxMicros', '--journal': 'journal',
      '--max-cost-micros': 'maxCostMicros', '--concurrency': 'concurrency' } as const)[flag];
    if (!name) throw new Error(`Unknown batch flag ${flag}. ${usage}`);
    if (parsed[name] !== undefined) throw new Error(`Supply ${flag} once`);
    if (name === 'concurrency') {
      if (!/^[1-8]$/.test(value)) throw new Error('--concurrency takes 1 to 8');
      parsed.concurrency = Number(value);
    } else if (name === 'runMaxMicros') parsed.runMaxMicros = dollarsToMicros(value);
    else if (name === 'maxCostMicros' && !/^\d{1,15}$/.test(value)) throw new Error('--max-cost-micros takes a whole number of micros');
    else parsed[name] = value;
  }
  if (!parsed.rows) throw new Error(usage);
  const fields = parsed.map.map(entry => entry.field);
  if (new Set(fields).size !== fields.length) throw new Error('Map each field once');
  return { ...parsed, tool, rows: parsed.rows, concurrency: parsed.concurrency ?? 1 };
}

const rowStates = ['sent', 'pending', 'stopped', 'queued', 'executing', 'waiting', 'succeeded', 'failed', 'cancelled', 'unknown', 'awaiting_approval'] as const;
type RowState = typeof rowStates[number];
/**
 * One row's progress. `attempt` numbers its idempotency key; `carriedMicros` is what earlier attempts billed, and
 * `exclude` the providers that already answered a miss on them, so a retry does not pay them again.
 */
const entrySchema = z.object({ attempt: z.number().int().nonnegative(), state: z.enum(rowStates), invocationId: z.uuid().optional(),
  billedMicros: z.string().nullable().optional(), carriedMicros: z.string().optional(), exclude: z.array(z.string()).optional(),
  reason: z.string().max(300).optional() });
const headerSchema = z.object({ version: z.literal(2), tool: z.string(), runId: z.uuid(), shape: z.string(), wallet: z.string().optional(),
  maxCostMicros: z.string().optional() });
const lineSchema = entrySchema.extend({ key: z.string() });
type Header = z.infer<typeof headerSchema>;
type Entry = z.infer<typeof entrySchema>;
// A row in one of these states is done for this journal. Every other row is sent again under its own key, which replays
// a stored receipt for free: a call still running, one waiting for approval, or one whose charge is not yet known.
const finished = (entry: Entry | undefined) => !!entry && (entry.state === 'succeeded' || entry.state === 'cancelled'
  // A call the wallet refused outright stored nothing, so it is sent again; a call that ran and failed is done.
  || entry.state === 'failed' && !!entry.invocationId);
const running = new Set<string>(['queued', 'executing', 'waiting']);
/** Route attempts that reached a provider without serving the row: billed, or with a charge still to settle. */
const unserved = new Set<string>(['miss', 'not_found', 'rejected', 'pending', 'unresolved', 'late']);
const ROWS_WITHOUT_RUN_MAX = 1_000;

export type BatchClient = Pick<ToolClient, 'callTool' | 'getInvocation' | 'waitForInvocation' | 'runSummary' | 'runId'> & { origin?: string };
export type Stop = { reason: 'run_ceiling' | 'funds' | 'refused' | 'unauthorized'; row?: number; remainingMicros?: string; message?: string };

/** The journal: a header line, then one line per row state change. The last line for a row wins; a line cut off by a kill is ignored. */
export async function readJournal(path: string) {
  const text = await readFile(path, 'utf8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (text === undefined) return undefined;
  const lines = text.split('\n').filter(line => line.trim());
  const parse = (line: string): unknown => { try { return JSON.parse(line); } catch { return undefined; } };
  const header = headerSchema.safeParse(parse(lines[0] ?? ''));
  if (!header.success) throw new Error(`${path} is not a batch journal`);
  const rows = new Map<string, Entry>();
  lines.slice(1).forEach((line, index) => {
    const parsed = lineSchema.safeParse(parse(line));
    if (!parsed.success) {
      if (index === lines.length - 2) return;
      throw new Error(`${path} is not a batch journal`);
    }
    const { key, ...entry } = parsed.data;
    rows.set(key, entry);
  });
  return { header: header.data, rows };
}
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Row)[key])}`).join(',')}}`
  : JSON.stringify(value ?? null);
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const field = (value: unknown, name: string): unknown => typeof value === 'object' && value !== null && name in value ? (value as Row)[name] : undefined;
const text = (value: unknown, name: string) => { const found = field(value, name); return typeof found === 'string' ? found : undefined; };
const routeOf = (receipt: InvocationReceipt) => field(receipt.result, 'route');
const attemptsOf = (receipt: InvocationReceipt): unknown[] => { const attempts = field(routeOf(receipt), 'attempts'); return Array.isArray(attempts) ? attempts : []; };
/**
 * A route that ended without an answer because money stopped it: the run ceiling refused its providers, or the card or
 * balance did (`blocked`). The row is sent again under a new key once that is fixed.
 */
function stoppedRoute(receipt: InvocationReceipt): Stop['reason'] | undefined {
  const route = routeOf(receipt);
  if (typeof route !== 'object' || route === null || text(route, 'outcome') === 'hit') return undefined;
  if (attemptsOf(receipt).some(attempt => text(attempt, 'reason') === RUN_CEILING_REASON)) return 'run_ceiling';
  return text(route, 'outcome') === 'blocked' ? 'funds' : undefined;
}
/**
 * The row's providers to leave out of its next attempt: the earlier list plus every provider this receipt paid, or may still
 * pay, without serving the row. Asked again with the same fields, each would most likely be paid again for the same answer.
 */
function excluding(entry: Entry, receipt: InvocationReceipt): Pick<Entry, 'exclude'> {
  const paid = attemptsOf(receipt).flatMap(attempt => {
    const tool = text(attempt, 'tool'), outcome = text(attempt, 'outcome') ?? '', billed = text(attempt, 'billedMicros') ?? '0';
    return tool && outcome !== 'hit' && (unserved.has(outcome) || /^\d{1,30}$/.test(billed) && BigInt(billed) > 0n) ? [tool] : [];
  });
  const exclude = [...new Set([...(entry.exclude ?? []), ...paid])];
  return exclude.length ? { exclude } : {};
}
const stopText: Record<Stop['reason'], string> = {
  run_ceiling: 'The run reached its maximum. Raise --run-max and run the same command again; finished rows are not sent again.',
  funds: 'The wallet or the card ran out. Add funds or raise the card limit, then run the same command again; finished rows are not sent again.',
  refused: 'The wallet refused this card. Fix what the message names, then run the same command again; finished rows are not sent again.',
  unauthorized: 'The API key was refused. Sign in again, then run the same command again; finished rows are not sent again.',
};

/**
 * Runs one route (or tool) call per row. A row's idempotency key comes from the run, the tool and the row's own
 * fields, so it stays the same when the file gains, loses or reorders rows, and a run killed at any point restarts
 * from its journal: rows already sent replay their stored receipt for free, finished rows are not sent again. The
 * batch stops when the run's ceiling, the balance or the card refuses a call; those rows stay pending.
 */
export async function runBatch(client: BatchClient, options: BatchArguments & { runId?: string; cwd?: string },
  read: (path: string) => Promise<string> = path => readFile(path, 'utf8')) {
  const input = options.input === undefined ? {} : JSON.parse(options.input.startsWith('@') ? await read(options.input.slice(1)) : options.input) as unknown;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('--input takes a JSON object of fields every row shares');
  const source = await rowSource(options.rows);
  const rows = await loadRows(source, id => client.getInvocation(id));
  if (!rows.length) throw new Error('There are no rows to run');
  if (rows.length > ROWS_WITHOUT_RUN_MAX && !options.runMaxMicros)
    throw new Error(`This list has ${rows.length} rows. Pass --run-max USD to run more than ${ROWS_WITHOUT_RUN_MAX} rows.`);
  const shape = hash({ map: options.map, input });
  const path = options.journal ?? `${options.cwd ?? '.'}/o11-batch-${hash({ tool: options.tool, shape,
    rows: source.kind === 'file' ? resolve(source.path) : source.id }).slice(0, 12)}.jsonl`;
  const saved = await readJournal(path);
  if (saved && (saved.header.shape !== shape || saved.header.tool !== options.tool))
    throw new Error(`${path} belongs to a different batch. Use the same tool, --map and --input, or another --journal.`);
  if (saved && options.runId && saved.header.runId !== options.runId) throw new Error(`${path} belongs to run ${saved.header.runId}. Leave out --run-id or pass that one.`);
  // The wallet ties a key to its request, maximum included, and a key means nothing on another wallet.
  if (saved && saved.header.maxCostMicros !== options.maxCostMicros)
    throw new Error(`${path} was started ${saved.header.maxCostMicros ? `with --max-cost-micros ${saved.header.maxCostMicros}` : 'without --max-cost-micros'}. Pass the same, or another --journal.`);
  if (saved?.header.wallet && client.origin && saved.header.wallet !== client.origin)
    throw new Error(`${path} belongs to the wallet at ${saved.header.wallet}. Use that profile, or another --journal.`);
  const header: Header = saved?.header ?? { version: 2, tool: options.tool, runId: options.runId ?? client.runId, shape,
    ...(client.origin ? { wallet: client.origin } : {}), ...(options.maxCostMicros ? { maxCostMicros: options.maxCostMicros } : {}) };
  const journal = saved?.rows ?? new Map<string, Entry>();
  // Start from a compact file: the header and each row's latest line.
  const scratch = `${path}.${process.pid}.tmp`;
  await writeFile(scratch, [header, ...[...journal].map(([key, entry]) => ({ key, ...entry }))].map(line => JSON.stringify(line)).join('\n') + '\n', { mode: 0o600 });
  await rename(scratch, path);
  let writing = Promise.resolve();
  const record = (key: string, entry: Entry) => {
    journal.set(key, entry);
    return (writing = writing.then(() => appendFile(path, JSON.stringify({ key, ...entry }) + '\n')));
  };
  const prepared = rows.map(row => {
    const made = rowParams(row, options.map, input as Row);
    return 'missing' in made ? made : { params: made.params, key: hash([header.runId, options.tool, made.params]) };
  });
  const startedAt = Date.now();
  let stop: Stop | undefined, next = 0;
  const claimed = new Set<string>();

  const runRow = async (index: number) => {
    const row = prepared[index]!;
    // The same fields twice in one list are one call.
    if ('missing' in row || claimed.has(row.key)) return;
    claimed.add(row.key);
    let entry: Entry = journal.get(row.key) ?? { attempt: 0, state: 'sent' };
    if (options.retryFailed && finished(entry) && entry.state !== 'succeeded')
      entry = { attempt: entry.attempt + 1, state: 'sent', carriedMicros: (BigInt(entry.carriedMicros ?? '0') + BigInt(entry.billedMicros ?? '0')).toString(),
        ...(entry.exclude?.length ? { exclude: entry.exclude } : {}) };
    else if (finished(entry)) return;
    const halt = (reason: Stop['reason'], state: Entry, detail: Partial<Stop> = {}) => { stop ??= { reason, row: index, ...detail }; return record(row.key, state); };
    for (let replayed = false; ;) {
      const { invocationId: _id, billedMicros: _billed, reason: _reason, ...kept } = entry;
      await record(row.key, { ...kept, state: 'sent' });
      // A retry leaves out the providers that already answered a miss, so the caller does not pay them twice.
      const route = field(row.params, 'route');
      const params = entry.exclude?.length && (route === undefined || typeof route === 'object' && route !== null && !Array.isArray(route))
        ? { ...row.params, route: { ...route as Row, exclude: [...new Set([...(Array.isArray(field(route, 'exclude')) ? field(route, 'exclude') as string[] : []), ...entry.exclude])].slice(0, 50) } }
        : row.params;
      let receipt: InvocationReceipt;
      try {
        receipt = await client.callTool({ tool: options.tool, params: z.json().parse(params), idempotencyKey: `batch-${row.key.slice(0, 32)}-${entry.attempt}`,
          runId: header.runId, ...(options.runMaxMicros ? { runMaxMicros: options.runMaxMicros } : {}),
          ...(options.maxCostMicros ? { maxCostMicros: options.maxCostMicros } : {}) }, { waitMs: 120_000 });
      } catch (error) {
        const cause = error instanceof ToolCallError ? error.cause : error;
        const status = cause instanceof ToolClientError ? cause.status : 0;
        const response = cause instanceof ToolClientError ? cause.response : undefined;
        const message = (text(response, 'message') ?? (cause instanceof Error ? cause.message : 'failed')).slice(0, 300);
        const waiting: Entry = { ...kept, state: 'stopped', reason: message };
        if (text(response, 'reason') === 'run_ceiling')
          return halt('run_ceiling', { ...waiting, reason: 'run ceiling reached' }, text(response, 'remainingMicros') ? { remainingMicros: text(response, 'remainingMicros') } : {});
        // Money, the card or the key refused the call: nothing was stored, and every later row would be refused the same way.
        if (status === 402) return halt('funds', waiting, { message });
        if (status === 401) return halt('unauthorized', waiting, { message });
        if (status === 403) return halt('refused', waiting, { message });
        // A conflict, a timeout or a server error may clear: the row stays sent and replays its key on the next run.
        // Any other refusal is about this row's own fields; it is sent again only if the command is run again.
        const definite = status >= 400 && status < 500 && ![408, 409, 429].includes(status);
        return record(row.key, { ...kept, state: definite ? 'failed' : 'sent', reason: message });
      }
      if (running.has(receipt.state)) receipt = await client.waitForInvocation(receipt.id, { timeoutMs: 300_000 }).catch(() => receipt);
      const stopped = stoppedRoute(receipt);
      if (stopped) {
        // The stored receipt is a refusal, so the row needs a new key; what this attempt billed stays in the total.
        entry = { attempt: entry.attempt + 1, state: 'stopped', carriedMicros: (BigInt(entry.carriedMicros ?? '0') + BigInt(receipt.billedMicros ?? '0')).toString(),
          ...excluding(entry, receipt),
          reason: stopped === 'run_ceiling' ? 'run ceiling reached' : 'card or balance stopped this call' };
        // A refusal stored before this run started was already acted on (the maximum was raised, funds were added): send the row again now.
        if (!replayed && Date.parse(receipt.createdAt) < startedAt - 5_000) { replayed = true; continue; }
        return halt(stopped, entry);
      }
      // A route that failed keeps the same list, so --retry-failed does not pay those providers again either.
      await record(row.key, { ...kept, state: running.has(receipt.state) ? 'pending' : receipt.state as RowState, invocationId: receipt.id, billedMicros: receipt.billedMicros,
        ...(receipt.state === 'failed' ? excluding(entry, receipt) : {}) });
      if (options.runMaxMicros) {
        const ceiling = (await client.runSummary(header.runId).catch(() => undefined))?.ceiling;
        if (ceiling && BigInt(ceiling.remainingMicros) === 0n) stop ??= { reason: 'run_ceiling', remainingMicros: '0' };
      }
      return;
    }
  };
  const worker = async () => {
    while (!stop) {
      const index = next++;
      if (index >= rows.length) return;
      await runRow(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency, rows.length) }, worker));
  await writing;
  const results = prepared.map((row, index) => 'missing' in row ? { row: index, state: 'skipped', reason: `missing ${row.missing.join(', ')}` }
    : { row: index, ...(journal.get(row.key) ?? { state: 'not_sent' }) });
  const entries = [...new Set(prepared.flatMap(row => 'key' in row ? [row.key] : []))].map(key => journal.get(key));
  const count = (state: string) => results.filter(result => result.state === state).length;
  const remaining = prepared.filter(row => 'key' in row && !finished(journal.get(row.key))).length;
  const failed = count('failed') + count('cancelled');
  return {
    // Done means every row has an answer or was skipped; anything else needs another run or a decision.
    exitCode: results.every(result => result.state === 'succeeded' || result.state === 'skipped') ? 0 : 2,
    result: { tool: options.tool, runId: header.runId, journal: path, rows: rows.length,
      succeeded: count('succeeded'), failed: count('failed'), skipped: count('skipped'), cancelled: count('cancelled'), remaining,
      billedMicros: entries.reduce((sum, entry) => sum + BigInt(entry?.billedMicros ?? '0') + BigInt(entry?.carriedMicros ?? '0'), 0n).toString(),
      ...(stop ? { stopped: { ...stop, next: stopText[stop.reason] } }
        : remaining ? { next: 'Run the same command again to finish the remaining rows; rows already sent are not charged twice.' }
        : failed ? { next: `${failed} rows failed or were cancelled. Add --retry-failed to send them again under new keys; providers a failed route already paid are not asked again.` } : {}),
      results },
  };
}
