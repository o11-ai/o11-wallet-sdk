# Changelog

`o11 ostack setup status` shows the sections newer than the version a person last reviewed, so the agent can say what changed. Keep each entry to what a user would notice.

## 0.13.1
- SEO pages pass hard checks before they ship. Every piece gets an intent lock first (the format the top results reward), opens with the answer in its first 40 words, and passes a banned-phrase check with 0 hits. Comparison pages carry a verdict up top, sourced facts about the competitor, where they win, pricing at 1, 5 and 25 seats with the date checked, switching steps and switching reasons from recent reviews.
- A new `proof` step keeps your facts, prices and first-hand proof in one place. When a price or fact changes, every page that uses it is updated in one change, and each growth run checks new commits for stale facts. Missing proof is marked and asked about, never invented.
- Searches share a page only when Google ranks the same pages for them. Free tools are built only where buyers pay for clicks and the results are tools.
- Audits sort fixes into Fatal, Revenue, Compounding and Fluff, and check that AI crawlers can read your prices, that unknown pages return 404, and that numbers agree across the page, FAQ and `llms.txt`.
- Growth adds internal links from posts that get traffic to the pages that earn money, and reports the counts before and after.
- Tracking asks AI assistants the same 25 to 50 buyer questions every week, gives each page they cite an action, and lists your competitors' new pages. Run `o11 ostack setup` to answer the new buyer questions topic.
- Search Console reads through your own Google connection in your o11 wallet, for performance and whether a page is indexed.

## 0.13.0
- Scheduled runs keep going when your laptop is closed. You don't need to do anything.
- When a run needs you signed in to a site (LinkedIn, X, Instagram, or your mailbox when no tool is connected), your agent sends you a link. Sign in there once and tell your agent you're done. Scheduled runs use that same browser, and you stay signed in after restarts.
- Setup checks your email, CRM and calendar on the computer that runs ostack while you're away. If a run there can't reach one, your agent tells you what to reconnect. Email and calendar connected only in Claude don't work there yet, so ostack keeps running on your own computer for those.
- You only ever talk to your own agent. Scheduled runs never wait on a question: when one needs you (a sign-in, an answer setup is missing, a choice only you can make), it notes it, skips that part and carries on, and your agent asks you the next time you talk.

## 0.12.0
- Every skill works the first time, with nothing set up. Ask for outbound, an SEO audit, a reel or social growth and the agent learns what it needs about your company (what you said, your repo, your website, the web and your connected tools), does the work, and saves what it learned without asking. When you correct something, it updates just that part and says so.
- Every playbook gives feedback without being asked: weak templates and replies for outbound, titles, topics and slipping pages for SEO, comments, bios and captions for social, hooks, length and endings for videos. It improves its own work and says so; your own text changes only after your yes.
- Search Console is always your own Google account, connected in your o11 wallet.
- Setup is one short conversation. Your agent learns what it can first (what you said, your repo, your website, the web and your connected CRM, mail and calendar), and its first full reply shows who it will reach and two real drafted messages. It asks only what it cannot find, uses sensible defaults for the rest, and saves everything, checks your tools and turns on the suggested schedules when you say go. Runs still draft until you choose to send.
- Your agent coaches your email template. Paste one and it kindly names what will cost replies, shows a rewrite, and asks whether to keep yours, use its version, or test both. A template it finds in your sent mail is tightened for the first emails automatically, and it says so.
- Outbound adds a short "How your messages are doing" note to the first run of each week: replies per template from your CRM, a winner once there is enough data, and one specific change to try when replies are low. It only suggests; nothing changes until you agree.
- Outbound works each company, not just one person there. It finds the people who fit at a company once, best fit first, and contacts two at a time. As soon as one person's follow-ups are used up with no reply, the next person there starts on the next outbound run, with no waiting period, up to 20 people per company. Emails for people further down are looked up only when their turn comes.
- A reply from anyone at a company pauses the rest there, a meeting stops all cold messages to it, and "we're not interested" for the company skips it. One person opting out affects only them; a referral goes to the front of the line.
- Change any of it in your own words with a `gtm/companies.md` file (or per audience): how many at once, the most per company, which titles first, a wait between people, rules by company size, or whether later emails mention earlier ones. `o11 ostack settings set gtm.per_company <n>` sets how many at once.
- New fields in your CRM or sheet: `o11_rank` and the status `queued` on people, `o11_company_status` and `o11_people_tried` on companies. Run `o11 ostack setup` to add them and answer the new companies question. Teams that saved 1 per company before keep it until they change it.

