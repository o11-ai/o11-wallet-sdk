#!/usr/bin/env bun
import { z } from "zod";
import { ToolClient, ToolClientError } from './client';
import { inputSchema, invocationSchema } from './contracts/index';
import { readConfig, saveConfig, clearConfig } from './config';
import { readFile } from 'node:fs/promises';
import { version } from '../package.json';
import { browserLogin } from './browser-login';

let command: string | undefined;
let args: string[] = [];
let profile: string | undefined;
const usage = `o11 [--profile PROFILE] <command> [arguments]
  cards [--cursor CURSOR]         List cards available to this connection
  --card ID                     Choose a card for any command
  login --server URL             Connect through browser approval
    [--client APP] [--card ID] [--name NAME] [--task TEXT] [--no-browser]
  login --server URL --key-stdin Save an existing card key from standard input
  logout                         End browser access and remove saved credentials
  doctor                         Verify access without spending
  discover [query] [--provider ID] [--cursor ID] Search allowed tools
  inspect <tool-id>               Read a tool's input contract
  connections [provider]          List allowed connected accounts
  configuration <tool-id>         Read saved account and spending choices
  quote <tool-id> <input-json>    Estimate a wallet-funded call
  quote <tool-id> --input FILE|-  Read quote input from a file or stdin
    [--credential-mode platform|customer] [--connection ID] Choose quote account
  invoke <request-json>           Submit a call with an idempotency key
  invoke --input FILE|-           Submit a request from a file or standard input
  status <call-id>                Read an existing call's receipt
  wait <call-id> [--timeout MS]   Poll an existing call (default 60000 ms)
  cancel <call-id>                Request cancellation
  balance                        Read card spending funds
  resources                      List owned services
  events <resource-id>            Read service events
  release <resource-id>           Request service release
  retry <resource-id>             Retry a service review
  configure-service <json>        Update service renewal controls

Use --profile PROFILE or O11_TOOLS_PROFILE for a separate agent login.
Set both O11_TOOLS_URL and O11_API_KEY to override unprofiled saved access.
Output is JSON. Errors go to stderr. Amounts use integer micro-USD.
Exit 0: command succeeded; 1: error; 2: wait stopped before success.
Wallet guides: https://docs.o11.ai/wallet-cli/`;

