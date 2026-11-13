---
summary: How a message leaves, through which account and tool.
used_by: [outbound, follow-ups]
changed: 0.9.0
change: First messages are scheduled for the next send_at (next_send_at in o11 ostack context) instead of going out as the run writes them, so outbound can run the evening before. A file that sends first messages right away should say so or set send_at off.
---
Use whatever tool the user's files name for this channel (a mail MCP, a browser session, an API script). Without a file, use a connected mail or LinkedIn tool if exactly one fits; otherwise stop and ask the user (or, in a scheduled run, report it).

Before sending, check the settings in `o11 ostack context` for the audience (`--audience <name>`; `local_time` is the workspace's time now). An audience's `audience.md` can change them:
- **Scheduled first messages:** when `send_at` is set (the default, `08:00`), schedule each first message with the mail tool's schedule-send for `next_send_at_utc` (`next_send_at` is the same moment on the workspace's clock), whatever time the run is. Record it as `scheduled` with that time (the record step). A tool with no schedule-send (the preset says so) saves a draft instead, recorded `scheduled` with the draft ID; the follow-ups run sends it once its time has come. With `send_at: off`, send first messages as the run writes them, inside the send window. If the user is present and asks for one to go now, send it now.
- **Send window:** follow-ups, and first messages when `send_at` is off, go out only inside `send_window`. Replies go out any time.
- **Daily limits:** count the messages sent or scheduled for that day in the record tool (or the Sent folder and scheduled mail). A message scheduled for tomorrow counts toward tomorrow. Stop first messages at `new_per_day`, all messages at `touches_per_day`.
- **Per company:** at most `per_company` people at one company in an open conversation.
- **Send mode:** in `send` mode, send. In `draft` mode, create a draft (or show it in chat if no tool holds drafts). When the user asks to switch, run `o11 ostack settings set gtm.send_mode ...` (or, for one audience, set `send_mode:` in its audience.md) and remove any line about it from their files.

Every message, without exception, follows the record step's routine: mark `sending`, send exactly the final text, record the result right away. Before the first send of a run, confirm the signed-in account is the sender the user configured. On a mismatch, stop sending and report it.

If the send errors or times out, look in the Sent folder (or thread) now, as the record step says. Never send again to "fix" it.

Scheduled messages: a message that someone answers, opts out of or bounces before it goes out is cancelled (deleted from the scheduled mail or drafts) and its status put back to what the reply says. Never cancel one only because a run is unsure; look first.

Drafts (draft mode): once per run, check whether the user sent each `drafted` one. Sent: record it as `contacted` with its IDs. Deleted: put the old status back. Still a draft: leave it. Drafts never hold up anything else.
