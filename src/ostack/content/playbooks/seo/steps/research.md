---
summary: Where search data comes from, how to check it, and how to read it.
used_by: [audit, growth, tracking]
changed: 0.13.1
change: "Named routes for AI answers (ChatGPT, Gemini, AI Mode, AI Overviews, Perplexity, LLM mentions), Bing and Search Console. A sanity check on every results page. Raw pulls are saved with dates and reused for 7 days."
---
Every number comes from a real call made in this run, a saved pull under 7 days old, or a dated report in the team's
files, never from memory. Use the best and freshest data the wallet offers: when two sources disagree, say so and keep
both; never average them.

Data the wallet routes for you (o11 picks a provider and names it in the result):

```bash
o11 call o11.google.domain.ranked-keywords --input '{"target":"acme.com","country":"us","limit":200}'
o11 call o11.google.keywords.volume --input '{"keywords":["expense software","ramp alternative"],"country":"us"}'
o11 call o11.google.keywords.ideas --input '{"keyword":"month-end close","country":"us"}'
o11 call o11.google.keywords.trends --input '{"keyword":"month-end close","country":"US"}'
o11 call o11.google.serp.organic --input '{"q":"ramp alternative","country":"us","ai_overview":true}'
o11 call o11.bing.serp.organic --input '{"q":"ramp alternative","country":"us"}'
o11 call o11.web.backlinks.summary --input '{"target":"acme.com"}'
o11 call o11.web.backlinks.list --input '{"target":"acme.com","limit":10}'
o11 call o11.web.url.metrics --input '{"target":"acme.com"}'
o11 call o11.ai-search.perplexity.answer --input '{"prompt":"What is the best expense software for a 50 person startup?"}'
o11 call o11.web.extract --input '{"url":"https://acme.com/blog/close-checklist"}'
o11 call o11.video.transcript --input '{"url":"https://www.youtube.com/watch?v=<id>"}'
```

AI answers and other data by exact tool id. Run `o11 inspect <id>` first for its inputs and price:
- **ChatGPT:** `dataforseo#ai/chatgpt-search`, or `cloro#chatgpt/ask` (the same scrape as `cloro.ai-search.chatgpt.scrape`).
- **Gemini:** `cloro#gemini/ask` (the same as `cloro.ai-search.gemini.scrape`), or `dataforseo#ai/gemini-search`.
- **Google AI Mode:** `crawl4ai.google.serp.ai_mode`, or `cloro#google/ai-mode` (the same as `cloro.google.serp.ai_mode`).
- **Google AI Overview:** `o11.google.serp.organic` with `"ai_overview": true` returns its text and sources when Google
  showed one. `serpapi#google/ai-overview` only works with a page token from a Google search made in the last minute.
- **LLM mentions** (which brands, domains and pages AI answers name for a search): the
  `dataforseo.x.ai-optimization-llm-mentions-*` tools, such as `-search-mentions-live`, `-target-metrics-live`,
  `-top-mentioned-domains-live` and `-top-mentioned-pages-live`. About $0.10 a call.
- **Fetch a page as a crawler, without JavaScript:** `litescrape.web.fetch.post` with `user_agent`, `"engine":"curl"`
  and `"respond_with":"html"`.
- **A site's URLs:** `o11.web.map`, or `search1api#sitemap`.
- **Full backlink lists** (`o11.web.backlinks.list` returns 10 rows at most): `dataforseo#backlinks/backlinks` or
  `ahrefs#site-explorer/all-backlinks`, for the dofollow, placement and page traffic fields `links` filters on.

For anything else, find the tool by what it does, inspect it, and call it: `o11 discover "domain organic competitors"`,
then `o11 inspect <id>`. Search by capability, never by provider name, and prefer the result with the best usable rate.
What to look for that way: organic competitors of a domain, a domain's top pages, keyword difficulty and search intent,
referring domains, backlink gaps between domains, Copilot answers, page speed and Core Web Vitals, and an on-page audit
of a URL. Flag any result you used that was bad (`o11 rate <id> not-useful --issue empty`). Never make up a tool id.

**Search Console** is the site's own truth for clicks, impressions, average position and which pages Google indexed. It
reads only through the user's own Google account, connected in their o11 wallet, and the calls are free:
`google-search-console.performance` (clicks, impressions, CTR and position by page, search, country or date),
`google-search-console.url_inspection` (whether Google indexed a URL and why not; about 2,000 a day per site) and
`google-search-console.sitemaps`. Find the connection with `o11 connections google-search-console`, then call with
`--credential-mode customer --connection <id>`. Without a connection, say so in one line with where to connect it, and
carry on with third-party data, labeled as estimates. Third-party volumes and positions are estimates; when Search
Console and an estimate disagree about the team's own site, Search Console wins.

**Check every results page before using it.** A results page can come back looking complete while it is wrong:
- On a brand search, the brand's own domain must be in the top 10. When it is missing, retry once, then use another
  tool for the same search, and say which one you used.
- On a buying search, at least 2 of the top 3 titles must match what was searched.
- Unwrap redirect links (`google.com/goto?...`, `google.com/url?q=...`) to the real URL before comparing or counting.
A results page that fails twice is left out and named in the report; never cluster or lock a page format on it.

**Save raw pulls.** Save each paid result beside the content plan (default `seo-data/<date>/<tool>-<search>.json`, never
in a folder the site publishes) with the tool id, input, date and cost. Reuse a saved pull of the same tool and input
for up to 7 days instead of paying again; after that, pull it again. Tracking's weekly numbers are always pulled fresh.

Reading the data:
- **Volume** is monthly searches in the market from `seo/site.md`. Low volume with clear buying intent beats high volume
  that only reads.
- **Difficulty** (0 to 100): a young site (few referring domains) wins under about 30 first; aim higher as authority grows.
  Check by looking at who ranks: if the top 10 holds pages from sites as small as this one, it is winnable.
- **Intent** comes from the results page, not the words: read the top 10 for the search and write the kind of page
  Google already rewards (a comparison, a list, a guide, a tool, a product page). `topics` locks it before a draft.
- **AI answers**: for the team's priority searches, ask the assistants the question a buyer would and note whether the
  team, its competitors and which sources are named. Pages that AI answers cite are worth studying and earning links from.

Every paid call is quoted first. Keep each run to the work it needs; never skip data that would change the decision.
