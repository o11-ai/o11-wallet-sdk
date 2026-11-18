---
name: ostack-setup
description: Set up, schedule and change ostack in one short conversation. Learns what it can about the user and their company first (their words, repo, website, the web, connected tools), shows real results in its first reply (for gtm, two drafted messages to real leads), asks only what it cannot find, kindly coaches their email template, then saves plain-language files, checks their tools and schedules runs in Claude Desktop, Codex or cron. Owners and admins set up the team once; teammates add only their mailbox and signature. Use whenever someone wants to set up or change ostack or how their outreach, videos, SEO or social work: "set up ostack", "schedule my outbound every morning", "use my email template", "is my cold email any good", "log everything in HubSpot", "send from my Outlook", "stop mentioning pricing", "remember this", "set up launch videos" or "review ostack updates", even without saying "ostack". Running a workflow belongs to that workflow's skill.
---

# ostack setup

ostack is a set of playbooks (gtm is the first), each a family of workflows made of named steps with defaults. Everything specific to a team lives in short files and a few settings in their o11 workspace, which the workflows read before every step. Each person adds their own files and settings on top. You set ostack up by learning what you can, showing real results, writing those files, proving they work, and scheduling the workflows. The user never edits config and never sits through a questionnaire.

Read [customizing.md](references/customizing.md) before writing any file.

**No o11 CLI here** (a cloud chat, or a computer without it, but the o11 MCP tools are connected): call `ostack_read` with `{ "read": "guide" }` first. It maps every `o11 ostack` command below to `ostack_read`, `ostack_write` or `ostack_run`, and says what needs a computer. Everything else in this skill works the same.

## First, find out where things stand

Do these without commentary; the user hears from you when there is something real to show.

1. Run `o11 ostack doctor`. If the `login` check fails, run `o11 login --task "Set up Ostack"` yourself and ask the user to approve it in the browser page it opens (everyone signs in, admins and teammates alike; someone without an account creates one there for free), then run doctor again.
2. If there is no workspace folder (no `ostack.json` in this folder or a parent), check the `known` workspaces the error lists; with none, create one at `~/ostack` (or where the user asks) with `o11 ostack init --dir <path>`. It turns on every playbook this person may use, so do not ask which to install. Work in that folder from then on (if your shell does not keep the folder between commands, start each with `cd <workspace> &&`). The folder holds this computer's schedules and personal files; the team's setup lives in the wallet.
3. Run `o11 ostack setup status`. `team.role` says whether this person is an owner or admin (`admin`) or a teammate (`member`). It lists the questions this person should answer (`pending_questions`; `new_since_setup` marks ones a newer release added), team questions an admin still has to answer (`team_pending`), customized steps whose default changed since the user last reviewed (`changed_defaults`), files that need attention (`unknown_steps`, `renamed_steps`, `misplaced_files`), files from before teams (`local_setup_to_import`), and their own files and schedules that only this computer has (`my_local_setup_to_upload`). `team.me` (their sign-in address) and `team.workspace` are your first clues about their company.
4. Run `o11 ostack context --files` to see what is already customized.

**One part at a time.** Everything is installed; people rarely set up everything at once. Unless the request already names one (the GTM setup prompt names gtm; "outbound", "videos", "SEO" or "social" name theirs), ask one question: "Which do you want to set up now?", listing the enabled playbooks in a few words each (gtm: outreach and follow-ups; launch-videos: videos; seo: search and AI answers; social: growing your own accounts and the content calendar). For the one they pick (or the one the request is about, or a workflow skill handed over because something was missing), run `o11 ostack setup status --playbook <id>` and set up only that playbook's questions; the others wait for another day. If that playbook is not enabled, add it first (`o11 ostack playbooks add <id>`). Some playbooks are in beta (`playbooks list` marks them `beta: true`) and only reach people and workspaces o11 invited: if a command answers `feature_not_available`, say this workspace is not in that beta yet and to ask o11 to join it, and never retry.

If `my_local_setup_to_upload` is above zero, this person kept files in `custom.local/` or schedules on this computer before they moved to o11. Show `o11 ostack setup import --dry-run`, then run `o11 ostack setup import`: it saves them as their own (never over what they already have there), so cloud chats and their other computers use them too. Anyone can do this; it needs no admin.

If `local_setup_to_import` is above zero and this person is an admin, this folder was set up before teams. Show `o11 ostack setup import --dry-run`, and once they agree run `o11 ostack setup import`, which copies those files, settings and answers to the team without overwriting anything the team has. Then continue below.

## Two paths

**An owner or admin** sets up the team: every team question in `pending_questions`, then the personal ones for themselves. When it is done, tell them to invite teammates from the workspace's team settings (account menu, Preferences, Team), and that each teammate pastes the same setup prompt from the Ostack page into their own agent, which installs o11 (nothing else needed), signs them in and adds the skills.

