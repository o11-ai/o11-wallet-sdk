# Writing customization notes

A note is a short piece of markdown in plain language, saved in the team's o11 workspace with `o11 ostack notes write <path> --text-file -` (or `--text`). Team notes are shared by everyone and written by owners and admins; add `--me` for a note that is only yours. Its folder decides which workflows read it, and its name decides when:

| Path | Read |
| --- | --- |
| `<any name>.md`, such as `about.md`, `voice.md`, `learnings.md` | By every module, at the start of every run, as general context |
| `<module>/<step>.md`, such as `gtm/write.md` | Every time that step runs, after the step's default |
| `<module>/before-<step>.md`, `after-<step>.md` | Right before or after that step, such as `gtm/after-record.md` to post replies in Slack |
| `<module>/<any other name>.md`, such as `gtm/pricing.md` | By that module only, at the start of every run |
| `campaigns/<name>/<step>.md` (gtm, team only) | For that campaign's runs, such as a fundraising push |

`o11 ostack steps` lists the step names (`gtm/write`). `o11 ostack context <step>` shows exactly what the agent will read for a step, which is the best way to check a note.

To change a note that exists, read it first (`o11 ostack notes show <path> [--me]`) and pass its `version` as `--base-version`. If someone changed it meanwhile, the write is refused with `note_changed`: read it again, merge, and retry. Nothing is ever overwritten silently.

## Layers

Notes stack, lowest priority first:
1. the step defaults that ship with the module
2. the module's installed packs
3. the team's notes: general, then `<module>/`
4. the campaign's notes, `campaigns/<name>/` (gtm)
5. your own notes (`--me`): general, then `<module>/`
6. files in `custom.local/` and `custom.local/<module>/` in the workspace folder on this computer

A later layer refines the earlier ones and wins where they conflict. To replace a default completely, say so in the note: "Ignore the default shape; always use this template."

## How to write them

- **Write only what differs from the default.** Never copy the default into a note. A copy freezes today's behavior and hides every later improvement to that step.
- Use the user's words. Be concrete: name tools, accounts, stages, numbers and examples.
- One topic per note, and each fact in one place: who to reach lives in `gtm/qualify.md`, the offer in `about.md`. Other notes point to them ("see qualify.md") instead of restating them, so one edit changes everything. Put rules about everything in `learnings.md` or another general note.
- Never repeat a setting or a schedule in a note (mode, daily limits, the follow-up days, the send window, when a workflow runs). `o11 ostack settings` holds those, and a copy in a note goes stale the day the setting changes.
- Never put passwords, API keys or tokens in notes. Point to where they live instead, for example "the key is in RESEND_API_KEY in .env". Make sure `.env` is gitignored.
- If a customization needs code (an API call, a small script), put the script in the workspace, for example `scripts/send-resend.ts`, and have the note say when and how to run it.

## Examples

These show the shape of a good note. They are not defaults: write what the user said, never these rules.

`gtm/record.md`:
```
Everything lives in Lightfield, through the Lightfield MCP. People are contacts, linked to their company.
- Status is the "Outreach" field. Our names: New, Qualified, Disqualified, Sending, Drafted, Contacted, Replied, Meeting booked, Closed, Do not contact (for opt-outs and bounces).
- Research, evidence and message IDs go in the "Outreach notes" field; next follow-up in "Next touch".
- Split: Sam owns companies A-M, Priya N-Z. Everyone else is hands off.
```

`gtm/write.md`:
```
Always use this template. Fill the bracketed parts from research, and never send a bracket.

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
