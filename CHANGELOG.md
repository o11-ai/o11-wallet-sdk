# Changelog

## 0.1.39

**New**
- `o11` ships as a standalone program for macOS, Linux and Windows (x64 and Arm) that needs no Bun, Node.js or package manager. Install with `curl -fsSL https://go.o11.ai/install.sh | sh` or `irm https://go.o11.ai/install.ps1 | iex`. The installer checks the program's SHA-256 against the wallet's `checksums.json` and puts it at `~/.local/share/o11-wallet/bin/o11`, the path earlier launchers used, so saved commands and MCP entries keep working.
- `o11 update` in the standalone program downloads the new one, checks it, and swaps it in place. Before other commands it only reports an available update.
- `setup --verify-mcp`, the email-login retry command and saved invocations start the standalone program directly.

## 0.1.38

**Changed behavior: SDK callers and scripts that call `o11` directly**
- `o11 topup 5` prints the USD checkout link immediately, then waits for the wallet credit and confirms `Added US$5.00 in credits.` Declines stay pending while the same checkout can be retried; failed or expired payments never report success. `--no-wait` returns only the link; `--wait-ms` changes the 10-minute wait. Reuse `--request-id` and the same amount to resume an existing checkout.
- `o11 call` prints the result when it is ready, up to 10 minutes (`--wait SECONDS` changes that). A long call shows one progress line on stderr; stdout is still one JSON receipt.
- `call` and `callTool` always send a request key. If the connection drops or times out, they send the same request with the same key up to twice more, which returns the existing call and never charges twice. Server errors are not resent.
- `o11 call` streams: the wallet sends each provider attempt and then the result on one connection, and the progress line shows the provider being tried. A dropped stream reconnects to the same call and misses nothing. Against a wallet that does not stream, `call` uses the plain held request.
- Add `ToolClient.streamTool(request, { onEvent })`, which streams a call's progress and resolves with the final receipt, and export `streamCall` for any HTTP client.
- `o11 wait` is no longer needed. It still works for this release, prints a one-line notice on stderr and runs `o11 status ID --wait`.
- A call still running when the wait ends exits 2 with `nextCommand` set to `o11 status ID --wait`, not `o11 wait`. `o11 status ID` reads a call once.
- `ToolClient.callTool` resolves with the finished receipt by default. While the call runs, the client keeps reading the same call and returns as soon as it finishes, up to 10 minutes. Pass `{ waitMs: 0 }` for the old behavior, which returns the receipt at once, and `onPending` to get the invocation ID while it runs.

**New**
- `ToolClient.topUpStatus(requestId)` reads durable funding without contacting Stripe. `waitForTopUp(requestId, options)` polls that same request with a bounded deadline and optional abort signal; `topUp` still returns the checkout link immediately.
- Add `o11 batch TOOL_ID --rows FILE|INVOCATION_ID`: runs a route once per row of a CSV, JSON or JSONL file, or of an earlier list call. `--map FIELD=COLUMN` picks the row column for each field; a row missing one is skipped, not charged.
- `--run-max USD` with `--run-id` (or `O11_RUN_ID`) caps the whole run, settled charges plus holds. The batch stops at the cap; raise it and run the same command again.
- Progress is saved to a journal. After a stop or a kill, running the same command again skips finished rows and replays sent ones without a new charge. A row's key comes from its own fields, so the list can change between runs.
- The batch stops when the run maximum, the balance or the card refuses a call, and those rows stay pending. `--retry-failed` sends rows that ran and failed again under new keys. A list over 1,000 rows needs `--run-max`.
- `invoke` and `call` accept `runMaxMicros`, and `run-status` shows the run's ceiling, spent, held and remaining.
- `o11 quote` on a route (an `o11.*` tool) now prints `route`: the providers a call would try, in order (`route.order`), and one row per provider with its price, recorded calls, success rate, hit rate, median seconds and checks passed (`route.compare`). `maximumMicros` is printed too. Earlier versions dropped these fields.
- `ToolClient.quote` returns the same `route` and `maximumMicros`, typed as `QuoteRoute`. Both are absent on a quote for a single tool.
- Add `o11 rate ID useful|not-useful [--reason TEXT]` to rate a call result. Ratings rank providers for the same job and never change billing.
- `o11 ostack` 0.8.1: find, qualify and research go through o11 routes, so the outbound playbook no longer names providers.

## 0.1.37

- `o11 ostack` 0.8: files, presets and playbooks replace notes, packs and modules (the old commands still work). Audiences with their own templates and follow-ups, A/B testing across the templates in use, and per-template results on each run. Each CRM record keeps `o11_audience`, `o11_template` and `o11_follow_up`.
- New playbook: launch-videos (`o11 ostack playbooks add launch-videos`).

## 0.1.36

- Add `o11 ostack`: outbound workflows for coding agents, with the team's setup kept in your workspace. `o11 ostack skills install` adds the skills to Claude Code, Codex, Cursor or Gemini, and updates refresh them.

