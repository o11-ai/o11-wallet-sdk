# gtm setup questions

Asked by the ostack-setup skill when the gtm playbook is enabled; their ids are `gtm/<id>`. Each `## <id>` section is one topic. `Since` is the release that added it, so after an upgrade only new topics are asked. Releases may add sections, but never rename or remove an id.

Questions without a `Scope` line are the team's: an owner or admin answers them once, and their files are team files (`o11 ostack files write <path>`). `Scope: personal` questions are answered by every teammate for themselves, and their files are personal (`--me`). "Writes" names the file path.

## about
Since: 0.2.0
Ask: What do you do, who is it for, and what should outreach lead to? (a call, a demo, a reply, an intro) Any proof you can share: customers, results, notable users? Anything we must never claim?
Default: None. This one is needed.
Writes: `company.md`, with sections for what you offer, who it is for, proof, the one ask, and never claim.
Check: Read it back in two sentences and ask whether it is right.

## who
Since: 0.2.0
Ask: Who exactly should we reach? Role, company type and size, location, and anything that rules someone out (existing customers, competitors, agencies, ...).
Default: Inferred from `company.md`, which is rarely sharp enough. Push for specifics.
Writes: `gtm/qualify.md` as provable rules and exclusions.
Check: Qualify two or three real leads from the user's list or the web against the rules in chat (do not add them to their tool) and show each verdict with its evidence. Ask about any borderline case you hit, such as a role or size close to the line, and add the answer to the file.

## records
Since: 0.6.0
Ask: Where do you keep your leads and outreach? (Attio, Lightfield, HubSpot, Airtable, a Google Sheet, nothing yet) Does anyone else on your team reach out from the same list, and how should you split who contacts whom?
Default: The tool they already use. With none: `leads.csv` here when they work alone, a shared Google Sheet for a team. With no preference on the split, pick one that fits (by company for a small team).
Writes: `gtm/record.md`: the tool, how to reach it (its MCP, connector, API or the browser), which fields or columns hold what the record step lists, including `o11_audience`, `o11_template` and `o11_follow_up` and where each message is logged (create missing ones once they agree), the status names they already use, and the rule for how work is split. Each person records their own share (such as "companies A-M") with `o11 ostack settings set lead_assignment "<share>"`.
Check: Create a test person with an `o11_audience`, set it to `sending`, then `contacted` with a logged test message, read both back, then delete them (or ask them to).

## audiences
Since: 0.8.0
Ask: Do you reach more than one kind of person, such as customers and providers, or investors next to sales? For each: who they are, what you offer them, and how messages to them should differ.
Default: One audience, default, in `gtm/`. Most teams start there and add one later.
Writes: For each extra audience, `gtm/audiences/<name>/` with only what differs from `gtm/`: usually `qualify.md`, `company.md` or `write.md`, and its templates. Settings that differ (send mode, limits, sending hours) go in the front matter of its `audience.md` (see customizing.md, Audiences). Each one gets its own outbound schedule in the schedule question.
Check: Run `o11 ostack gtm audiences` and read each audience back in one line, then qualify one real lead for each against its own rules in chat.

## sources
Since: 0.2.0
Ask: Where do good leads come from? A list or CSV, a CRM view, a data tool (Apollo, Clay, ...), or should I research the web? Any places to look or avoid?
Default: Web research, as described in the find step.
Writes: `gtm/find.md`. If they name a tool, include how to reach it.
Check: Find up to three real candidates and show them without adding them. For a file, show how many rows it has, how many are already in their tool, and a few that would be added.

## tam
Since: 0.5.0
Ask: Should I build a list of every company that fits (your TAM) and work through it, or find leads as we go? If a list: where should it live (a CSV here, a Google Sheet, your CRM, Clay), and how much may I spend on data per month?
Default: Find leads as we go. With a list, use `tam.csv` here, with free sources first and no spending without asking.
Writes: `gtm/tam.md` with where the list lives, the source the tam step picked for their ICP, the budget, and a `## Progress` section.
Check: Pull a small sample from the chosen source, show the total and 10 random rows, and give the estimated full size and cost before pulling the rest.

