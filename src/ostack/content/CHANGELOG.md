# Changelog

`o11 ostack setup status` shows the sections newer than the version a person last reviewed, so the agent can say what changed. Keep each entry to what a user would notice.

## 0.7.0
- ostack is part of the o11 CLI: every command is now `o11 ostack ...`, and `o11 update` updates ostack and the skills it installed. Install the skills with `o11 ostack skills install`. Everyone signs in with `o11 login`.
- Teams: notes and settings live in your o11 workspace, shared by everyone. Owners and admins answer the team questions once; teammates only add their own mailbox, signature and schedule. Add `--me` to any note or setting to change it just for you.
- A note that changed since you read it is never overwritten: writes name the version they read.
- The wallet's Ostack page (in the account menu) shows how to install it, how the team configured it, the skills, and every run. Members and invites stay in the workspace's usual team settings.
- Folders set up before teams keep working: `o11 ostack setup import` copies their notes, settings and answers to the team. `homepage-check` and `export-ledger` are now `o11 ostack gtm tam check` and `o11 ostack gtm ledger export`.

## 0.6.0
- Your own tool is the record: people, messages, replies and opt-outs live in your CRM, Airtable, Sheet or CSV, not in an ostack database. Teammates on other computers share it, so nobody is contacted twice. Setup asks where it is and how your team splits the work.
- Every message follows a simple routine in that tool: mark the person `sending`, send, record the message ID. Anything unclear is checked in the Sent folder, never resent.
- Removed the ledger commands (`ostack gtm due`, `leads`, `reserve`, `receipt`, `observe`, `defer`, `suppress`, `check`, `status`). The update review offers to move your old ledger's history into your tool.

## 0.5.0
- TAM: say "build our TAM" to get a list of every company that might fit, from registries, directories, maps, company databases or web search, saved where you choose (`tam.csv` by default). Find works through it, and qualify re-checks each company before anyone there is contacted.

## 0.4.0
- Modules: everything outreach-related is now the **gtm** module. Its step notes belong in `custom/gtm/` (old ones in `custom/` keep working; `ostack setup tidy` moves them), its settings are `gtm.*`, and its ledger is `.ostack/gtm.db` (renamed automatically).
- Schedules: workflows can run on their own in your timezone, from Claude Desktop, Codex or cron (`ostack schedule list`). Say "schedule my workflows".
- Sending hours: cold messages wait for `gtm.send_window` (new workspaces: weekdays 08:00-18:00). Upgraded workspaces start with no window; setup asks.
- Runs of the same workflow never overlap.
- Skills renamed `ostack-outbound` and `ostack-follow-ups`. Commands such as `ostack due` are now `ostack gtm due`; the old ones still work.

## 0.3.0
- Follow-up timing is a setting (`follow_up_days`), unknown flags are refused, imports can be previewed with `--dry-run`, and unfilled template slots are rejected.
