import { readFile } from 'node:fs/promises';
import { publicOperationSchemas } from './contracts/public-api.js';
import type { z } from 'zod';

type CallRequest = z.input<typeof publicOperationSchemas.call>;
type Json = z.infer<typeof publicOperationSchemas.call>['query'];
const usage = 'Use o11 call TOOL_ID [-i JSON | -f FILE | --data JSON|@FILE|@-] [--query KEY=VALUE]';

function pair(value: string, delimiter: string): [string, string] {
  const split = value.indexOf(delimiter);
  if (split < 1) throw new Error(`Expected KEY${delimiter}VALUE`);
  return [value.slice(0, split), value.slice(split + delimiter.length)];
}
function queryValue(value: string): NonNullable<Json>[string] {
  try { return JSON.parse(value) as NonNullable<Json>[string]; }
  catch { return value; }
}

export function callArguments(values: string[]) {
  if (!values[0] || values[0].startsWith('-')) throw new Error(usage);
  const request: CallRequest = { tool: values[0] };
  let data: string | undefined;
  const seen = new Set<string>();
  for (let index = 1; index < values.length; index++) {
    const suppliedFlag = values[index]!;
    const fileInput = suppliedFlag === '-f' || suppliedFlag === '--input-file';
    const flag = ['-i', '--input', '-f', '--input-file'].includes(suppliedFlag) ? '--data' : suppliedFlag;
    if (flag === '--allow-write' || flag === '--accept-recurring') {
      if (seen.has(flag)) throw new Error(`Supply ${flag} once`);
      seen.add(flag);
      request[flag === '--allow-write' ? 'allowWrite' : 'acceptRecurring'] = true;
      continue;
    }
    if (!['--data', '--query', '--path', '--header', '--idempotency-key', '--max-cost-micros', '--credential-mode', '--connection'].includes(flag))
      throw new Error(`Unknown call flag: ${flag}. ${usage}`);
    const value = values[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Supply a value after ${flag}`);
    if (!['--query', '--path', '--header'].includes(flag)) {
      if (seen.has(flag)) throw new Error(`Supply ${flag} once`);
      seen.add(flag);
    }
    if (flag === '--data') data = fileInput ? `@${value}` : value;
    else if (flag === '--query') {
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
      if (!name || Object.hasOwn(fields, name)) throw new Error(`Supply ${flag} ${name} once`);
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
  return { request: publicOperationSchemas.call.parse(request), data };
}

export async function callRequest(values: string[]) {
  const { request, data } = callArguments(values);
  if (data !== undefined) {
    const raw = data === '@-' ? await Bun.stdin.text() : data.startsWith('@') ? await readFile(data.slice(1), 'utf8') : data;
    try { request.params = JSON.parse(raw.replace(/^\uFEFF/, '')); }
    catch { throw new Error('Call input must contain valid JSON; use -f FILE to avoid shell quoting issues.'); }
  }
  return publicOperationSchemas.call.parse(request);
}
