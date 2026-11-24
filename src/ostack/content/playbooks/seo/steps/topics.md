---
summary: Choose what to write or refresh next, and lock each page's format before anyone drafts it.
used_by: [audit, growth]
changed: 0.13.1
change: "Searches share a page only when their top 10 results overlap with the cluster head. Every piece needs an intent lock before a draft. Free tools need a CPC and volume floor and a results page full of tools."
---
The content plan lives where `seo/publish.md` says (default `seo-plan.md` beside the posts). Read it first; it lists
every planned, written and published piece with its search, status and date. Add to it, never start a second one.

Choose in this order, and say why each piece comes next:
1. **Bottom of the funnel.** Searches from people ready to choose: "<competitor> alternative(s)", "<you> vs
   <competitor>", "<competitor> vs <competitor>", "best <category> for <audience>", "<category> pricing", and
   "<category> for <use case>". One page per search, honest about where competitors are better. A "best <category>
   for <narrow audience>" page only where the product is honestly one of the top 3 picks for that audience.
2. **Problems the product solves.** The searches people make before they know the category: "how to <job>",
   "<problem> template", "why <symptom>". Each one leads to the product as the way to do it.
3. **Competitor gaps.** Searches two or more competitors rank top 20 for and the site does not (ranked keywords for each
   competitor from `seo/site.md`, minus the site's own). Keep those that match the product.
4. **Near wins.** Searches where the site already ranks 4 to 20 (Search Console first): improve that page instead of
   writing a new one.
5. **Low competition early.** While the site is young, prefer difficulty under about 30 with clear intent, even at 50 to
   500 searches a month; a page that ranks beats a page that does not.

Skip a search when the top results show a different intent than the team can serve, when a page of theirs already
targets it (refresh that page instead), or when `seo/topics.md` rules it out. Keep to the pace in `seo/topics.md`
(default 2 new pieces and 2 refreshes a week).

**One page per results page.** Group searches by the pages Google ranks for them, never by shared words. Take the top 10
for each search (from the saved pulls in `research`), with URLs trimmed the same way (lowercase host, no `www.`, query,
`#` or trailing slash). Go from the highest volume search down and compare each one only with the head (first search)
of each group, never with another member:
- 3 or more shared URLs: it joins that group, and one page targets both.
- Exactly 2 shared: it joins only when both results pages are led by the same kind of page (tool, list, docs or help,
  forum or video, product or pricing page, article). Otherwise it starts its own group.
- 0 or 1 shared: it starts its own group and gets its own page.

Every search sits in exactly one group, no two groups point at one URL, and an existing page that serves two groups is
marked to split, or two pages serving one group to merge (with a redirect), in the content plan.

**Intent lock: no lock, no draft.** Before anyone writes a piece, save its lock beside the content plan (default
`seo-intent/<slug>.md`). Read the top 5 for its search, and what each page is (its title, whether it has a working tool
with two or more inputs, a comparison table, its headings and rough word count):
- **Format:** the kind of page 3 or more of the top 5 are (tool, list, docs, landing page, experience piece with
  screenshots or video, article). When none has 3, copy the format of positions 1 to 3.
- **Evidence:** the top 5 URLs with their kind, the median word count, and results page features (featured snippet,
  People also ask, video, AI Overview).
- **Required:** what the page must have to compete (inputs and result for a tool, entry count for a list, the questions
  from People also ask).
- **Forbidden:** what would put it in the wrong format (a long intro above a tool, a blog post where buyers get product
  pages).

The published page must match its locked format; a page that changed format needs a new lock first.

**Free tools.** A calculator, checker, generator or template people use in the browser is its own page type. Pull
volume and CPC for the search, then:
- CPC $3 or more and 300 or more searches a month: a candidate.
- CPC under $0.50: reject at any volume. People who search it do not buy.
- In between: a candidate only when the tool's result feeds the product's main action (a fee calculator whose result
  goes into an invoice). Otherwise reject.
- A candidate is built only when 3 of the top 5 results are working tools; otherwise write it as a guide.
Rank candidates by CPC times volume, list rejects with the reason, and keep the tool free and usable without signing up.