## 0.1.35

**Changed behavior: check scripts that call `o11` directly**
- `o11 call` now waits up to 60 s for the result and prints the finished receipt. A call still running at 60 s exits 2 with a `wait` command. Earlier versions exited 0 with the queued receipt. Use `--no-wait` for the old output. Older CLIs reject that flag.
- Results over 16 KB are written to `./o11-result-<id>.json`. The printed receipt then shows a preview and the file path in place of `result`. Use `-o FILE` to choose the path; `--overwrite` replaces an existing file.
- `history --limit` lists at most 25 rows and says so when you asked for more.
- The `find` alias for `discover` is removed.

**New**
- `history --since` and spend `totals`, and `run-status` with no ID for the current run. A `call` without `--run-id` or `O11_RUN_ID` returns a `runHint` with the run ID it used.
- `discover --providers` lists each provider's name and tool count.
- `--input FILE` works without `@`.
- `keys add` checks the key with the server before saving it.
- When a result is not ready, the client re-reads at 1 s, growing ×1.5 up to 10 s.

**Clearer output**
- `inspect` prints flat, runnable call examples with each field's location.
- Errors carry the server's message and the next step. `retryable` is set only when certain. An unavailable tool points to `o11 discover`. A write tool without `--allow-write` says to add it. A tool that needs your own account names `--credential-mode customer --connection ID`. BUSY shows `retryAfterSeconds`.
- A call held for approval shows its approval link and a `wait.resumeCommand` to run after approval, not a `nextCommand`.
- `nextCommand` uses `o11` when it is on PATH. Succeeded receipts omit a leftover `failure`. `search` is no longer listed in `--help --all`.
- Server messages keep long tool IDs, so a not-found error shows the closest IDs in full. Token-like strings are still redacted.
- A lost connection or timeout prints a short message and the next step, not the runtime's internal error text.

## 0.1.34

- Remove Bun’s stale Wallet alias symlink when the upgraded `o11` first runs.

## 0.1.33

- Preserve the newest verified Wallet runtime during upgrades and remove the old Wallet launcher.

## 0.1.32

- Install one wallet command, `o11`.

## 0.1.31

- Run wallet commands directly under `o11`. Accept the earlier `o11 wallet` prefix for compatibility.

## 0.1.30

- Use the primary `o11` command in help and call examples when available.

## 0.1.29

- Show short help at launch and suggest a command after a typo. Use `--help --all` for the command list.
- Return compact JSON. `inspect` includes a call example. Use `inspect --detailed` for the full contract.
- Pass the same provider input to `quote` and `call`.
- With `-o`, save the result privately and print a short receipt. Add `--detailed` for the full receipt.

## 0.1.28

- Show up to 10 discovery matches on the first page and up to 50 on later pages. Follow the returned cursor to continue the same search.
- Show the capability query in compact results when o11 rewrites a search.

## 0.1.27

- Accept the card flag before the command, as shown in the bulk example.

## 0.1.26

- Teach one CLI workflow with discover, inspect, call and wait. Older command and flag spellings remain callable.
- Return nextCommand for pending work and wait timeouts. Keep the output path and call scope when resuming. Completed waits and receipts that need action do not suggest another command.

## 0.1.24

- Return a bounded wait command for pending calls and timed-out waits. The command carries the run ID, selected card and profile.
- Start the bulk example with one session ID and use a fresh request key for each lead and operation.

## 0.1.23

- Check for verified updates before authenticated commands and new MCP bridges, with bounded checks and offline fallback.
- Preserve stdin, selected keys, profiles and invocation recovery when switching to the verified runtime before a request.
- Stage complete installations before publishing a version directory so interrupted updates remain retryable.

## 0.1.22

- Keep canonical invocation IDs in resume commands so short-ID collisions do not break timeout recovery; preserve the SDK-selected card.
- Bind CLI status and report recovery commands to the installed runtime, including when another program owns the `o11` command.
- Add focused help for discovery, inspection and reports.

## 0.1.21

- Use `o11` as the primary command and retain `o11-wallet` as a compatibility alias, including stable installer launchers.
- Synchronize versioned documentation releases with the public SDK repository and npm publishing workflow.

## 0.1.20

- Use eight-character invocation references for status, waiting, cancellation and report evidence; full IDs remain valid and ambiguous references require the full ID.
- Accept inline call JSON with `-i` or files with `-f`; filter history with flags and read focused command help.
- Refresh stale skill instructions and add inline execution, waiting, short-reference and key-management examples while preserving existing guidance.

## 0.1.19

- Include every current CLI module in the installer inventory and verify the shipped installer against its archive during packaging and publication.
- Normalize archive file permissions so builders with different umasks produce the same release bytes.

## 0.1.18