## 0.11.2
- Social growth ranks every post it reads as best, close or skip. Best posts get the follows, likes, comments and reposts first; once they are used up, the run keeps following and liking as many close posts as it can find (smaller accounts, neighboring topics, slightly older posts, good replies under strong posts) instead of waiting. Comments still go only where there is something specific to say, and the skip list and no-brands rule never loosen.

## 0.11.1
- SEO and Social are open to every team, no beta invite needed. Add one with `o11 ostack playbooks add seo` or `o11 ostack playbooks add social`.
- Social growth leaves LinkedIn off by default, since LinkedIn restricts accounts for automated activity most strictly. To keep it, add the line `LinkedIn: on` to your own `social/accounts.md`, or run `o11 ostack setup` and answer the new LinkedIn question.
- Social growth runs at your own risk: X, LinkedIn and Instagram can warn, restrict or ban accounts for automated activity, and o11 is not liable for any action a platform takes against your accounts. Every report ends with that notice. We recommend running it only after subscribing to each platform's paid plan (X Premium, LinkedIn Premium, Meta Verified), since paid accounts are less likely to be restricted.

## 0.11.0
- Make a presenter of yourself: your agent sends a secure link to record a talking video, a voice sample or photos (or takes a file you attach), saves it in your o11 wallet under Resources and makes each video on Captions. For other platforms it can also prepare a portrait and voice sample, resume their uploads and save one reusable o11 avatar reference. The twin workflow handles compatible provider setup and preserves each provider's consent and account requirements. A saved reference is reported separately from a trained clone.
- UGC videos have working defaults: a talking clip from one character image, a short voice clip and a script, with the route, price and request for each step. The agent works in stages and stops for your choice of reference, character and hooks. Every take is checked for pace, pauses, missing words and identity before you watch it. "Recreate this video" now asks what to keep: the structure, the edit style, the motion or everything but one element. Variants of a finished video reuse every accepted clip.
- Break a reference video down before remaking it: the new `ostack-video-teardown` skill and `scripts/teardown.mjs` measure shots, sound and words, and save a beat sheet (`reference.json`) and an edit style (`style.json`) in the video folder.
- Find what is trending: `launch-videos trending rank|import|list|comments|creator|measure|compare` and the `ostack-video-trending` skill rank saved TikTok, Instagram, YouTube Shorts and Pinterest results by views per day, save picks as local references, tag a video's comments, track a creator's outliers, and compare posts you published at 1, 6, 24 and 48 hours.
- New growth playbook. Ask your agent "how did <company> grow", "what content works for <brand>" or "break down <creator>'s growth": it works from public evidence, marks every finding seen or inferred, keeps paid lookups under a cap ($3 by default) and ends in plays with ready prompts. Existing folders turn it on with `o11 ostack playbooks add growth`, then `o11 ostack skills install`.
- Edit a video in a style: the new `ostack-video-edit` skill and one style file (`edit/style.json`) set captions, headers, text stacks, punch-ins, cutaways, transitions, shake and grade. Six presets ship, four measured from trending short videos (`native-sans`, `native-serif`, `karaoke-small`, `text-stack`). Open-licence fonts download on demand with `node scripts/fonts.mjs --style`.
- Hooks improve across rounds: `ostack-ugc` writes hooks from what is trending, scores them, makes variants that differ only in the first three seconds, and records how each did in `hooks/ledger.json` after you post them.
- Whole videos from parts: `ostack-ugc` assembles a talking hook, a product section with a voiceover in the same voice, and a close, with captions per shot and checks on every cut.
- Remakes are scored against their reference: `node scripts/match.mjs` puts the two side by side, scores eleven lines from camera position to text timing, and names the largest gap to fix next. A teardown now records where the camera is and where the subject sits, so the first frame can be matched before a clip is bought.
- Trending results keep each video's sound. Ranking lists the sounds several videos share, an imported reference links the sound's page, and a remake can be cut to the same sound and posted with it attached.
- UGC follows the same named steps as the other formats, with three new ones your team can customize: `trend`, `experiment` and `match`. The agent says up front what it needs and where it will stop for you, tries people, image models and video models side by side on the cheapest tier (`node scripts/match.mjs sheet`), and asks before spending more. Its choices are saved to the video's brief as format parts. A new setup question records a standing presenter, voice and preferred models.
- Growth teardown has a videos mode: the short videos a company posted at each stage of its growth, your own stage matched to one of them, and a handoff file with that stage's hooks, formats, sounds and reference links for the video skills.
- A remake is rebuilt from its teardown part by part: sound, hook, layers, captions and cuts each have a named technique. `node scripts/cutout.mjs` removes a presenter's background locally so they can sit over product footage, and trending results are sorted by kind of video and how well each can be remade.
- The video skills are organised as building blocks (find, tear down, score; character, talking clip, action clip, motion transfer, screen footage, cut-out; speech, voice transfer, same sound; shots, windows, captions, headers, look), each proven on a finished video. Motion transfer onto a different character now works. Layers can start and end on a shot, captions can lie over a presenter as references have them, and footage brightness is adjustable.
- Presenters look better by default: a locked `character.json` with chest-up framing, a calm first frame, a lived-in room and a prop, made on two image models; the speech is made first and the clip is lip-synced to it or follows it as a voice reference. Captions default to a boxed heavy style, a music bed sits under speech, and the delivered file is always the full 1080 by 1920 render.
- Trending pulls 50 to 150 videos, reads transcripts for the strongest and writes `trending/hooks.md` (first spoken line, when the product is named, who is on camera, sound), adds named competitors' ads, and lists presenter and voice candidates in words. A teardown now saves its measurements (cuts, shots, loudness, silences, speaking rate) in `reference.json`, and on-screen text carries its timing and position.
- A remake can use the original's sound: the trending skill names a route that returns a TikTok sound's audio file, plus routes for trending sounds and videos that use a sound. Characters can be made on Gemini 3 Pro Image, word timings import from any speech result, and a teardown can start from the free video link a trending search already returns.
- Create UGC videos from a brief or remake an authorized reference with `launch-videos/ugc`. The generated project saves quotes, spending limits, invocation receipts and downloaded clips so interrupted work can resume. Edit shots and word captions, then render locally without paying to regenerate unchanged clips.
- New skill folders are not added by the automatic refresh: run `o11 ostack skills install` once after updating.

