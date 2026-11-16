---
summary: Reading the team's content calendar, claiming due rows and writing results back.
used_by: [calendar]
changed: 0.9.3
change: First release.
---
ostack keeps no posts. The calendar lives in the team's own tool: a Google Sheet, a Notion database, Airtable, or a
calendar. `social/calendar.md` says which tool, how to reach it (its connector, MCP, API or the browser), and which
column or property holds what. Without that file, stop and hand over to ostack-setup.

Default columns, when the file does not name others:

| Column | Who fills it | What it holds |
|-|-|-|
| Date | team | The day the post goes out |
| Platforms | team | Where it goes, such as X, LinkedIn, Instagram (optional: the prompt can say it) |
| Prompt | team | What to make, in plain words: the topic, how many videos, what to follow, anything else |
| Reference | team | An o11 film or video link to follow (optional but strongly recommended for video) |
| Material | team | Where the clips are (a folder or Drive link), or the product URL for a demo |
| Status | both | Planned, In progress, Ready for review, Needs help, Approved, Posted |
| Videos | ostack | Each o11 video link, one per line |
| One column per platform | ostack | That platform's caption, then any extras, each labeled |
| Agent note | ostack | What was made, what was assumed, or the one question blocking it |

**Due rows.** A row is due when its date is on or before today plus the lead days in the file (default 3), in the
team's timezone, and its status is Planned or empty. Rows dated in the past that are still Planned are due too: make
them and say they are late. Approved, Posted, Ready for review and Needs help rows are done for now; the team moves one
back to Planned to have it made again.

**Claim before working.** Set the row to In progress and write `<your name or computer>, <time>` in the agent note,
then read the row back. If someone else's claim is there, skip the row. A claim older than six hours is stale: take it
over and say so in the note. This is how two teammates' runs never make the same post.

**Write back** only the columns the file names, appending to cells the team wrote in, never replacing their words:
- Ready for review: the Videos links, every caption and extra, and a one-line note (what you followed, any assumption).
- Needs help: whatever was finished, plus the reason and the one thing that would unblock it.

Read each row back after writing it, and fix anything that did not save. A Google Calendar event has no columns: use
its description for drafts and links, and a `[Ready]` or `[Needs help]` title prefix for status, unless the file says
otherwise.
