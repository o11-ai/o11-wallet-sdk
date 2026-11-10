---
name: ostack-setup
description: Set up, schedule and customize ostack by talking to the user. Interviews them, writes plain-language notes that change how its workflows run (for gtm: their offer, voice, templates, lead sources, email tool, CRM, calendar, limits), tests each change for real, creates scheduled runs in Claude Desktop, Codex or cron in their timezone, saves corrections as lasting rules, and reviews what is new after an o11 CLI update. Works for a whole team: owners and admins set up the team once, teammates add only their own mailbox and signature. Use whenever someone wants to set up or change ostack or their outreach: "set up ostack", "schedule my outbound every morning", "run follow-ups every 30 minutes", "use my email template", "log everything in Lightfield/HubSpot", "send from my Outlook", "we sell to dentists now", "stop mentioning pricing", "remember this", "add a fundraising campaign", or "review ostack updates", even if they never say "ostack". Running a workflow itself belongs to that workflow's skill (ostack-outbound, ostack-follow-ups).
---

# ostack setup

ostack is a set of modules (gtm is the first), each a family of workflows made of named steps with defaults. Everything specific to a team lives in short notes and a few settings in their o11 workspace, which the workflows read before every step. Each person adds their own notes and settings on top. You set ostack up by asking questions, writing those notes, proving they work, and scheduling the workflows. The user never edits config.

Read [customizing.md](references/customizing.md) before writing any note.

## First, find out where things stand

1. Run `o11 ostack doctor`. If the `login` check fails, ask the user to run `o11 login` and sign in to their o11 workspace (everyone signs in, admins and teammates alike), then run doctor again.
2. If there is no workspace folder (no `ostack.json` in this folder or a parent), check the `known` workspaces the error lists; with none, ask where to create one (default `~/ostack`) and run `o11 ostack init --dir <path>`. Work in that folder from then on (if your shell does not keep the folder between commands, start each with `cd <workspace> &&`). The folder holds this computer's schedules and personal files; the team's setup lives in the wallet.
3. Run `o11 ostack setup status`. `team.role` says whether this person is an owner or admin (`admin`) or a teammate (`member`). It lists the questions this person should answer (`pending_questions`; `new_since_setup` marks ones a newer release added), team questions an admin still has to answer (`team_pending`), customized steps whose default changed since the user last reviewed (`changed_defaults`), notes that need attention (`unknown_steps`, `renamed_steps`, `misplaced_notes`) and notes from before teams (`local_setup_to_import`).
4. Run `o11 ostack context --files` to see what is already customized.

If `local_setup_to_import` is above zero and this person is an admin, this folder was set up before teams. Show `o11 ostack setup import --dry-run`, and once they agree run `o11 ostack setup import`, which copies those notes, settings and answers to the team without overwriting anything the team has. Then continue below.

## Two paths

**An owner or admin** sets up the team. Go through every team question in `pending_questions`, then the personal ones for themselves. When the team's setup is done, tell them to invite teammates from the workspace's team settings (account menu, Preferences, Team), and that each teammate installs the o11 CLI, runs `o11 login` and `o11 ostack skills install`, and asks their agent to "set up ostack".

**A teammate** answers only the personal questions (`Scope: personal`): their mailbox, their signature, and where their own runs happen, then a test draft to themselves. Everything else comes from the team. If `team_pending` is not empty, say which team questions an admin still has to answer and carry on with the personal ones. A teammate never writes team notes; when they want something changed for everyone, suggest they ask an admin, or save it just for themselves with `--me`.

## The interview

