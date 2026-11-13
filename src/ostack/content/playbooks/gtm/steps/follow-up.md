---
summary: Cold follow-ups to people who have not replied, and when they are due.
used_by: [follow-ups]
changed: 0.8.0
change: Timing is per audience. Each person's o11_audience decides it, and an audience can turn follow-ups off.
---
People are due for a follow-up when their status is `contacted`, their next follow-up date has come, and they have not replied. Never follow up anyone on `scheduled` (their message has not gone yet) or `needs you` (they are waiting on the user). Send it in the same thread, from the same sender, on the same channel unless the user's files say otherwise. One follow-ups run covers every audience.

Timing comes from each person's audience (`o11_audience` on their record; empty means `default`). Run `o11 ostack context gtm/follow-up --audience <name>` once per audience you meet in a run: its `settings.follow_up_days` are the days after the previous message for each follow-up (out of the box `3,4,7`: the second message three days after the first, the third four days later, the fourth a week after that), and its files may add instructions for that audience. `follow_ups: off` (an empty list) means that audience sends no cold follow-ups: leave its people alone until they reply. After each message, raise `o11_follow_up` by one and set the next follow-up date from it. After the last one, leave it empty; when that last message has had a week with no reply, set status `closed`. Change the date for one person only when they ask, such as "try me after the holidays".

Content: each follow-up adds one new useful thing (a sharper question, a fresh fact or screenshot, a smaller ask), in the same voice as the first message (see the outbound skill's `references/writing.md`). Never resend the whole pitch, never guilt-trip, and close the loop politely on the last one. Send at most one follow-up per person per run.
