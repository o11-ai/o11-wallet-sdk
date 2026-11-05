# Changelog

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