**A teammate** has only the personal questions (`Scope: personal`): their mailbox, signature, calendar and where their own runs happen. Learn them the same way (the connected mail tool and their sign-in address, the signature from their sent mail), show one real draft in their voice, and go. Everything else comes from the team. If `team_pending` is not empty, say in one line which team questions an admin still has to answer and carry on. A teammate never writes team files; when they want something changed for everyone, suggest they ask an admin, or save it just for themselves with `--me`.

## Setup in one conversation

The user should see real results in your first full reply and need only one more word, "go". Never walk them through the questions one by one: `pending_questions` is your checklist, not a script. What you learn is saved as soon as you show it; nothing is sent, scheduled or added to their tools until they say go.

### 1. Learn, don't interview

Read [first-run.md](references/first-run.md) now: it is how every ostack skill learns, saves and coaches. For each question in `pending_questions` (`o11 ostack setup status` gives each one's full text), find the answer yourself as it says, starting from the question's `Infer:` line. Ask only what you cannot find, in one short message, and never more than one round of questions before the preview. Some answers are the person's alone, such as the social risk notice and any spending: first-run.md lists them.

### 2. Show real results in your first full reply

**gtm:** follow the find, qualify, research and write steps (`o11 ostack context gtm/<step>`) and the outbound skill's `references/writing.md` by hand: find real leads, qualify them, and draft first messages for the two best. Keep it fast: stop at two leads that pass, and when a source is slow or dry, switch to another instead of digging (a competitor's public customer stories are a fair source). o11's data routes are fine within the account's free credit; never top up during setup. A lead whose email is not found yet can still be drafted in the preview; say so on that lead. For the preview, a light qualify check is enough (the live site and one current source for each rule); scheduled runs do the full checks. Add nobody to their tools. Then reply with only this, on one screen:

- What they offer and the one ask, in a line.
- Who you will reach, in a line, with its source when guessed.
- Template coaching, when there is a template (follow the outbound skill's `references/coaching.md`): one they gave you gets at most three kind, specific flags, your rewrite and the choice "keep yours, use mine, or test both"; one you found gets improved automatically, with one line saying so.
- The two drafts, each with the company, its URL and why it fits.
- One line of assumptions: the mailbox, where leads and messages are logged, follow-ups, daily limits and the schedule.
- "Saved this as your setup. Nothing sent. Say go to turn on the daily runs, or tell me what to change."

**launch-videos:** start `o11 ostack launch-videos check` and let anything missing install in the background, and meanwhile show the script, the storyboard and a first frame built from their site and brand. Then make a ten-second test with the ostack-launch-videos skill (`o11 ostack launch-videos new setup-test --format <their format>`, one real clip or one captured screen, their end card), render it at review size, pass the audits and show it. **seo:** show the site's top searches next to one competitor's, the three biggest fixes on the site, and the first five pieces the topics step would write, each with its search, volume, difficulty and why, without publishing anything. Search Console comes after go and is always their own Google account, connected in their o11 wallet. **social:** from their public profiles (no sign-in needed yet), show five posts the find step would act on and draft three comments in their voice; the accounts question still shows the "Your own risk" notice and gets their own yes before any run touches an account. With the content calendar, plan their next two posts from recent launches and their site and draft the captions, without writing to the calendar or making videos. Each preview carries the playbook's coaching (first-run.md, "Coach without being asked") and ends with the same assumptions line and "say go".

Save what you learned right after the preview, without asking (first-run.md, "Save what you learn"), and record each question it answers with `o11 ostack setup answer <id>`, including ones that only needed their default. When the user changes something, update just that part, show only what changed (a redrafted message, a new verdict) and say what you saved, until they say go.

### 3. On "go"

1. **Finish saving.** Everything learned is already saved; record any question still open with `o11 ostack setup answer <id>` (`--skip` only for what they declined).
2. **Check quietly.** Run each answered question's `Check` (create, read back and delete a test record; a test draft to the user themselves; a test event on their calendar, then delete it). Checks never add real people to their tools or send to anyone but the user. Say nothing when a check passes. When one fails, say in one line what to connect, keep its file, and carry on; the workflow that needs it hands that work to the user until it is connected.
3. **Schedule** as "Scheduling" below describes. "Go" covers turning on the suggested schedules; the team's send mode starts at draft, so scheduled runs draft until the user says to send.
4. **Finish** in a few lines: what runs when, where to see and change everything (the playbook's page in the wallet), how to invite teammates (owners and admins), and that they can change anything in plain words ("stop mentioning pricing", "send automatically", "use my template").

When the user wants something no question covers, write the file anyway. Every step can be customized, and general files can say anything. Setup is complete when `o11 ostack setup status` shows no `pending_questions` and the user said go.

## Scheduling

Each person's runs happen on their own computer, in the team's timezone (or their own: `o11 ostack settings set timezone <zone> --me`). Each person's schedules are kept in o11, so they are the same everywhere; the agent app on their computer runs them. Over MCP, save schedules the same way; creating the scheduled task needs the o11 CLI on a computer.

1. Show `o11 ostack schedule list`: each workflow with its suggested schedule and runs per day. Outbound has a row per audience; each audience's outbound is scheduled on its own with `--audience <name>` on every schedule command below, and follow-ups runs once for all of them. On first setup, turn on each suggestion as it is (`o11 ostack schedule on <workflow>`) unless the user asked for other times. Later, when they ask, change any with `o11 ostack schedule set <workflow> --at HH:MM` or `--every <minutes> --from HH:MM --to HH:MM` (`--days weekdays|weekends|daily|mon-fri`). A schedule can have a different rule for different days (follow-ups suggests every 30 minutes on weekdays and hourly on weekends): `set` changes only the days it names, and `o11 ostack schedule off <workflow> --days <days>` stops those days. If the team's send window (`o11 ostack settings show`) is narrower than a suggestion's hours, suggest the window's hours instead. Outbound sends first messages the moment it writes them, at any hour, so run it whenever people should get them (inside the sending hours, if the team set any); with a `send_at` time, it should run the evening before. Every task's instructions start with `/goal`, so each run keeps going until it has recorded its end and written its report; create them exactly as `ask` says, and set the effort it names.
2. Runs happen in the app you are running in when it can create scheduled tasks (Claude Desktop or Codex); otherwise ask in one line where they should happen. It must be a machine that has the workspace folder, the o11 CLI signed in, and the user's mail, CRM and calendar tools, and that is on during those hours:
   - **Claude Desktop** (local scheduled tasks) or **Codex** (automations): run `o11 ostack schedule spec <workflow> --host claude|codex`. If you are running inside that app and can create scheduled tasks or automations, create them exactly as `ask` says: same names, folder, schedules and instructions (one task per entry in `tasks`). Otherwise give the user the fields to enter (`where` says where). Then have them run it once (Run now) and approve the tools it uses with "always allow", so later runs never stall on a prompt.
   - **Neither** (a server, or another agent): `o11 ostack schedule cron install --agent claude|codex` writes a crontab block that starts the agent headless. Show the lines first.
3. Record what you created: `o11 ostack schedule installed <workflow> --host <host> --name <task name>`. `o11 ostack doctor` warns about schedules that are on but not installed anywhere.
4. If `spec` returns a `timezone_note`, the computer's clock differs from the timezone in use. Use the converted times `spec` gives as they are and tell the user in one line; each run checks the time itself.
5. A Run now outside the schedule's hours, or between two of its runs, stops at `not_due` on purpose. That still proves the task starts; run it once just after one of its times to approve the mail and CRM tools.

Workflows without a suggested schedule (launch-videos) run when someone asks; skip them here.

The task's instructions only call `o11 ostack prompt <workflow>`, so they stay right after updates and setting changes. When a schedule's times change, update the task in each host listed under `installed` (the `set` output says which). Every run is reported to the team's Ostack page (account menu, Activity tab).

## Changing things later

Any time the user says how something should work ("use this template", "never mention pricing", "log replies in Lightfield", "send from my other mailbox", "run outbound at 7"):

0. When they give you a template or ask whether one is good, coach it first as the outbound skill's `references/coaching.md` says: at most three kind, specific flags, your rewrite, and "keep yours, use mine, or test both".

1. Work out which step it belongs to (`o11 ostack steps` lists them, such as `gtm/write`), whether it is general, or whether it is a setting or a schedule. Then whether it is for the team or just for this person ("just for me", a mailbox, a signature): personal changes use `--me`.
2. Read the existing file (`o11 ostack files show <path> [--me]`) and save the updated text with `--base-version <its version>`, or write a new one. Keep the file to what the user wants, not a copy of the default. If it is a setting (`o11 ostack settings show`), change it with `o11 ostack settings set` (owners and admins change the team's; anyone can add `--me`) and remove anything in the files that contradicts it. If it is a schedule, follow "Scheduling".
3. Test it and show the result: for a tool, its question's check; for how messages are written, one real draft; for who to reach, a qualify verdict on a real lead. `o11 ostack context <step>` confirms the file loads.

If a write fails with `note_changed`, someone else edited the file meanwhile: read it again, merge their change with the user's, and save once more. If it fails with `forbidden`, this person cannot change the team's setup: offer `--me`, or to ask an admin.

When the user corrects you during a run ("don't open with a compliment", "that's not our ICP"), save it right away to the right step's file, or to `learnings.md` if it applies everywhere, and say so in one line. A correction for just this once is not saved.

When the user wants another playbook ("also help me with recruiting"), `o11 ostack playbooks list` shows what exists and `o11 ostack playbooks add <id>` enables it; then set it up the same way ("Setup in one conversation"). Its files and settings start empty, and nothing that exists changes.

The whole setup can be downloaded as plain files at any time: `o11 ostack files export`.

## After an update ("review updates")

The o11 CLI updates ostack and the installed skills (`o11 update`). Run `o11 ostack setup status` and walk the user through it:

- **What's new:** summarize `release_notes` in a few plain lines first.
- **New questions:** ask only those. The existing answers stand.
- **Changed defaults:** each has a `change` saying what the release changed. Read the file for that step (`o11 ostack context <step>`). If the change makes part of the file redundant or wrong (such as day counts that now belong in a setting), propose the exact edit and make it once they agree. If the file is unaffected, say so in one line instead of asking.
- **Old ledger:** before 0.6.0, ostack kept leads and messages in `.ostack/gtm.db`. If that file exists and the `gtm/records` question is answered, offer to move its history into the user's tool: `o11 ostack gtm ledger export` writes `people.csv`, `messages.csv` and `opt-outs.csv` to `ledger-export/`. Import them as the record file describes; opt-outs first, since they stop messages. Once the user confirms it all arrived, they may delete `.ostack/gtm.db` and `ledger-export/`.
- **Misplaced files:** step files at the top level (such as `write.md`) and 0.7 campaign folders (`campaigns/<name>/...`) keep working. Offer to save each under its `move_to` path (`gtm/write.md`, `gtm/audiences/<name>/...`) and delete the old one.
- **0.8 tracking:** when `gtm/records` is answered, offer to add `o11_audience`, `o11_template` and `o11_follow_up` to the record tool and a place to log each message, and update `gtm/record.md` to name them. Existing people get `o11_audience: default`. If the team has `about.md`, offer to save it as `company.md` (the name 0.8 uses) and delete the old one; both are read until then. If `gtm/write.md` holds a template, offer to move it to `gtm/template-a.md` so its sends can be compared.
- **Your own setup on this computer (0.10):** when `my_local_setup_to_upload` is above zero, say their `custom.local/` files and schedules now live in o11 so cloud chats and other computers use them, show `o11 ostack setup import --dry-run`, and run `o11 ostack setup import` once they agree. Scheduled tasks already created keep working.
- **Renamed steps:** save the files under the new step names (`renamed_steps`). They keep working meanwhile.
- **Unknown steps:** ask what each file was meant for, then move or delete it.

Then run `o11 ostack setup reviewed`, which records that this person reviewed this release's changes.

## Where files go

- Team files (no flag): about the team and its company, read by everyone: `company.md`, `voice.md`, `learnings.md`, and each playbook's step files such as `gtm/write.md`. For gtm, `gtm/record.md` names the tool where people and messages live and how work is split.
- Personal files (`--me`): this person's own, which take priority over the team's: their mailbox and channels (`gtm/send.md`, `gtm/inbox.md`), their `signature.md`, or anything they say is "just for me".
- `gtm/audiences/<name>/`: team files for one gtm audience (for example providers next to customers): who to reach, what to say, its `template-*.md` files and its own settings in `audience.md` and `follow-up.md` front matter (customizing.md, Audiences). Use `--audience <name>` with the CLI, and give its outbound its own schedule.
- `launch-videos/`: the brand kit, team files true for every video: `brand.md` (name, call to action, mark, fonts and the design from any design.md in their repo), and step files such as `script.md`, `capture.md`, `narrate.md`, `sound.md` and `deliver.md`. Nothing about one video goes here: its audience, story, screens, length and budget go in that video's brief in o11. Each video's own clips, edit and renders stay in its folder on this computer (`videos/<name>/`), never in o11 files.
- `social/`: the team's niche, comment style and limits for growth, and for the content calendar `social/calendar.md` (the tool, columns, statuses and lead days), `social/captions.md` (caption style per platform) and `social/videos.md` (default video plan, film and nightly cap). Posts, captions and statuses stay in the team's calendar, never in o11 files.
- `custom.local/` in the workspace folder: files only this computer reads, for experiments. They take priority over everything.
- Presets (`o11 ostack presets list`) are shared starting points for a playbook, such as a use case or a tool. Offer one when it matches what the team describes (`o11 ostack presets add gtm/<name>`, owners and admins). Files always win over presets.