For each question in `pending_questions`, in order (`o11 ostack setup status` gives each one's full text):

- **Ask it conversationally**, one topic at a time. Offer the default so "the default is fine" is a quick answer. Reuse anything the user already said, and skip questions the answers already cover.
- **Write what they said** as the note the question names, in their words where possible, with `o11 ostack notes write <path> --text-file -` (team questions) or `--me` (personal ones). Keep notes short and specific.
- **Make it real.** When the answer names a tool (a CRM, a mail account, a calendar), check the tool is actually available. Run the question's check (create a test record and read it back, send a test draft to themselves, list calendar slots) and show the result. If the tool is missing, tell the user what to connect, write the note anyway, and come back to the check later.
- **Record it:** `o11 ostack setup answer <id>`, or `o11 ostack setup answer <id> --skip` when they decline. A skipped question is not asked again.

When the user wants something no question covers, write the note anyway. Every step can be customized, and general notes can say anything.

Checks are previews: they never add real people to the user's tool or send to anyone but the user. Clean up what a check created (delete the test draft or CRM record if the tool can; otherwise tell the user what to delete).

Finish a person's first setup with a real preview. For gtm: follow the find, qualify, research and write steps (`o11 ostack context gtm/<step>`) by hand for two real leads in chat and show both drafted messages, without adding anyone to their tool or sending. Ask plainly whether they are good to go, and adjust notes until the user says yes. Then schedule (below). Setup is complete when `o11 ostack setup status` shows no `pending_questions`.

## Scheduling

Each person's runs happen on their own computer, in the team's timezone (or their own: `o11 ostack settings set timezone <zone> --me`). ostack keeps the schedule; the user's agent app runs it.

1. Show `o11 ostack schedule list`: each workflow with its suggested schedule and runs per day. Ask which should run and when, and change any with `o11 ostack schedule set <workflow> --at HH:MM` or `--every <minutes> --from HH:MM --to HH:MM` (`--days weekdays|daily|mon-fri`). Turn on a suggestion as it is with `o11 ostack schedule on <workflow>`.
2. Ask where runs should happen. It must be a machine that has the workspace folder, the o11 CLI signed in, and the user's mail, CRM and calendar tools, and that is on during those hours:
   - **Claude Desktop** (local scheduled tasks) or **Codex** (automations): run `o11 ostack schedule spec <workflow> --host claude|codex`. If you are running inside that app and can create scheduled tasks or automations, create it exactly as `ask` says: same name, folder, schedule and instructions. Otherwise give the user the fields to enter (`where` says where). Then have them run it once (Run now) and approve the tools it uses with "always allow", so later runs never stall on a prompt.
   - **Neither** (a server, or another agent): `o11 ostack schedule cron install --agent claude|codex` writes a crontab block that starts the agent headless. Show the lines first.
3. Record what you created: `o11 ostack schedule installed <workflow> --host <host> --name <task name>`. `o11 ostack doctor` warns about schedules that are on but not installed anywhere.
4. If `spec` returns a `timezone_note`, the computer's clock differs from the timezone in use. Use the converted times `spec` gives as they are and tell the user in one line; each run checks the time itself.
5. A Run now outside the schedule's hours stops at `not_due` on purpose. That still proves the task starts; run it once during its hours to approve the mail and CRM tools.

The task's instructions only call `o11 ostack prompt <workflow>`, so they stay right after updates and setting changes. When a schedule's times change, update the task in each host listed under `installed` (the `set` output says which). Every run is reported to the team's Ostack page (account menu, Activity tab).

## Changing things later

Any time the user says how something should work ("use this template", "never mention pricing", "log replies in Lightfield", "send from my other mailbox", "run outbound at 7"):

1. Work out which step it belongs to (`o11 ostack steps` lists them, such as `gtm/write`), whether it is general, or whether it is a setting or a schedule. Then whether it is for the team or just for this person ("just for me", a mailbox, a signature): personal changes use `--me`.
2. Read the existing note (`o11 ostack notes show <path> [--me]`) and save the updated text with `--base-version <its version>`, or write a new one. Keep the note to what the user wants, not a copy of the default. If it is a setting (`o11 ostack settings show`), change it with `o11 ostack settings set` (owners and admins change the team's; anyone can add `--me`) and remove anything in the notes that contradicts it. If it is a schedule, follow "Scheduling".
3. Test it and show the result: for a tool, the interview's check; for how messages are written, one real draft; for who to reach, a qualify verdict on a real lead. `o11 ostack context <step>` confirms the note loads.

If a write fails with `note_changed`, someone else edited the note meanwhile: read it again, merge their change with the user's, and save once more. If it fails with `forbidden`, this person cannot change the team's setup: offer `--me`, or to ask an admin.

When the user corrects you during a run ("don't open with a compliment", "that's not our ICP"), offer once to save it. If they agree, add it to the right step's note, or to `learnings.md` if it applies everywhere.

When the user wants another module ("also help me with recruiting"), `o11 ostack modules list` shows what exists and `o11 ostack modules add <id>` enables it; then interview its questions. Its notes and settings start empty, and nothing that exists changes.

The whole setup can be downloaded as plain files at any time: `o11 ostack notes export`.

## After an update ("review updates")

The o11 CLI updates ostack and the installed skills (`o11 update`). Run `o11 ostack setup status` and walk the user through it:

- **What's new:** summarize `release_notes` in a few plain lines first.
- **New questions:** ask only those. The existing answers stand.
- **Changed defaults:** each has a `change` saying what the release changed. Read the note for that step (`o11 ostack context <step>`). If the change makes part of the note redundant or wrong (such as day counts that now belong in a setting), propose the exact edit and make it once they agree. If the note is unaffected, say so in one line instead of asking.
- **Old ledger:** before 0.6.0, ostack kept leads and messages in `.ostack/gtm.db`. If that file exists and the `gtm/records` question is answered, offer to move its history into the user's tool: `o11 ostack gtm ledger export` writes `people.csv`, `messages.csv` and `opt-outs.csv` to `ledger-export/`. Import them as the record note describes; opt-outs first, since they stop messages. Once the user confirms it all arrived, they may delete `.ostack/gtm.db` and `ledger-export/`.
- **Misplaced notes:** step notes at the top level (such as `write.md`) keep working. Offer to save each under its `move_to` path and delete the old one.
- **Renamed steps:** save the notes under the new step names (`renamed_steps`). They keep working meanwhile.
- **Unknown steps:** ask what each note was meant for, then move or delete it.

Then run `o11 ostack setup reviewed`, which records that this person reviewed this release's changes.

## Where notes go

- Team notes (no flag): about the team and its company, read by everyone: `about.md`, `voice.md`, `learnings.md`, and each module's step notes such as `gtm/write.md`. For gtm, `gtm/record.md` names the tool where people and messages live and how work is split.
- Personal notes (`--me`): this person's own, which take priority over the team's: their mailbox and channels (`gtm/send.md`, `gtm/inbox.md`), their `signature.md`, or anything they say is "just for me".
- `campaigns/<name>/`: team notes for one gtm campaign (for example a fundraising push next to sales). Use `--campaign <name>` with the CLI.
- `custom.local/` in the workspace folder: files only this computer reads, for experiments. They take priority over everything.
- Packs (`o11 ostack packs list`) are shared starting points for a module, such as a use case or a tool. Offer one when it matches what the team describes (`o11 ostack packs add gtm/<name>`, owners and admins). Notes always win over packs.
