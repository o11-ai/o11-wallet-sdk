# Writing customization files

A file is a short piece of markdown in plain language, saved in the team's o11 workspace with `o11 ostack files write <path> --text-file -` (or `--text`). Team files are shared by everyone and written by owners and admins; add `--me` for a file that is only yours. Its folder decides which workflows read it, and its name decides when:

| Path | Read |
| --- | --- |
| `<any name>.md`, such as `company.md`, `voice.md`, `learnings.md` | By every playbook, at the start of every run, as general context |
| `<playbook>/<step>.md`, such as `gtm/write.md` | Every time that step runs, after the step's default |
| `<playbook>/before-<step>.md`, `after-<step>.md` | Right before or after that step, such as `gtm/after-record.md` to post replies in Slack |
| `<playbook>/<any other name>.md`, such as `gtm/pricing.md` | By that playbook only, at the start of every run |
| `gtm/audiences/<name>/...` (team only) | One audience's own files, read for that audience's runs on top of `gtm/` (see Audiences) |

`o11 ostack steps` lists the step names (`gtm/write`). `o11 ostack context <step> [--audience <name>]` shows exactly what the agent will read for a step, which is the best way to check a file.

To change a file that exists, read it first (`o11 ostack files show <path> [--me]`) and pass its `version` as `--base-version`. If someone changed it meanwhile, the write is refused with `file_changed`: read it again, merge, and retry. Nothing is ever overwritten silently. Every save keeps the old text as a version with its own id, so a CRM record that points at one still opens it (`o11 ostack files show --version <id>`).

## Audiences

An audience is a folder of team files for one outbound push, such as customers next to providers. `gtm/` itself is the default audience; any other lives in `gtm/audiences/<name>/` (lowercase, dashes). Its files refine `gtm/` for that audience only, so write only what differs: usually who to reach (`qualify.md`), what to say (`company.md` or `write.md`) and its templates. `o11 ostack gtm audiences` lists them.

- **Templates:** `template.md`, or `template-a.md`, `template-b.md` and so on, one email each. The ones in use split new people evenly, which makes an A/B test; `active: false` at the top of a template pauses it without deleting it, and an optional `weight: 2` sends one twice as often. An audience without templates of its own uses the default audience's (`gtm/template-*.md`). Each person's CRM record keeps the version id of the template they got.
- **Settings for one audience:** front matter at the top of the audience's `audience.md` (`send_mode`, `new_per_day`, `touches_per_day`, `per_company`, `send_window`, `follow_up_days`) and `follow-up.md` (`days: 2, 5`, or `days: off` for no cold follow-ups). Everything else keeps the team's settings. `o11 ostack gtm audiences <name>` shows the result and any value it skipped.
- Outbound runs once per audience (`--audience <name>`, its own schedule); follow-ups covers every audience in one run, using each person's audience for timing.

```
gtm/audiences/providers/audience.md
---
send_mode: draft
new_per_day: 10
---
Clinics and labs we want as providers on the marketplace, not buyers.
```

## Layers

Files stack, lowest priority first:
1. the step defaults that ship with the playbook
2. the playbook's installed presets
3. the team's files: general, then `<playbook>/`
4. the audience's files, `gtm/audiences/<name>/`
5. your own files (`--me`): general, then `<playbook>/`
6. files in `custom.local/` and `custom.local/<playbook>/` in the workspace folder on this computer

A later layer refines the earlier ones and wins where they conflict. To replace a default completely, say so in the file: "Ignore the default shape; always use this template."

## How to write them

- **Write only what differs from the default.** Never copy the default into a file. A copy freezes today's behavior and hides every later improvement to that step.
- Use the user's words. Be concrete: name tools, accounts, stages, numbers and examples.
- One topic per file, and each fact in one place: who to reach lives in `gtm/qualify.md`, the offer in `company.md`. Other files point to them ("see qualify.md") instead of restating them, so one edit changes everything. Put rules about everything in `learnings.md` or another general file.
- Never repeat a setting or a schedule in a file's text (send mode, daily limits, the follow-up days, the send window, when a workflow runs). `o11 ostack settings` holds the team's, an audience's front matter holds its own, and a copy in the text goes stale the day the setting changes.
- Never put passwords, API keys or tokens in files. Point to where they live instead, for example "the key is in RESEND_API_KEY in .env". Make sure `.env` is gitignored.
- If a customization needs code (an API call, a small script), put the script in the workspace, for example `scripts/send-resend.ts`, and have the file say when and how to run it.

## Examples

These show the shape of a good file. They are not defaults: write what the user said, never these rules.

`gtm/record.md`:
```
Everything lives in Lightfield, through the Lightfield MCP. People are contacts, linked to their company.
- Status is the "Outreach" field. Our names: New, Qualified, Disqualified, Sending, Drafted, Contacted, Replied, Meeting booked, Closed, Do not contact (for opt-outs and bounces).
- Research, evidence and message IDs go in the "Outreach notes" field; next follow-up in "Next touch".
- o11_audience, o11_template and o11_follow_up are custom fields of the same names. Each message is logged as a Lightfield email activity on the contact.
- Split: Sam owns companies A-M, Priya N-Z. Everyone else is hands off.
```

`gtm/template-a.md` (add `gtm/template-b.md` to A/B test a second one):
```
Fill the bracketed parts from research, and never send a bracket.

subject: [their product] + [our product]?

hey [first name], saw [specific recent thing]. [one line connecting it to what we do].
worth 15 min next week?

sam
```

`gtm/send.md`:
```
Send email from sam@yourcompany.com in Outlook web through the browser. Check the signed-in account first.
Never use Gmail for outreach.
```

`signature.md` (`--me`):
```
Sign off as "a." and keep everything lowercase.
```
