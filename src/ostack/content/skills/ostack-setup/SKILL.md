---
name: ostack-setup
description: Set up, schedule and customize ostack by talking to the user. Interviews them, writes plain-language files that change how its workflows run (for gtm: their offer, voice, templates, lead sources, email tool, CRM, calendar, limits; for launch-videos: their brand, formats, product access, narration voice and music), tests each change for real, creates scheduled runs in Claude Desktop, Codex or cron in their timezone, saves corrections as lasting rules, and reviews what is new after an o11 CLI update. Works for a whole team: owners and admins set up the team once, teammates add only their own mailbox and signature. Use whenever someone wants to set up or change ostack or their outreach: "set up ostack", "schedule my outbound every morning", "run follow-ups every 30 minutes", "use my email template", "log everything in Lightfield/HubSpot", "send from my Outlook", "we sell to dentists now", "stop mentioning pricing", "remember this", "add a fundraising audience", "set up launch videos", "our videos should always end with this line", or "review ostack updates", even if they never say "ostack". For the seo and social playbooks: their site, publishing, topics and tracking, or their niche, comment style, limits and accounts, and their content calendar (where it lives, its columns, caption style, video defaults and nightly spending cap). Running a workflow itself belongs to that workflow's skill (ostack-outbound, ostack-follow-ups, ostack-launch-videos, ostack-seo-audit, ostack-seo-growth, ostack-seo-tracking, ostack-social-growth, ostack-content-calendar).
---

# ostack setup

ostack is a set of playbooks (gtm is the first), each a family of workflows made of named steps with defaults. Everything specific to a team lives in short files and a few settings in their o11 workspace, which the workflows read before every step. Each person adds their own files and settings on top. You set ostack up by asking questions, writing those files, proving they work, and scheduling the workflows. The user never edits config.

Read [customizing.md](references/customizing.md) before writing any file.

**No o11 CLI here** (a cloud chat, or a computer without it, but the o11 MCP tools are connected): call `ostack_read` with `{ "read": "guide" }` first. It maps every `o11 ostack` command below to `ostack_read`, `ostack_write` or `ostack_run`, and says what needs a computer. Everything else in this skill works the same.

## First, find out where things stand

1. Run `o11 ostack doctor`. If the `login` check fails, run `o11 login --task "Set up Ostack"` yourself and ask the user to approve it in the browser page it opens (everyone signs in, admins and teammates alike; someone without an account creates one there for free), then run doctor again.
2. If there is no workspace folder (no `ostack.json` in this folder or a parent), check the `known` workspaces the error lists; with none, create one at `~/ostack` (or where the user asks) with `o11 ostack init --dir <path>`. It turns on every playbook this person may use, so do not ask which to install. Work in that folder from then on (if your shell does not keep the folder between commands, start each with `cd <workspace> &&`). The folder holds this computer's schedules and personal files; the team's setup lives in the wallet.
3. Run `o11 ostack setup status`. `team.role` says whether this person is an owner or admin (`admin`) or a teammate (`member`). It lists the questions this person should answer (`pending_questions`; `new_since_setup` marks ones a newer release added), team questions an admin still has to answer (`team_pending`), customized steps whose default changed since the user last reviewed (`changed_defaults`), files that need attention (`unknown_steps`, `renamed_steps`, `misplaced_files`), files from before teams (`local_setup_to_import`), and their own files and schedules that only this computer has (`my_local_setup_to_upload`).
4. Run `o11 ostack context --files` to see what is already customized.

**One part at a time.** Everything is installed; people rarely set up everything at once. Unless the request already names one, ask one question: "Which do you want to set up now?", listing the enabled playbooks in a few words each (gtm: outreach and follow-ups; launch-videos: videos; seo: search and AI answers; social: growing your own accounts and the content calendar). For the one they pick (or the one the request is about, or a workflow skill handed over because something was missing), run `o11 ostack setup status --playbook <id>` and interview only that playbook's questions; the others wait for another day. If that playbook is not enabled, add it first (`o11 ostack playbooks add <id>`). Some playbooks are in beta (`playbooks list` marks them `beta: true`) and only reach people and workspaces o11 invited: if a command answers `feature_not_available`, say this workspace is not in that beta yet and to ask o11 to join it, and never retry.

