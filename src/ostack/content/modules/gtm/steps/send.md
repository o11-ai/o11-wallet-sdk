---
summary: How a message leaves, through which account and tool.
used_by: [outbound, follow-ups]
changed: 0.6.0
change: Every send follows the record step's routine in the user's own tool instead of ostack reserve and receipt. Daily limits and the send window are checked by counting in that tool.
---
Use whatever tool the user's notes name for this channel (a mail MCP, a browser session, an API script). Without a note, use a connected mail or LinkedIn tool if exactly one fits; otherwise stop and ask the user (or, in a scheduled run, report it).

Before sending, check the settings in `o11 ostack context` (`local_time` is the workspace's time now):
- **Send window:** cold messages (first messages and follow-ups) go out only inside `send_window`. Replies go out any time.
- **Daily limits:** count today's sends in the record tool (or the Sent folder). Stop first messages at `new_per_day`, all messages at `touches_per_day`.
- **Per company:** at most `per_company` people at one company in an open conversation.
- **Mode:** in `send` mode, send. In `draft` mode, create a draft (or show it in chat if no tool holds drafts). When the user asks to switch, run `o11 ostack settings set gtm.mode ...` and remove any line about it from their notes.

Every message, without exception, follows the record step's routine: mark `sending`, send exactly the final text, record the result right away. Before the first send of a run, confirm the signed-in account is the sender the user configured. On a mismatch, stop sending and report it.

If the send errors or times out, look in the Sent folder (or thread) now, as the record step says. Never send again to "fix" it.

Drafts (draft mode): once per run, check whether the user sent each `drafted` one. Sent: record it as `contacted` with its IDs. Deleted: put the old status back. Still a draft: leave it. Drafts never hold up anything else.
