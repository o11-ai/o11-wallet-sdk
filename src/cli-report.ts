import { invocationReferenceSchema, invocationShortIdSchema } from "./contracts/invocation-lifecycle.js";
import { z } from 'zod';
import { mkdir, lstat, chmod, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createReportSchema, type CreateReport, type ReportDetail } from './contracts/reports.js';
import { credentialDirectory, readConfig, profileTokenProvider } from './config.js';
import { ToolClient, ToolClientError } from './client.js';
import { cliRecoveryCommand } from './cli-execution.js';

const usage = 'Use report -t "short symptom" [-r RUN_UUID] [--invocation CALL_ID] [--note FILE] [--request-id UUID], report --retry UUID, or report --input FILE|-';
type ReportArguments = { mode: 'input' } | { mode: 'retry'; requestId: string } |
  { mode: 'simple'; reason: string; invocationIds: string[]; note?: string; requestId?: string; runId?: string };
export function reportArguments(args: string[]): ReportArguments {
  if (args[0] === '--input' || args.length === 1 && args[0]!.startsWith('{')) {
    if (args[0] === '--input' && (args.length !== 2 || !args[1])) throw new Error(usage);
    return { mode: 'input' };
  }
  if (args[0] === '--retry') {
    if (args.length !== 2) throw new Error(usage);
    return { mode: 'retry', requestId: z.uuid().parse(args[1]) };
  }
  let reason: string | undefined, note: string | undefined, requestId: string | undefined, runId: string | undefined;
  const invocationIds: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === '-t' || flag === '--text') { if (reason !== undefined || !args[i + 1] || args[i + 1]!.startsWith('-')) throw new Error(usage); reason = args[++i]; }
    else if (flag === '-r' || flag === '--run') { if (runId) throw new Error(usage); runId = z.uuid().parse(args[++i]); }
    else if (flag === '--invocation') invocationIds.push(invocationReferenceSchema.parse(args[++i]));
    else if (flag === '--note') { if (note || !args[i + 1] || args[i + 1]!.startsWith('--')) throw new Error(usage); note = args[++i]; }
    else if (flag === '--request-id') { if (requestId) throw new Error(usage); requestId = z.uuid().parse(args[++i]); }
    else if (flag.startsWith('-') || reason !== undefined) throw new Error(usage);
    else reason = flag;
  }
  if (!reason?.trim() || invocationIds.length > 20) throw new Error(usage);
  return { mode: 'simple', reason, invocationIds: [...new Set(invocationIds)], note, requestId, runId };
}

// Match server report redaction before writing any local request or diagnostic text.
function redact(value: string) {
  return value.replace(/\b(authorization|proxy-authorization|cookie|set-cookie|x-api-key)\s*:\s*[^\r\n]*/gi, '$1: [redacted]')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/https?:\/\/[^\s<>"']+/gi, raw => { try { return new URL(raw).origin + '/[url redacted]'; } catch { return '[url redacted]'; } })
    .replace(/\b(?:(?:bearer|basic)\s+[^\s,;]+|(?:o11_|sk-)[a-z0-9_-]+|[a-z]{3,10}_[a-z0-9]{16,}|(?:api[ _-]?key|access[_-]?token|refresh[_-]?token|session[_-]?(?:token|id)|password|secret|token)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+))/gi, '[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]');
}
function sanitizedRequest(raw: unknown) {
  const value = createReportSchema.parse(raw);
  return createReportSchema.parse({ ...value, reason: redact(value.reason), ...(value.intent ? { intent: redact(value.intent) } : {}),
    toolIds: value.toolIds.map(redact), discoverQueries: value.discoverQueries.map(redact) });
}
const contextSchema = z.object({ cliVersion: z.string(), walletOrigin: z.url().max(2000).optional(), cardId: z.uuid().optional(), runId: z.uuid().optional() });
const safeReportSchema = z.object({ id: z.uuid(), status: z.string(), revision: z.number(), metadata: z.record(z.string(), z.unknown()) });
const diagnosticSchema = z.object({ version: z.literal(1), request: createReportSchema, context: contextSchema,
  state: z.enum(['pending', 'submitted', 'not_confirmed']), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  rootCause: z.literal('unknown'), report: safeReportSchema.optional(), failure: z.object({ code: z.string(), status: z.number().optional() }).optional() });