If `my_local_setup_to_upload` is above zero, this person kept files in `custom.local/` or schedules on this computer before they moved to o11. Show `o11 ostack setup import --dry-run`, then run `o11 ostack setup import`: it saves them as their own (never over what they already have there), so cloud chats and their other computers use them too. Anyone can do this; it needs no admin.

If `local_setup_to_import` is above zero and this person is an admin, this folder was set up before teams. Show `o11 ostack setup import --dry-run`, and once they agree run `o11 ostack setup import`, which copies those files, settings and answers to the team without overwriting anything the team has. Then continue below.

## Two paths

**An owner or admin** sets up the team. Go through every team question in `pending_questions`, then the personal ones for themselves. When the team's setup is done, tell them to invite teammates from the workspace's team settings (account menu, Preferences, Team), and that each teammate pastes the same setup prompt from the Ostack page into their own agent, which installs o11 (nothing else needed), signs them in and adds the skills.

**A teammate** answers only the personal questions (`Scope: personal`): their mailbox, their signature, their calendar, and where their own runs happen, then a test draft and a test event for themselves. Everything else comes from the team. If `team_pending` is not empty, say which team questions an admin still has to answer and carry on with the personal ones. A teammate never writes team files; when they want something changed for everyone, suggest they ask an admin, or save it just for themselves with `--me`.

## The interview

