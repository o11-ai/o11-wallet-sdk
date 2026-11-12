#!/usr/bin/env bun
import { z } from "zod";
import { ToolClient, ToolClientError, ToolCallError, TopUpRequestError } from './client.js';
import { discoveryPageSize, publicOperationSchemas, routeRefusalReasons } from './contracts/public-api.js';
import { reportOperationSchemas } from './contracts/reports.js';
import { readConfig, saveConfig, clearConfig, profileTokenProvider } from './config.js';
import { readFile, open, readlink, realpath, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { version } from '../package.json';
import { browserLogin, keyStdinServer } from './browser-login.js';
import { managementOperationSchemas } from './contracts/agent-permissions.js';
import { searchArguments } from './cli-search.js';
import { invocationHistoryInputSchema, invocationShortIdSchema } from './contracts/invocation-lifecycle.js';
import { executionArguments, executeInvocation, historyCursor, historyTotals, invocationFollowup, sinceTimestamp } from './cli-execution.js';
import { presentLargeResult } from './cli-result-file.js';
import { commandHelp, commandSynopsis, compactInspection, inspectArguments, isWalletCommand, unknownCommand } from './cli-help.js';
import { executeQuote, quoteArguments } from './cli-call.js';
import { resourceArguments, resourceCommand } from './cli-resources.js';
import { topUpArguments, openCheckout } from './cli-wallet.js';
import { activeKeyProfile, keyArguments, manageKeys, selectDefaultCredentials, forgetKeyLabel } from './cli-keys.js';
import { fileReport, reportArguments, ReportSubmissionError } from './cli-report.js';

let command: string | undefined;
let args: string[] = [];
let profile: string | undefined;
let runId: string | undefined;
const recoveryInvocation = [process.execPath, '--no-install', process.argv[1]!];
const namedInvocation = await walletInvocation();
const program = namedInvocation?.join(' ') ?? 'o11';

async function walletInvocation() {
  const primary = Bun.which('o11');
  try {
    const entry = await realpath(process.argv[1]!);
    const packageCli = join(dirname(entry), 'cli.js');
    if (packageCli.endsWith(sep + ['node_modules', '@o11', 'sdk', 'cli.js'].join(sep))) {
      const bunBin = process.env.BUN_INSTALL_BIN || join(process.env.BUN_INSTALL || join(homedir(), '.bun'), 'bin');
      for (const candidate of new Set([primary, resolve(bunBin, 'o11')])) {
        if (candidate) await retirePackageAlias(candidate, packageCli);
      }
    }
    if (primary) {
      const target = await realpath(primary);
      if (target === entry || target === packageCli) return ['o11'];
      const launcher = await Bun.file(target).slice(0, 1024).text();
      if (/^(?:#!\/bin\/sh\n# o11-wallet launcher|@rem o11-wallet launcher)\r?\n/.test(launcher)) return ['o11'];
    }
  } catch { /* Keep an executable fallback when the primary name is unavailable. */ }
}

// Bun can retain bin links for names removed from a package's manifest.
async function retirePackageAlias(primary: string, target: string) {
  const bin = dirname(primary), alias = join(bin, 'o11-wallet');
  try {
    const [primaryLink, aliasLink] = await Promise.all([readlink(primary), readlink(alias)]);
    const packageCli = resolve(bin, primaryLink);
    if (resolve(bin, aliasLink) !== join(dirname(packageCli), 'wallet-cli.js')) return;
    // Only remove the old symlink alongside the active Wallet package. Never touch a wrapper or another install.
    if (await realpath(primary) === target && await readlink(alias) === aliasLink) await unlink(alias);
  } catch { /* Missing links and read-only installs require no action. */ }
}

function required(index: number) {
  const value = args[index];
  if (!value) throw new Error(`Use ${commandSynopsis(program, command ?? '')}`);
  return value;
}
async function jsonInput(values = args): Promise<unknown> {
  if (values[0] !== '--input') return JSON.parse(values[0]!);
  const file = values[1]!;
  return JSON.parse(file === '-' ? await Bun.stdin.text() : await readFile(file, 'utf8'));
}
function validateArguments() {
  const counts: Record<string, number> = { doctor: 0, balance: 0, logout: 0, permissions: 0, 'revoke-api-key': 1,
    configuration: 1, cancel: 1, retry: 1,
    version: 0, '--version': 0, mcp: 0 };
  if (command && command in counts) {
    if (args.length !== counts[command] || args.some(arg => arg.startsWith('--')))
      throw new Error(`Use o11 ${command}${counts[command] ? ' ID' : ''}. Run o11 --help for usage`);
  } else if (command === 'run-status') {
    if (args.length > 1 || args.some(arg => arg.startsWith('-'))) throw new Error('Use o11 run-status [RUN_UUID]. It defaults to --run-id or O11_RUN_ID');
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
  } else if (command === 'inspect') {
    inspectArguments(args);
  } else if (command === 'quote') {
    quoteArguments(args);
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
  } else if (command?.startsWith('-')) {
    throw new Error(unknownCommand(program, command));
  }
}
const historyLimitMax = invocationHistoryInputSchema.shape.limit.unwrap().maxValue ?? 25;
function historyArguments() {
  if (args[0] === '--input' || args.length === 1 && !args[0]!.startsWith('-')) {
    if (args[0] === '--input' && (args.length !== 2 || !args[1] || args[1].startsWith('--')))
      throw new Error('Use history --input FILE|- or history with filter flags');
    return { values: args };
  }
  const filters: Record<string, string | number> = {};
  let notice: string | undefined;
  const names: Record<string, string> = { '--limit': 'limit', '-l': 'limit', '--cursor': 'cursor', '--state': 'state', '--tool': 'toolId', '--since': 'since' };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    const name = Object.hasOwn(names, flag) ? names[flag] : undefined;
    if (!name || filters[name] !== undefined) throw new Error('Use history [--limit 1-25] [--cursor CURSOR] [--state STATE] [--tool ID] [--since 30m|2h|1d] [--run-id UUID]');
    const value = args[++index];
    if (!value || value.startsWith('-')) throw new Error(`Supply a value after ${flag}`);
    if (name === 'limit' && (!/^\d+$/.test(value) || Number(value) < 1))
      throw new Error(`History --limit must be an integer from 1 to ${historyLimitMax}`);
    // Asking for more than a page holds is common; serve the largest page and say how to get the rest.
    if (name === 'limit' && Number(value) > historyLimitMax)
      notice = `--limit ${value} is above the page maximum, so ${historyLimitMax} calls are listed. Pass --cursor CURSOR for more.`;
    filters[name] = name === 'limit' ? Math.min(Number(value), historyLimitMax) : name === 'since' ? sinceTimestamp(value) : name === 'cursor' ? historyCursor(value) : value;
  }
  return { input: invocationHistoryInputSchema.parse({ ...filters, ...(runId ? { runId } : {}) }), notice };
}
async function historyInput() {
  const options = historyArguments();
  if (!options.values) return options;
  const raw = await jsonInput(options.values);
  // A bare number is valid JSON, so it used to reach the object schema and say "expected object".
  if (typeof raw === 'number')
    throw new Error('History does not take a number. Use --limit N, from 1 to 25. The next page uses --cursor and the cursor the previous history command printed.');
  const input = invocationHistoryInputSchema.parse(raw);
  if (input.cursor !== undefined) historyCursor(input.cursor);
  if (runId && input.runId && input.runId !== runId) throw new Error('History runId must match --run-id or O11_RUN_ID');
  return { input: invocationHistoryInputSchema.parse({ ...input, ...(runId ? { runId } : {}) }), notice: undefined };
}
function discoveryArguments() {
  const words: string[] = [];
  const options: { provider?: string; cursor?: string; limit?: number } = {};
  let detailed = false, providers = false;
  for (let i = 0; i < args.length; i++) {
    const value = args[i]!;
    if (value === '--providers') {
      if (providers) throw new Error('Supply --providers once');
      providers = true;
    } else if (value === '--detailed') {
      if (detailed) throw new Error('Supply --detailed once');
      detailed = true;
    } else if (value === '--limit') {
      const argument = args[++i];
      if (options.limit !== undefined || !argument || !/^\d+$/.test(argument))
        throw new Error(`Supply --limit once with an integer from 1 to ${discoveryPageSize}`);
      options.limit = publicOperationSchemas.find_tools.shape.limit.parse(Number(argument));
    } else if (value === '--provider' || value === '--cursor') {
      const name = value === '--provider' ? 'provider' : 'cursor';
      const argument = args[++i];
      if (options[name] !== undefined || !argument || argument.startsWith('--'))
        throw new Error(`Supply ${value} once, followed by its value`);
      options[name] = argument;
    } else if (value.startsWith('--')) throw new Error(`Unknown discover flag: ${value}`);
    else words.push(value);
  }
  if (providers && (words.length || detailed || Object.keys(options).length)) throw new Error('Use o11 discover --providers on its own');
  return { query: words.join(' '), options, detailed, providers };
}
function safeIssuePaths(response: unknown) {
  if (typeof response !== 'object' || response === null || !('issues' in response) || !Array.isArray(response.issues)) return '';
  const fields = new Set(['toolId', 'idempotencyKey', 'input', 'connectionId', 'credentialMode', 'maxCostMicros',
    'quoteContext',
    'allowWrite', 'acceptRecurring', 'id', 'query', 'provider', 'cursor', 'limit', 'autoRenew', 'maxPeriodChargeMicros', 'inboundInvocationLimitMicros',
    'requestId', 'expectedRevision', 'message', 'amountCents', 'targetCardId', 'name', 'limitMicros', 'status']);
  const paths = response.issues.flatMap((issue: unknown) => {
    if (typeof issue !== 'object' || issue === null || !('path' in issue) || !Array.isArray(issue.path)) return [];
    const [first, second] = issue.path;
    if (typeof first !== 'string' || !fields.has(first)) return [];
    return [first === 'input' && ['body', 'queryParams', 'pathParams', 'headers'].includes(second) ? `input.${second}` : first];
  });
  const unique = [...new Set(paths)].slice(0, 8);
  return unique.length ? ` Check fields: ${unique.join(', ')}.` : '';
}
function serverMessage(response: unknown) {
  if (typeof response !== 'object' || response === null || !('message' in response) || typeof response.message !== 'string') return '';
  return response.message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\b(?:bearer\s+\S+|sk-[\w-]+)|[A-Za-z0-9_-]{40,}/gi, (match, offset: number, whole: string) =>
      isToolIdSegment(match, offset, whole) ? match : '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 500);
}
// Long runs are redacted as possible tokens, except lowercase word segments of a catalog id such as
// dataforseo.x.ai-optimization-... or tikhub#api/v1/.../fetch_hot_account_fans_interest_account_list.
function isToolIdSegment(match: string, offset: number, whole: string) {
  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(match)) return false;
  const before = whole.slice(Math.max(0, offset - 2), offset), after = whole.slice(offset + match.length, offset + match.length + 2);
  return /^[A-Za-z0-9][.#/]$/.test(before) || /^[.#/][A-Za-z0-9]$/.test(after);
}
// Server messages name MCP operations; the CLI names its own commands. Older servers also appended a vague step.
const cliWording = (message: string) => message.replace(/,? or retry after the step this names\./g, ', or try this one again later.')
  .replace(/\bfind_tools(?: \(o11 discover\))?/g, `${program} discover`)
  .replace(/Choose a card using cardId\. List available cards with cards first\./g, `Add --card ID; list cards with ${program} cards.`);
function uuidFlag(flag: string, value: string | undefined) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new Error(`${flag} takes a UUID${flag === '--card' ? `; list cards with ${program} cards` : ''}.`);
  return parsed.data;
}
const retryAfterSeconds = (error: ToolClientError) => Math.max(1, Math.ceil((error.retryAfterMs ?? 1000) / 1000));
const routeRefusals = new Set<string>(routeRefusalReasons);
function safeHttpError(error: ToolClientError) {
  if (error.authorization) {
    const message = error.authorization.message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 500);
    const url = /^\/[A-Za-z0-9/_?=&%.-]{1,1999}$/.test(error.authorization.url) ? error.authorization.url : undefined;
    return `Wallet returned HTTP ${error.status}. ${message}${url ? ` Open ${url} in your wallet.` : ''}`;
  }
  const code = typeof error.response === 'object' && error.response !== null && 'error' in error.response ? error.response.error : undefined;
  if (code === 'CONFLICT' && typeof error.response === 'object' && error.response !== null &&
    'reason' in error.response && error.response.reason === 'IDEMPOTENCY_KEY_REUSED')
    return 'This key belongs to a different request. Recover that call from history. Use a fresh key for a separate lead or operation.';
  const reason = typeof error.response === 'object' && error.response !== null && 'reason' in error.response ? error.response.reason : undefined;
  const echoed = cliWording(serverMessage(error.response));
  const message = echoed && !/[.!?]$/.test(echoed) ? echoed + '.' : echoed;
  const head = `Wallet returned HTTP ${error.status}${typeof code === 'string' && /^[A-Za-z_]{1,80}$/.test(code) ? ` (${code})` : ''}.`;
  // A 401 comes before any work: nothing was submitted, and only new access helps. The wallet's own message already
  // says why the key failed; the generic cause is only for servers that send none. Reads submit nothing anyway.
  // With no profile chosen, an environment key wins over saved logins, so logging in again would not help.
  const environmentKey = !profile && !process.env.O11_TOOLS_PROFILE && Boolean(process.env.O11_TOOLS_URL && process.env.O11_API_KEY);
  if (error.status === 401) return `${head} ${message ? message + ' ' : ''}${command === 'login'
    ? `The wallet rejected this key. Copy a fresh setup prompt from the wallet and run ${program} login again.`
    : `${message ? '' : 'This key was revoked, expired or is invalid. '}${['call', 'invoke'].includes(command ?? '')
      ? 'Nothing was submitted. ' : ''}${environmentKey
        ? `This key comes from O11_API_KEY: set a current key there, or unset O11_TOOLS_URL and O11_API_KEY and run ${program} login.`
        : `Run ${program} login to connect again.`}`}`;
  // An older server sends no reason; its write refusal is recognized by its fixed text when the flag was left out.
  if (code === 'FORBIDDEN' && (reason === 'WRITE_NOT_ALLOWED' || !reason && !args.includes('--allow-write')
    && message === 'Allow this agent to perform actions before continuing.'))
    return `${head} This tool writes. ${command === 'invoke' ? 'Set allowWrite to true in the request' : 'Rerun with --allow-write'} if that is intended.`;
  if (reason === 'CUSTOMER_ACCOUNT_REQUIRED')
    return `${head} This tool needs your own provider account. Connect it in the o11 wallet, then rerun with --credential-mode customer --connection ID (${program} connections lists IDs).`;
  if (code === 'BUSY')
    return `${head} ${message || `Nothing was held. Retry the same command in ${retryAfterSeconds(error)} s.`}`;
  if (command === 'search' && error.status === 404 && code === 'NOT_FOUND')
    return 'Task search is unavailable for this server or connection. Use o11 discover with short capability keywords; add --provider for a named provider. Inspect and quote before spending.';
  const advice: Record<string, string> = {
    INVALID_INPUT: command === 'configure-service'
      ? 'Check id and autoRenew. maxPeriodChargeMicros and inboundInvocationLimitMicros use integer USD micros.'
      : command === 'report-info' ? 'Check id, requestId, expectedRevision and message.'
      : ['call', 'quote', 'invoke'].includes(command ?? '') ? `Run ${program} inspect ${
        command !== 'invoke' && /^[\w.:#/{}@+-]{1,200}$/.test(args[0] ?? '') ? args[0] : 'TOOL_ID'} and check the request fields.${
        /maxCostMicros/.test(safeIssuePaths(error.response)) ? ' maxCostMicros is integer USD micros.' : ''}`
      : `Run ${program} ${command} --help to check the inputs.`,
    INSUFFICIENT_BALANCE: 'Check balance and card allowances before retrying.',
    FORBIDDEN: 'Check card permissions, spending caps, and provider account access.',
    NOT_FOUND: ['resources', 'events', 'release', 'retry', 'configure-service'].includes(command ?? '')
      ? 'Check the service id and card with resources list.'
      : ['report-status', 'report-info', 'reports', 'report'].includes(command ?? '')
      ? 'Check the report id and card with reports.'
      : ['inspect', 'configuration', 'call', 'quote', 'invoke', 'discover', 'search'].includes(command ?? '')
      ? `Use ${program} discover to check the tool reference and card access.`
      : 'Check the requested ID and card.',
    NOT_CONFIGURED: `This tool or operation is not available now. Choose another tool with ${program} discover, or try again later.`,
    CONFLICT: command === 'report-info'
      ? 'Run report-status for the current revision. Keep the unsent message. Reuse requestId only for unchanged inputs.'
      : ['status', 'wait', 'cancel'].includes(command ?? '') && invocationShortIdSchema.safeParse(args[0]).success
      ? 'Use the full invocation ID from its receipt or history.'
      : 'Check the current state. Reuse the request ID only for unchanged inputs.',
    UNAVAILABLE: 'Check the existing invocation before retrying with the same idempotency key.',
    UNAUTHORIZED: 'Run doctor and verify the card key and server.',
  };
  // The wallet's own message names the field, the cause and its step; it beats generic advice.
  const terminal = typeof error.response === 'object' && error.response !== null && 'retryable' in error.response && error.response.retryable === false;
  if (code === 'NOT_CONFIGURED' && message)
    return `${head} ${message}${reason === 'TOOL_UNAVAILABLE' ? ` ${program} discover lists other tools.`
      : /\bdiscover\b/.test(message) ? '' : ` If it stays unavailable, choose another tool with ${program} discover.`}`;
  // Every code shows the server's message; the advice follows it.
  // A route refusal (worded by o11) also names its reason, such as "domain must be a company domain".
  const said = message ? `${message}${typeof reason === 'string' && routeRefusals.has(reason) ? ` (${reason})` : ''} ` : '';
  return typeof code === 'string' && Object.hasOwn(advice, code)
    ? `${head} ${said}${advice[code]}${code === 'INVALID_INPUT' ? safeIssuePaths(error.response) : ''}${
      terminal && code === 'INVALID_INPUT' && message ? ' Change the request before trying again.' : ''}`
    : `${head} ${said}Check access, request inputs, or the existing invocation.`;
}
// The wallet API applies publicFacing to every response and error it sends, so the CLI prints them as received.
function print(value: unknown, detailed = false) { console.log(JSON.stringify(value, null, detailed ? 2 : undefined)); }

