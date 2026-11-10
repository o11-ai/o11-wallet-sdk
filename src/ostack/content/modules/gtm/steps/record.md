---
summary: Where leads, messages, replies and opt-outs are kept, and the routine that stops anyone getting two messages.
used_by: [outbound, follow-ups]
changed: 0.6.0
change: ostack no longer keeps a ledger. Everything lives in the user's own tool, named in this step's note. An after-record note that copied the ledger into a CRM usually becomes this note.
---
ostack keeps no lead data. Everything lives in the user's own tool: a CRM (Attio, Lightfield, HubSpot), Airtable, a Google Sheet or a CSV. This step's note says which tool, how to reach it, and which fields hold what. Every other step reads and writes there, and teammates on other computers see the same records. Without a note, use `leads.csv` in the workspace and say so in the report. That only works for one person; a team needs a shared tool.

## What to keep for each person
Use the tool's own fields where they exist and add the rest:
- name, email or LinkedIn URL, company, domain, title, source, and owner (the teammate working them)
- status: `new`, `qualified`, `disqualified`, `sending`, `drafted`, `contacted`, `replied`, `meeting`, `closed`, `opted out`, `bounced`
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
4. Right away, record the result: status `contacted` (a reply keeps `replied`), the message and thread IDs, the date, messages sent plus one, and the next follow-up date. A draft gets `drafted` and its draft ID.
5. If the send failed, look in the Sent folder. Found it: record it as in step 4. Clearly not sent: put the old status back, with a note.

A record stuck on `sending` (a run that crashed, or a teammate mid-send): look for the message in the Sent folder first. Found: record it as sent. Not there and older than an hour: put the old status back. Never send again only because a record is unclear.

## Who works whom
The note says how the team splits the work: by company, region, list, alternating, or not at all. Only work your own. With no split, set yourself as owner of a company before working anyone there. When the team gave no preference, setup picks one that fits and writes it in the note.

If the tool is down or refuses a write, send nothing you cannot record. Say so in the report and stop sending for this run.
