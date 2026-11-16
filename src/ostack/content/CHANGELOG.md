# Changelog

`o11 ostack setup status` shows the sections newer than the version a person last reviewed, so the agent can say what changed. Keep each entry to what a user would notice.

## 0.10.0
- Social growth (beta) no longer stops when good posts run out: it widens the search (fresh posts, replies under strong posts, the people you followed, related terms) and checks back for new posts until every daily target is met, a platform shows a warning, or the day ends (23:00 your time; change it in `social/limits.md`). It still stays under the hourly limits and never posts a weak comment to reach a number. The report lists any related terms worth adding to your niche.
- Use ostack without the o11 CLI: in a cloud chat (Claude, ChatGPT and others) with the o11 MCP connected, ask for outbound or setup and the agent reads the skills and your team's setup through o11's ostack tools. Nothing to install, and the skills there are always the current ones.
- Every playbook you can use is installed and turned on; setup asks only which one to set up now.
- Your schedules live in o11, so they are the same on every computer and in cloud chats. Your own `custom.local/` files can live there too. Run `o11 ostack setup import` once to upload both (it never overwrites what you already have, and keeps a copy of the moved files in `.ostack/uploaded-local/`). Scheduled tasks you already created keep working.

## 0.9.3
- Content calendar (social beta): plan posts in your own Google Sheet, Notion database or calendar, one row per post with a date and a plain prompt. Every night at 12:01 your agent makes what is due in the next three days: the videos (uploaded to o11 in every shape the platforms need) and a caption for each platform, then writes the links and drafts back to the row and marks it ready for review. Nothing is published. Run `o11 ostack setup` to connect your calendar, then schedule `social/calendar`.
- Every film in the launch videos library has its own link: open a film and use Copy link, or copy a tile's address. Paste it as a calendar row's reference, or anywhere a video to follow is wanted.
- `o11 ostack launch-videos` commands take a video's o11 link in place of its id, and a film's link in place of its slug.
- `o11 ostack launch-videos download <link>` saves a library film or a cut of one of your videos (`--version`, `--aspect 9:16` or `all`), so a new video can follow one you already made.

## 0.9.2
- Meetings go on the calendar you choose: setup asks each person which calendar (usually the one you send from, or another account's or a shared one) and how the agent reaches it (a connector, an MCP, the browser), then proves it by creating and deleting a test event. Run `o11 ostack setup` to answer it; until it passes, meeting replies come to you instead of being booked.
- No booking link unless you ask for one: replies offer two or three open times from your calendar. Once the lead picks one, they get the invite (with your video link), and a one-line confirmation in the thread.

## 0.9.1
- Messages go out the moment a run writes them, at any hour: first messages are no longer scheduled for 8:00 the next morning, and there are no sending hours unless you set them (`o11 ostack settings set gtm.send_window "weekdays 08:00-18:00"`). Replies already went out right away and still do. If your team saved settings in the wallet before 0.9.1, it may hold weekdays 08:00-18:00 and an 8:00 `send_at` without anyone choosing them; setup review asks. To have them all land at one time, set it: `o11 ostack settings set gtm.send_at 08:00` (or per audience in `audience.md`), and run outbound the evening before. The suggested outbound schedule is back to 8:00 on weekdays; if yours runs at 8pm, move it (`o11 ostack schedule set gtm/outbound --days weekdays --at 08:00`).
- Every scheduled run starts with `/goal`, so your agent keeps working until the run has recorded its end and written its report, instead of stopping after its first turn. Recreate your scheduled tasks to get it: `o11 ostack schedule spec <workflow> --host claude|codex` (cron: `o11 ostack schedule cron install`). Codex needs its goals feature on.
- Outbound and follow-ups run at the highest reasoning effort: Claude Code reads it from the skill, Codex runs at Max, or Extra high where the model does not offer Max: cron runs pass `--effort max` (Claude) or `model_reasoning_effort=max` (Codex, `xhigh` when Codex's model list shows no Max), and the Codex automation spec asks for Max.

## 0.9.0
- First messages are scheduled: outbound writes them the evening before and schedules each one to land at `send_at` (8:00 by default) on your sending days. Set it with `o11 ostack settings set gtm.send_at 09:00`, per audience in `audience.md`, or `off` to send as the run goes. The suggested outbound schedule is now 8pm Sunday to Thursday; if yours runs in the morning, move it to the evening before (`o11 ostack schedule set gtm/outbound --days sun-thu --at 20:00`). Gmail has no schedule-send through its API, so there the message waits as a draft and the next follow-ups run after `send_at` sends it.
- Replies that need you: pricing, contracts, custom terms, complaints and anyone asking for a person get a suggested draft in the thread, an `o11/needs you` label, status `needs you` in your CRM (with a task where your CRM has them), and nothing more is sent to them until you act. One short list arrives in your inbox each morning (or Slack, or off). Change what comes to you and when in `gtm/handoff.md`, or ask your agent to "go through my handoffs".
- Your CRM gains two statuses (`scheduled`, `needs you`) and two fields (`scheduled_for`, `handoff_reason`); setup review offers to add them.
- Launch videos live in o11, and your agent does the work: open a film on the Launch videos page and copy its prompt, or just ask your agent for a launch video and it sends you a link to pick a template (`o11 ostack launch-videos video <id> --wait 300` waits for the pick). The agent names the video, fills its brief with `o11 ostack launch-videos update`, and uploads each finished cut as a version with `o11 ostack launch-videos upload`, with every shape it rendered (16:9, 9:16, 4:5, 1:1), so your team watches and downloads every version in o11. `--part <name>=<text>` adds a brief part one kind of video needs. `o11 ostack launch-videos templates --search <text>` finds a template: every one is a real launch film the agent studies and matches. Uploads are kept at 1080p at most.
- Ask your agent for a video and it first says what it needs from you (the clips, or your product's URL) and what happens next, then starts right away: no setup interview first, and it asks for brand details only when a step needs them.
- The launch-videos brand kit holds only what is true for every video: one video's audience, takeaway, screens, length and budget go in its brief. When the agent works in a repo with a `design.md`, brand guide or theme file, it adds the colors, fonts and style rules to `launch-videos/brand.md` (owners and admins) and tells you what it added.

## 0.8.2
- New suggested gtm schedules: outbound at 08:00 on weekdays, and follow-ups from 06:00 to midnight, every 30 minutes on weekdays and every hour on weekends. Schedules you already turned on stay as they are.
- A schedule can differ by day: `o11 ostack schedule set <workflow> --days weekends ...` changes only those days, and `schedule off <workflow> --days weekends` stops them. Claude Desktop and Codex get one task per rule.

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
