import { createInterface } from 'node:readline/promises';
import { serviceOperationSchemas } from './contracts/public-api.js';
import type { ToolClient } from './client.js';
import type { z } from 'zod';

type Command = 'resources' | 'events' | 'release';
type ResourceAction = { operation: 'legacy-list' }
  | { operation: 'list'; input: z.infer<typeof serviceOperationSchemas.list_resources> }
  | { operation: 'get'; input: z.infer<typeof serviceOperationSchemas.get_resource> }
  | { operation: 'events'; input: z.infer<typeof serviceOperationSchemas.list_resource_events> }
  | { operation: 'legacy-events' | 'legacy-release' | 'release'; input: { id: string }; yes?: boolean };
export function resourceArguments(command: Command, args: string[]): ResourceAction {
  const [first, ...remaining] = args;
  const operation = command === 'resources' ? first ?? 'legacy-list' : command === 'events' ? 'legacy-events' : 'legacy-release';
  const values = command === 'resources' ? remaining : args;
  if (!['legacy-list', 'legacy-events', 'legacy-release', 'list', 'get', 'events', 'release'].includes(operation))
    throw new Error('Use resources [list|get|events|release]');
  const options: { id?: string; provider?: string; resourceType?: string; state?: string; limit?: number; cursor?: string; includeExternal?: boolean; yes?: boolean } = {};
  const names: Record<string, 'id' | 'provider' | 'resourceType' | 'state' | 'limit' | 'cursor'> = {
    '-r': 'id', '--resource-id': 'id', '-p': 'provider', '--provider': 'provider', '-t': 'resourceType', '--resource-type': 'resourceType',
    '-s': 'state', '--state': 'state', '-l': 'limit', '--limit': 'limit', '--cursor': 'cursor',
  };
  for (let index = 0; index < values.length; index++) {
    const flag = values[index]!;
    if (flag === '--no-external' && options.includeExternal === undefined) { options.includeExternal = false; continue; }
    if ((flag === '-y' || flag === '--yes') && options.yes === undefined) { options.yes = true; continue; }
    const name = Object.hasOwn(names, flag) ? names[flag] : undefined;
    if (!name) {
      if (!flag.startsWith('-') && !options.id && operation !== 'list' && operation !== 'legacy-list') { options.id = flag; continue; }
      throw new Error('Unknown or repeated resource option');
    }
    const value = values[++index];
    if (value === undefined || value.startsWith('-') || options[name] !== undefined) throw new Error('Supply each resource option once with its value');
    if (name === 'limit') {
      if (!/^\d+$/.test(value)) throw new Error('Resource limit must be an integer from 1 to 100');
      options.limit = Number(value);
    } else options[name] = value;
  }
  if (operation === 'legacy-list') {
    if (args.length) throw new Error('Use resources list for filtered pagination');
    return { operation } as const;
  }
  if (operation === 'list') {
    if (options.id || options.includeExternal !== undefined || options.yes) throw new Error('Use resources list with provider, type, state, limit or cursor filters');
    return { operation, input: serviceOperationSchemas.list_resources.parse(options) } as const;
  }
  if (operation === 'get') {
    const { id, includeExternal, ...other } = options;
    if (Object.keys(other).length) throw new Error('Use resources get ID [--no-external]');
    return { operation, input: serviceOperationSchemas.get_resource.parse({ id, includeExternal }) } as const;
  }
  if (operation === 'events') {
    const { id, limit, cursor, ...other } = options;
    if (Object.keys(other).length) throw new Error('Use resources events ID [--limit N] [--cursor CURSOR]');
    return { operation, input: serviceOperationSchemas.list_resource_events.parse({ id, limit, cursor }) } as const;
  }
  if (operation !== 'legacy-events' && operation !== 'legacy-release' && operation !== 'release') throw new Error('Unknown resource operation');
  const { id, yes, ...other } = options;
  if (Object.keys(other).length || operation === 'legacy-events' && yes) throw new Error('Use events ID, release ID, or resources release ID [-y]');
  return { operation, input: serviceOperationSchemas.release_resource.parse({ id }), yes } as const;
}
export async function resourceCommand(client: ToolClient, command: Command, args: string[]) {
  const request = resourceArguments(command, args);
  switch (request.operation) {
    case 'legacy-list': return client.resources();
    case 'list': return client.listResources(request.input);
    case 'get': return client.getResource(request.input.id, request.input.includeExternal);
    case 'events': return client.listResourceEvents(request.input.id, request.input);
    case 'legacy-events': return client.resourceEvents(request.input.id);
    case 'release':
      if (!request.yes) {
        if (!process.stdin.isTTY) throw new Error('Use resources release ID -y to confirm service release');
        const prompt = createInterface({ input: process.stdin, output: process.stderr });
        try { if (!/^y(es)?$/i.test(await prompt.question('Release this service and stop its renewals? [y/N] '))) return { released: false }; }
        finally { prompt.close(); }
      }
      return client.releaseResource(request.input.id);
    case 'legacy-release': return client.releaseResource(request.input.id);
  }
}
