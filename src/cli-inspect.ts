import type { ToolDefinition } from './contracts/index.js';
import { cliRecoveryCommand } from './cli-execution.js';

type Selection = { profile?: string; cardId?: string; invocation?: readonly string[] };
const locations = { pathParams: 'path', queryParams: 'query', headers: 'header', body: 'body' } as const;
const annotations = new Set(['$comment', 'title', 'description', 'example', 'examples']);
const maps = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas', 'dependencies']);
const children = new Set(['additionalItems', 'additionalProperties', 'allOf', 'anyOf', 'contains', 'contentSchema',
  'else', 'if', 'items', 'not', 'oneOf', 'prefixItems', 'propertyNames', 'then', 'unevaluatedItems', 'unevaluatedProperties']);
const record = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;

function compactSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactSchema);
  const schema = record(value);
  if (!schema) return value;
  return Object.fromEntries(Object.entries(schema).flatMap(([key, child]) => {
    if (annotations.has(key)) return [];
    if (maps.has(key) && record(child))
      return [[key, Object.fromEntries(Object.entries(record(child)!).map(([name, field]) => [name, compactSchema(field)]))]];
    return [[key, children.has(key) ? compactSchema(child) : child]];
  }));
}

function fields(value: unknown) {
  const schema = record(value);
  if (!schema) return {};
  return record(schema.properties) ?? (typeof schema.type === 'string' || Array.isArray(schema.type) ||
    typeof schema.$schema === 'string' || typeof schema.$ref === 'string' || Array.isArray(schema.required) ||
    Array.isArray(schema.allOf) || Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf) ? {} : schema);
}

function compactInput(value: unknown) {
  const legacyFields = fields(value);
  return legacyFields === value
    ? Object.fromEntries(Object.entries(legacyFields).map(([key, field]) => [key, compactSchema(field)]))
    : compactSchema(value);
}

function requiredFields(value: unknown): string[] {
  const schema = record(value);
  if (Array.isArray(schema?.required)) return schema.required.filter((key): key is string => typeof key === 'string');
  return Object.entries(fields(value)).filter(([, field]) => record(field)?.required === true).map(([name]) => name);
}

/** A value inspect can show for a field with no catalog example: its example, first enum value or default. */
function sampleValue(field: unknown): unknown {
  const schema = record(field);
  if (!schema) return undefined;
  for (const key of ['example', 'default'] as const) if (schema[key] !== undefined) return schema[key];
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  return undefined;
}

