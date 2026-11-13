---
summary: Replies the user answers themselves, how they find out, and the daily list.
used_by: [follow-ups]
changed: 0.9.0
change: New step. Replies that need the user's judgment get a suggested draft, a "needs you" label in the mailbox, status needs you in the record tool, and a daily list emailed to the user.
---
Some replies are the user's to answer. Hand them off instead of answering, even in send mode:
- pricing, discounts or a quote not already in the user's files
- contracts, legal, security reviews, data or compliance questions
- custom terms, partnerships, or anything that commits the user to something new
- a meeting time nobody offered that the calendar cannot settle
- anger, a complaint, or a threat to post publicly
- asking for a person, or asking whether this is automated
- press, investors, or anyone the user's files name as theirs
- anything you are not sure how the user would answer

The user's files can add to this list or take items off it, per audience.

## Handing one off
1. Write the reply you would suggest, in the user's voice, as a draft in that thread. Where a fact is missing, leave a clear blank such as `[price]`, never a guess.
2. Label the thread so it shows up in the mailbox: the label (Gmail) or category (Outlook) `o11/needs you`, created if missing. Without labels, star or flag it.
3. In the record tool: status `needs you`, `handoff_reason` in a few words (such as "asks for pricing"), the draft ID, and the date. If the tool has tasks (HubSpot, Attio, Salesforce and so on), also create a task for the person's owner: "Reply to <name> at <company>: <reason>", linked to their record, due today.
4. Send nothing else to this person, no follow-ups and no nudges, until the user acts. A handed-off reply never goes out on its own, however long it waits.

If the user is present, ask them right away instead of handing off, and send what they decide.

## When the user acts
Each run, check every `needs you` person (the inbox step does this):
- The draft or another reply from the user is in the Sent folder: record it (status `replied`, the message ID), remove the label, and close the task.
- The draft is gone and nothing was sent: the user chose not to answer. Set status `closed` with a note, remove the label, and close the task.
- Still waiting: leave it.

## The daily list
Out of the box the list goes by email at 07:30 in the workspace timezone. The user's handoff file can change that, in words or at its top (`digest: email`, `slack` or `off`, and `digest_at: "08:30"`); the latest file wins.

Once a day, the first follow-ups run at or after that time sends the user one short email from their own mailbox to their own address, subject `o11: <n> replies need you`. Before sending, look in the Sent folder for today's list; if it is there, skip it. For each `needs you` person, oldest first, include one line:
- name, company, the reason, and a link to the thread
- "waiting <n> days" for anything older than two days

End with: "Reply in your mailbox, or ask your agent to go through your handoffs." With nobody waiting, send nothing. This message is not cold and does not count toward the daily limits.

`digest: slack` sends the same list as a direct message to the user through a connected Slack tool (fall back to email if none is connected). `digest: off` sends no list; the label and tasks still work.

## Going through handoffs with the user
When the user asks ("go through my handoffs", "what needs me?"), show the `needs you` people one at a time, oldest first: who, what they asked, and the suggested draft. For each one, send what the user decides (edit the draft, then send it in the thread), record it, remove the label, and close the task. If their answer would settle the same question next time (a price, a policy, a yes or no), offer to save it as a file with the ostack-setup skill, so the next one is answered without them.
