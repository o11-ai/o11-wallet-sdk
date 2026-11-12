import { readFile } from 'node:fs/promises';
import { inputSchema } from './contracts/index.js';
import { publicOperationSchemas } from './contracts/public-api.js';
import type { z } from 'zod';
import type { ToolClient } from './client.js';

type CallRequest = z.input<typeof publicOperationSchemas.call>;
type Json = z.infer<typeof publicOperationSchemas.call>['query'];
type Operation = 'call' | 'quote';
const usage = (operation: Operation) => 'Use o11 ' + operation + ' TOOL_ID [--input JSON|@FILE|@-]';

function pair(value: string, delimiter: string): [string, string] {
  const split = value.indexOf(delimiter);
  if (split < 1) throw new Error('Expected KEY' + delimiter + 'VALUE');
  return [value.slice(0, split), value.slice(split + delimiter.length)];
}
function queryValue(value: string): NonNullable<Json>[string] {
  try { return JSON.parse(value) as NonNullable<Json>[string]; }
  catch { return value; }
}

function looksLikeInlineJson(value: string) {
  const trimmed = value.trim();
  return /^[\[{"]/.test(trimmed) || /^(true|false|null|-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?)$/.test(trimmed);
}

function parseRequest(request: CallRequest) {
  const parsed = publicOperationSchemas.call.safeParse(request);
  if (parsed.success) return parsed.data;
  switch (parsed.error.issues[0]?.path[0]) {
    case 'connectionId': throw new Error('Use a connection ID from o11 connections.');
    case 'maxCostMicros': throw new Error('Use a nonnegative integer with --max-cost-micros.');
    case 'idempotencyKey': throw new Error('The idempotency key must be 1–200 characters.');
    case 'tool': throw new Error('Use a tool ID from o11 discover.');
    default: throw new Error('Invalid tool input.');
  }
}

export function callArguments(values: string[], operation: Operation = 'call') {
  if (!values[0] || values[0].startsWith('-')) throw new Error(usage(operation));
  const request: CallRequest = { tool: values[0] };
  let data: string | undefined;
  let legacy: 'inline' | 'file' | undefined;
  const seen = new Set<string>();
  for (let index = 1; index < values.length; index++) {
    const suppliedFlag = values[index]!;
    // Quote previously accepted an input envelope as a positional argument.
    if (operation === 'quote' && !suppliedFlag.startsWith('-')) {
      if (seen.has('--data')) throw new Error('Supply quote input once.');
      seen.add('--data');
      data = suppliedFlag;
      legacy = 'inline';
      continue;
    }
    const fileInput = suppliedFlag === '-f' || suppliedFlag === '--input-file';
    const flag = ['-i', '--input', '-f', '--input-file'].includes(suppliedFlag) ? '--data' : suppliedFlag;
    if (operation === 'quote' && ['--allow-write', '--accept-recurring', '--idempotency-key'].includes(flag))
      throw new Error(flag + ' is only for call.');
    if (flag === '--allow-write' || flag === '--accept-recurring') {
      if (seen.has(flag)) throw new Error('Supply ' + flag + ' once');
      seen.add(flag);
      request[flag === '--allow-write' ? 'allowWrite' : 'acceptRecurring'] = true;
      continue;
    }
    if (!['--data', '--query', '--path', '--header', '--idempotency-key', '--max-cost-micros', '--credential-mode', '--connection'].includes(flag))
      throw new Error('Unknown ' + operation + ' flag: ' + flag + '. ' + usage(operation));
    const value = values[++index];
    if (value === undefined || value.startsWith('--')) throw new Error('Supply a value after ' + flag);
    if (!['--query', '--path', '--header'].includes(flag)) {
      if (seen.has(flag)) throw new Error('Supply ' + flag + ' once');
      seen.add(flag);
    }
    if (flag === '--data') {
      // call and quote both read --input file.json (and - for stdin) like @file.json; inline JSON starts with {, [, " or a literal.
      const bareFile = ['-i', '--input'].includes(suppliedFlag) && !value.startsWith('@') && !looksLikeInlineJson(value);
      if (operation === 'quote' && suppliedFlag === '--input' && bareFile) legacy = 'file';
      data = fileInput || bareFile ? '@' + value : value;
    } else if (flag === '--query') {
      const [key, raw] = pair(value, '=');
      const params = request.query ??= {};
      const next = queryValue(raw);
      if (Object.hasOwn(params, key)) {
        const previous = params[key]!;
        params[key] = Array.isArray(previous) ? [...previous, next] : [previous, next];
      } else Object.defineProperty(params, key, { value: next, enumerable: true, configurable: true, writable: true });
    } else if (flag === '--path' || flag === '--header') {
      const [key, raw] = pair(value, flag === '--header' ? ':' : '=');
      const fields = flag === '--path' ? request.path ??= {} : request.headers ??= {};
      const name = flag === '--header' ? key.trim() : key;
      if (!name || Object.hasOwn(fields, name)) throw new Error('Supply ' + flag + ' ' + name + ' once');
      Object.defineProperty(fields, name, { value: flag === '--header' ? raw.trim() : raw, enumerable: true });
    } else if (flag === '--idempotency-key') request.idempotencyKey = value;
    else if (flag === '--max-cost-micros') request.maxCostMicros = value;
    else if (flag === '--connection') request.connectionId = value;
    else if (flag === '--credential-mode') {
      if (value !== 'platform' && value !== 'customer') throw new Error('Use --credential-mode platform or customer');
      request.credentialMode = value;
    }
  }
  if (request.connectionId && request.credentialMode !== 'customer') throw new Error('--connection requires --credential-mode customer');
  if (request.credentialMode === 'customer' && !request.connectionId) throw new Error('Use --connection ID with --credential-mode customer');
  return { request: parseRequest(request), data, legacy, explicitCredential: seen.has('--credential-mode') };
}

async function readInput(data: string, operation: Operation, fromFile = true): Promise<CallRequest['params']> {
  let raw: string;
  try {
    raw = fromFile && data === '@-' ? await Bun.stdin.text()
      : fromFile && data.startsWith('@') ? await readFile(data.slice(1), 'utf8') : data;
  } catch {
    throw new Error(fromFile && data.startsWith('@') && data !== '@-'
      ? `Could not read the input file ${JSON.stringify(data.slice(1).slice(0, 200))}. Pass inline JSON or an existing file.`
      : 'Could not read the input file.');
  }
  try { return JSON.parse(raw.replace(/^\uFEFF/, '')) as CallRequest['params']; }
  catch { throw new Error('Invalid ' + operation + ' JSON. Use --input @FILE for a JSON file.'); }
}

export async function callRequest(values: string[]) {
  const { request, data } = callArguments(values);
  return data === undefined ? request : parseRequest({ ...request, params: await readInput(data, 'call') });
}

export function quoteArguments(values: string[]) {
  return callArguments(values, 'quote');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const locationNames = new Set(['queryParams', 'pathParams', 'body', 'headers']);
function declaredFields(raw: unknown) {
  const source = record(raw);
  if (typeof source.type === 'string' || Array.isArray(source.type) || typeof source.$schema === 'string'
      || Array.isArray(source.anyOf) || Array.isArray(source.oneOf)) return record(source.properties);
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== null && typeof value === 'object' && !Array.isArray(value)));
}

// Match the server's call-input placement so quotes work with the deployed API.
function quoteInput(contract: Record<string, unknown>, call: CallRequest) {
  const queryParams = { ...call.query };
  const pathParams = { ...call.path };
  const headers = { ...call.headers };
  const define = (target: object, key: string, value: unknown) => Object.defineProperty(target, key, { value, enumerable: true });
  let body: unknown = call.body;
  if (call.params !== undefined) {
    const hasBody = contract.body !== undefined && contract.body !== null;
    if (call.params === null || typeof call.params !== 'object' || Array.isArray(call.params)) {
      if (!hasBody || body !== undefined) throw new Error('Use a JSON object for query parameters. Supply the body once.');
      body = call.params;
    } else {
      const queryFields = declaredFields(contract.queryParams);
      const pathFields = declaredFields(contract.pathParams);
      const bodyDeclared = declaredFields(contract.body);
      const bodyFields: [string, unknown][] = [];
      const declared = (key: string) => Object.hasOwn(queryFields, key) || Object.hasOwn(pathFields, key) || Object.hasOwn(bodyDeclared, key);
      // Unwrap a location wrapper only when that location declares fields, as the server does.
      const declaresFields = (location: string) => Object.keys(declaredFields(contract[location])).length > 0;
      const entries: [string, unknown][] = [];
      for (const [key, value] of Object.entries(call.params)) {
        if (!locationNames.has(key) || !declaresFields(key) || declared(key)) { entries.push([key, value]); continue; }
        // Agents copy inspect's location grouping into the input; place its fields rather than forwarding the wrapper.
        const fields = record(value);
        if (fields !== value || Object.keys(fields).some(name => locationNames.has(name) && !declared(name)))
          throw new Error('Pass fields flat in --input, not under ' + key + '.');
        if (key === 'body') {
          if (!hasBody) throw new Error('Pass fields flat in --input, not under ' + key + '.');
          // Explicit body fields stay in the body even when a query or path field shares the name.
          bodyFields.push(...Object.entries(fields));
        } else if (key === 'headers') {
          for (const [name, header] of Object.entries(fields)) {
            if (Object.hasOwn(headers, name) || typeof header !== 'string') throw new Error('Supply header ' + name + ' once as a string.');
            define(headers, name, header);
          }
        } else for (const [name, child] of Object.entries(fields)) {
          const target = key === 'pathParams' ? pathParams : queryParams;
          if (Object.hasOwn(target, name)) throw new Error('Supply ' + (key === 'pathParams' ? 'path' : 'query') + ' parameter ' + name + ' once.');
          if (key === 'pathParams' && typeof child !== 'string') throw new Error('Supply path parameter ' + name + ' once as a string.');
          define(target, name, child);
        }
      }
      for (const [key, value] of entries) {
        if (Object.hasOwn(pathFields, key)) {
          if (Object.hasOwn(pathParams, key) || typeof value !== 'string') throw new Error('Supply path parameter ' + key + ' once as a string.');
          Object.defineProperty(pathParams, key, { value, enumerable: true });
        } else if (Object.hasOwn(queryFields, key) || !hasBody) {
          if (Object.hasOwn(queryParams, key)) throw new Error('Supply query parameter ' + key + ' once.');
          Object.defineProperty(queryParams, key, { value, enumerable: true });
        } else bodyFields.push([key, value]);
      }
      if (bodyFields.length || hasBody && !Object.keys(call.params).length) {
        if (body !== undefined) throw new Error('Supply the body once.');
        body = Object.fromEntries(bodyFields);
      }
    }
  }
  return inputSchema.parse({ queryParams, pathParams, headers, ...(body !== undefined ? { body } : {}) });
}

export async function executeQuote(client: Pick<ToolClient, 'inspect' | 'quote'>, values: string[]) {
  const { request, data, legacy, explicitCredential } = quoteArguments(values);
  const supplied = data === undefined ? undefined : await readInput(data, 'quote', legacy !== 'inline');
  const options = {
    credentialMode: explicitCredential ? request.credentialMode : undefined,
    connectionId: request.connectionId,
    maxCostMicros: request.maxCostMicros,
  };
  if (legacy) {
    const parsed = inputSchema.safeParse(supplied);
    if (parsed.success) {
      if (request.query || request.path || request.headers)
        throw new Error('Use --input JSON or @FILE with --query, --path, or --header.');
      return client.quote(request.tool, parsed.data, options);
    }
  }
  const withParams = parseRequest({ ...request, params: supplied });
  const contract = supplied === undefined ? {} : (await client.inspect(request.tool)).input;
  return client.quote(request.tool, quoteInput(contract, withParams), options);
}

/**
 * One stderr line while a call runs; stdout stays one JSON receipt. A terminal gets a line that updates in place with
 * the step the wallet reports (which provider is being tried, judging). Other stderr gets one plain line at 20 s: how
 * to pick the call up again if the shell kills this command, or, before the wallet has named it, how to find it.
 */
export function callProgress(tool: string, runId: string, idempotencyKey: string) {
  const clean = (value: unknown) => String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80);
  const name = clean(tool);
  const started = Date.now();
  let id: string | undefined, step = '', drawn = false, noticed = false, named = false;
  const nameLine = () => {
    named = true;
    process.stderr.write(`o11: still running ${name} as ${id}. If this command is stopped, do not call again: o11 status ${id} --wait picks it up.\n`);
  };
  const live = process.stderr.isTTY ? setInterval(() => {
    const seconds = Math.round((Date.now() - started) / 1000);
    if (seconds < 3) return;
    process.stderr.write(`\r\x1b[Ko11: ${name}${id ? ` (${id.slice(0, 8)})` : ''}${step ? `, ${step}` : ''}, ${seconds} s`);
    drawn = true;
  }, 1000) : undefined;
  const notice = live ? undefined : setTimeout(() => {
    noticed = true;
    if (id) nameLine();
    else process.stderr.write(`o11: still running ${name}. If this command is stopped, do not call again: `
      + `find it with o11 history --run-id ${runId}, or rerun with --idempotency-key ${idempotencyKey}.\n`);
  }, 20_000);
  const pending = (reference: string) => {
    id ??= reference;
    if (noticed && !named) nameLine();
  };
  return {
    pending,
    /** A streamed call's events: the call's ID, then each provider attempt and judging. */
    event(event: { event: string; data: Record<string, unknown> }) {
      const data = event.data;
      if (event.event === 'accepted' && typeof data.invocationId === 'string') pending(data.invocationId);
      else if (event.event === 'attempt') {
        const who = clean(data.provider ?? data.tool ?? 'provider');
        step = data.status === 'started' ? `trying ${who}` : `${who} ${clean(data.outcome ?? 'done')}`;
      } else if (event.event === 'stage' && data.stage) step = clean(data.stage).replaceAll('_', ' ');
      else if (event.event === 'judge') step = `checking results (${clean(data.judged ?? 0)} done)`;
    },
    stop() {
      clearInterval(live);
      clearTimeout(notice);
      if (drawn) process.stderr.write('\r\x1b[K');
    },
  };
}