function exampleCommand(tool: ToolDefinition, selection: Selection) {
  const selected = selection.profile ? ['--profile', selection.profile] : [];
  const card = selection.cardId ? ['--card', selection.cardId] : [];
  const args = [...selected, ...card, 'call', tool.id];
  const bindings = [...tool.auth, ...(tool.customerAuth ?? [])];
  const isCredential = (location: string, name: string) => bindings.some(binding =>
    binding.location === location && binding.name.toLowerCase() === name.toLowerCase()) ||
    location === 'header' && /^(?:authorization|proxy-authorization|cookie|set-cookie|(?:x-)?api-key)$/i.test(name);
  let template = false;
  const write = (tool.effect ?? tool.decisionEvidence?.effect) === 'write';
  const bodyContract = tool.input.body !== undefined && tool.input.body !== null;
  if (!bodyContract && tool.input.queryParams) {
    // Query-only tools: one flat --input with the real query names, which call places in the query.
    const declared = fields(tool.input.queryParams);
    const named = (name: string) => Object.hasOwn(declared, name) ? name : Object.hasOwn(declared, `${name}[]`) ? `${name}[]` : undefined;
    const flat: Record<string, unknown> = {};
    // Some catalog examples list query values as a JSON body; keep only names the query declares.
    for (const [name, value] of [...Object.entries(record(tool.example.queryParams) ?? {}), ...Object.entries(record(tool.example.body) ?? {})]) {
      const target = named(name);
      if (!target || isCredential('query', target) || Object.hasOwn(flat, target)) continue;
      flat[target] = target.endsWith('[]') && !Array.isArray(value) ? [value] : value;
    }
    for (const name of requiredFields(tool.input.queryParams)) {
      if (Object.hasOwn(flat, name) || isCredential('query', name)) continue;
      const value = sampleValue(declared[name]);
      if (value === undefined) template = true;
      flat[name] = value ?? `<${name}>`;
    }
    // No catalog example and no required field (a provider rule like "linkedin_url OR name + company" lives in a
    // note): show every field that carries its own example, so the printed command is not an empty call.
    if (!Object.keys(flat).length) for (const [name, field] of Object.entries(declared)) {
      const schema = record(field);
      const value = schema?.example ?? (Array.isArray(schema?.examples) ? schema.examples[0] : undefined);
      if (value !== undefined && !isCredential('query', name)) flat[name] = value;
    }
    const json = JSON.stringify(flat);
    if (Object.keys(flat).length && json.length <= 512) args.push('--input', json);
    else if (Object.keys(flat).length) { args.push('--input', '@input.json'); template = true; }
    for (const key of ['pathParams', 'headers'] as const) {
      const location = locations[key], supplied = record(tool.example[key]) ?? {}, known = fields(tool.input[key]);
      for (const name of new Set([...Object.keys(supplied), ...requiredFields(tool.input[key])])) {
        if (isCredential(location, name)) continue;
        const raw = Object.hasOwn(supplied, name) ? supplied[name] : sampleValue(known[name]);
        const value = typeof raw === 'string' && !/[\r\n]/.test(raw) ? raw : undefined;
        if (value === undefined) template = true;
        args.push(`--${location}`, location === 'header' ? `${name}: ${value ?? `<${name}>`}` : `${name}=${value ?? `<${name}>`}`);
      }
    }
    if (write) args.push('--allow-write');
    return { callExample: cliRecoveryCommand(args, selection.invocation),
      ...(template ? { exampleNote: 'Fill in the input file or placeholders before calling.' } : {}) };
  }

  const body = tool.example.body;
  const bodyFields = record(body);
  const bodyExample = bodyFields ? Object.fromEntries(Object.entries(bodyFields).filter(([name]) => !isCredential('body', name))) : body;
  const requiredBody = requiredFields(tool.input.body).filter(name => !isCredential('body', name));
  const bodyNames = new Set([...Object.keys(record(bodyExample) ?? {}), ...requiredBody]);
  // A body field named like a query or path field needs explicit locations. invoke takes them on every server version;
  // a {"body":{...}} call input is placed only by servers with the call-input unwrap, and an older server would send
  // the wrapper to the provider as a field and charge the call.
  if ([tool.input.queryParams, tool.input.pathParams].some(schema => Object.keys(fields(schema)).some(name => bodyNames.has(name))))
    return { invokeExample: cliRecoveryCommand([...selected, ...card, 'invoke', '--input', 'request.json'], selection.invocation),
      exampleNote: 'Put the tool ID and separate input locations in request.json.' };
  const bodyJson = JSON.stringify(bodyExample);
  if (bodyJson && bodyJson.length <= 512 && requiredBody.every(name => Object.hasOwn(record(bodyExample) ?? {}, name)))
    args.push('--input', bodyJson);
  else if (tool.input.body !== undefined && tool.input.body !== null) {
    args.push('--input', '@input.json');
    template = true;
  }

  for (const key of ['pathParams', 'queryParams', 'headers'] as const) {
    const location = locations[key];
    const supplied = record(tool.example[key]) ?? {};
    const declared = fields(tool.input[key]);
    for (const name of new Set([...Object.keys(supplied), ...requiredFields(tool.input[key])])) {
      if (isCredential(location, name)) continue;
      const raw = Object.hasOwn(supplied, name) ? supplied[name] : sampleValue(declared[name]);
      const value = location === 'query' ? raw : typeof raw === 'string' && !/[\r\n]/.test(raw) ? raw : undefined;
      if (value === undefined) template = true;
      const sample = value === undefined ? `<${name}>` : value;
      args.push(`--${location}`, location === 'header' ? `${name}: ${sample}`
        : `${name}=${location === 'query' ? JSON.stringify(sample) : sample}`);
    }
  }
  if (write) args.push('--allow-write');
  return { callExample: cliRecoveryCommand(args, selection.invocation),
    ...(template ? { exampleNote: 'Fill in the input file or placeholders before calling.' } : {}) };
}

