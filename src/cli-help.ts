import { discoveryFirstPageSize, discoveryPageSize } from './contracts/public-api.js';

const providerInput = '[--input JSON|@FILE|@-]';
const executionInput = `TOOL_ID ${providerInput}`;
const commands = {
  login: ['--server URL', 'Connect a wallet'],
  logout: ['', 'End saved access'],
  doctor: ['', 'Check access and readiness'],
  setup: ['[--verify-mcp]', 'Check access and optionally MCP'],
  keys: ['add|list|activate|remove', 'Manage saved keys'],
  cards: ['[--cursor CURSOR]', 'List available cards'],
  permissions: ['', 'Read approved permissions'],
  'create-card': ['--input FILE|-', 'Create an authorized card'],
  'update-card': ['--input FILE|-', 'Update an authorized card'],
  'api-keys': ['[--cursor CURSOR]', 'List delegated keys'],
  'create-api-key': ['--input FILE|- --output NEW_FILE', 'Save a delegated key privately'],
  'revoke-api-key': ['ID', 'Revoke a delegated key'],
  update: ['[--check]', 'Check or install a verified update'],
  mcp: ['', 'Serve MCP using this profile'],
  discover: ['[QUERY]', 'Find tools'],
  search: ['TASK', 'Rank tools where task search is enabled; otherwise use discover'],
  inspect: ['TOOL_ID [--detailed]', 'Get inputs and a call example'],
  quote: [executionInput, 'Estimate a call price'],
  call: [`${executionInput} [-o NEW_FILE [--overwrite]]`, 'Run a tool'],
  invoke: ['--input FILE|- | JSON', 'Submit a full request with your own key and spending cap'],
  status: ['ID [-o NEW_FILE [--overwrite]]', 'Read a call receipt'],
  wait: ['ID [--timeout MS] [-o NEW_FILE [--overwrite]]', 'Wait for a call'],
  cancel: ['ID', 'Request cancellation'],
  history: ['[--limit 1-25] [--since 30m|ISO] [--cursor CURSOR]', 'List recent calls with totals'],
  'session-id': ['[-j]', 'Generate a task UUID'],
  generate_session_id: ['[-j]', 'Alias for session-id'],
  'run-status': ['[RUN_UUID]', 'Total a task\'s calls, charges and holds'],
  wallet: ['balance|topup', 'Read or fund the wallet'],
  balance: ['', 'Read wallet funds and card allowance'],
  topup: ['[AMOUNT] [--no-open]', 'Read funding limits or open checkout'],
  connections: ['[PROVIDER]', 'List connected accounts'],
  configuration: ['TOOL_ID', 'Read saved tool choices'],
  resources: ['list|get|events|release', 'Manage provisioned services'],
  events: ['RESOURCE_ID', 'Read service events'],
  release: ['RESOURCE_ID', 'Request service release'],
  retry: ['RESOURCE_ID', 'Retry service review'],
  'configure-service': ['JSON', 'Set service renewal controls'],
  report: ['-t TEXT | --input FILE|-', 'Send feedback or dispute a charge'],
  reports: ['[--input FILE|-]', 'List reports'],
  'report-status': ['ID [--history-cursor CURSOR]', 'Read report updates'],
  'report-info': ['--input FILE|-', 'Add report context'],
  version: ['', 'Show the installed version'],
  '--version': ['', 'Show the installed version'],
} as const;

