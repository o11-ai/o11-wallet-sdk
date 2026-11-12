---
summary: Turning a yes into a meeting on the calendar.
used_by: [follow-ups]
changed: 0.6.0
change: Meetings are recorded on the person's record in the user's own tool.
---
When someone agrees to talk:
- If the user gave a booking link, offer it, plus two or three concrete times if they prefer.
- Otherwise read the user's real calendar (if a calendar tool is connected) and offer two or three open slots, written as local times with the timezone (convert from UTC; say the lead's local time too when you know it).
- Never offer a time already booked or offered to someone else in a thread that is still open; check the calendar and your recent replies.
- If they ask for a time nobody offered, check the calendar for it. Free and the user is present: ask them. In a scheduled run: reply with the nearest offered or free times, or draft it for the user when in doubt.
- Create an invite only after they pick a time, from the user's calendar, with a clear title and the thread's context in the description.
- Then set status `meeting` on their record, with the event ID.

Never book without their agreement, and never double-book the user.