## 0.10.1
- Launch videos: a new guide for narrated films with no footage (scenes built from your product's real components over your brand's gradients), with how to open on your logo, give every scene its own look, keep text readable and land each element on the word that names it.
- Launch videos follow your music: the agent splits a song into its instrumental and vocals through your o11 wallet, edits on the song's beat, and lands its biggest moment on the film's biggest cut. Your song's vocals come back over the end card.
- Launch videos are mixed to −14 LUFS, use sound effects cued to the picture (pops, ticks, typing, chimes, whooshes), show real logos in their own colours, and use no text shadows.
- Narration: every line is checked by transcription and generated again when a word is unclear; names are spelled the way they are said.
- Every cut you are shown gets its own version number, with a web cut for posting.

## 0.10.0
- Social growth (beta) no longer stops when good posts run out: it widens the search (fresh posts, replies under strong posts, the people you followed, related terms) and checks back for new posts until every daily target is met, a platform shows a warning, or the day ends (23:00 your time; change it in `social/limits.md`). It still stays under the hourly limits and never posts a weak comment to reach a number. The report lists any related terms worth adding to your niche.
- Use ostack without the o11 CLI: in a cloud chat (Claude, ChatGPT and others) with the o11 MCP connected, ask for outbound or setup and the agent reads the skills and your team's setup through o11's ostack tools. Nothing to install, and the skills there are always the current ones.
- Every playbook you can use is installed and turned on; setup asks only which one to set up now.
- Your schedules live in o11, so they are the same on every computer and in cloud chats. Your own `custom.local/` files can live there too. Run `o11 ostack setup import` once to upload both (it never overwrites what you already have, and keeps a copy of the moved files in `.ostack/uploaded-local/`). Scheduled tasks you already created keep working.