## voice
Since: 0.2.0
Ask: How does your team write? Paste two to five real messages that got replies, or describe the style. Is there a template every message should follow, or two you want to test against each other? How do the people you reach talk (for tech founders, short and lowercase often works)?
Default: Short, plain and specific, per the write step, with no template.
Writes: `voice.md` (style and samples). Each template as its own file: `gtm/template-a.md`, `gtm/template-b.md` (or in an audience's folder), with `weight:` front matter when the split should not be even (see customizing.md, Audiences). Signatures are personal (the signature question).
Check: Draft one message for a real lead, following the outbound skill's `references/writing.md`, and ask what to change and whether they would reply to it themselves. Repeat until they would.

## sending
Since: 0.2.0
Scope: personal
Ask: Which account should your messages go out from, and through what? (a Gmail or Outlook connector, the browser, an email API like Resend, LinkedIn in the browser)
Default: Whichever connected mail tool fits. Draft or send is the team's setting.
Writes: `o11 ostack settings set sender_email <address>`, then personal files (`--me`): `gtm/send.md` with the account and tool for each channel, and `gtm/inbox.md` with how to read replies the same way. Offer the matching preset (`gmail`, `outlook-web`) to an owner or admin when one fits. Owners and admins also choose draft or send for the team: `o11 ostack settings set gtm.send_mode draft|send` (add `--me` only for someone who wants a different mode than the team; an audience can set its own `send_mode:` in its audience.md). The send mode alone decides draft or send: leave every mention of drafting or sending first (even "start in draft mode") out of the files' text, so a later switch cannot leave a stale file behind.
Check: Confirm the signed-in account, and create a test draft to the user themselves (never to a lead).

## follow-ups
Since: 0.2.0
Ask: If someone does not reply, how many follow-ups, how far apart, and on which channel? Should any audience follow up differently, or not at all?
Default: Three follow-ups after the first message, at 3, 4 and 7 days, in the same thread, for every audience.
Writes: `o11 ostack settings set gtm.follow_up_days <days before each follow-up>`, such as `2,5` for two follow-ups, or `off`. This also sets how many messages a lead can get. An audience that differs gets `days: 2, 5` (or `days: off`) at the top of its `gtm/audiences/<name>/follow-up.md`. Put anything else (channel, content, "skip weekends") in the text of `gtm/follow-up.md` or the audience's.
Check: Restate each audience's schedule as dates for a message sent today (`o11 ostack gtm audiences` shows them).

## crm
Since: 0.2.0
Ask: Besides where your leads live, should anything else hear about outreach (a Slack channel for replies, a second CRM, a dashboard)? And is a summary in chat after each run enough? Ask both in one question; the answer also settles the report question.
Default: Nothing else, and a summary in chat. Everything is already in the tool from the records question.
Writes: `gtm/after-record.md`, saying what to post or update, where, and when (see customizing.md). A place for run summaries goes in the report question's file.
Check: Post or create one clearly labeled test item, then remove it or ask the user to.

## meetings
Since: 0.2.0
Ask: When someone says yes, how should we book? A booking link, or should I offer times from your calendar and send the invite? How long are meetings, and in what timezone?
Default: Offer two or three times from the connected calendar; invite only after they agree.
Writes: `gtm/book.md`.
Check: List three real open slots from their calendar, or show the booking link.

## limits
Since: 0.2.0
Ask: How many new people per day at most, and how many messages per day in total? How many people at the same company? (Sending hours are the send-window question.)
Default: 20 new, 60 total, 1 per company. Start lower on a new mailbox.
Writes: `o11 ostack settings set gtm.new_per_day <n>`, `gtm.touches_per_day <n>`, `gtm.per_company <n>`.
Check: `o11 ostack settings show`.

## report
Since: 0.2.0
Ask: After each run, is a summary in chat enough, or should I also post it somewhere (Slack, email, a doc)? Usually answered with the crm question: then record it without asking again.
Default: A summary in chat.
Writes: `gtm/after-report.md` if they want it posted somewhere.
Check: Post a test summary there.

## send-window
Since: 0.4.0
Ask: When may cold messages go out? Days and hours in your timezone. Replies to people who wrote back go out any time.
Default: Weekdays 08:00-18:00. New workspaces start with this; workspaces from before 0.4 start with any time, so ask.
Writes: `o11 ostack settings set gtm.send_window "<days> HH:MM-HH:MM"`, such as `"weekdays 08:00-18:00"`, or `any`.
Check: Say whether the window is open right now (`o11 ostack context` shows `local_time` and `send_window`).

## signature
Since: 0.7.0
Scope: personal
Ask: How do you sign off? Your name, title and anything else under your messages.
Default: Your first name.
Writes: personal file `signature.md` (`--me`).
Check: Draft one message for a real lead with the team's voice and your signature, and ask what to change.
