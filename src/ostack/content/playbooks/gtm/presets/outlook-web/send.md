Email goes through Outlook on the web in the browser. Before the first send, open Outlook and read the signed-in account; stop if it is not the sender in the user's files.
- Compose or reply from that account only, pasting the exact final text. Follow-ups and replies go in the original conversation.
- Scheduled first messages: use Send later (the arrow next to Send, then Schedule send) for the moment in `next_send_at_utc`, written in the mailbox's own timezone (Outlook shows it under Settings, Time zone), then record `scheduled` with `scheduled_for`. Scheduled mail waits in Drafts until it goes.
- After sending, open Sent Items, find the message, and record `contacted` with its conversation or item id if the URL shows one, or the recipient, subject and sent time.
- If the page errors or the send is unclear, leave the person on `sending`. The next run checks Sent Items before anything is resent.
