#!/usr/bin/env bun
import { z } from "zod";
import { taskCompletionInstructions, taskNavigationInstructions } from "./contracts/agent-guidance.js";
import { ToolClient, ToolClientError, ToolCallError, TopUpRequestError } from './client.js';
import { inputSchema } from './contracts/index.js';
import { publicOperationSchemas } from './contracts/public-api.js';
import { reportOperationSchemas, reportReasonInstructions } from './contracts/reports.js';
import { readConfig, saveConfig, clearConfig, profileTokenProvider } from './config.js';
import { readFile, open } from 'node:fs/promises';
import { version } from '../package.json';
import { browserLogin } from './browser-login.js';
import { managementOperationSchemas } from './contracts/agent-permissions.js';
import { searchArguments } from './cli-search.js';
import { invocationHistoryInputSchema } from './contracts/invocation-lifecycle.js';
import { executionArguments, executeInvocation } from './cli-execution.js';
import { commandHelp } from './cli-help.js';
import { resourceArguments, resourceCommand } from './cli-resources.js';
import { topUpArguments, openCheckout } from './cli-wallet.js';
import { activeKeyProfile, keyArguments, manageKeys, selectDefaultCredentials, forgetKeyLabel } from './cli-keys.js';
import { fileReport, reportArguments, ReportSubmissionError } from './cli-report.js';

