const selection = '\nUse --profile PROFILE and --card ID when needed. Output is JSON.';
const call = `o11 call TOOL_ID [-i JSON | -f FILE] [-w [SECONDS]] [-o NEW_FILE]

Use the short tool ID from discover and provider parameters from inspect.
o11 handles pricing, request keys and the card's existing spending limits.

  -i, --input JSON         Provider parameters as JSON
  -f, --input-file FILE    Read provider JSON from a file; - reads stdin
  --data JSON|@FILE|@-     Alternative input syntax
  --query KEY=VALUE       Query parameter; repeat for multiple values
  --path KEY=VALUE        Path parameter
  --header 'NAME: VALUE'  Allowed request header
  -w, --wait [SECONDS]    Poll this call; bare -w waits up to 60 seconds
  -o, --output NEW_FILE   Save final result JSON in a new private file
  --idempotency-key KEY   Reuse the same key and inputs after an uncertain submission
  --max-cost-micros N     Optional lower ceiling in micro-USD
  --allow-write          Confirm an authorized write
  --accept-recurring     Confirm an authorized recurring service
  --credential-mode customer --connection ID  Use an explicitly chosen account

Example, after replacing TOOL_ID and fields with the inspected contract:
  o11 call TOOL_ID -i '{"query":"AI"}' -w 30 -o result.json

Timeout stops waiting; the call keeps running. Resume with the returned
wait.resumeCommand. Do not submit another call to poll.${selection}`;
function invocation(command: 'status' | 'wait') {
  return `o11 ${command} CALL_ID ${command === 'wait' ? '[--timeout MS]' : '[-w [SECONDS]]'} [-o NEW_FILE]

CALL_ID accepts the receipt's 8-character shortId or full UUID.
If the short ID is ambiguous, use the full id from its receipt or history.
${command === 'wait' ? 'Poll this existing call for up to 60 seconds by default.' : 'Read this existing call once; add -w to poll for up to 60 seconds.'}

  -w, --wait [SECONDS]    Set a wait in seconds${command === 'wait' ? '\n  --timeout MS           Set a wait in milliseconds instead' : ''}
  -o, --output NEW_FILE   Save final result JSON in a new private file

  o11 ${command} a1b2c3d4 ${command === 'wait' ? '--timeout 30000' : '-w 30'} -o result.json

A timeout keeps the call running. Check state and result before claiming success.
Exit 2 means waiting stopped before success or the result needs attention.${selection}`;
}
const history = `o11 history [--limit N] [--cursor CURSOR] [--state STATE] [--tool ID]

  -l, --limit 1-25        Maximum calls returned; default 10
  --cursor CURSOR        Continue the previous page with the same filters
  --state STATE          queued, executing, waiting, succeeded, failed,
                         cancelled, unknown or awaiting_approval
  --tool ID              Filter by tool ID
  --run-id UUID          Filter by a task session; O11_RUN_ID also works
  --input FILE|-         Read advanced filters from JSON instead of flags

  o11 history --state waiting --limit 5

Use the returned shortId with status, wait or cancel. History covers the selected
card, including calls from other authorized connections sharing that card.${selection}`;
const keys = `o11 keys add|list|activate|remove

  keys add -l LABEL --server URL --key-stdin  Save a supplied API key from stdin
  keys add -l LABEL --server URL -k KEY      Alternative key input
  keys list                                 Show labels and active selection
  keys activate -l LABEL                    Select a saved key
  keys remove -l LABEL [-f]                 Remove locally; -f skips confirmation

Keep secrets out of shell history and logs; prefer --key-stdin.
The first saved key becomes active. Removing it clears selection.
Explicit --profile and environment credentials take precedence over selection.
Removing a saved key does not revoke it on the server. Output is JSON.`;
const topup = `o11 topup [AMOUNT | -a AMOUNT] [--no-open]

Without an amount, read current USD limits and the Billing link.
With an amount, create a one-time checkout link. Payment is completed by the user.

  -a, --amount AMOUNT     US dollars; extra decimals round to the nearest cent
  --no-open              Print the checkout link without opening a browser
  --no-browser           Alias for --no-open
  --request-id UUID      Recover an uncertain checkout with the same amount

  o11 topup
  o11 topup 7.25 --no-open

Use the returned Billing URL if this connection cannot create a checkout link.
Funding does not increase card allowances. wallet topup is also supported.${selection}`;
const resources = `o11 resources list|get|events|release

  resources list [-p PROVIDER] [-t TYPE] [-s STATE] [-l LIMIT] [--cursor CURSOR]
  resources get RESOURCE_ID [--no-external]
  resources events RESOURCE_ID [-l LIMIT] [--cursor CURSOR]
  resources release RESOURCE_ID [-y]

List filters also accept --provider, --resource-type, --state and --limit.
TYPE requires PROVIDER. LIMIT is 1-100. -r/--resource-id can supply a resource ID.
Get reads saved service details; live external-link details are unsupported.
Events are oldest first. Follow the returned cursor with the same filters.
Release can affect billing and needs confirmation; -y confirms it for scripts.
A release request is asynchronous. Check the resource again to confirm cleanup.

A resource is a service that outlives its creating call. Use status CALL_ID for
call results; use resources get RESOURCE_ID for the service.${selection}`;
const session = `o11 session-id [-j]

Generate a task UUID without signing in. generate_session_id is an alias.
Plain output is the UUID; -j/--json returns {"sessionId":"..."}.

Optional for grouping several calls and reading their total charges:
  o11 session-id
  o11 --run-id UUID call TOOL_ID -i '{"query":"AI"}'
  o11 run-status UUID

Reuse the UUID with --run-id or O11_RUN_ID for the task. A session label creates
no budget. Single calls need no session setup; each returns an 8-character shortId.`;

export function commandHelp(command: string | undefined, args: string[]): string | undefined {
  if (command === 'wallet' && args[0] === 'topup') return topup;
  switch (command) {
    case 'call': return call;
    case 'status': case 'wait': return invocation(command);
    case 'history': return history;
    case 'keys': return keys;
    case 'topup': return topup;
    case 'resources': return resources;
    case 'session-id': case 'generate_session_id': return session;
    default: return undefined;
  }
}
