# social setup questions

Asked by the ostack-setup skill when the social playbook is enabled; their ids are `social/<id>`. Each `## <id>` section is one topic. `Since` is the release that added it, so after an upgrade only new topics are asked. Releases may add sections, but never rename or remove an id.

Questions without a `Scope` line are the team's: an owner or admin answers them once, and their files are team files (`o11 ostack files write <path>`). `Scope: personal` questions are answered by every teammate for themselves, and their files are personal (`--me`). "Writes" names the file path.

`Infer` says where the agent finds the answer itself before asking anyone (the ostack-setup skill's `references/first-run.md`); "Use the default" means never ask, and list it as an assumption. `Ask` is for when nothing can be inferred, or when someone wants to change the answer later.

## niche
Since: 0.9.2
Ask: Who do you want to reach on social? Their roles, the topics they post about, and what to skip. Any accounts whose audience you want?
Infer: The buyers in `company.md` and who the site sells to: search terms per platform from their customers' roles and the topics those people post about, and accounts whose audience they want from competitors' and customers' founders.
Default: The buyers in `company.md`. Suggest search terms per platform (X searches, LinkedIn content searches, Instagram hashtags) from it and confirm them. Always skip ads, engagement bait, politics, tragedy, recruiting posts and bots.
Writes: `social/niche.md` with who to reach, search terms per platform, how fresh a post must be per platform, and what to skip.
Check: Search each platform once with the terms and show five posts you would act on and two you would skip, with why.

## comments
Since: 0.9.2
Ask: How should comments sound? Length, case, punctuation, how casual. Words and openers you never use. Is it ever okay to mention what you sell? (The default is never.)
Infer: Their own recent public comments for length, case and tone; otherwise the default. Never pitch.
Default: One line under 20 words, specific to the post, no hashtags, no pitching, none of the stock phrases in the skill's comments reference.
Writes: `social/comments.md`.
Check: Draft comments for three of the posts from the niche check and ask whether they sound right. Save the ones they like as examples in their voice file (next question).

## limits
Since: 0.9.2
Ask: How much per day on each platform? Follows, likes, comments, and reposts or quotes on X. Any platform to leave out? When should the day's run wrap up?
Infer: Use the default; start at the low end for an account that has been quiet.
Default: The ranges in the skill's pacing reference: X up to 350 follows, 350 likes and 30 comments a day; LinkedIn (only for people who turn it on) up to 50 follows, 80 likes and 20 comments; Instagram up to 100 follows, 140 likes and 10 comments; hourly ceilings as listed there. New or small accounts start at half for the first two weeks. The day ends at 23:00 their time.
Writes: `social/limits.md` with daily ranges and hourly ceilings per platform, and when the day ends.
Check: Read the table back and say roughly how long a full day takes at that pace.

## accounts
Since: 0.9.2
Scope: personal
Ask: Which of your accounts should this grow? Your X and Instagram profile links, and, on their own computer, which browser you are signed in to them in (an o11 sandbox has one). Before asking, show the "Your own risk" notice from the ostack-social-growth skill word for word, and ask whether each account has its paid plan (X Premium, Meta Verified for Instagram); recommend subscribing before the first run.
Infer: The X and Instagram links in their site's footer or about page, and their own profiles found by name. The "Your own risk" notice and the paid-plan question still come first and need the person's own yes: never infer those.
Default: None. Each person names their own. LinkedIn stays off (see the linkedin question).
Writes: `social/accounts.md` (personal): one line per platform with the profile URL, plus the link to that platform's own list of your recent comments.
Check: Open each profile in the browser and confirm the signed-in account matches. Never type a password; if one is signed out, ask the person to sign in. In their o11 sandbox, send them the one-use sign-in link the ostack-setup skill describes and check through its `browser` MCP.

## linkedin
Since: 0.11.1
Scope: personal
Ask: LinkedIn is off by default: it restricts accounts for automated activity more strictly than X or Instagram. Show the "Your own risk" notice from the ostack-social-growth skill word for word, then ask: do you want growth to work your own LinkedIn account anyway, at your own risk?
Infer: Off. Never infer a yes: only the person can turn it on, after the notice.
Default: Off. Turn it on only when the person says yes after reading the notice; recommend LinkedIn Premium first.
Writes: On yes, add `LinkedIn: on` and their LinkedIn profile and comments links to `social/accounts.md` (personal). On no, remove any `LinkedIn: on` line.
Check: Read back which platforms the next run will work.

## voice
Since: 0.9.2
Scope: personal
Ask: Paste a few comments or posts of yours that sound like you, or let me read your recent comments on each platform.
Infer: Their last 20 public comments on each platform; pick five that show their voice.
Default: Read the person's last 20 comments on each platform and pick five that show their voice; confirm them.
Writes: `social/voice.md` (personal) with the examples and anything that makes their voice theirs.
Check: Draft two comments in their voice and ask whether they would post them.

## schedule
Since: 0.9.2
Scope: personal
Ask: Growth runs every day at 11:00 in your timezone and takes a few hours at a slow pace. Keep it, or change the time or days? On their own computer, it has to stay awake with the browser open; an o11 sandbox always is.
Infer: Use the default.
Default: Daily at 11:00. Avoid times another ostack workflow uses the same LinkedIn account.
Writes: The schedule (`o11 ostack schedule`), created paused until the person confirms their accounts are signed in.
Check: Show the schedule as it will run, and turn it on when they say so.

## calendar
Since: 0.9.3
Ask: Where do you plan your posts? (A Google Sheet, a Notion database, Airtable, a calendar, nothing yet.) Which columns hold the date, the platforms, the prompt, the reference video and the material, and what do you call each status? How many days ahead should posts be ready (the default is three)?
Infer: A content calendar connected to this agent (a Sheet, Notion database or Airtable with dated rows); otherwise the default new Sheet.
Default: The tool they already plan in; with none, a new Google Sheet with the default columns in the calendar step (Date, Platforms, Prompt, Reference, Material, Status, Videos, one column per platform, Agent note). Three days ahead.
Writes: `social/calendar.md`: the tool and how to reach it (its connector, MCP, API or the browser), which column or property holds what, the status names, and the lead days. Create missing columns once they agree.
Check: Read the next five rows back as the run would see them, mark which would be due tonight, then write and clear a test note on one row.

## captions
Since: 0.9.3
Ask: How should captions read on each platform you post to? Length, tone, hashtags, links, words you never use, and anything to draft every time (a first comment, alt text, a thread). Paste a few posts you liked if you have them.
Infer: Their recent posts on each platform for length, tone and hashtags; otherwise the default.
Default: The captions reference in the content calendar skill: one punchy line on X, a short story with one next step on LinkedIn, a hook, call to action and a few hashtags on Instagram.
Writes: `social/captions.md` with the rules per platform, the extras to always draft, and their example posts.
Check: Draft captions for one real upcoming row on every platform it names and ask whether they would post them.

## videos
Since: 0.9.3
Ask: When a post goes to several platforms, should it be one video in each shape or a separate video per platform? A film to follow when a row names none? And how much may one night's run spend on narration, music and sound?
Infer: Use the default. Paid generation waits for a spending cap they set themselves.
Default: One video, rendered in each shape the platforms need. No default film: the run picks the closest library film and says which. No paid calls until they set a nightly cap.
Writes: `social/videos.md` with the default video plan, the default reference film link, and the nightly spending cap.
Check: Plan two real upcoming rows (videos, shapes, reference) and read the plans back without making them.

## calendar-schedule
Since: 0.9.3
Scope: personal
Ask: The calendar runs every night at 12:01 and makes what is due in the next few days. Should it run on this computer? It has to be on and awake then, with the browser signed in to your product for demos. One person on the team is enough.
Infer: Use the default, on the computer of the person setting it up.
Default: Daily at 00:01, only on the computer of the person who owns the calendar. Runs on other computers skip rows already claimed.
Writes: The schedule (`o11 ostack schedule`), or nothing when they decline.
Check: Show the schedule as it will run, and turn it on when they say so.
