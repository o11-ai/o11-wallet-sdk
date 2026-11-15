---
summary: Where search data comes from and how to read it.
used_by: [audit, growth, tracking]
changed: 0.9.2
change: First release.
---
Every number comes from a real call made in this run or a dated report in the team's files, never from memory. Use the
best and freshest data the wallet offers: when two sources disagree, say so and keep both; never average them.

Data the wallet routes for you (o11 picks a provider and names it in the result):

```bash
o11 call o11.google.domain.ranked-keywords --input '{"target":"acme.com","country":"us","limit":200}'
o11 call o11.google.keywords.volume --input '{"keywords":["expense software","ramp alternative"],"country":"us"}'
o11 call o11.google.keywords.ideas --input '{"keyword":"month-end close","country":"us"}'
o11 call o11.google.keywords.trends --input '{"keyword":"month-end close","country":"US"}'
o11 call o11.google.serp.organic --input '{"q":"ramp alternative","country":"us"}'
o11 call o11.web.backlinks.summary --input '{"target":"acme.com"}'
o11 call o11.web.url.metrics --input '{"target":"acme.com"}'
o11 call o11.ai-search.perplexity.answer --input '{"prompt":"What is the best expense software for a 50 person startup?"}'
o11 call o11.web.extract --input '{"url":"https://acme.com/blog/close-checklist"}'
```

For anything else, find the tool by what it does, inspect it, and call it: `o11 discover "domain organic competitors"`,
then `o11 inspect <id>`. Search by capability, never by provider name, and prefer the result with the best usable rate.
What to look for that way: organic competitors of a domain, a domain's top pages, keyword difficulty and search intent,
referring domains, backlink gaps between domains, Google's AI Overview and AI Mode, ChatGPT, Gemini and Copilot answers,
page speed and Core Web Vitals, and an on-page audit of a URL. Rate each result you used (`o11 rate <id> useful|not-useful`).

Search Console is the site's own truth for clicks, impressions, average position and which pages Google indexed. Read it
through the user's connected account (`o11 discover "search console performance"`, customer connection). Third-party
volumes and positions are estimates; when Search Console and an estimate disagree about the team's own site, Search
Console wins.

Reading the data:
- **Volume** is monthly searches in the market from `seo/site.md`. Low volume with clear buying intent beats high volume
  that only reads.
- **Difficulty** (0 to 100): a young site (few referring domains) wins under about 30 first; aim higher as authority grows.
  Check by looking at who ranks: if the top 10 holds pages from sites as small as this one, it is winnable.
- **Intent** comes from the results page, not the words: read the top 10 for the search and write the kind of page
  Google already rewards (a comparison, a list, a guide, a tool, a product page).
- **AI answers**: for the team's priority searches, ask the assistants the question a buyer would and note whether the
  team, its competitors and which sources are named. Pages that AI answers cite are worth studying and earning links from.

Every paid call is quoted first. Keep each run to the work it needs; never skip data that would change the decision.