function required(index: number) {
  const value = args[index];
  if (!value) throw new Error(usage);
  return value;
}
async function jsonInput(values = args): Promise<unknown> {
  if (values[0] !== '--input') return JSON.parse(values[0]!);
  const file = values[1]!;
  return JSON.parse(file === '-' ? await Bun.stdin.text() : await readFile(file, 'utf8'));
}
function validateArguments() {
  const counts: Record<string, number> = { doctor: 0, balance: 0, resources: 0, logout: 0,
    inspect: 1, configuration: 1, status: 1, cancel: 1, events: 1, release: 1, retry: 1,
    version: 0, '--version': 0 };
  if (command && command in counts) {
    if (args.length !== counts[command] || args.some(arg => arg.startsWith('--')))
      throw new Error(`Use o11 ${command}${counts[command] ? ' ID' : ''}. Run o11 --help for usage`);
  } else if (command === 'cards') {
    if (args.length && (args.length !== 2 || args[0] !== '--cursor' || !args[1])) throw new Error('Use o11 cards [--cursor CURSOR]');
  } else if (command === 'connections') {
    if (args.length > 1 || args.some(arg => arg.startsWith('--'))) throw new Error('Use o11 connections [provider]');
  } else if (command === 'quote') {
    quoteArguments();
  } else if (command === 'invoke' || command === 'configure-service') {
    const values = args;
    if (!(values.length === 1 && !values[0]!.startsWith('--') || values.length === 2 && values[0] === '--input' && Boolean(values[1]) && !values[1]!.startsWith('--')))
      throw new Error(`Use o11 ${command} JSON or --input FILE|-`);
  } else if (command === 'wait') {
    if (!args[0] || args[0].startsWith('--') || (args.length !== 1 && (args.length !== 3 || args[1] !== '--timeout')) ||
      (args[2] !== undefined && (!Number.isFinite(Number(args[2])) || Number(args[2]) <= 0)))
      throw new Error('Use o11 wait CALL_ID [--timeout POSITIVE_MS]');
  } else if (command === 'discover') {
    discoveryArguments();
  } else if (command !== 'login') throw new Error(usage);
}
function discoveryArguments() {
  const words: string[] = [];
  const options: { provider?: string; cursor?: string } = {};
  for (let i = 0; i < args.length; i++) {
    const value = args[i]!;
    if (value === '--provider' || value === '--cursor') {
      const name = value === '--provider' ? 'provider' : 'cursor';
      const argument = args[++i];
      if (options[name] !== undefined || !argument || argument.startsWith('--'))
        throw new Error(`Supply ${value} once, followed by its value`);
      options[name] = argument;
    } else if (value.startsWith('--')) throw new Error(`Unknown discover flag: ${value}`);
    else words.push(value);
  }
  return { query: words.join(' '), options };
}
function quoteArguments() {
  if (!args[0] || args[0].startsWith('-')) throw new Error('Use o11 quote TOOL_ID JSON or --input FILE|-');
  const values: string[] = [];
  const options: { credentialMode?: 'platform' | 'customer'; connectionId?: string } = {};
  for (let i = 1; i < args.length; i++) {
    const value = args[i]!;
    if (value === '--credential-mode' || value === '--connection') {
      const name = value === '--credential-mode' ? 'credentialMode' : 'connectionId';
      const argument = args[++i];
      if (options[name] !== undefined || !argument || argument.startsWith('-')) throw new Error(`Supply ${value} once, followed by its value`);
      if (name === 'credentialMode') {
        if (argument !== 'platform' && argument !== 'customer') throw new Error('Use --credential-mode platform or customer');
        options.credentialMode = argument;
      } else {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(argument)) throw new Error('Use a connection id from o11 connections');
        options.connectionId = argument;
      }
    } else if (value === '--input') {
      const file = args[++i];
      if (values.length || !file || file.startsWith('--')) throw new Error('Use one JSON input or --input FILE|-');
      values.push(value, file);
    } else if (value.startsWith('-') || values.length) throw new Error('Use one JSON input or --input FILE|- with supported quote flags');
    else values.push(value);
  }
  if (!values.length) throw new Error('Supply quote JSON or --input FILE|-');
  if (options.connectionId && options.credentialMode !== 'customer') throw new Error('--connection requires --credential-mode customer');
  if (options.credentialMode === 'customer' && !options.connectionId) throw new Error('Use --connection ID with --credential-mode customer');
  return { values, options };
}
function safeIssuePaths(response: unknown) {
  if (typeof response !== 'object' || response === null || !('issues' in response) || !Array.isArray(response.issues)) return '';
  const fields = new Set(['toolId', 'idempotencyKey', 'input', 'connectionId', 'credentialMode', 'maxCostMicros',
    'allowWrite', 'acceptRecurring', 'id', 'query', 'provider', 'cursor', 'autoRenew', 'maxPeriodChargeMicros', 'inboundInvocationLimitMicros']);
  const paths = response.issues.flatMap((issue: unknown) => {
    if (typeof issue !== 'object' || issue === null || !('path' in issue) || !Array.isArray(issue.path)) return [];
    const [first, second] = issue.path;
    if (typeof first !== 'string' || !fields.has(first)) return [];
    return [first === 'input' && ['body', 'queryParams', 'pathParams', 'headers'].includes(second) ? `input.${second}` : first];
  });
  const unique = [...new Set(paths)].slice(0, 8);
  return unique.length ? ` Check fields: ${unique.join(', ')}.` : '';
}
function safeHttpError(error: ToolClientError) {
  const code = typeof error.response === 'object' && error.response !== null && 'error' in error.response ? error.response.error : undefined;
  const advice: Record<string, string> = {
    INVALID_INPUT: 'Inspect the tool and check request fields and money units.',
    INSUFFICIENT_BALANCE: 'Check balance and card allowances before retrying.',
    FORBIDDEN: 'Check card permissions, spending caps, and provider account access.',
    NOT_FOUND: 'Discover an allowed tool or check the existing invocation id.',
    NOT_CONFIGURED: 'Connect an allowed provider account or choose an available tool.',
    CONFLICT: 'Check the existing invocation; reuse its original request and idempotency key.',
    UNAVAILABLE: 'Check the existing invocation before retrying with the same idempotency key.',
    UNAUTHORIZED: 'Run doctor and verify the card key and server.',
  };
  return typeof code === 'string' && Object.hasOwn(advice, code)
    ? `Wallet returned HTTP ${error.status} (${code}). ${advice[code]}${code === 'INVALID_INPUT' ? safeIssuePaths(error.response) : ''}`
    : `Wallet returned HTTP ${error.status}. Check access, request inputs, or the existing invocation.`;
}
function print(value: unknown) { console.log(JSON.stringify(value, null, 2)); }

