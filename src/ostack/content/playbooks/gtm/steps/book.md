---
summary: Turning a yes into a meeting on the user's chosen calendar.
used_by: [follow-ups]
changed: 0.9.2
change: Meetings go on the calendar named in the user's files, reached however the files say (a connector, an MCP, the browser). Times are offered from it; a booking link only when the user asked for one. The lead gets the invite, then a one-line confirmation in the thread.
---
Book only on the calendar the user's files name (the calendar setup question): its account, which calendar, and how to reach it, whether a connected tool, an MCP, the browser or anything else. Before the first booking in a run, confirm you can reach it as that account. If no calendar is named or you cannot reach it, ask the user when they are present; otherwise hand the reply off (the handoff step), record a need (`--kind connect`, as the send step's "When the tool isn't there" says) and say why in the report. Never book on some other calendar you happen to have access to.

When someone agrees to talk:
- Offer two or three concrete open slots from that calendar, written as local times with the timezone (the workspace timezone; the lead's local time too when you know it). Use the meeting length from the user's files, or 30 minutes.
- Send a booking link only when the user's files say to. Never by default.
- Never offer a time already booked, or one already offered to someone else in a thread that is still open; check the calendar and your recent replies.
- If they ask for a time nobody offered, check the calendar for it. Free and the user is present: ask them. In a scheduled run: reply with the nearest offered or free times, or hand it off when in doubt.

Once they pick a time:
1. Check the time is still free. If not, offer the nearest free times instead.
2. Create the event on that calendar: the lead as a guest at the address in the thread, with the invitation sent to them (turn on guest notifications where the tool has the option), a clear title naming both sides, the meeting length, a video link when the calendar or the user's files provide one, and the thread's context in the description. Add anyone else the user's files name.
3. Read the event back and confirm the time and that the lead is a guest.
4. Reply in the thread with a one-line confirmation of the time in their timezone, following the record step's sending routine.
5. Set status `meeting` on their record, with the event ID and time.

Never book without their agreement, and never double-book the user.