type Diagnostic = z.infer<typeof diagnosticSchema>;
type Options = { profile?: string; cardId?: string; runId?: string; version: string; input?: unknown; invocation?: readonly string[] };
export class ReportSubmissionError extends Error {
  constructor(readonly details: { error: string; requestId: string; diagnosticFile: string; retryCommand: string; status?: number },
    message = 'Report submission was not confirmed. Retry the saved request.') {
    super(message);
  }
}
async function reportDirectory(profile?: string) {
  const parent = credentialDirectory(profile), directory = join(parent, 'reports');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  if (!(await lstat(parent)).isDirectory() || (await lstat(parent)).isSymbolicLink()) throw new Error('The report configuration directory must be a real directory');
  await mkdir(directory, { mode: 0o700 }).catch((error: unknown) => { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; });
  const current = await lstat(directory);
  if (!current.isDirectory() || current.isSymbolicLink()) throw new Error('The report directory must be a real directory');
  if (process.platform !== 'win32') await chmod(directory, 0o700);
  return directory;
}
async function load(path: string): Promise<Diagnostic | undefined> {
  const current = await lstat(path).catch((error: unknown) => { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw error; });
  if (!current) return;
  if (!current.isFile() || current.isSymbolicLink() || current.size > 128 * 1024 || process.platform !== 'win32' && (current.mode & 0o077) !== 0)
    throw new Error('Report diagnostics must be small owner-only regular files');
  return diagnosticSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}