- File short reports with `report -t "symptom"`, attach a run with `-r` or calls with `--invocation`, and add an optional `--note` file. Save private diagnostic evidence automatically and retry the exact request with `report --retry`.
- Add inline `call` and `status --wait [SECONDS]` plus private final-result output files, preserving receipt recovery on timeout.
- Add filtered resource pages, safe resource details and oldest-first event pages; preserve legacy response shapes.
- Add local `keys add`, `list`, `activate` and `remove` commands with private profile storage and explicit active-key selection.
- Generate a task UUID without authentication using `generate_session_id` or `session-id`.
- Read funding limits with `topup`; accept `-a`/`--amount` and `--no-open`, round decimal USD to cents, and return a Billing link when checkout is unavailable.

## 0.1.16

- Check for published CLI updates with `update --check` and install a newer verified release with `update`, preserving the saved wallet profile.
- Include update status in setup and doctor output so agents can refresh their CLI after a deployment.

## 0.1.15

- Package the combined wallet CLI with current report contracts and the reviewed call, wallet and installer modules.

## 0.1.14

- Add `o11 wallet balance` to show wallet funds separately from card allowances.
- Add `o11 wallet topup 25` for a one-time Stripe-hosted checkout, with `--no-browser` and stable request IDs for retries. Payment completes in Stripe; saved payment methods and card allowances stay unchanged.

## 0.1.13

- Accept raw keyword relevance scores above 100 from compact discovery. Relevance uses weighted terms and capability vocabulary; shared-account reliability and price break relevance ties.

## 0.1.12

- Discovery defaults to compact results with relevance, shared-account reliability and sample counts. Use `--detailed` for the previous CLI output, or SDK `discoverCompact()` for the new shape. Existing SDK `discover()` stays compatible.

## 0.1.11

- Call tools with short IDs and plain provider inputs through `o11 call` or `client.callTool()`.
- Use existing card limits without supplying a budget for each call; return failures and retry keys without repeating paid work.

## 0.1.10

- Default to CLI access; setup no longer requires both CLI and MCP checks.
- Offer three "Try" prompts for lead enrichment, buying signals, and competitor ads.
- Keep explicit terminal email login in the terminal. If private input is unavailable, explain how to continue there before starting browser approval.

## 0.1.9

- Sign in with an email code in an interactive terminal, then approve the connection in the browser. Keep browser sign-in for Google accounts and terminals without a local browser.
- Add `setup` to check saved CLI access and the MCP bridge without spending, report what the current agent still needs to verify, and offer three starter prompts.

## 0.1.8

- Keep `wait` polling until generated files finish saving, and report failed or expired files as requiring attention.
- Preserve the invocation ID so a status check resumes delivery without repeating a paid generation.

## 0.1.7

- Add `o11-wallet --profile PROFILE mcp` so CLI and MCP share one login and refresh credentials together. MCP never opens a browser.
- Reuse saved access for login; add `--reauth` for fresh consent and release pending-login locks on cancellation.
- Prevent overlapping browser logins for the same profile and clarify when to use the printed approval link.

## 0.1.6

- Keep status reads waiting through transient failures, with bounded backoff and resumable deadlines.
- Add card-scoped invocation history and task cost summaries without repeating provider work.
- Carry task correlation, lifecycle advice and classified output evidence across SDK, CLI and MCP.
- Add task search shortlists and report/dispute commands with private credential handling.

## 0.1.5

- Add the `o11-wallet` command so an older workspace CLI named `o11` cannot be mistaken for the wallet client.
- Separate saved authentication from card readiness in `doctor`, and preserve the exact profile in login recovery commands.
- Report Exa per-page failures and make `wait` exit 2 for partial or failed retrieval, including historical server receipts.

- Read approved connection permissions and create or manage cards within backend-enforced allowances.
- Create tool-only delegated keys and save their secrets to private files from the CLI.
- Keep management access opt-in; refresh preserves grants and parent revocation stops delegated access.

## 0.1.4

- Publish reviewed SDK bundles through GitHub trusted publishing.
- Link npm releases to the dedicated public SDK repository.

## 0.1.3

- Scope connections to cards, wallets, or all wallets in a workspace.
- List permitted cards with `o11 cards` or `client.cards()`.
- Select a card with `--card ID` or `client.withCard(id)`.
- Browser login and doctor support connections with multiple cards.

## 0.1.2

- Keep agent credentials in separate named profiles without changing the default login.
- Bind browser approval to the selected card and connection name.
- Support `--profile` on every command and renew only that profile's credentials.

## 0.1.1

- Connect agents through browser approval without copying a card key.
- Renew saved card access automatically and preserve the requested task.
- Keep existing environment and key-stdin connections available.

## 0.1.0

- Publish the wallet SDK as `@o11/sdk`, including the `o11` terminal command.
- Support tool discovery, price quotes, spending balances, execution, receipts, cancellation, and service controls.
- Keep wallet card access in `~/.config/o11-wallet`, separate from retention profiles.

The earlier documentation download used `@o11/tool-sdk` and `o11-tools`. See https://docs.o11.ai/product-names/ for the new names.
