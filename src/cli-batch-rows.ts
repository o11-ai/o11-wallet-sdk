import { readFile, stat } from 'node:fs/promises';
import { invocationReferenceSchema } from './contracts/invocation-lifecycle.js';

export type Row = Record<string, unknown>;
/** `--map email=work_email`: the route field `email` takes the row's `work_email` (a dotted path reaches nested values). */
export type FieldMap = { field: string; column: string }[];

export function parseMap(value: string | undefined): FieldMap[number] {
  const split = value?.indexOf('=') ?? -1;
  const field = value?.slice(0, split).trim(), column = value?.slice(split + 1).trim();
  if (!value || split < 1 || !field || !column || !/^[A-Za-z_][\w.]*$/.test(field) || column.includes('='))
    throw new Error('Use --map FIELD=COLUMN, for example --map email=work_email');
  return { field, column };
}

function valueAt(row: Row, path: string): unknown {
  if (Object.hasOwn(row, path)) return row[path];
  let current: unknown = row;
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current) || !Object.hasOwn(current, part)) return undefined;
    current = (current as Row)[part];
  }
  return current;
}
function setAt(target: Row, path: string, value: unknown) {
  const parts = path.split('.'), last = parts.pop()!;
  let current = target;
  for (const part of parts) {
    const next = current[part];
    current = current[part] = typeof next === 'object' && next !== null && !Array.isArray(next) ? { ...next as Row } : {};
  }
  current[last] = value;
}
const empty = (value: unknown) => value === undefined || value === null || typeof value === 'string' && !value.trim();

/**
 * The params for one row: the base input, then each mapped field, or every field of the row when nothing is mapped.
 * A mapped column that is missing or blank skips the row, so no call is paid for an input the route cannot use.
 */
export function rowParams(row: Row, map: FieldMap, base: Row): { params: Row } | { missing: string[] } {
  if (!map.length) return { params: { ...base, ...row } };
  const params: Row = { ...base };
  const missing: string[] = [];
  for (const { field, column } of map) {
    const value = valueAt(row, column);
    if (empty(value)) missing.push(column);
    else setAt(params, field, typeof value === 'string' ? value.trim() : value);
  }
  return missing.length ? { missing } : { params };
}

/** Rows from a list result: a route's `output.items`, an `o11.rows` result's `rows`, or a bare array. */
export function rowsFromResult(result: unknown): Row[] | undefined {
  const candidates = [result, field(result, 'rows'), field(result, 'items'), field(field(result, 'output'), 'items'), field(field(result, 'output'), 'rows')];
  const list = candidates.find(Array.isArray);
  return list?.every(item => typeof item === 'object' && item !== null && !Array.isArray(item)) ? list as Row[] : undefined;
}
function field(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, name) ? (value as Row)[name] : undefined;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes. The first line names the columns. */
export function parseCsv(source: string): Row[] {
  // A byte-order mark before a quoted first header would otherwise hide its opening quote.
  const text = source.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let record: string[] = [], value = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && !value) quoted = true;
    else if (char === ',') { record.push(value); value = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      record.push(value); value = '';
      if (record.some(cell => cell !== '')) records.push(record);
      record = [];
    } else value += char;
  }
  if (quoted) throw new Error('The CSV file has an unclosed quote');
  record.push(value);
  if (record.some(cell => cell !== '')) records.push(record);
  const [header, ...body] = records;
  if (!header) return [];
  const names = header.map(name => name.trim().replace(/^﻿/, ''));
  if (names.some(name => !name) || new Set(names).size !== names.length) throw new Error('The CSV header needs unique, non-empty column names');
  return body.map(cells => Object.fromEntries(names.map((name, column) => [name, cells[column] ?? ''])));
}

function parseRowsText(text: string, path: string): Row[] {
  if (/\.csv$/i.test(path)) return parseCsv(text);
  if (/\.(jsonl|ndjson)$/i.test(path))
    return text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      const value: unknown = JSON.parse(line);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Line ${index + 1} of ${path} is not a JSON object`);
      return value as Row;
    });
  const rows = rowsFromResult(JSON.parse(text));
  if (!rows) throw new Error(`${path} needs a JSON array of objects, or an object with rows or items`);
  return rows;
}

export type RowSource = { kind: 'file'; path: string } | { kind: 'invocation'; id: string };
/** A path that exists is a file; otherwise the value must be an invocation ID whose result is a list. */
export async function rowSource(value: string): Promise<RowSource> {
  const isFile = await stat(value).then(found => found.isFile(), () => false);
  if (isFile) return { kind: 'file', path: value };
  if (invocationReferenceSchema.safeParse(value).success) return { kind: 'invocation', id: value };
  throw new Error(`--rows takes a CSV, JSON or JSONL file, or the ID of an earlier list call. ${value} is neither.`);
}
export async function loadRows(source: RowSource, readInvocation: (id: string) => Promise<{ state: string; result?: unknown }>) {
  if (source.kind === 'file') return parseRowsText(await readFile(source.path, 'utf8'), source.path);
  const receipt = await readInvocation(source.id);
  const rows = receipt.state === 'succeeded' ? rowsFromResult(receipt.result) : undefined;
  if (!rows) throw new Error(`Invocation ${source.id} has no list rows (state ${receipt.state}). Use a finished list call or a file.`);
  return rows;
}
