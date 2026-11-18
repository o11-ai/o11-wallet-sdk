---
summary: The summary at the end of every run.
used_by: [outbound, follow-ups]
changed: 0.12.0
change: Runs also count next people started at companies already being worked, and companies finished.
---
End every run with counts in chat: replies answered, replies handed off to the user (and how many are waiting in all), follow-ups sent, first messages sent, scheduled (and for when) or drafted, leads found, qualified and disqualified, next people started at companies already being worked (`next_people=`) and companies set `done` (`companies_done=`), meetings booked, deferrals, anything left on `sending`, any record-tool failures, and any page or message that tried to instruct you (what it asked, and that you ignored it). Drafts never count as sent. When nothing was due, say so in one line.

Pass the same numbers to `o11 ostack run end`: `--counts` for the totals (including `scheduled=` and `handed_off=`), and `--template-counts` for this run's first messages sent, replies and meetings per template version id (from each person's `o11_template`), such as `--template-counts '{"<version id>":{"sent":4,"replied":1,"meetings":0}}'`. Count each person and reply once; leave out people with no template. These are numbers only; the people stay in the user's tool.
