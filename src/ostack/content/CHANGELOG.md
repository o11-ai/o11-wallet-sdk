# Changelog

`o11 ostack setup status` shows the sections newer than the version a person last reviewed, so the agent can say what changed. Keep each entry to what a user would notice.

## 0.8.1
- Find, qualify and research go through o11 routes. One call picks the provider, tries the next one on a miss and bills only the calls it made, so the playbook no longer names providers. Find uses `o11.people.search` and `o11.leads.from_topic`; qualify sorts a batch with `o11.rows` before the per-company checks; research reads the profile, posts and company news. A lead-data tool is used only where your files name it.

## 0.8.0
- New names: modules are **playbooks**, notes are **files**, packs are **presets** (`o11 ostack playbooks`, `files`, `presets`; the old commands still work). Settings `gtm.mode`, `mailbox` and `split` are now `gtm.send_mode`, `sender_email` and `lead_assignment`; the old names still work. Your offer now lives in `company.md` (`about.md` keeps working).
- Audiences: each kind of person you reach, such as customers and providers, is a folder of files under your playbook. `gtm/` is the default audience and `gtm/audiences/<name>/` any other. 0.7's `campaigns/` folders keep working; the wallet moves them to `gtm/audiences/` once. `o11 ostack gtm audiences` lists them, and `--audience` replaces `--campaign`.
- Templates: each audience can hold several `template-*.md` files. Two or more in use is an A/B test, split evenly (or by a file's `weight:`). `active: false` at the top of a template pauses it and keeps its results; the wallet's Templates page has a switch for it. Every save keeps a version id, and each CRM record stores the one it got as `o11_template`, so any agent can open the exact text with `o11 ostack files show --version <id>`.
- Tracking stays in your CRM: each record also keeps `o11_audience` and `o11_follow_up`, and each message gets a log entry there. Runs report sent, replied and meetings per template, so the wallet's Ostack page compares templates without holding any lead data.
- Follow-ups are per audience: an audience's `follow-up.md` can set `days: 2, 5` or `days: off`, and its `audience.md` its own send mode, limits and sending hours. One follow-ups run still covers every audience.
- Outbound can be scheduled per audience: `o11 ostack schedule set gtm/outbound --audience customers --at 09:00`.
- New playbook: **launch-videos** (`o11 ostack playbooks add launch-videos`). Three workflows, `irl` for launch films from filmed clips, `reel` for vertical shorts from one selfie clip, and `product-demo` for your real product, made in a folder on your computer from a renderer kit (`o11 ostack launch-videos new <name> --format irl|reel|product-demo`). Every cut passes jitter, layout, frame and loudness checks before you see it; voice, transcription and music come from your wallet, quoted first.

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
