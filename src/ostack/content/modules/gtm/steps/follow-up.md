---
summary: Cold follow-ups to people who have not replied, and when they are due.
used_by: [follow-ups]
changed: 0.6.0
change: Who is due comes from the next follow-up date on each record in the user's own tool.
---
People are due for a follow-up when their status is `contacted`, their next follow-up date has come, and they have not replied. Send it in the same thread, from the same sender, on the same channel unless the user's notes say otherwise.

Timing comes from the `follow_up_days` setting in `o11 ostack context` (out of the box `3,4,7`: the second message three days after the first, the third four days later, the fourth a week after that). After each message, set the next follow-up date from it. After the last one, leave it empty; when that last message has had a week with no reply, set status `closed`. Change the date for one person only when they ask, such as "try me after the holidays".

Content: each follow-up adds one new useful thing (a sharper question, a relevant detail from the research notes, a smaller ask). Never resend the whole pitch, never guilt-trip, and close the loop politely on the last one. Send at most one follow-up per person per run.