For each question in `pending_questions`, in order (`o11 ostack setup status` gives each one's full text):

- **Ask it conversationally**, one topic at a time. Offer the default so "the default is fine" is a quick answer. Reuse anything the user already said, and skip questions the answers already cover.
- **Write what they said** as the file the question names, in their words where possible, with `o11 ostack files write <path> --text-file -` (team questions) or `--me` (personal ones). Keep files short and specific.
- **Make it real.** When the answer names a tool (a CRM, a mail account, a calendar), check the tool is actually available. Run the question's check (create a test record and read it back, send a test draft to themselves, create, read back and delete a test event on their calendar) and show the result. If the tool is missing, tell the user what to connect, write the file anyway, and come back to the check later.
- **Record it:** `o11 ostack setup answer <id>`, or `o11 ostack setup answer <id> --skip` when they decline. A skipped question is not asked again. `setup answer` takes no `--me`: a personal question is saved for this person on its own.

When the user wants something no question covers, write the file anyway. Every step can be customized, and general files can say anything.

Checks are previews: they never add real people to the user's tool or send to anyone but the user. Clean up what a check created (delete the test draft or CRM record if the tool can; otherwise tell the user what to delete).

Finish a person's first setup with a real preview for each playbook they enabled. For gtm: follow the find, qualify, research and write steps (`o11 ostack context gtm/<step>`) by hand for two real leads in chat and show both drafted messages, without adding anyone to their tool or sending. For launch-videos: run `o11 ostack launch-videos check`, then make a ten-second test with the ostack-launch-videos skill (`o11 ostack launch-videos new setup-test --format <their format>`, one real clip or one captured screen, their end card), render it at review size, pass the audits and show it. For seo: show the site's top searches next to one competitor's and the first five pieces the topics step would write, each with its search, volume, difficulty and why, without publishing anything. For social: open each account, show five posts the find step would act on, and draft three comments in their voice without posting; with the content calendar, read its due rows back, plan two and draft their captions without writing to the calendar or making videos. Ask plainly whether they are good to go, and adjust files until the user says yes. Then schedule (below). Setup is complete when `o11 ostack setup status` shows no `pending_questions` and the user said yes to the previews.

## Scheduling

Each person's runs happen on their own computer, in the team's timezone (or their own: `o11 ostack settings set timezone <zone> --me`). Each person's schedules are kept in o11, so they are the same everywhere; the agent app on their computer runs them. Over MCP, save schedules the same way; creating the scheduled task needs the o11 CLI on a computer.

1. Show `o11 ostack schedule list`: each workflow with its suggested schedule and runs per day. Outbound has a row per audience; each audience's outbound is scheduled on its own with `--audience <name>` on every schedule command below, and follow-ups runs once for all of them. Ask which should run and when, and change any with `o11 ostack schedule set <workflow> --at HH:MM` or `--every <minutes> --from HH:MM --to HH:MM` (`--days weekdays|weekends|daily|mon-fri`). A schedule can have a different rule for different days (follow-ups suggests every 30 minutes on weekdays and hourly on weekends): `set` changes only the days it names, and `o11 ostack schedule off <workflow> --days <days>` stops those days. Turn on a suggestion as it is with `o11 ostack schedule on <workflow>`. If the team's send window (`o11 ostack settings show`) is narrower than a suggestion's hours, suggest the window's hours instead. Outbound sends first messages the moment it writes them, at any hour, so run it whenever people should get them (inside the sending hours, if the team set any); with a `send_at` time, it should run the evening before. Every task's instructions start with `/goal`, so each run keeps going until it has recorded its end and written its report; create them exactly as `ask` says, and set the effort it names.
2. Ask where runs should happen. It must be a machine that has the workspace folder, the o11 CLI signed in, and the user's mail, CRM and calendar tools, and that is on during those hours:
   - **Claude Desktop** (local scheduled tasks) or **Codex** (automations): run `o11 ostack schedule spec <workflow> --host claude|codex`. If you are running inside that app and can create scheduled tasks or automations, create them exactly as `ask` says: same names, folder, schedules and instructions (one task per entry in `tasks`). Otherwise give the user the fields to enter (`where` says where). Then have them run it once (Run now) and approve the tools it uses with "always allow", so later runs never stall on a prompt.
   - **Neither** (a server, or another agent): `o11 ostack schedule cron install --agent claude|codex` writes a crontab block that starts the agent headless. Show the lines first.
3. Record what you created: `o11 ostack schedule installed <workflow> --host <host> --name <task name>`. `o11 ostack doctor` warns about schedules that are on but not installed anywhere.
4. If `spec` returns a `timezone_note`, the computer's clock differs from the timezone in use. Use the converted times `spec` gives as they are and tell the user in one line; each run checks the time itself.
5. A Run now outside the schedule's hours, or between two of its runs, stops at `not_due` on purpose. That still proves the task starts; run it once just after one of its times to approve the mail and CRM tools.

Workflows without a suggested schedule (launch-videos) run when someone asks; skip them here.

The task's instructions only call `o11 ostack prompt <workflow>`, so they stay right after updates and setting changes. When a schedule's times change, update the task in each host listed under `installed` (the `set` output says which). Every run is reported to the team's Ostack page (account menu, Activity tab).

## Changing things later

Any time the user says how something should work ("use this template", "never mention pricing", "log replies in Lightfield", "send from my other mailbox", "run outbound at 7"):

1. Work out which step it belongs to (`o11 ostack steps` lists them, such as `gtm/write`), whether it is general, or whether it is a setting or a schedule. Then whether it is for the team or just for this person ("just for me", a mailbox, a signature): personal changes use `--me`.
2. Read the existing file (`o11 ostack files show <path> [--me]`) and save the updated text with `--base-version <its version>`, or write a new one. Keep the file to what the user wants, not a copy of the default. If it is a setting (`o11 ostack settings show`), change it with `o11 ostack settings set` (owners and admins change the team's; anyone can add `--me`) and remove anything in the files that contradicts it. If it is a schedule, follow "Scheduling".
3. Test it and show the result: for a tool, the interview's check; for how messages are written, one real draft; for who to reach, a qualify verdict on a real lead. `o11 ostack context <step>` confirms the file loads.

If a write fails with `note_changed`, someone else edited the file meanwhile: read it again, merge their change with the user's, and save once more. If it fails with `forbidden`, this person cannot change the team's setup: offer `--me`, or to ask an admin.

When the user corrects you during a run ("don't open with a compliment", "that's not our ICP"), offer once to save it. If they agree, add it to the right step's file, or to `learnings.md` if it applies everywhere.

When the user wants another playbook ("also help me with recruiting"), `o11 ostack playbooks list` shows what exists and `o11 ostack playbooks add <id>` enables it; then interview its questions. Its files and settings start empty, and nothing that exists changes.

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
