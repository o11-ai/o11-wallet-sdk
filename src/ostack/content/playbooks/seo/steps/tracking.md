---
summary: Measure what moved since the last run, with the same questions and method every week.
used_by: [tracking, growth]
changed: 0.13.1
change: "AI answers are checked with a fixed set of 25 to 50 buyer questions across five stages. Every cited page gets an action, sorted by how often it is cited. A weekly diff of competitor sitemaps. Search Console reads through the user's own connection, with a stated fallback."
---
Read, for the last 7 complete days against the 7 before and the same week four weeks ago:
- **Search Console** (`google-search-console.performance` through the user's own connection, as `research` says):
  clicks, impressions, average position and CTR for the site, the top pages and the top searches; whether published
  pieces and key pages are indexed (`google-search-console.url_inspection`); any manual action or security issue.
  Without a connection, say so first with where to connect it, leave those numbers out (never estimate them), and do
  the rest.
- **Watched searches** (`seo/tracking.md`, default: the topics file's priorities and the site's 4 to 20 searches): the
  position and ranking URL of each from a live results page in the team's market.
- **AI answers:** the buyer questions below, asked to each assistant in `seo/tracking.md` (default Google's AI
  Overview, ChatGPT, Perplexity and Gemini).
- **Published pieces:** for each piece in the content plan published in the last 90 days, whether it is indexed, its
  position and its clicks.
- **Authority:** referring domains, gained and lost, against last week.
- **Competitors' new pages:** the sitemap diff below.

**Buyer questions.** A fixed set of 25 to 50 questions in `seo/tracking.md` (`## Buyer questions`), written the way a
buyer types them to an assistant, spread across five stages:
1. **Unaware:** they describe a symptom ("why does our month-end close take two weeks").
2. **Problem aware:** they name the problem and look for ways to fix it.
3. **Solution aware:** they look for the category ("best expense software for startups").
4. **Product aware:** they compare named products ("<you> vs <competitor>", "<competitor> alternatives").
5. **Most aware:** they check the team's own product (pricing, setup, reviews, limits).

Ask the same questions, worded the same way, to the same assistants every week, so weeks compare. Each question has a
fixed id; a new question gets a new id and the date added, and one that no longer fits is retired with a date, never
reworded or renumbered. Any change is noted in the report. Quote the whole set (questions times assistants) before
asking; when the team's limit cannot cover it, keep every question and drop an assistant, and say which.

For each answer, record whether the team is named and where, which competitors are named, every page it cites, and
anything it says about the team that is wrong. A wrong fact means the page that owns it is unclear: name that page.

**Cited pages.** List every page the answers cite, sorted by how many questions cite it (3 or more first: one page cited
on 6 questions is worth more than six pages cited once). Give each one an action for growth:
- **A list or roundup page:** pitch to be listed (`links`).
- **A Reddit or forum thread:** draft a specific, disclosed reply for the team to post; never post it.
- **A YouTube video:** pitch the creator (`o11.video.transcript` finds the moment worth pitching).
- **A competitor's page:** plan a comparison or alternatives page (`topics`).
- **The team's own page:** keep its facts current (`proof`).
- **Another product's docs or integrations page:** plan an integration page or ask to be listed there.

**Competitor sitemaps.** Each week, read each competitor's sitemap (the `Sitemap:` lines in their robots.txt, fetched
directly, which costs nothing; or `search1api#sitemap`). Save the URL list beside the reports
(`seo-report/sitemaps/<competitor>-<date>.txt`) and compare it with last week's: new pages, removed pages, and the
search each new page targets. Suggest a page only where the team can make a better one.

Keep the numbers as dated rows where `seo/tracking.md` says (default `seo-report/<date>.md` beside the content plan) so the
next run can compare. Explain each real change with evidence (a page published or refreshed, a competitor's new page, a
results page that changed shape) and say plainly when the cause is unknown.
