# seo setup questions

Asked by the ostack-setup skill when the seo playbook is enabled; their ids are `seo/<id>`. Each `## <id>` section is one topic. `Since` is the release that added it, so after an upgrade only new topics are asked. Releases may add sections, but never rename or remove an id.

All of these are the team's: an owner or admin answers them once, and their files are team files (`o11 ostack files write <path>`). "Writes" names the file path. Read the site first (its home page, pricing, blog and sitemap with `o11 call o11.web.extract`) and suggest an answer to each question from what you found, so the user only confirms or corrects it.

## site
Since: 0.9.2
Ask: What is the site, who do you want to reach from search, which countries and languages do you serve, and which competitors show up when your buyers search?
Default: The domain the user names, its audience and market from the site itself, and competitors from `o11.google.domain.ranked-keywords` overlap and the search results for the product's category. Confirm them.
Writes: `seo/site.md` with sections for the site (domain, product, the one action a visitor should take), who search should bring, markets (countries and languages), and competitors (domains).
Check: Pull the top 10 keywords the site ranks for and the top 10 for one competitor, and show them side by side.

## publish
Since: 0.9.2
Ask: Where should new and refreshed posts go? A folder in your site's repo, your CMS (WordPress, Webflow, Ghost, Framer, Sanity, ...), or a doc for someone to post? What format do posts use, and does a person approve each one before it goes live?
Default: A pull request per post in the site's repo, in the folder and format the existing posts use, never merged by the agent. Without a repo: a draft in their CMS. Without either: a Google Doc or Markdown file per post.
Writes: `seo/publish.md`: where posts go and how to reach it (the repo path, the CMS and its MCP, connector or API, or the docs folder), the file format and front matter, image rules, internal link rules, who approves, and where the content plan lives (default `seo-plan.md` beside the posts).
Check: Publish a short test draft the same way (a draft PR, a CMS draft or a doc), show the user where it is, then delete it or close the PR.

## topics
Since: 0.9.2
Ask: What do you most want to rank for? Anything to write first, and any topics, claims or competitors to stay away from?
Default: Bottom of the funnel first: "<competitor> alternative", "<you> vs <competitor>", "best <category> for <audience>", and the problems the product solves, chosen from real volume and difficulty. Nothing about legal, medical or financial advice unless the team is qualified to give it.
Writes: `seo/topics.md`: priority topics, pieces to write first, and topics and words to avoid.
Check: Run the topics step once and show the first five pieces it would write, each with its search, volume, difficulty and why it comes first.

## write
Since: 0.9.2
Ask: How should posts read? Tone, length, how technical, the call to action each one ends on, and the claims and numbers you can back up. Any posts of yours or others you think read well?
Default: The team's `voice.md` when it exists. Plain and direct, as long as the search needs (usually 1,200 to 2,500 words), ending on the action in `seo/site.md`. Only claims the site or the user can back up.
Writes: `seo/write.md`.
Check: Write the opening and outline of the first piece from the topics check and ask whether it sounds like them.

## tracking
Since: 0.9.2
Ask: Is the site in Google Search Console, and can I read it through your wallet? Which searches should I watch every week, and where should the weekly report go (Slack, email, a doc, just here)?
Default: Search Console through the user's own connected account in the wallet. Watched searches: the topics file's priority searches and the ones the site already ranks 4 to 20 for. The report goes to chat and a dated file beside the content plan.
Writes: `seo/tracking.md`: the Search Console property, the searches to watch, the AI assistants to check, and where the report goes.
Check: Read last week's clicks and impressions from Search Console and the current position of three watched searches, and show them.

## schedule
Since: 0.9.2
Ask: Growth runs Monday and Thursday at 9:00 and tracking Monday at 8:00, in your timezone. Keep that, or change it? How many new pieces a week at most, and should refreshes count toward it?
Default: Those times; at most 2 new pieces and 2 refreshes a week.
Writes: The schedules (`o11 ostack schedule`), and `seo/topics.md` gains a `## Pace` section with the weekly limits.
Check: Show the schedules as they will run, in the user's timezone.