try {
  const values = process.argv.slice(2);
  const selected: string[] = [];
  for (let index = 0; index < values.length; index++) {
    if (values[index] !== '--profile') { selected.push(values[index]!); continue; }
    if (profile || !values[index + 1] || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(values[index + 1]!)) throw new Error('Supply --profile once with a valid profile name');
    profile = values[++index];
  }
  [command, ...args] = selected;
  let cardId: string | undefined;
  if (command !== 'login') {
    const position = args.indexOf('--card');
    if (position >= 0) { cardId = z.uuid().parse(args[position + 1]); args.splice(position, 2); }
  }
  const help = !command || ['help', '--help', '-h'].includes(command) || args.includes('--help');
  if (!help) validateArguments();
  if (help) {
    console.log(usage);
  } else if (command === '--version' || command === 'version') {
    print({ product: 'wallet', package: '@o11/sdk', version });
  } else if (command === 'logout') {
    await clearConfig(profile);
    print({ signedOut: true, environmentCredentialsStillSet: Boolean(process.env.O11_API_KEY) });
  } else if (command === 'login') {
    if (!args.includes('--key-stdin')) {
      print(await browserLogin(args, profile));
    } else {
    if (args.length !== 3 || args[0] !== '--server' || args[2] !== '--key-stdin')
      throw new Error('Use login --server URL --key-stdin');
    const config = { baseUrl: required(1), apiKey: (await Bun.stdin.text()).trim() };
    const client = new ToolClient(config);
    await client.cards();
    await saveConfig(config, profile);
    print({ connected: true, server: new URL(config.baseUrl).origin });
    }
  } else {
    const config = await readConfig(profile);
    const client = new ToolClient({ ...config, cardId });
    let result: unknown;
    switch (command) {
      case 'doctor':
        result = { connected: true, server: new URL(config.baseUrl).origin, cards: await client.cards(), ...(cardId ? { balance: await client.balance() } : {}) };
        break;
      case 'cards': result = await client.cards(args[1]); break;
      case 'discover': {
        const { query, options } = discoveryArguments();
        result = await client.discover(query, options);
        break;
      }
      case 'inspect': result = await client.inspect(required(0)); break;
      case 'connections': result = await client.connections(args[0]); break;
      case 'configuration': result = await client.configuration(required(0)); break;
      case 'quote': {
        const { values, options } = quoteArguments();
        result = await client.quote(required(0), inputSchema.parse(await jsonInput(values)), options);
        break;
      }
      case 'invoke': result = await client.invoke(invocationSchema.parse(await jsonInput())); break;
      case 'status': result = await client.getInvocation(required(0)); break;
      case 'wait': {
        if (args.length !== 1 && (args.length !== 3 || args[1] !== '--timeout'))
          throw new Error('Use wait CALL_ID [--timeout MS]');
        const receipt = await client.waitForInvocation(required(0), { timeoutMs: args[2] === undefined ? undefined : Number(args[2]) });
        result = receipt;
        if (receipt.state !== 'succeeded') process.exitCode = 2;
        break;
      }
      case 'cancel': result = await client.cancel(required(0)); break;
      case 'balance': result = await client.balance(); break;
      case 'resources': result = await client.resources(); break;
      case 'events': result = await client.resourceEvents(required(0)); break;
      case 'release': result = await client.releaseResource(required(0)); break;
      case 'retry': result = await client.retryResource(required(0)); break;
      case 'configure-service': {
        const { serviceOperationSchemas } = await import('./contracts/public-api');
        const value = serviceOperationSchemas.configure_resource.parse(await jsonInput());
        result = await client.configureResource(value.id, value.autoRenew, value.maxPeriodChargeMicros, value.inboundInvocationLimitMicros);
        break;
      }
      default: throw new Error(usage);
    }
    print(result);
  }
} catch (error) {
  // Provider and transport errors may contain credentials. Never echo raw bodies.
  printError(error instanceof ToolClientError
    ? safeHttpError(error)
    : error instanceof Error ? error.message : 'Request failed');
  process.exitCode = 1;
}
function printError(message: string) {
  const key = process.env.O11_API_KEY;
  const redacted = key ? message.replaceAll(key, '[redacted]') : message;
  console.error(redacted.replace(/o11_[A-Za-z0-9_-]+/g, '[redacted]'));
}