/** Every input as call takes it: one flat list, each field tagged with where o11 sends it. */
function inputFields(tool: ToolDefinition) {
  return Object.entries(locations).flatMap(([key, location]) => {
    const schema = tool.input[key as keyof typeof locations];
    const required = new Set(requiredFields(schema));
    return Object.entries(fields(schema)).flatMap(([name, raw]) => {
      if (location === 'header' && /^(?:authorization|proxy-authorization|cookie|(?:x-)?api-key)$/i.test(name)
        || [...tool.auth, ...(tool.customerAuth ?? [])].some(binding => binding.location === location && binding.name.toLowerCase() === name.toLowerCase())) return [];
      const field = record(raw) ?? {};
      const type = typeof field.type === 'string' ? field.type : Array.isArray(field.type) ? field.type.join('|') : undefined;
      const text = typeof field.note === 'string' ? field.note : field.description;
      const note = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 160) : undefined;
      const choices = Array.isArray(field.enum) && field.enum.length <= 12 ? field.enum : undefined;
      return [{ name, in: location, ...(type ? { type } : {}), ...(required.has(name) ? { required: true } : {}),
        ...(choices ? { enum: choices } : {}), ...(note ? { note } : {}) }];
    });
  });
}

/**
 * Notes up to 600 characters print whole. A longer one ends at its last full sentence within that (or the last word),
 * so advice such as which paid follow-up returns an email is never cut mid-word.
 */
export function shortNote(note: string, limit = 600) {
  if (note.length <= limit) return note;
  const head = note.slice(0, limit + 1);
  const sentence = [...head.matchAll(/[.!?](?=\s)/g)].at(-1)?.index;
  const space = head.lastIndexOf(' ', limit - 1);
  const kept = sentence !== undefined && sentence >= limit / 3 ? head.slice(0, sentence + 1) : `${head.slice(0, space > 0 ? space : limit - 1)}…`;
  return `${kept} (inspect --detailed shows the full note.)`;
}

export function compactInspection(tool: ToolDefinition, selection: Selection) {
  const input = Object.fromEntries(Object.keys(locations).flatMap(key => {
    const value = tool.input[key];
    return value === undefined || value === null || record(value) && !Object.keys(record(value)!).length
      ? [] : [[key, compactInput(value)]];
  }));
  const { price } = tool;
  const billingIssue = price.unavailableReason ?? (price.requiresSupplierRate || price.tariff?.billingAvailable === false
    ? price.tariff?.blocker ?? 'Supplier price unavailable' : undefined);
  const bodyType = tool.bodyType ?? tool.input.bodyType;
  const write = (tool.effect ?? tool.decisionEvidence?.effect) === 'write';
  const notes = [...(tool.notes ?? []).slice(0, 3).map(note => shortNote(note)),
    ...(write ? ['callExample includes --allow-write because this endpoint is classed as a write; call refuses it without that flag.'] : [])];
  return {
    id: tool.id,
    ...exampleCommand(tool, selection),
    price: {
      // `$0.01–$0.03 (avg $0.0233)`: low, the held top of the range, and the mean billed in the last 30 days.
      ...(price.priceText ? { priceText: price.priceText, priceMinMicros: price.priceMinMicros, priceMaxMicros: price.priceMaxMicros,
        ...(price.priceAvgMicros ? { priceAvgMicros: price.priceAvgMicros, priceAvgN: price.priceAvgN } : {}) } : {}),
      basis: price.basis,
      ...(price.micros !== null ? { micros: price.micros } : {}),
      ...(price.unit ? { unit: price.unit } : {}),
      ...(price.rates?.length === 1 ? { rates: price.rates } : {}),
      ...(price.basis === 'variable' && price.tariff?.label ? { label: price.tariff.label } : {}),
      ...(price.supplierQuoteAtExecution ? { supplierQuoteAtExecution: true } : {}),
      ...(billingIssue ? { unavailable: billingIssue } : {}),
    },
    ...(Object.keys(input).length ? { input } : {}),
    ...(inputFields(tool).length ? { fields: inputFields(tool) } : {}),
    // Notes say what a free endpoint leaves out and which paid follow-up returns it.
    ...(notes.length ? { notes } : {}),
    ...(bodyType && bodyType !== 'json' ? { bodyType } : {}),
    ...((tool.effect ?? tool.decisionEvidence?.effect) === 'write' ? { effect: 'write' } : {}),
    ...(tool.recurring ? { recurring: true } : {}),
    ...(tool.requiresCustomerCredentials ? { requiresCustomerCredentials: true }
      : tool.platformAccountAvailable === false ? { platformAccountAvailable: false } : {}),
    ...(tool.availability !== 'configured' ? { unavailable: tool.unavailableReason ?? tool.availability } : {}),
  };
}