const quickCommands = ['login', 'discover', 'inspect', 'quote', 'call', 'wait', 'session-id', 'run-status', 'history'] as const;
const inputFlags = '  --query KEY=VALUE, --path KEY=VALUE, --header "NAME: VALUE"\n  --credential-mode customer --connection ID, --max-cost-micros N';
const details: Partial<Record<keyof typeof commands, string>> = {
  login: '  --auth email|browser, --no-browser, --key-stdin, --reauth\n  --client APP, --name NAME, --card ID, --email EMAIL, --task TEXT',
  discover: `  --provider KEY, --cursor CURSOR, --limit N, --detailed\n  --providers lists provider keys for --provider.
  Compact results[] vs --detailed items[]: id and endpoint_id = id; usd_per_call = price.micros / 1000000
    (null for variable prices); name, provider and score match. works, samples, usable_rate, usable_samples
    and no_key_needed appear only in compact rows.\n  Up to ${discoveryFirstPageSize} results on the first page and ${discoveryPageSize} with a cursor.`,
  search: '  --preference 0-10, --max-effective-price-micros N, --limit N',
  inspect: '  --detailed  Show the full tool contract.',
  quote: `${inputFlags}\n  Accepts the same provider input as call. Positional JSON and --input FILE|- also accept the legacy input envelope.`,
  call: `  Group a task's calls: export O11_RUN_ID=$(o11 session-id), then o11 run-status totals them.
  --input JSON|@FILE|@-  Provider fields, flat: --input '{"per_page":5,"person_titles[]":["Founder"]}'.
    o11 puts each field in the query, path or body, as inspect's fields[].in shows. Do not nest them under queryParams or body.
  --query KEY=VALUE  One query field. Repeat it to build a list: --query 'tags[]=a' --query 'tags[]=b'.
${inputFlags.split('\n')[0]!.replace('--query KEY=VALUE, ', '')}\n${inputFlags.split('\n')[1]}
  --wait [SECONDS]  How long to wait for the result (default 60). Calls wait by default.
                    A provider call already running in this request can run past SECONDS, until the provider answers.
  --no-wait  Print the queued receipt at once; follow it with o11 wait ID.
  --idempotency-key KEY, --allow-write (tools inspect marks effect: write), --accept-recurring
  -o NEW_FILE saves the result and prints a short receipt. Add --detailed for the full receipt.
  -o refuses an existing file before submitting; --overwrite replaces it once the result is saved.
  Results over 16 KB are saved to a new o11-result-ID.json file; the receipt shows a preview. --detailed prints them.
  If a call is stopped before it answers, do not call again: o11 history --since 10m finds it, then o11 wait ID.
  Example: o11 call crustdata.companies.identify --input '{"domains":["stripe.com"]}'`,
  invoke: `  The request is JSON (inline, a file, or - for stdin) with these fields:
    toolId          Tool ID from o11 discover.
    idempotencyKey  Your key, 1-200 characters. Reuse it to retry the same call without paying twice.
    input           {"queryParams":{},"pathParams":{},"headers":{},"body":...}, as o11 inspect --detailed shows.
    maxCostMicros   Spending cap in integer USD micros ("50000" is $0.05).
    allowWrite, acceptRecurring  true only for tools that write or renew. Both default to false.
    credentialMode, connectionId  "customer" with a connection ID uses your own provider account.
    runId           Optional task UUID; o11 run-status totals it. searchId and quoteContext are optional.
  Example: o11 invoke '{"toolId":"crustdata.companies.identify","idempotencyKey":"lead-42",
    "input":{"body":{"domains":["stripe.com"]}},"maxCostMicros":"50000"}'
  Most calls are simpler with o11 call, which takes flat fields and sets the key and cap for you.`,
  status: '  --wait [SECONDS], --detailed with -o, --overwrite to replace an existing -o file',
  wait: '  --timeout MS defaults to 60000. Follow nextCommand on timeout.\n  -o NEW_FILE saves the result; --overwrite replaces an existing file. Add --detailed for the full receipt.',
  history: `  --limit 1-25 (default 10), --state STATE, --tool TOOL_ID, --run-id UUID, --input FILE|-
  --since 30m|2h|1d|ISO  Only calls from that time on.
  totals sums the listed calls; complete is false when --cursor has more.
  --limit above 25 lists 25 and says so; follow cursor for more.
  History covers the whole card. With O11_RUN_ID or --run-id set, it lists only that task's calls.`,
  'run-status': `  Defaults to --run-id or O11_RUN_ID. Each o11 command makes a new run ID unless given one,
  so pass the same one to every call in a task: O11_RUN_ID=UUID o11 call ...
  Take it from o11 session-id or from your first call's runId.`,
  keys: '  add -l LABEL --server URL --key-stdin\n  list\n  activate -l LABEL\n  remove -l LABEL [-f]',
  resources: '  list [-p PROVIDER] [-t TYPE] [-s STATE] [-l LIMIT] [--cursor CURSOR]\n  get RESOURCE_ID\n  events RESOURCE_ID [-l LIMIT] [--cursor CURSOR]\n  release RESOURCE_ID [-y]',
  report: '  --invocation ID, --run UUID, --note FILE, --request-id UUID\n  --retry REQUEST_UUID resumes the saved report.',
  topup: '  --request-id UUID retries the same checkout. An amount is in USD.',
};

export function isWalletCommand(value: string): value is keyof typeof commands {
  return Object.hasOwn(commands, value);
}

export function commandSynopsis(program: string, command: string) {
  return isWalletCommand(command) ? `${program} ${command} ${commands[command][0]}`.trimEnd() : `${program} COMMAND`;
}

export function unknownCommand(program: string, value: string) {
  if (!/^[a-z0-9_-]{1,40}$/i.test(value)) return `Unknown command. Run ${program} --help.`;
  const alternatives = Object.keys(commands).filter(name => name.startsWith(value.toLowerCase()));
  const suggestion = value === 'list' || value === 'ls' || value === 'find' ? 'discover' : value === 'run' ? 'call'
    : alternatives.length === 1 ? alternatives[0] : undefined;
  return `Unknown command "${value}". ${suggestion ? `Try ${program} ${suggestion}.` : `Run ${program} --help.`}`;
}

export function commandHelp(program: string, command: string | undefined, args: string[]): string {
  const walletCommand = command === 'wallet' ? args.find(arg => arg === 'balance' || arg === 'topup') : undefined;
  if (walletCommand) return commandHelp(program, walletCommand, []);
  if (command && isWalletCommand(command))
    return [commandSynopsis(program, command), commands[command][1], details[command]].filter(Boolean).join('\n');

  const all = args.includes('--all');
  // search works only where task search is enabled; discover is the dependable entry point.
  const names = all ? Object.keys(commands).filter(isWalletCommand).filter(name => name !== 'wallet' && name !== 'search') : quickCommands;
  const heading = `${program} [--profile PROFILE] [--card ID] COMMAND`;
  const rows = names.map(name => `  ${name.padEnd(all ? 19 : 11)} ${commands[name][1]}`);
  const footer = all ? `Use ${program} COMMAND --help for flags.` : `Use ${program} COMMAND --help for flags or ${program} --help --all for all commands.`;
  return [heading, ...rows, footer].join('\n');
}

export function inspectArguments(args: string[]) {
  if (!args[0] || args[0].startsWith('-') || args.length > 2 || args[1] !== undefined && args[1] !== '--detailed')
    throw new Error('Use o11 inspect TOOL_ID [--detailed].');
  return { id: args[0], detailed: args[1] === '--detailed' };
}

export { compactInspection } from './cli-inspect.js';
