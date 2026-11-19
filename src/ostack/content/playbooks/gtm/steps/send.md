---
summary: How a message leaves, through which account and tool.
used_by: [outbound, follow-ups]
changed: 0.12.0
change: The per-company limit counts people being contacted at once (2 by default), and no new person goes to a company that is paused, won, done or skipped.
---
Use whatever tool the user's files name for this channel (a mail MCP, a browser session, an API script). Without a file, use a connected mail or LinkedIn tool if exactly one fits; otherwise stop and ask the user (or, in a scheduled run, record it as below).

**When the tool isn't there.** A scheduled run often happens on another computer than the one setup ran on (the hosted computer). If the named tool is missing, signed out or refuses the account, never switch to another tool or account. With the user present, tell them what to connect. In a scheduled run, record it so their agent asks them: `o11 ostack run need <workflow> --kind connect --ask "<one line: what to connect or reconnect, for which account>" [--url <a page that fixes it for this computer, such as where they make a new API key>]`, or `--kind sign_in --url <the site>` when the tool is a site in the browser. Then skip everything that needs this channel, keep doing the rest (research, records, other channels), and say it in the report. Never end a run silently over it.

Before sending, check the settings in `o11 ostack context` for the audience (`--audience <name>`; `local_time` is the workspace's time now). An audience's `audience.md` can change them:
- **First messages go out now:** send each one the moment the run writes it, at any hour, never through the mail tool's schedule-send. A message sent now is in the Sent folder with real IDs, so the record step can confirm it at once and nothing waits in a queue a reply would have to cancel.
- **Unless the audience set `send_at`:** with a time set (`o11 ostack context` then shows `next_send_at`), schedule each first message with the mail tool's schedule-send for `next_send_at_utc` (`next_send_at` is the same moment on the workspace's clock), whatever time the run is, and record it as `scheduled` with that time (the record step). A tool with no schedule-send (the preset says so) saves a draft instead, recorded `scheduled` with the draft ID; the follow-ups run sends it once its time has come. If the user is present and asks for one to go now, send it now.
- **Sending hours:** none by default (`send_window: any`). If the team or audience set `send_window`, first messages and follow-ups go out only inside it. Replies go out any time either way.
- **Daily limits:** count the messages sent or scheduled for that day in the record tool (or the Sent folder and scheduled mail). A message scheduled for tomorrow counts toward tomorrow. Stop first messages at `new_per_day`, all messages at `touches_per_day`.
- **Per company:** at most `per_company` people at one company being contacted at once, and no new person at a company that is `paused`, `won`, `done` or `skip` (the companies step).
- **Send mode:** in `send` mode, send. In `draft` mode, create a draft (or show it in chat if no tool holds drafts). When the user asks to switch, run `o11 ostack settings set gtm.send_mode ...` (or, for one audience, set `send_mode:` in its audience.md) and remove any line about it from their files.

Every message, without exception, follows the record step's routine: mark `sending`, send exactly the final text, record the result right away. Before the first send of a run, confirm the signed-in account is the sender the user configured. On a mismatch, stop sending and report it.

If the send errors or times out, look in the Sent folder (or thread) now, as the record step says. Never send again to "fix" it.

Scheduled messages: a message that someone answers, opts out of or bounces before it goes out is cancelled (deleted from the scheduled mail or drafts) and its status put back to what the reply says. Never cancel one only because a run is unsure; look first.

Drafts (draft mode): once per run, check whether the user sent each `drafted` one. Sent: record it as `contacted` with its IDs. Deleted: put the old status back. Still a draft: leave it. Drafts never hold up anything else.