try {
  const values = process.argv.slice(2);
  const selected: string[] = [];
  let cardId: string | undefined;
  for (let index = 0; index < values.length; index++) {
    if (values[index] === '--card' && selected.length === 0) {
      if (cardId) throw new Error('Supply --card once with a UUID');
      cardId = uuidFlag('--card', values[++index]);
      continue;
    }
    if (values[index] === '--run-id') {
      if (runId) throw new Error('Supply --run-id once with a UUID');
      runId = uuidFlag('--run-id', values[++index]);
      continue;
    }
    if (values[index] !== '--profile') { selected.push(values[index]!); continue; }
    if (profile || !values[index + 1] || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(values[index + 1]!)) throw new Error('Supply --profile once with a valid profile name');
    profile = values[++index];
  }
  [command, ...args] = selected;
  const jsonOutput = args.includes('-j') || args.includes('--json');
  args = args.filter(value => value !== '-j' && value !== '--json');
  if (command === 'wallet') [command, ...args] = args;
  if (command !== "mcp") runId ??= process.env.O11_RUN_ID;
  if (command !== 'login') {
    const position = args.indexOf('--card');
    if (position >= 0) {
      if (cardId || args.lastIndexOf('--card') !== position) throw new Error('Supply --card once with a UUID');
      cardId = uuidFlag('--card', args[position + 1]);
      args.splice(position, 2);
    }
  } else if (cardId) {
    if (args.includes('--card')) throw new Error('Supply --card once with a UUID');
    args.push('--card', cardId);
  }
  const rootHelp = !command || ['help', '--help', '-h'].includes(command);
  const helpTarget = command === 'help' ? args.find(value => !value.startsWith('-')) : rootHelp ? undefined : command;
  if (helpTarget && !isWalletCommand(helpTarget)) throw new Error(unknownCommand(program, helpTarget));
  // ostack prints its own help: `o11 ostack help`, `o11 ostack <command> --help`.
  const help = command !== 'ostack' && (rootHelp || args.includes('--help') || args.includes('-h'));
  if (!help) validateArguments();
  let cliUpdate: import('./cli-update.js').CliUpdateCheck | undefined;
  if (!help && !['--version', 'version', 'keys', 'generate_session_id', 'session-id', 'update', 'login', 'logout'].includes(command!)) {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY || process.env.O11_CLI_DEFAULT_PROFILE ? undefined : await activeKeyProfile());
    const config = await readConfig(profile, { refresh: false }).catch(() => undefined);
    const { prepareCliUpdate } = await import('./cli-auto-update.js');
    const update = config ? await prepareCliUpdate(config.baseUrl, command === 'setup' || command === 'doctor') : undefined;
    cliUpdate = update?.check;
    if (update?.invocation) {
      const original = process.argv.slice(2), selectedProfile = profile && !original.includes('--profile') ? ['--profile', profile] : [];
      const child = Bun.spawn([...update.invocation, ...selectedProfile, ...original], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
        env: { ...process.env, O11_CLI_UPDATE_REEXEC: update.check.latestVersion ?? 'unknown', ...(!profile ? { O11_CLI_DEFAULT_PROFILE: '1' } : {}) } });
      process.exit(await child.exited);
    }
  }
  if (help) {
    console.log(commandHelp(program, helpTarget, args));
  } else if (command === '--version' || command === 'version') {
    print({ product: 'wallet', package: '@o11/sdk', version });
  } else if (command === 'keys') {
    print(await manageKeys(args));
  } else if (command === 'generate_session_id' || command === 'session-id') {
    const sessionId = crypto.randomUUID();
    if (jsonOutput) print({ sessionId }); else console.log(sessionId);
  } else if (command === 'update') {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY || process.env.O11_CLI_DEFAULT_PROFILE ? undefined : await activeKeyProfile());
    const config = await readConfig(profile, { refresh: false });
    const { checkCliUpdate, updateCli } = await import('./cli-update.js');
    print(await (args.includes('--check') ? checkCliUpdate(config.baseUrl) : updateCli(config.baseUrl)));
  } else if (command === 'logout') {
    const selected = profile ?? process.env.O11_TOOLS_PROFILE ?? await activeKeyProfile();
    await clearConfig(selected);
    if (selected) await forgetKeyLabel(selected);
    print({ signedOut: true, environmentCredentialsStillSet: Boolean(process.env.O11_API_KEY) });
  } else if (command === 'report') {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY || process.env.O11_CLI_DEFAULT_PROFILE ? undefined : await activeKeyProfile());
    const parsed = reportArguments(args);
    print(await fileReport(args, { profile, cardId, runId, version, invocation: recoveryInvocation,
      ...(parsed.mode === 'input' ? { input: await jsonInput() } : {}) }));
  } else if (command === 'ostack') {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY || process.env.O11_CLI_DEFAULT_PROFILE ? undefined : await activeKeyProfile());
    if (cardId) throw new Error('Use ostack without --card. Runs use the card your login allows.');
    const { ostackCommand } = await import('./cli-ostack.js');
    process.exitCode = await ostackCommand(args, profile);
  } else if (command === 'mcp') {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY || process.env.O11_CLI_DEFAULT_PROFILE ? undefined : await activeKeyProfile());
    if (cardId || runId) throw new Error('Use mcp with --profile only; pass cardId and runId in tool arguments.');
    const { serveMcp } = await import('./mcp.js');
    await serveMcp(profile);
  } else if (command === 'login') {
    if (!args.includes('--key-stdin')) {
      const connected = await browserLogin(args, profile);
      if (!connected.profile && !profile && !process.env.O11_TOOLS_PROFILE) await selectDefaultCredentials();
      print(connected);
    } else {
      const config = { baseUrl: keyStdinServer(args), apiKey: (await Bun.stdin.text()).trim() };
      const client = new ToolClient(config);
      await client.cards();
      await saveConfig(config, profile);
      if (!profile && !process.env.O11_TOOLS_PROFILE) await selectDefaultCredentials();
      print({ connected: true, server: new URL(config.baseUrl).origin });
    }
  } else {
    profile ??= process.env.O11_TOOLS_PROFILE ?? (process.env.O11_TOOLS_URL || process.env.O11_API_KEY || process.env.O11_CLI_DEFAULT_PROFILE ? undefined : await activeKeyProfile());
    const config = await readConfig(profile);
    const client = new ToolClient({ ...config, cardId, runId, tokenProvider: profileTokenProvider(profile, config) });
    // Agents copy nextCommand verbatim; the plain command name works wherever o11 is this CLI.
    const executionContext = { profile, cardId, runId: client.runId, runIdSupplied: Boolean(runId), invocation: namedInvocation ?? recoveryInvocation };
    let result: unknown;
    switch (command) {
      case 'setup': {
        const { setupStatus } = await import('./setup.js');
        const checks = await setupStatus(client, args.includes('--verify-mcp') ? async selectedCardId => {
          const { verifyMcpBridge } = await import('./mcp.js');
          return verifyMcpBridge(profile, selectedCardId);
        } : undefined);
        result = { ...checks, cliUpdate, server: new URL(config.baseUrl).origin, ...(profile ? { profile } : {}) };
        if (checks.status !== 'cli_ready') process.exitCode = 2;
        break;
      }
      case 'doctor':
        { const checks = await client.doctor(); result = { ...checks, cliUpdate, server: new URL(config.baseUrl).origin };
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
          // A 4xx refusal is definite: no key exists, so the reserved file is removed rather than marked unknown.
          if (error instanceof ToolClientError && error.status >= 400 && error.status < 500) {
            await file.close(); await unlink(args.at(-1)!).catch(() => undefined); throw error;
          }
          await file.writeFile(JSON.stringify({ id: input.requestId, state: recoveryState, recovery: 'Inspect or revoke this key before creating a replacement.' }));
          throw error;
        } finally { await file.close().catch(() => undefined); }
        break;
      }
      case 'revoke-api-key': result = await client.revokeApiKey(required(0)); break;
      case 'discover': {
        const { query, options, detailed, providers } = discoveryArguments();
        if (providers || detailed) result = providers ? await client.providers() : await client.findTools(query, options);
        else {
          // id matches --detailed items[].id; endpoint_id stays for existing parsers.
          const page = await client.findToolsCompact(query, options);
          result = { ...page, results: page.results.map(row => ({ id: row.endpoint_id, ...row })) };
        }
        break;
      }
      case 'inspect': {
        const { id, detailed } = inspectArguments(args);
        const tool = await client.inspect(id);
        const invocation = namedInvocation ?? recoveryInvocation;
        result = detailed ? tool : compactInspection(tool, { profile, cardId, invocation });
        break;
      }
      case 'search': result = await client.searchTools(searchArguments(args)); break;
      case 'report-status': result = await client.report(required(0), { historyCursor: args[2] }); break;
      case 'reports': result = await client.reports(reportOperationSchemas.list_reports.parse(args.length ? await jsonInput() : {})); break;
      case 'report-info': result = await client.addReportInfo(reportOperationSchemas.add_report_info.parse(await jsonInput())); break;
      case 'connections': result = await client.connections(args[0]); break;
      case 'configuration': result = await client.configuration(required(0)); break;
      case 'quote': result = await executeQuote(client, args); break;
      case 'invoke': {
        const request = publicOperationSchemas.invoke.parse(await jsonInput());
        const receipt = await client.invoke(request);
        const printed = { ...receipt, ...invocationFollowup(receipt, { ...executionContext, runId: request.runId ?? client.runId }) };
        result = await presentLargeResult(printed, receipt.shortId ?? receipt.id);
        break;
      }
      case 'call': case 'status': case 'wait': {
        const executed = await executeInvocation(client, command, args, executionContext);
        result = executed.result;
        process.exitCode = executed.exitCode;
        break;
      }
      case 'history': {
        const { input, notice } = await historyInput();
        const page = await client.invocationHistory(input).catch((error: unknown) => {
          // A server older than --since rejects the unknown filter; say so instead of a bare HTTP 400.
          if (input.since && error instanceof ToolClientError && error.status === 400
            && JSON.stringify(error.response).includes('unrecognized request fields'))
            throw new Error('This server does not support --since yet. Use --limit N or --run-id UUID.');
          throw error;
        });
        result = { ...(notice ? { notice } : {}), ...page, totals: historyTotals(page) };
        break;
      }
      case 'run-status': {
        const selected = args[0] ?? runId;
        if (!selected || args.length > 1) throw new Error('Use run-status RUN_UUID, or pass --run-id or O11_RUN_ID');
        result = await client.runSummary(selected);
        break;
      }
      case 'cancel': result = await client.cancel(required(0)); break;
      case 'balance': result = await client.balance(); break;
      case 'topup': {
        const input = topUpArguments(args);
        if (input.amountCents === undefined) { result = await client.topUpLimits(); break; }
        let checkout;
        try { checkout = await client.topUp(input.amountCents, input.requestId); }
        catch (error) {
          if (!(error instanceof TopUpRequestError) || !(error.cause instanceof ToolClientError) || !(error.cause.status === 403 || [400, 503].includes(error.cause.status) && typeof error.cause.response === 'object' && error.cause.response !== null && 'error' in error.cause.response && error.cause.response.error === 'NOT_CONFIGURED')) throw error;
          // Same Billing link as topup without an amount; older servers fall back to the wallet origin.
          const dashboardUrl = await client.topUpLimits().then(limits => limits.dashboardUrl, () => new URL('/billing', config.baseUrl).href);
          result = { checkoutAvailable: false, dashboardUrl, requestId: input.requestId,
            message: error.cause.status === 403 ? 'This connection cannot create a checkout link. Open Billing to add funds.'
              : 'Card checkout is not available on this wallet. Open Billing to add funds.' };
          break;
        }
        const browserOpened = await openCheckout(checkout.url, input.noBrowser);
        result = { ...checkout, browserOpened,
          next: 'Complete payment in Stripe, then run o11 balance.' };
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
      default: throw new Error(unknownCommand(program, command ?? ''));
    }
    print(result, args.includes('--detailed'));
  }
} catch (error) {
  // Provider and transport errors may contain credentials. Never echo raw bodies.
  if (error instanceof ReportSubmissionError) {
    // Preserve locally generated recovery paths; token-pattern redaction can corrupt valid directory names.
    const details = JSON.stringify({ ...error.details, message: redactError(error.message) });
    const key = process.env.O11_API_KEY;
    console.error(key ? details.replaceAll(key, '[redacted]') : details);
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
      && typeof cause.response.error === 'string' && /^[A-Z_]{1,80}$/.test(cause.response.error) ? cause.response.error
      : cause instanceof ToolClientError && cause.status === 401 ? 'UNAUTHORIZED' : 'CALL_FAILED';
    const body = cause instanceof ToolClientError && typeof cause.response === 'object' && cause.response !== null ? cause.response : undefined;
    // Agents branch on these: retryable false means the same request will fail again.
    // Derived from the code, not passed through, so an older server's broader values never contradict the advice.
    const reasonCode = body && 'reason' in body && typeof body.reason === 'string' ? body.reason : undefined;
    const retryable = ['INVALID_INPUT', 'NOT_FOUND'].includes(code) || reasonCode === 'IDEMPOTENCY_KEY_REUSED' ? false
      : ['UNAVAILABLE', 'BUSY'].includes(code) ? true : undefined;
    const reason = body && 'reason' in body && typeof body.reason === 'string' && /^[A-Z_]{1,80}$/.test(body.reason) ? body.reason : undefined;
    printError(JSON.stringify({ error: code, ...(cause instanceof ToolClientError ? { status: cause.status } : {}),
      message: cause instanceof ToolClientError ? safeHttpError(cause) : 'Submission outcome is uncertain. Inspect history before retrying; reuse this idempotency key.',
      idempotencyKey: error.idempotencyKey, ...(retryable !== undefined ? { retryable } : {}), ...(reason ? { reason } : {}),
      ...(code === 'BUSY' && cause instanceof ToolClientError ? { retryAfterSeconds: retryAfterSeconds(cause) } : {}) }));
  } else if (error instanceof z.ZodError) {
    const help = command && isWalletCommand(command) ? command + ' --help' : '--help';
    // Zod's own wording names the allowed range or type. Unknown keys are named only when they look like field
    // names, so a pasted secret is never echoed.
    const unknown = error.issues.flatMap(issue => issue.code === 'unrecognized_keys' ? issue.keys : [])
      .filter(key => /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)).slice(0, 5);
    const reference = ['status', 'wait', 'cancel'].includes(command ?? '') && error.issues.every(issue => issue.path.length === 0);
    const detail = error.issues.filter(issue => issue.code !== 'unrecognized_keys').slice(0, 3)
      .map(issue => `${typeof issue.path[0] === 'string' && /^[A-Za-z]{1,40}$/.test(issue.path[0]) ? issue.path[0] : 'input'}: ${issue.message}`.slice(0, 200)).join('; ');
    printError(reference ? `${command} takes a full invocation ID or its 8-character short ID, from a receipt or ${program} history.`
      : 'Invalid data.' + (unknown.length ? ` Unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.` : '')
      + (detail ? ' ' + detail + '.' : '') + safeIssuePaths(error) + ' Run ' + program + ' ' + help + '.');
  } else printError(error instanceof ToolClientError
    ? safeHttpError(error)
    : networkErrorMessage(error) ?? (error instanceof Error ? error.message : 'Request failed'));
  process.exitCode = 1;
}
// Bun's fetch reports a failed connection as a TypeError with a string code and a timeout as a DOMException; its
// wording names fetch() internals, so print the code and the next step instead.
function networkErrorMessage(error: unknown) {
  if (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))
    return `The wallet did not answer in time. Run the command again; ${program} history shows whether a call was submitted.`;
  if (!(error instanceof TypeError) || !('code' in error) || typeof error.code !== 'string') return undefined;
  const code = /^[A-Za-z_]{1,40}$/.test(error.code) ? ` (${error.code})` : '';
  return `Could not reach the wallet${code}. Check your connection, then run the command again; ${program} doctor checks access.`;
}
function printError(message: string) {
  console.error(redactError(message));
}
function redactError(message: string) {
  const key = process.env.O11_API_KEY;
  const redacted = key ? message.replaceAll(key, '[redacted]') : message;
  return redacted.replace(/o11_[A-Za-z0-9_-]+/g, '[redacted]');
}
