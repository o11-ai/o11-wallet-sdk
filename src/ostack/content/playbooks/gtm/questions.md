# gtm setup questions

Asked by the ostack-setup skill when the gtm playbook is enabled; their ids are `gtm/<id>`. Each `## <id>` section is one topic. `Since` is the release that added it, so after an upgrade only new topics are asked. Releases may add sections, but never rename or remove an id.

Questions without a `Scope` line are the team's: an owner or admin answers them once, and their files are team files (`o11 ostack files write <path>`). `Scope: personal` questions are answered by every teammate for themselves, and their files are personal (`--me`). "Writes" names the file path. `Infer` says where the agent finds the answer itself before asking anyone; "Use the default" means never ask, and list it as an assumption in the setup preview. `Ask` is for when nothing can be inferred, or when the user wants to change the answer later.

## about
Since: 0.2.0
Ask: What do you do, who is it for, and what should outreach lead to? (a call, a demo, a reply, an intro) Any proof you can share: customers, results, notable users? Anything we must never claim?
Infer: The conversation and what you know about them, their repo (README, landing page, pricing), their website from the sign-in domain or workspace name (home, product, pricing, customers, case studies, blog), then the public web. The ask is the one in the user's own words or template when they gave one, else the site's main call to action (book a demo, start a trial), else a short call. Proof is only what you found; never invent it.
Default: None. This one is needed, but almost always inferred; ask only when there is no site, repo or company address to go on.
Writes: `company.md`, with sections for what you offer, who it is for, proof, the one ask, and never claim.
Check: Read it back in two sentences and ask whether it is right.

## who
Since: 0.2.0
Ask: Who exactly should we reach? Role, company type and size, location, and anything that rules someone out (existing customers, competitors, agencies, ...).
Infer: Who the site sells to (pricing tiers, customer logos, case studies, industry and integration pages), won deals in their CRM, their job posts, and their competitors' customers. Turn it into sharp, provable rules; mark a guess from thin evidence as guessed in the preview.
Default: Inferred from `company.md`, which is rarely sharp enough. Push for specifics.
Writes: `gtm/qualify.md` as provable rules and exclusions.
Check: Qualify two or three real leads from the user's list or the web against the rules in chat (do not add them to their tool) and show each verdict with its evidence. Ask about any borderline case you hit, such as a role or size close to the line, and add the answer to the file.

## records
Since: 0.6.0
Ask: Where do you keep your leads and outreach? (Attio, Lightfield, HubSpot, Airtable, a Google Sheet, nothing yet) Does anyone else on your team reach out from the same list, and how should you split who contacts whom?
Infer: The CRM, Airtable or Sheet tool connected to this agent (with several, the one with recent contacts) and the fields and statuses it already has. With none, use the default. Split by company for a small team.
Default: The tool they already use. With none connected: `leads.csv` here to start, moved to a shared Google Sheet once one is connected or a teammate joins. With no preference on the split, pick one that fits (by company for a small team).
Writes: `gtm/record.md`: the tool, how to reach it (its MCP, connector, API or the browser), which fields or columns hold what the record step lists, including `o11_audience`, `o11_template`, `o11_follow_up` and `o11_rank`, the company fields the companies step lists (`o11_company_status`, `o11_people_tried`, and how people link to their company), and where each message is logged (create missing ones once they agree), the status names they already use, and the rule for how work is split. Each person records their own share (such as "companies A-M") with `o11 ostack settings set lead_assignment "<share>"`.
Check: Create a test person with an `o11_audience`, set it to `sending`, then `contacted` with a logged test message, read both back, then delete them (or ask them to).