async function save(path: string, diagnostic: Diagnostic, first = false) {
  const metadata = diagnostic.report?.metadata;
  let text = JSON.stringify(diagnostic, null, 2) + '\n';
  while (Buffer.byteLength(text) > 120 * 1024 && metadata) {
    const keys = (['currentInvocations', 'invocations', 'requests', 'runs'] as const).filter(key => Array.isArray(metadata[key]) && metadata[key].length > 0);
    keys.sort((a, b) => JSON.stringify(metadata[b]).length - JSON.stringify(metadata[a]).length);
    const key = keys[0]; if (!key) break;
    const items = metadata[key] as unknown[]; items.pop();
    const coverage = metadata.coverage as Record<string, unknown>;
    coverage[{ currentInvocations: 'currentInvocationCaptured', invocations: 'invocationCaptured', requests: 'requestCaptured', runs: 'runCaptured' }[key]!] = items.length;
    text = JSON.stringify(diagnostic, null, 2) + '\n';
  }
  if (Buffer.byteLength(text) > 128 * 1024) throw new Error('Report diagnostics exceed their private file limit');
  if (first) { await writeFile(path, text, { flag: 'wx', mode: 0o600 }); return; }
  await load(path);
  const temporary = path + '.' + crypto.randomUUID() + '.tmp';
  try { await writeFile(temporary, text, { flag: 'wx', mode: 0o600 }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
function safeInvocation(value: ReportDetail['evidence']['invocations'][number]) {
  const { id, toolId, provider, state, reservedMicros, billedMicros, createdAt, role, resultAvailable, nextAction, canResume,
    runId, credentialMode, upstreamStatus, failure, holdState, heldMicros } = value;
  return { id, toolId: redact(toolId).slice(0, 250), provider: redact(provider).slice(0, 80), state: redact(state).slice(0, 40),
    reservedMicros: /^\d{1,30}$/.test(reservedMicros) ? reservedMicros : undefined,
    billedMicros: billedMicros === null || /^\d{1,30}$/.test(billedMicros) ? billedMicros : undefined, createdAt, role,
    resultAvailable, nextAction, canResume, runId, credentialMode, upstreamStatus,
    ...(holdState ? { holdState } : {}),
    ...(heldMicros !== undefined && /^\d{1,30}$/.test(heldMicros) ? { heldMicros } : {}),
    ...(value.error ? { error: redact(value.error).slice(0, 300) } : {}),
    ...(failure ? { failure: { stage: failure.stage, codes: failure.codes, occurredAt: failure.occurredAt } } : {}) };
}
function safeReport(value: ReportDetail): z.infer<typeof safeReportSchema> {
  return { id: value.id, status: value.status, revision: value.revision, metadata: {
    cardId: value.cardId, createdAt: value.createdAt, updatedAt: value.updatedAt, outcome: value.outcome,
    runs: value.evidence.runs.slice(0, 20),
    coverage: { invocationTotal: value.evidence.invocations.length, invocationCaptured: Math.min(40, value.evidence.invocations.length),
      currentInvocationTotal: value.currentInvocations.length, currentInvocationCaptured: Math.min(40, value.currentInvocations.length),
      requestTotal: value.evidence.requests.length, requestCaptured: Math.min(40, value.evidence.requests.length),
      runTotal: value.evidence.runs.length, runCaptured: Math.min(20, value.evidence.runs.length) },
    invocations: value.evidence.invocations.slice(0, 40).map(safeInvocation),
    currentInvocations: value.currentInvocations.slice(0, 40).map(item => ({ ...safeInvocation(item), observedAt: item.observedAt })),
    requests: value.evidence.requests.slice(0, 40).map(item => ({ requestId: item.requestId, operation: redact(item.operation).slice(0, 100),
      outcome: item.outcome ? redact(item.outcome).slice(0, 100) : undefined,
      errorCode: item.errorCode && /^[A-Z0-9_]{1,80}$/.test(item.errorCode) ? item.errorCode : undefined,
      runId: item.runId, callId: item.callId })),
  } };
}

export async function fileReport(args: string[], options: Options) {
  const profile = options.profile ?? process.env.O11_TOOLS_PROFILE;
  const parsed = reportArguments(args), directory = await reportDirectory(profile);
  let request: CreateReport, saved: Diagnostic | undefined;
  if (parsed.mode === 'retry') {
    saved = await load(join(directory, parsed.requestId + '.json'));
    if (!saved || saved.request.requestId !== parsed.requestId) throw new Error('Saved report request not found');
    request = saved.request;
  } else if (parsed.mode === 'input') request = sanitizedRequest(options.input);
  else {
    let note = '';
    if (parsed.note) {
      const info = await stat(parsed.note);
      if (!info.isFile() || info.size > 16_000) throw new Error('Use a regular note file with at most 4,000 characters');
      note = await readFile(parsed.note, 'utf8');
    }
    request = sanitizedRequest({ requestId: parsed.requestId ?? crypto.randomUUID(), kind: 'feedback',
      reason: parsed.reason + (note ? '\n\n' + note : ''), invocationIds: parsed.invocationIds,
      ...(parsed.runId ? { runId: parsed.runId } : {}) });
  }
  const path = join(directory, request.requestId + '.json');
  saved ??= await load(path);
  if (saved && JSON.stringify(saved.request) !== JSON.stringify(request)) throw new Error('This request ID already has different report content; retry the saved request or use a new request ID');
  if (saved?.context.cardId && options.cardId && saved.context.cardId !== options.cardId) throw new Error('Retry the report using its original card');
  if (saved?.context.runId && options.runId && saved.context.runId !== options.runId) throw new Error('Retry the report using its original request correlation run');
  const retryCommand = cliRecoveryCommand([...(profile ? ['--profile', profile] : []), 'report', '--retry', request.requestId,
    ...(options.cardId ?? saved?.context.cardId ? ['--card', (options.cardId ?? saved?.context.cardId)!] : [])], options.invocation);
  const now = new Date().toISOString();
  const diagnostic: Diagnostic = saved ?? { version: 1, request, context: { cliVersion: options.version,
    ...(options.cardId ? { cardId: options.cardId } : {}), ...(options.runId ? { runId: z.uuid().parse(options.runId) } : {}) },
    state: 'pending', createdAt: now, updatedAt: now, rootCause: 'unknown' };
  if (!saved) {
    try { await save(path, diagnostic, true); }
    catch { throw new ReportSubmissionError({ error: 'REPORT_FILE_UNAVAILABLE', requestId: request.requestId, diagnosticFile: path, retryCommand },
      'No report was submitted because its private diagnostic file could not be saved. Inspect the file before retrying.'); }
  }
  if (diagnostic.state === 'submitted' && diagnostic.report)
    return { id: diagnostic.report.id, status: diagnostic.report.status, revision: diagnostic.report.revision,
      cached: true, walletOrigin: diagnostic.context.walletOrigin, requestId: request.requestId, diagnosticFile: path };
  try {
    const config = await readConfig(profile, { refresh: false }), origin = new URL(config.baseUrl).origin;
    if (diagnostic.context.walletOrigin && diagnostic.context.walletOrigin !== origin)
      throw new ReportSubmissionError({ error: 'REPORT_DESTINATION_CHANGED', requestId: request.requestId, diagnosticFile: path, retryCommand },
        'Retry the saved report using its original wallet origin. Its diagnostic file was preserved.');
    diagnostic.context.walletOrigin = contextSchema.shape.walletOrigin.parse(origin);
    let client = new ToolClient({ ...config, cardId: options.cardId ?? diagnostic.context.cardId,
      runId: options.runId ?? diagnostic.context.runId ?? request.runId, tokenProvider: profileTokenProvider(profile, config) });
    diagnostic.context.runId = client.runId;
    diagnostic.context.cardId ??= options.cardId;
    if (!diagnostic.context.cardId) {
      await save(path, diagnostic);
      const cards = await client.cards();
      if (cards.items.length !== 1 || cards.cursor)
        throw new ReportSubmissionError({ error: 'REPORT_CARD_REQUIRED', requestId: request.requestId, diagnosticFile: path, retryCommand },
          'Choose --card UUID for this report, then retry the saved request. No report has been submitted.');
      diagnostic.context.cardId = cards.items[0]!.id;
    }
    client = client.withCard(diagnostic.context.cardId);
    await save(path, diagnostic);
    const report = await client.createReport(request);
    if (report.cardId !== diagnostic.context.cardId) throw new Error('The report response selected a different card');
    diagnostic.report = safeReport(report); diagnostic.context.cardId = report.cardId;
    diagnostic.state = 'submitted'; diagnostic.updatedAt = new Date().toISOString(); delete diagnostic.failure;
    await save(path, diagnostic);
    return { ...report, requestId: request.requestId, diagnosticFile: path };
  } catch (error) {
    if (error instanceof ReportSubmissionError) throw error;
    const response = error instanceof ToolClientError ? error.response : undefined;
    const code = response && typeof response === 'object' && 'error' in response && typeof response.error === 'string'
      && /^[A-Z_]{1,80}$/.test(response.error) ? response.error : 'REPORT_NOT_CONFIRMED';
    diagnostic.state = 'not_confirmed'; diagnostic.updatedAt = new Date().toISOString();
    diagnostic.failure = { code, ...(error instanceof ToolClientError ? { status: error.status } : {}) };
    await save(path, diagnostic);
    throw new ReportSubmissionError({ error: code, requestId: request.requestId, diagnosticFile: path, retryCommand,
      ...(error instanceof ToolClientError ? { status: error.status } : {}) },
      code === 'CONFLICT' && error instanceof ToolClientError && error.status === 409
        && [...request.invocationIds, ...request.contextInvocationIds].some(id => invocationShortIdSchema.safeParse(id).success)
        ? 'Report references conflict. If a short ID is ambiguous, use full invocation IDs from history. Check reports for an existing submission before filing corrected feedback with a new request ID. The original request is saved.'
        : request.runId && error instanceof ToolClientError && error.status === 400
          ? 'This wallet did not accept the run report. Update wallet reporting support, or file a new report with --invocation for an individual call. The original request is saved.'
          : undefined);
  }
}
