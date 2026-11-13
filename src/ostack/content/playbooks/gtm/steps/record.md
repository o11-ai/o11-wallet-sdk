---
summary: Where leads, messages, replies and opt-outs are kept, and the routine that stops anyone getting two messages.
used_by: [outbound, follow-ups]
changed: 0.9.0
change: New statuses scheduled (a message waiting to go out at scheduled_for) and needs you (a reply handed to the user, with handoff_reason). Add the scheduled_for and handoff_reason fields.
---
ostack keeps no lead data. Everything lives in the user's own tool: a CRM (Attio, Lightfield, HubSpot), Airtable, a Google Sheet or a CSV. This step's file says which tool, how to reach it, and which fields hold what. Every other step reads and writes there, and teammates on other computers see the same records. Without a file, use `leads.csv` in the workspace and say so in the report. That only works for one person; a team needs a shared tool. Start it with these columns, adding others only when a file asks for them:

```
name,email,linkedin,company,domain,tam_id,title,source,owner,status,reason,evidence,research,o11_audience,o11_template,o11_follow_up,messages_sent,last_message_at,message_id,thread_id,draft_id,scheduled_for,next_follow_up,replies_handled,defer_until,defer_reason,handoff_reason
```

Keep a message log next to it, `messages.csv`, one row per message: `sent_at,email_or_linkedin,o11_audience,o11_template,o11_follow_up,subject,message_id,thread_id,sender`. In a CRM, use its activity, note or email log on the person instead.

Keep opt-outs and do-not-contact domains in `do-not-contact.csv` next to it (`email_or_domain,reason,added_at`).

## What to keep for each person
Use the tool's own fields where they exist and add the rest:
- name, email or LinkedIn URL, company, domain, title, source, and owner (the teammate working them)
- the o11 ids that say what they got, so any agent can look it up without copying text into the record:
  - `o11_audience`: the audience that reached them (`default`, or a folder name such as `customers`). It decides their follow-up timing.
  - `o11_template`: the version id of the template their first message used (from `o11 ostack context gtm/write`), empty when there was none. `o11 ostack files show --version <id>` opens the exact text.
  - `o11_follow_up`: how many follow-ups they have had (0 after the first message).
- status: `new`, `qualified`, `disqualified`, `sending`, `scheduled`, `drafted`, `contacted`, `replied`, `needs you`, `meeting`, `closed`, `opted out`, `bounced`
  - `scheduled`: a message is waiting to go out at `scheduled_for` (a scheduled send or a draft the follow-ups run sends then). Once its time has passed and it is in the Sent folder, it is `contacted`.
  - `needs you`: a reply the user answers themselves, with `handoff_reason` (the handoff step). Nothing more goes to this person until the user acts.
- why they qualified or not, with evidence, and research notes
- messages sent so far, the date of the last one, its message and thread IDs, the next follow-up date, and the IDs of replies already handled
- defer until, and why

Never delete people who opted out or bounced: their record is what stops the next message. A company or domain nobody may contact goes on a do-not-contact list in the same tool.

## Before working anyone
Search the tool for their email, LinkedIn URL and domain. Skip anyone already there with another status, anyone who opted out or bounced, and anyone a teammate owns.

## Sending routine, for every message
1. Re-read the person's record. If it changed since you looked (a teammate took them, they replied, they opted out), leave them.
2. Set status `sending`, with your name and the time.
3. Send or draft it (the send step).
4. Right away, record the result: status `contacted` (a reply keeps `replied`; a scheduled message gets `scheduled` with `scheduled_for`), the message and thread IDs, the date, messages sent plus one, `o11_audience`, `o11_template` (first messages), `o11_follow_up` (follow-ups), and the next follow-up date from the audience's timing. Add the message to the log (or the CRM's activity). A draft gets `drafted` and its draft ID.
5. If the send failed, look in the Sent folder. Found it: record it as in step 4. Clearly not sent: put the old status back, with a note.

A record stuck on `sending` (a run that crashed, or a teammate mid-send): look for the message in the Sent folder first. Found: record it as sent. Not there and older than an hour: put the old status back. Never send again only because a record is unclear.

## Who works whom
The file says how the team splits the work: by company, region, list, audience, alternating, or not at all (each person's own share is their `lead_assignment` setting). Only work your own. With no split, set yourself as owner of a company before working anyone there. When the team gave no preference, setup picks one that fits and writes it in the file.

If the tool is down or refuses a write, send nothing you cannot record. Say so in the report and stop sending for this run.
