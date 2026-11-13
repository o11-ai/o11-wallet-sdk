Email goes through the connected Gmail tool. Before the first send, read which account it is signed in as and compare it with the sender in the user's files.
- Draft mode: create a Gmail draft with the exact final text, then record `drafted` with the draft id.
- Scheduled first messages: Gmail's API has no schedule-send, so create the draft with the exact final text and record `scheduled` with the draft id and `scheduled_for`. A follow-ups run at or after that time sends the draft and records `contacted`. If the user schedules it themselves in Gmail instead, that works too: the Sent folder shows it once it goes.
- Send mode: send it, then record `contacted` with the message id and thread id the tool returns.
- Follow-ups and replies: reply in the thread id on the person's record so they stay in one conversation.
- Checking a send: search the Sent folder for the recipient and subject.