## audiences
Since: 0.8.0
Ask: Do you reach more than one kind of person, such as customers and providers, or investors next to sales? For each: who they are, what you offer them, and how messages to them should differ.
Infer: One audience, unless what they said or their site clearly serves two kinds of people (such as a marketplace's buyers and providers); then show both in the preview.
Default: One audience, default, in `gtm/`. Most teams start there and add one later.
Writes: For each extra audience, `gtm/audiences/<name>/` with only what differs from `gtm/`: usually `qualify.md`, `company.md` or `write.md`, and its templates. Settings that differ (send mode, limits, sending hours) go in the front matter of its `audience.md` (see customizing.md, Audiences). Each one gets its own outbound schedule in the schedule question.
Check: Run `o11 ostack gtm audiences` and read each audience back in one line, then qualify one real lead for each against its own rules in chat.

## sources
Since: 0.2.0
Ask: Where do good leads come from? A list or CSV, a CRM view, a data tool (Apollo, Clay, ...), or should I research the web? Any places to look or avoid?
Infer: A list or CSV in this folder or one they mentioned, a saved view in their CRM, or a data tool connected to this agent; otherwise web research.
Default: Web research, as described in the find step.
Writes: `gtm/find.md`. If they name a tool, include how to reach it.
Check: Find up to three real candidates and show them without adding them. For a file, show how many rows it has, how many are already in their tool, and a few that would be added.

## tam
Since: 0.5.0
Ask: Should I build a list of every company that fits (your TAM) and work through it, or find leads as we go? If a list: where should it live (a CSV here, a Google Sheet, your CRM, Clay), and how much may I spend on data per month?
Infer: Use the default. Never plan paid data without asking.
Default: Find leads as we go. With a list, use `tam.csv` here, with free sources first and no spending without asking.
Writes: `gtm/tam.md` with where the list lives, the source the tam step picked for their ICP, the budget, and a `## Progress` section.
Check: Pull a small sample from the chosen source, show the total and 10 random rows, and give the estimated full size and cost before pulling the rest.

## voice
Since: 0.2.0
Ask: How does your team write? Paste two to five real messages that got replies, or describe the style. Is there a template every message should follow, or two you want to test against each other? How do the people you reach talk (for tech founders, short and lowercase often works)?
Infer: Their sent mail when a mail tool is connected (messages that got replies show their style, sign-off and any template they reuse), then their posts and site copy. Coach any template you find as the outbound skill's `references/coaching.md` says.
Default: Short, plain and specific, per the write step, with no template.
Writes: `voice.md` (style and samples). Each template as its own file: `gtm/template-a.md`, `gtm/template-b.md` (or in an audience's folder), with `weight:` front matter when the split should not be even (see customizing.md, Audiences). Signatures are personal (the signature question).
Check: Draft one message for a real lead, following the outbound skill's `references/writing.md`, and ask what to change and whether they would reply to it themselves. Repeat until they would.

## sending
Since: 0.2.0
Scope: personal
Ask: Which account should your messages go out from, and through what? (a Gmail or Outlook connector, the browser, an email API like Resend, LinkedIn in the browser)
Infer: The connected mail tool whose account matches their sign-in address (or the only one connected). With none, say in one line what to connect. The team's send mode stays draft until the user says to send.
Default: Whichever connected mail tool fits. Draft or send is the team's setting.
Writes: `o11 ostack settings set sender_email <address>`, then personal files (`--me`): `gtm/send.md` with the account and tool for each channel, and `gtm/inbox.md` with how to read replies the same way. Offer the matching preset (`gmail`, `outlook-web`) to an owner or admin when one fits. Owners and admins also choose draft or send for the team: `o11 ostack settings set gtm.send_mode draft|send` (add `--me` only for someone who wants a different mode than the team; an audience can set its own `send_mode:` in its audience.md). The send mode alone decides draft or send: leave every mention of drafting or sending first (even "start in draft mode") out of the files' text, so a later switch cannot leave a stale file behind.
Check: Confirm the signed-in account, and create a test draft to the user themselves (never to a lead).

## follow-ups
Since: 0.2.0
Ask: If someone does not reply, how many follow-ups, how far apart, and on which channel? Should any audience follow up differently, or not at all?
Infer: Use the default.
Default: Three follow-ups after the first message, at 3, 4 and 7 days, in the same thread, for every audience.
Writes: `o11 ostack settings set gtm.follow_up_days <days before each follow-up>`, such as `2,5` for two follow-ups, or `off`. This also sets how many messages a lead can get. An audience that differs gets `days: 2, 5` (or `days: off`) at the top of its `gtm/audiences/<name>/follow-up.md`. Put anything else (channel, content, "skip weekends") in the text of `gtm/follow-up.md` or the audience's.
Check: Restate each audience's schedule as dates for a message sent today (`o11 ostack gtm audiences` shows them).

## crm
Since: 0.2.0
Ask: Besides where your leads live, should anything else hear about outreach (a Slack channel for replies, a second CRM, a dashboard)? And is a summary in chat after each run enough? Ask both in one question; the answer also settles the report question.
Infer: Use the default, unless they mentioned Slack or another tool to notify.
Default: Nothing else, and a summary in chat. Everything is already in the tool from the records question.
Writes: `gtm/after-record.md`, saying what to post or update, where, and when (see customizing.md). A place for run summaries goes in the report question's file.
Check: Post or create one clearly labeled test item, then remove it or ask the user to.

## meetings
Since: 0.2.0
Ask: When someone says yes, I offer two or three open times from the sender's calendar and send the invite once they pick one. How long are meetings, which video link (Google Meet, Zoom, a fixed room), and should anyone else always be invited? Only if they bring it up: a booking link instead. (Times use the workspace timezone; don't ask for it. Which calendar is each person's own question.)
Infer: Their calendar's recent meetings with people outside the company (usual length and video link); otherwise the default.
Default: Two or three open times, 30 minutes, the calendar's own video link, no booking link.
Writes: `gtm/book.md`, with only what differs from the default. Mention a booking link only when they asked for one.
Check: Restate it in one line, as the invite a lead would get.

## calendar
Since: 0.9.2
Scope: personal
Ask: Which calendar should your meetings go on? Usually the one for the address you send from, but it can be another account's or a shared calendar. Then settle how this agent reaches it on the computer that runs follow-ups: a connected calendar tool, an MCP, the browser, or anything else that works.
Infer: The calendar of the sending account, through the same connected tool.
Default: The calendar of your `sender_email`, through whichever route reaches it.
Writes: personal `gtm/book.md` (`--me`): the account, the calendar's name, how to reach it (the tool or MCP, or the browser and its URL), and anyone to add as a guest on every meeting.
Check: Through that same route, list three real open slots, then create a 15-minute test event tomorrow with only the user as a guest, read it back to confirm it sits on that calendar under that account, and delete it. If the account differs from `sender_email`, say so and ask whether that is intended. If any part fails, say what to connect or share; follow-ups hand meetings to the user until it passes.

## limits
Since: 0.2.0
Ask: How many new people per day at most, and how many messages per day in total? (Sending hours are the send-window question; how a company is worked is the companies question.)
Infer: Use the default. If no mailbox is connected yet, or it has sent little before, start at 10 new a day and say so.
Default: 20 new, 60 total. Start lower on a new mailbox.
Writes: `o11 ostack settings set gtm.new_per_day <n>`, `gtm.touches_per_day <n>`.
Check: `o11 ostack settings show`.

## companies
Since: 0.12.0
Ask: How should we work each company? Out of the box: two people at a time, best fit first; as soon as one person's follow-ups are used up, the next person there starts on the next outbound run; up to 20 people per company; a reply from anyone there pauses the rest. Change anything: how many at once, the most per company, which titles first, a wait between people, rules by company size or audience, or whether later messages mention earlier ones.
Infer: Use the default.
Default: Two at a time, up to 20 per company, best fit first, no wait.
Writes: `o11 ostack settings set gtm.per_company <n>` for how many at once (or `per_company:` in an audience's `audience.md`), and `gtm/companies.md` with everything else that differs from the default, in their words. If `o11 ostack settings show` has `per_company` 1 from before 0.12.0, ask whether to keep one at a time or move to two.
Check: Restate it as what happens at one real company from their list: who goes first and second, and who starts after the first person's follow-ups run out.

## report
Since: 0.2.0
Ask: After each run, is a summary in chat enough, or should I also post it somewhere (Slack, email, a doc)? Usually answered with the crm question: then record it without asking again.
Infer: Use the default, unless they mentioned where summaries should go.
Default: A summary in chat.
Writes: `gtm/after-report.md` if they want it posted somewhere.
Check: Post a test summary there.

## send-window
Since: 0.9.1
Ask: When may cold messages go out? Days and hours, in the workspace timezone (already set from this computer; don't ask for it). Replies to people who wrote back go out any time.
Infer: Use the default.
Default: Any time: messages go out the moment a run writes them. Ask only whether they want sending hours; most teams don't. If `o11 ostack settings show` has hours the team never chose (a wallet save before 0.9.1 stored weekdays 08:00-18:00), ask whether to keep them or set `any`.
Writes: `o11 ostack settings set gtm.send_window "<days> HH:MM-HH:MM"`, such as `"weekdays 08:00-18:00"`, or `any`.
Check: Say whether the window is open right now (`o11 ostack context --playbook gtm` shows `local_time` and `send_window`).

## send-at
Since: 0.9.1
Ask: First messages go out the moment outbound writes them. Is that right, or should they all land at one time on your sending days, such as 8:00 (outbound then writes them the evening before and schedules them)?
Infer: Use the default.
Default: Off: sent as the run writes them, with outbound on weekdays at 08:00.
Writes: nothing for the default (if `o11 ostack settings show` has a `send_at` time the user did not choose, `o11 ostack settings set gtm.send_at off`), or `o11 ostack settings set gtm.send_at HH:MM` for a fixed time. An audience that differs gets `send_at:` in its `audience.md` front matter.
Check: With a time, say when the next one would land (`o11 ostack context --playbook gtm` shows `next_send_at`) and move outbound to the evening before (`o11 ostack schedule set gtm/outbound --days sun-thu --at 20:00`). Without one, outbound can run whenever suits them.

## handoffs
Since: 0.9.0
Ask: Some replies are yours to answer: pricing, contracts, custom terms, complaints, or someone asking for a person. I draft a suggested reply, label the thread "o11/needs you", mark it in your CRM (with a task if it has them), and send you one short list each morning. What else should always come to you, or what can I answer myself? Should the daily list come by email, Slack or not at all, and when?
Infer: Use the default.
Default: The handoff step's list, emailed to you at 07:30.
Writes: `gtm/handoff.md` with what to add or remove from the list and, at its top, `digest: email|slack|off` and `digest_at: "HH:MM"` when they differ from the default.
Check: Run `o11 ostack context gtm/handoff` and read back what goes to them and when the list arrives.

## signature
Since: 0.7.0
Scope: personal
Ask: How do you sign off? Your name, title and anything else under your messages.
Infer: The sign-off in their recent sent mail; otherwise their first name.
Default: Your first name.
Writes: personal file `signature.md` (`--me`).
Check: Draft one message for a real lead with the team's voice and your signature, and ask what to change.