## 0.9.3
- Content calendar (social beta): plan posts in your own Google Sheet, Notion database or calendar, one row per post with a date and a plain prompt. Every night at 12:01 your agent makes what is due in the next three days: the videos (uploaded to o11 in every shape the platforms need) and a caption for each platform, then writes the links and drafts back to the row and marks it ready for review. Nothing is published. Run `o11 ostack setup` to connect your calendar, then schedule `social/calendar`.
- Every film in the launch videos library has its own link: open a film and use Copy link, or copy a tile's address. Paste it as a calendar row's reference, or anywhere a video to follow is wanted.
- `o11 ostack launch-videos` commands take a video's o11 link in place of its id, and a film's link in place of its slug.
- `o11 ostack launch-videos download <link>` saves a library film or a cut of one of your videos (`--version`, `--aspect 9:16` or `all`), so a new video can follow one you already made.

## 0.9.2
- Meetings go on the calendar you choose: setup asks each person which calendar (usually the one you send from, or another account's or a shared one) and how the agent reaches it (a connector, an MCP, the browser), then proves it by creating and deleting a test event. Run `o11 ostack setup` to answer it; until it passes, meeting replies come to you instead of being booked.
- No booking link unless you ask for one: replies offer two or three open times from your calendar. Once the lead picks one, they get the invite (with your video link), and a one-line confirmation in the thread.

## 0.9.1
- Messages go out the moment a run writes them, at any hour: first messages are no longer scheduled for 8:00 the next morning, and there are no sending hours unless you set them (`o11 ostack settings set gtm.send_window "weekdays 08:00-18:00"`). Replies already went out right away and still do. If your team saved settings in the wallet before 0.9.1, it may hold weekdays 08:00-18:00 and an 8:00 `send_at` without anyone choosing them; setup review asks. To have them all land at one time, set it: `o11 ostack settings set gtm.send_at 08:00` (or per audience in `audience.md`), and run outbound the evening before. The suggested outbound schedule is back to 8:00 on weekdays; if yours runs at 8pm, move it (`o11 ostack schedule set gtm/outbound --days weekdays --at 08:00`).
- Every scheduled run starts with `/goal`, so your agent keeps working until the run has recorded its end and written its report, instead of stopping after its first turn. Recreate your scheduled tasks to get it: `o11 ostack schedule spec <workflow> --host claude|codex` (cron: `o11 ostack schedule cron install`). Codex needs its goals feature on.
- Outbound and follow-ups run at the highest reasoning effort: Claude Code reads it from the skill, Codex runs at Max, or Extra high where the model does not offer Max: cron runs pass `--effort max` (Claude) or `model_reasoning_effort=max` (Codex, `xhigh` when Codex's model list shows no Max), and the Codex automation spec asks for Max.

## 0.9.0
- First messages are scheduled: outbound writes them the evening before and schedules each one to land at `send_at` (8:00 by default) on your sending days. Set it with `o11 ostack settings set gtm.send_at 09:00`, per audience in `audience.md`, or `off` to send as the run goes. The suggested outbound schedule is now 8pm Sunday to Thursday; if yours runs in the morning, move it to the evening before (`o11 ostack schedule set gtm/outbound --days sun-thu --at 20:00`). Gmail has no schedule-send through its API, so there the message waits as a draft and the next follow-ups run after `send_at` sends it.
- Replies that need you: pricing, contracts, custom terms, complaints and anyone asking for a person get a suggested draft in the thread, an `o11/needs you` label, status `needs you` in your CRM (with a task where your CRM has them), and nothing more is sent to them until you act. One short list arrives in your inbox each morning (or Slack, or off). Change what comes to you and when in `gtm/handoff.md`, or ask your agent to "go through my handoffs".
- Your CRM gains two statuses (`scheduled`, `needs you`) and two fields (`scheduled_for`, `handoff_reason`); setup review offers to add them.
- Launch videos live in o11, and your agent does the work: open a film on the Launch videos page and copy its prompt, or just ask your agent for a launch video and it sends you a link to pick a template (`o11 ostack launch-videos video <id> --wait 300` waits for the pick). The agent names the video, fills its brief with `o11 ostack launch-videos update`, and uploads each finished cut as a version with `o11 ostack launch-videos upload`, with every shape it rendered (16:9, 9:16, 4:5, 1:1), so your team watches and downloads every version in o11. `--part <name>=<text>` adds a brief part one kind of video needs. `o11 ostack launch-videos templates --search <text>` finds a template: every one is a real launch film the agent studies and matches. Uploads are kept at 1080p at most.
- Ask your agent for a video and it first says what it needs from you (the clips, or your product's URL) and what happens next, then starts right away: no setup interview first, and it asks for brand details only when a step needs them.
- The launch-videos brand kit holds only what is true for every video: one video's audience, takeaway, screens, length and budget go in its brief. When the agent works in a repo with a `design.md`, brand guide or theme file, it adds the colors, fonts and style rules to `launch-videos/brand.md` (owners and admins) and tells you what it added.

## 0.8.2
- New suggested gtm schedules: outbound at 08:00 on weekdays, and follow-ups from 06:00 to midnight, every 30 minutes on weekdays and every hour on weekends. Schedules you already turned on stay as they are.
- A schedule can differ by day: `o11 ostack schedule set <workflow> --days weekends ...` changes only those days, and `schedule off <workflow> --days weekends` stops them. Claude Desktop and Codex get one task per rule.

## 0.8.1
- Find, qualify and research go through o11 routes. One call picks the provider, tries the next one on a miss and bills only the calls it made, so the playbook no longer names providers. Find uses `o11.people.search` and `o11.leads.from_topic`; qualify sorts a batch with `o11.rows` before the per-company checks; research reads the profile, posts and company news. A lead-data tool is used only where your files name it.

## 0.8.0
- New names: modules are **playbooks**, notes are **files**, packs are **presets** (`o11 ostack playbooks`, `files`, `presets`; the old commands still work). Settings `gtm.mode`, `mailbox` and `split` are now `gtm.send_mode`, `sender_email` and `lead_assignment`; the old names still work. Your offer now lives in `company.md` (`about.md` keeps working).
- Audiences: each kind of person you reach, such as customers and providers, is a folder of files under your playbook. `gtm/` is the default audience and `gtm/audiences/<name>/` any other. 0.7's `campaigns/` folders keep working; the wallet moves them to `gtm/audiences/` once. `o11 ostack gtm audiences` lists them, and `--audience` replaces `--campaign`.
- Templates: each audience can hold several `template-*.md` files. Two or more in use is an A/B test, split evenly (or by a file's `weight:`). `active: false` at the top of a template pauses it and keeps its results; the wallet's Templates page has a switch for it. Every save keeps a version id, and each CRM record stores the one it got as `o11_template`, so any agent can open the exact text with `o11 ostack files show --version <id>`.
- Tracking stays in your CRM: each record also keeps `o11_audience` and `o11_follow_up`, and each message gets a log entry there. Runs report sent, replied and meetings per template, so the wallet's Ostack page compares templates without holding any lead data.
- Follow-ups are per audience: an audience's `follow-up.md` can set `days: 2, 5` or `days: off`, and its `audience.md` its own send mode, limits and sending hours. One follow-ups run still covers every audience.
- Outbound can be scheduled per audience: `o11 ostack schedule set gtm/outbound --audience customers --at 09:00`.
- New playbook: **launch-videos** (`o11 ostack playbooks add launch-videos`). Three workflows, `irl` for launch films from filmed clips, `reel` for vertical shorts from one selfie clip, and `product-demo` for your real product, made in a folder on your computer from a renderer kit (`o11 ostack launch-videos new <name> --format irl|reel|product-demo`). Every cut passes jitter, layout, frame and loudness checks before you see it; voice, transcription and music come from your wallet, quoted first.

## 0.7.0
- ostack is part of the o11 CLI: every command is now `o11 ostack ...`, and `o11 update` updates ostack and the skills it installed. Install the skills with `o11 ostack skills install`. Everyone signs in with `o11 login`.
- Teams: notes and settings live in your o11 workspace, shared by everyone. Owners and admins answer the team questions once; teammates only add their own mailbox, signature and schedule. Add `--me` to any note or setting to change it just for you.
- A note that changed since you read it is never overwritten: writes name the version they read.
- The wallet's Ostack page (in the account menu) shows how to install it, how the team configured it, the skills, and every run. Members and invites stay in the workspace's usual team settings.
- Folders set up before teams keep working: `o11 ostack setup import` copies their notes, settings and answers to the team. `homepage-check` and `export-ledger` are now `o11 ostack gtm tam check` and `o11 ostack gtm ledger export`.

## 0.6.0
- Your own tool is the record: people, messages, replies and opt-outs live in your CRM, Airtable, Sheet or CSV, not in an ostack database. Teammates on other computers share it, so nobody is contacted twice. Setup asks where it is and how your team splits the work.
- Every message follows a simple routine in that tool: mark the person `sending`, send, record the message ID. Anything unclear is checked in the Sent folder, never resent.
- Removed the ledger commands (`ostack gtm due`, `leads`, `reserve`, `receipt`, `observe`, `defer`, `suppress`, `check`, `status`). The update review offers to move your old ledger's history into your tool.

## 0.5.0
- TAM: say "build our TAM" to get a list of every company that might fit, from registries, directories, maps, company databases or web search, saved where you choose (`tam.csv` by default). Find works through it, and qualify re-checks each company before anyone there is contacted.

## 0.4.0
- Modules: everything outreach-related is now the **gtm** module. Its step notes belong in `custom/gtm/` (old ones in `custom/` keep working; `ostack setup tidy` moves them), its settings are `gtm.*`, and its ledger is `.ostack/gtm.db` (renamed automatically).
- Schedules: workflows can run on their own in your timezone, from Claude Desktop, Codex or cron (`ostack schedule list`). Say "schedule my workflows".
- Sending hours: cold messages wait for `gtm.send_window` (new workspaces: weekdays 08:00-18:00). Upgraded workspaces start with no window; setup asks.
- Runs of the same workflow never overlap.
- Skills renamed `ostack-outbound` and `ostack-follow-ups`. Commands such as `ostack due` are now `ostack gtm due`; the old ones still work.

## 0.3.0
- Follow-up timing is a setting (`follow_up_days`), unknown flags are refused, imports can be previewed with `--dry-run`, and unfilled template slots are rejected.