let command: string | undefined;
let args: string[] = [];
let profile: string | undefined;
let runId: string | undefined;
const usage = `o11 [--profile PROFILE] <command> [arguments]
o11-wallet remains available as a compatibility alias.
  keys add -l LABEL -k KEY --server URL Save a local key; --key-stdin also works
  keys list                      List saved key labels and active selection
  keys activate -l LABEL         Use this saved key by default
  keys remove -l LABEL [-f]      Remove a local key; server key stays valid
  session-id [-j]                Generate a task UUID without signing in
  cards [--cursor CURSOR]         List cards available to this connection
  update [--check]               Check or install the latest wallet CLI
  permissions                    Read this connection's approved permissions
  create-card --input FILE|-      Create a card within the approved allowance
  update-card --input FILE|-      Manage an allowed card
  api-keys [--cursor CURSOR]       List keys delegated by this connection
  create-api-key --input FILE|- --output FILE Save a new key privately
  revoke-api-key ID               Revoke a key created by this connection
  --run-id UUID                 Correlate commands for one task (or O11_RUN_ID)
  --card ID                     Choose a card for any command
  login --server URL             Sign in with email, then approve in your browser
    [--client APP] [--card ID] [--name NAME] [--task TEXT] [--email EMAIL] [--auth email|browser] [--no-browser] [--reauth]
  login --server URL --key-stdin Save an existing card key from standard input
  logout                         End browser access and remove saved credentials
  doctor                         Verify access without spending
  setup [--verify-mcp]           Check CLI readiness; optionally verify MCP
  mcp                            Serve MCP over stdio using this profile; no login
  discover [query] [--provider ID] [--cursor ID] [--limit 1-25] [--detailed] Shortlist tools (default 3, compact)
  search <task>                  Rank a shortlist when task search is advertised
    [--preference 0-10] [--max-effective-price-micros AMOUNT] [--limit 1-25]
  inspect <tool-id>               Read a tool's input contract
  connections [provider]          List allowed connected accounts
  configuration <tool-id>         Read saved account and spending choices
  call <tool-id> [-i JSON | -f FILE] [--query KEY=VALUE]
                                 Call with provider inputs; --data JSON|@FILE also works
    [--path KEY=VALUE] [--header 'NAME: VALUE'] [--wait [SECONDS]] [-o NEW_FILE]
    [--idempotency-key KEY] [--max-cost-micros AMOUNT] Optional retry key or lower ceiling
  quote <tool-id> <input-json>    Estimate a wallet-funded call
  quote <tool-id> --input FILE|-  Read quote input from a file or stdin
    [--credential-mode platform|customer] [--connection ID] Choose quote account
    [--max-cost-micros AMOUNT]     Set the wallet maximum for an image-edit quote
  invoke <request-json>           Submit a call with an idempotency key
  invoke --input FILE|-           Submit a request from a file or standard input
  status <call-id> [--wait [SECONDS]] [-o NEW_FILE] Read or wait for an existing call
  history [--limit N] [--cursor CURSOR] List calls without writing a filter file
    [--state STATE] [--tool ID] [--run-id UUID] Filter calls; --input FILE|- also works
  run-status <run-id>             Read this card's task costs and outstanding holds
  wait <call-id> [--timeout MS] [-o NEW_FILE] Poll an existing call (default 60000 ms)
  cancel <call-id>                Request cancellation
  report --input FILE|-          File feedback or a dispute with a stable requestId
  report -t "short symptom" [-r RUN_UUID] [--invocation UUID] [--note FILE] Save diagnostics and file feedback
    [--request-id UUID]          Reuse a known submission ID
  report --retry UUID           Retry the saved request without collecting evidence again
  report-status <report-id>       Read public updates; --history-cursor CURSOR pages older updates
  reports [--input FILE|-]        List this card's reports with optional filters
  report-info --input FILE|-      Add context using current revision and requestId
  wallet balance                 Read wallet funds and remaining card allowance
  wallet topup [AMOUNT|-a AMOUNT]  Read limits or open a one-time USD checkout
    [--no-open] [--request-id UUID] Print checkout URL or safely retry
  balance                        Alias for wallet balance
  topup [AMOUNT|-a AMOUNT]        Alias for wallet topup
  resources [list|get|events|release] Manage owned services; --help lists command flags
  events <resource-id>            Read service events
  release <resource-id>           Request service release
  retry <resource-id>             Retry a service review
  configure-service <json>        Update service renewal controls

${taskNavigationInstructions}

${taskCompletionInstructions}

Reporting, when advertised: ${reportReasonInstructions}
Use one stable report requestId for identical retries; add new evidence with report-info.

CLI search calls search_items. If unavailable, use discover with short capability
terms. Inspect the closest candidate first; follow the cursor only when needed.

Use --profile PROFILE or O11_TOOLS_PROFILE for a separate agent login.
Set both O11_TOOLS_URL and O11_API_KEY to override unprofiled saved access.
Output is JSON; generate_session_id prints a UUID unless -j is supplied. Errors go to stderr. Amounts use integer micro-USD.
Exit 0: command succeeded; 1: error; 2: wait stopped before success.
Master skill: https://docs.o11.ai/SKILL.md
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
  const counts: Record<string, number> = { doctor: 0, balance: 0, logout: 0, permissions: 0, 'revoke-api-key': 1,
    inspect: 1, configuration: 1, cancel: 1, retry: 1, 'run-status': 1,
    version: 0, '--version': 0, mcp: 0 };
  if (command && command in counts) {
    if (args.length !== counts[command] || args.some(arg => arg.startsWith('--')))
      throw new Error(`Use o11 ${command}${counts[command] ? ' ID' : ''}. Run o11 --help for usage`);
  } else if (command === 'resources' || command === 'events' || command === 'release') {
    resourceArguments(command, args);
  } else if (command === 'keys') {
    keyArguments(args);
  } else if (command === 'generate_session_id' || command === 'session-id') {
    if (args.length) throw new Error('Use generate_session_id [-j]');
  } else if (command === 'update') {
    if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Use update [--check]');
  } else if (command === 'topup') {
    topUpArguments(args);
  } else if (command === 'setup') {
    if (args.length && (args.length !== 1 || !['--verify-mcp', '--skip-mcp'].includes(args[0]!))) throw new Error('Use setup [--verify-mcp]');
  } else if (command === 'cards' || command === 'api-keys') {
    if (args.length && (args.length !== 2 || args[0] !== '--cursor' || !args[1])) throw new Error(`Use o11 ${command} [--cursor CURSOR]`);
  } else if (command === 'report-status') {
    if (args.length !== 1 && (args.length !== 3 || args[1] !== '--history-cursor' || !args[2]))
      throw new Error('Use o11 report-status ID [--history-cursor CURSOR]');
    reportOperationSchemas.get_report.parse({ id: args[0], historyCursor: args[2] });
  } else if (command === 'report') {
    reportArguments(args);
  } else if (command === 'connections') {
    if (args.length > 1 || args.some(arg => arg.startsWith('--'))) throw new Error('Use o11 connections [provider]');
  } else if (command === 'quote') {
    quoteArguments();
  } else if (command === 'call' || command === 'status') {
    executionArguments(command, args);
  } else if (command === 'create-api-key') {
    const values = args.slice(0, -2);
    if (args.at(-2) !== '--output' || !args.at(-1) || args.at(-1)!.startsWith('--') ||
      !(values.length === 1 && !values[0]!.startsWith('--') || values.length === 2 && values[0] === '--input' && !!values[1]))
      throw new Error('Use o11 create-api-key --input FILE|- --output NEW_PRIVATE_FILE');
  } else if (command === 'history') {
    historyArguments();
  } else if (command === 'reports' && args.length === 0) {
    return;
  } else if (['invoke', 'configure-service', 'create-card', 'update-card', 'report', 'reports', 'report-info'].includes(command ?? '')) {
    const values = args;
    if (!(values.length === 1 && !values[0]!.startsWith('--') || values.length === 2 && values[0] === '--input' && Boolean(values[1]) && !values[1]!.startsWith('--')))
      throw new Error(`Use o11 ${command} JSON or --input FILE|-`);
  } else if (command === 'wait') {
    executionArguments(command, args);
  } else if (command === 'discover') {
    discoveryArguments();
  } else if (command === 'search') {
    searchArguments(args);
  } else if (command !== 'login') throw new Error(usage);
}
function historyArguments() {
  if (args[0] === '--input' || args.length === 1 && !args[0]!.startsWith('-')) {
    if (args[0] === '--input' && (args.length !== 2 || !args[1] || args[1].startsWith('--')))
      throw new Error('Use history --input FILE|- or history with filter flags');
    return { values: args };
  }
  const filters: Record<string, string | number> = {};
  const names: Record<string, string> = { '--limit': 'limit', '-l': 'limit', '--cursor': 'cursor', '--state': 'state', '--tool': 'toolId' };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    const name = Object.hasOwn(names, flag) ? names[flag] : undefined;
    if (!name || filters[name] !== undefined) throw new Error('Use history [--limit 1-25] [--cursor CURSOR] [--state STATE] [--tool ID] [--run-id UUID]');
    const value = args[++index];
    if (!value || value.startsWith('-')) throw new Error(`Supply a value after ${flag}`);
    if (name === 'limit' && !/^\d+$/.test(value)) throw new Error('History limit must be an integer from 1 to 25');
    filters[name] = name === 'limit' ? Number(value) : value;
  }
  return { input: invocationHistoryInputSchema.parse({ ...filters, ...(runId ? { runId } : {}) }) };
}
async function historyInput() {
  const options = historyArguments();
  if (!options.values) return options.input;
  const input = invocationHistoryInputSchema.parse(await jsonInput(options.values));
  if (runId && input.runId && input.runId !== runId) throw new Error('History runId must match --run-id or O11_RUN_ID');
  return invocationHistoryInputSchema.parse({ ...input, ...(runId ? { runId } : {}) });
}
function discoveryArguments() {
  const words: string[] = [];
  const options: { provider?: string; cursor?: string; limit?: number } = {};
  let detailed = false;
  for (let i = 0; i < args.length; i++) {
    const value = args[i]!;
    if (value === '--detailed') {
      if (detailed) throw new Error('Supply --detailed once');
      detailed = true;
    } else if (value === '--limit') {
      const argument = args[++i];
      if (options.limit !== undefined || !argument || !/^\d+$/.test(argument))
        throw new Error('Supply --limit once with an integer from 1 to 25');
      options.limit = publicOperationSchemas.discover.shape.limit.parse(Number(argument));
    } else if (value === '--provider' || value === '--cursor') {
      const name = value === '--provider' ? 'provider' : 'cursor';
      const argument = args[++i];
      if (options[name] !== undefined || !argument || argument.startsWith('--'))
        throw new Error(`Supply ${value} once, followed by its value`);
      options[name] = argument;
    } else if (value.startsWith('--')) throw new Error(`Unknown discover flag: ${value}`);
    else words.push(value);
  }
  return { query: words.join(' '), options, detailed };
}
function quoteArguments() {
  if (!args[0] || args[0].startsWith('-')) throw new Error('Use o11 quote TOOL_ID JSON or --input FILE|-');
  const values: string[] = [];
  const options: { credentialMode?: 'platform' | 'customer'; connectionId?: string; maxCostMicros?: string } = {};
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
    } else if (value === '--max-cost-micros') {
      const argument = args[++i];
      if (options.maxCostMicros !== undefined || !argument || !/^\d+$/.test(argument))
        throw new Error('Supply --max-cost-micros once with a nonnegative integer amount');
      options.maxCostMicros = argument;
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
    'quoteContext',
    'allowWrite', 'acceptRecurring', 'id', 'query', 'provider', 'cursor', 'limit', 'autoRenew', 'maxPeriodChargeMicros', 'inboundInvocationLimitMicros']);
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
  if (error.authorization) {
    const message = error.authorization.message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 500);
    const url = /^\/[A-Za-z0-9/_?=&%.-]{1,1999}$/.test(error.authorization.url) ? error.authorization.url : undefined;
    return `Wallet returned HTTP ${error.status}. ${message}${url ? ` Open ${url} in your wallet.` : ''}`;
  }
  const code = typeof error.response === 'object' && error.response !== null && 'error' in error.response ? error.response.error : undefined;
  if (command === 'search' && error.status === 404 && code === 'NOT_FOUND')
    return 'Task search is unavailable for this server or connection. Use o11 discover with short capability keywords; add --provider for a named provider. Inspect and quote before spending.';
  const advice: Record<string, string> = {
    INVALID_INPUT: 'Inspect the tool and check request fields and money units.',
    INSUFFICIENT_BALANCE: 'Check balance and card allowances before retrying.',
    FORBIDDEN: 'Check card permissions, spending caps, and provider account access.',
    NOT_FOUND: 'Discover an allowed tool or check the existing invocation id.',
    NOT_CONFIGURED: 'Connect an allowed provider account or choose an available tool.',
    CONFLICT: 'If a short invocation ID is ambiguous, use the full id from its receipt or history. For submission retries, reuse the original request and key.',
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
    if (values[index] === '--run-id') {
      if (runId) throw new Error('Supply --run-id once with a UUID');
      runId = z.uuid().parse(values[++index]);
      continue;
    }
    if (values[index] !== '--profile') { selected.push(values[index]!); continue; }
    if (profile || !values[index + 1] || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(values[index + 1]!)) throw new Error('Supply --profile once with a valid profile name');
    profile = values[++index];
  }
  [command, ...args] = selected;
  const jsonOutput = args.includes('-j') || args.includes('--json');
  args = args.filter(value => value !== '-j' && value !== '--json');
  if (command === 'wallet' && !args.length) command = undefined;
  if (command === 'wallet' && args.length && !args.includes('--help')) {
    [command, ...args] = args;
    if (!['balance', 'topup'].includes(command ?? '')) throw new Error('Use o11 wallet balance or o11 wallet topup AMOUNT.');
  }
  if (command !== "mcp") runId ??= process.env.O11_RUN_ID;
  let cardId: string | undefined;
  if (command !== 'login') {
    const position = args.indexOf('--card');
    if (position >= 0) { cardId = z.uuid().parse(args[position + 1]); args.splice(position, 2); }
  }
  const help = !command || ['help', '--help', '-h'].includes(command) || args.includes('--help') || args.includes('-h');
  if (!help) validateArguments();
  if (help) {
    console.log(commandHelp(command, args) ?? usage);
  } else if (command === '--version' || command === 'version') {
    print({ product: 'wallet', package: '@o11/sdk', version });
  } else if (command === 'keys') {
    print(await manageKeys(args));
  } else if (command === 'generate_session_id' || command === 'session-id') {
    const sessionId = crypto.randomUUID();
    if (jsonOutput) print({ sessionId }); else console.log(sessionId);
  } else if (command === 'update') {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY ? undefined : await activeKeyProfile());
    const config = await readConfig(profile, { refresh: false });
    const { checkCliUpdate, updateCli } = await import('./cli-update.js');
    print(await (args.includes('--check') ? checkCliUpdate(config.baseUrl) : updateCli(config.baseUrl)));
  } else if (command === 'logout') {
    const selected = profile ?? process.env.O11_TOOLS_PROFILE ?? await activeKeyProfile();
    await clearConfig(selected);
    if (selected) await forgetKeyLabel(selected);
    print({ signedOut: true, environmentCredentialsStillSet: Boolean(process.env.O11_API_KEY) });
  } else if (command === 'report') {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY ? undefined : await activeKeyProfile());
    const parsed = reportArguments(args);
    print(await fileReport(args, { profile, cardId, runId, version,
      ...(parsed.mode === 'input' ? { input: await jsonInput() } : {}) }));
  } else if (command === 'mcp') {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY ? undefined : await activeKeyProfile());
    if (cardId || runId) throw new Error('Use mcp with --profile only; pass cardId and runId in tool arguments.');
    const { serveMcp } = await import('./mcp.js');
    await serveMcp(profile);
  } else if (command === 'login') {
    if (!args.includes('--key-stdin')) {
      const connected = await browserLogin(args, profile);
      if (!connected.profile && !profile && !process.env.O11_TOOLS_PROFILE) await selectDefaultCredentials();
      print(connected);
    } else {
    if (args.length !== 3 || args[0] !== '--server' || args[2] !== '--key-stdin')
      throw new Error('Use login --server URL --key-stdin');
    const config = { baseUrl: required(1), apiKey: (await Bun.stdin.text()).trim() };
    const client = new ToolClient(config);
    await client.cards();
    await saveConfig(config, profile);
    if (!profile && !process.env.O11_TOOLS_PROFILE) await selectDefaultCredentials();
    print({ connected: true, server: new URL(config.baseUrl).origin });
    }
  } else {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY ? undefined : await activeKeyProfile());
    const config = await readConfig(profile);
    const client = new ToolClient({ ...config, cardId, runId, tokenProvider: profileTokenProvider(profile, config) });
    let result: unknown;
    switch (command) {
      case 'setup': {
        const { setupStatus } = await import('./setup.js');
        const checks = await setupStatus(client, args.includes('--verify-mcp') ? async selectedCardId => {
          const { verifyMcpBridge } = await import('./mcp.js');
          return verifyMcpBridge(profile, selectedCardId);
        } : undefined);
        const { checkCliUpdate } = await import('./cli-update.js');
        result = { ...checks, cliUpdate: await checkCliUpdate(config.baseUrl), server: new URL(config.baseUrl).origin, ...(profile ? { profile } : {}) };
        if (checks.status !== 'cli_ready') process.exitCode = 2;
        break;
      }
      case 'doctor':
        { const { checkCliUpdate } = await import('./cli-update.js');
        const [checks, cliUpdate] = await Promise.all([client.doctor(), checkCliUpdate(config.baseUrl)]); result = { ...checks, cliUpdate, server: new URL(config.baseUrl).origin };
        if ('ready' in checks && checks.ready === false) process.exitCode = 2; }
        break;
      case 'cards': result = await client.cards(args[1]); break;
      case 'permissions': result = await client.connectionPermissions(); break;
      case 'create-card': result = await client.createCard(managementOperationSchemas.create_card.parse(await jsonInput())); break;
      case 'update-card': result = await client.updateCard(managementOperationSchemas.update_card.parse(await jsonInput())); break;
      case 'api-keys': result = await client.apiKeys(args[1]); break;
      case 'create-api-key': {
        const input = managementOperationSchemas.create_api_key.parse(await jsonInput(args.slice(0, -2)));
        const file = await open(args.at(-1)!, 'wx', 0o600);
        let recoveryState: 'unknown' | 'secret_unavailable' = 'unknown';
        try {
          const issued = await client.createApiKey(input);
          if (!issued.token) {
            recoveryState = 'secret_unavailable';
            throw new Error("The key already exists, but its secret was not returned. Inspect or revoke it before creating a replacement.");
          }
          await file.writeFile(JSON.stringify(issued));
          result = { id: issued.id, created: issued.created, credentialFile: args.at(-1) };
        } catch (error) {
          await file.writeFile(JSON.stringify({ id: input.requestId, state: recoveryState, recovery: 'Inspect or revoke this key before creating a replacement.' }));
          throw error;
        } finally { await file.close(); }
        break;
      }
      case 'revoke-api-key': result = await client.revokeApiKey(required(0)); break;
      case 'discover': {
        const { query, options, detailed } = discoveryArguments();
        result = detailed ? await client.discover(query, options) : await client.discoverCompact(query, options);
        break;
      }
      case 'inspect': result = await client.inspect(required(0)); break;
      case 'search': result = await client.searchItems(searchArguments(args)); break;
      case 'report-status': result = await client.report(required(0), { historyCursor: args[2] }); break;
      case 'reports': result = await client.reports(reportOperationSchemas.list_reports.parse(args.length ? await jsonInput() : {})); break;
      case 'report-info': result = await client.addReportInfo(reportOperationSchemas.add_report_info.parse(await jsonInput())); break;
      case 'connections': result = await client.connections(args[0]); break;
      case 'configuration': result = await client.configuration(required(0)); break;
      case 'quote': {
        const { values, options } = quoteArguments();
        result = await client.quote(required(0), inputSchema.parse(await jsonInput(values)), options);
        break;
      }
      case 'invoke': result = await client.invoke(publicOperationSchemas.invoke.parse(await jsonInput())); break;
      case 'call': case 'status': case 'wait': {
        const executed = await executeInvocation(client, command, args, { profile, cardId });
        result = executed.result;
        process.exitCode = executed.exitCode;
        break;
      }
      case 'history': result = await client.invocationHistory(await historyInput()); break;
      case 'run-status': result = await client.runSummary(required(0)); break;
      case 'cancel': result = await client.cancel(required(0)); break;
      case 'balance': result = await client.balance(); break;
      case 'topup': {
        const input = topUpArguments(args);
        if (input.amountCents === undefined) { result = await client.topUpLimits(); break; }
        let checkout;
        try { checkout = await client.topUp(input.amountCents, input.requestId); }
        catch (error) {
          if (!(error instanceof TopUpRequestError) || !(error.cause instanceof ToolClientError) || !(error.cause.status === 403 || [400, 503].includes(error.cause.status) && typeof error.cause.response === 'object' && error.cause.response !== null && 'error' in error.cause.response && error.cause.response.error === 'NOT_CONFIGURED')) throw error;
          result = { checkoutAvailable: false, dashboardUrl: new URL('/billing', config.baseUrl).href,
            requestId: input.requestId, message: 'This connection cannot create a checkout link. Open Billing to add funds.' };
          break;
        }
        const browserOpened = await openCheckout(checkout.url, input.noBrowser);
        result = { ...checkout, browserOpened,
          next: 'Complete payment in Stripe, then run o11 wallet balance. Card allowances stay unchanged.' };
        break;
      }
      case 'resources': case 'events': case 'release': result = await resourceCommand(client, command, args); break;
      case 'retry': result = await client.retryResource(required(0)); break;
      case 'configure-service': {
        const { serviceOperationSchemas } = await import('./contracts/public-api.js');
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
  if (error instanceof ReportSubmissionError) {
    printError(JSON.stringify({ ...error.details, message: error.message }));
  } else if (error instanceof TopUpRequestError) {
    const cause = error.cause;
    const code = cause instanceof ToolClientError && typeof cause.response === 'object' && cause.response !== null && 'error' in cause.response
      && typeof cause.response.error === 'string' && /^[A-Z_]{1,80}$/.test(cause.response.error) ? cause.response.error : 'CHECKOUT_FAILED';
    printError(JSON.stringify({ error: code, requestId: error.requestId,
      message: cause instanceof ToolClientError && code === 'NOT_CONFIGURED' ? 'Card funding is unavailable for this wallet.'
        : 'Checkout was not confirmed. Retry the same amount with --request-id to recover the existing checkout.',
      ...(cause instanceof ToolClientError ? { status: cause.status } : {}) }));
  } else if (error instanceof ToolCallError) {
    const cause = error.cause;
    const code = cause instanceof ToolClientError && typeof cause.response === 'object' && cause.response !== null && 'error' in cause.response
      && typeof cause.response.error === 'string' && /^[A-Z_]{1,80}$/.test(cause.response.error) ? cause.response.error : 'CALL_FAILED';
    printError(JSON.stringify({ error: code, ...(cause instanceof ToolClientError ? { status: cause.status } : {}),
      message: cause instanceof ToolClientError ? safeHttpError(cause) : 'Submission outcome is uncertain. Inspect history before retrying; reuse this idempotency key.',
      idempotencyKey: error.idempotencyKey }));
  } else printError(error instanceof ToolClientError
    ? safeHttpError(error)
    : error instanceof Error ? error.message : 'Request failed');
  process.exitCode = 1;
}
function printError(message: string) {
  const key = process.env.O11_API_KEY;
  const redacted = key ? message.replaceAll(key, '[redacted]') : message;
  console.error(redacted.replace(/o11_[A-Za-z0-9_-]+/g, '[redacted]'));
}
