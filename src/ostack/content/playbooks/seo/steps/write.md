---
summary: How each piece is written, and the checks it passes before it ships.
used_by: [growth]
changed: 0.13.1
change: "The answer goes in the first 40 words. Every paragraph passes the competitor-swap test. A banned-phrase check must find 0 hits. Comparison pages need sourced competitor facts, where they win, a verdict up top, pricing math, switching steps and switching reasons from recent reviews."
---
Read the team's `voice.md` and `seo/write.md`, the piece's intent lock, its proof cards (`proof`), the top 5 results
for the search (`o11 call o11.web.extract` on each), and what AI assistants answer for it. Then write the page that is
plainly better for the person searching: more specific, more current and easier to act on, in the format the intent
lock names. Never rewrite a competitor's page in other words.

Every piece:
- **Answers in the first 40 words.** The opening answers the search directly; AI assistants and featured snippets quote
  it. A list names and links its top pick there. No preamble about why the topic matters.
- **Passes the competitor-swap test.** Read each paragraph and ask: could it appear unchanged on a competitor's site?
  If yes, rewrite it around something only the team has (a number, a step in their product, a price, a screenshot, a
  proof card) or delete it.
- **Covers what the top results cover**, briefly, then adds what they miss: real numbers, screenshots, steps from using
  the product, an opinion the team holds. Facts come from sources you read or the team's proof files, linked inline.
  Never invent customers, results, quotes or statistics; a missing fact gets a `[NEEDS PROOF]` marker.
- **Is easy to scan:** short paragraphs, sentence-case headings that match the questions people ask (at least one
  phrased as the question, answered in the next 1 to 2 sentences), tables for comparisons, numbered steps for
  how-tos, one idea per section.
- **Links:** 3 to 6 links to the team's related pages and the product page the piece supports, at least one in the top
  40% of the piece, with link text of 3 to 7 words that says what the page does, and links out to the sources it cites.
  Follow the internal link rules in `refresh`.
- **Has the parts search needs:** title under 60 characters with the search first, description under 160, a slug from
  the search, Article structured data with author and dates, an FAQ only from real questions people ask, and an image
  with alt text when it helps.
- **Ends on the action** in `seo/site.md`.

Length follows the search: as long as the top results need, rarely under 1,000 or over 3,000 words. Read it back once as
the person searching; cut anything they would skip.

**Comparison and alternative pages** ("<you> vs <competitor>", "<competitor> alternatives"):
- A two-sentence verdict in the first 50 words: when the competitor is the better pick, then when the team's is.
- At least 5 specific facts about the competitor, each with its source and the date checked. Never say a competitor
  lacks something without checking their docs that day; an unverified price links to their pricing page instead.
- At least 3 cases where the competitor wins, in their own section. When the team loses on every reason found, do not
  publish the page; say so in the report.
- Pricing as published at 1, 5 and 25 seats (or the product's real unit), on the plan each size is forced onto, with
  the pricing page and the date checked under the table. Round nothing in either direction.
- Switching steps: where to export in theirs, where to import in the team's, and how long it really takes.
- Switching reasons come from 1- and 2-star reviews from the last 12 months (review sites, app stores), forum threads
  and the competitor's own pricing page and docs. A reason goes on the page only with 3 or more separate complaints in
  that window and when it is still true on their live page today, written as a fact, not a feeling. Keep the reasons,
  counts and links in `seo-proof/competitors/<competitor>.md`.
- No competitor logos or screenshots of their product: text, and the team's own screenshots.
- On alternatives pages, every product gets the same block (verdict, best for, trade-off, starting price), and the
  team's product sits where it honestly ranks.

**Banned phrases: 0 hits before it ships.** No em or en dashes, curly quotes, or spaced hyphens used as dashes; no
"not just X, but Y"; no filler words (delve, pivotal, crucial, robust, seamless, leverage, utilize, showcase, foster,
moreover, furthermore, additionally, game-changing, cutting-edge, world-class) or chatbot lines ("in this guide",
"let's dive", "in conclusion", "studies show"). Teams add their own in `seo/write.md`. Run this on the piece's file
(Markdown, MDX or HTML) and rewrite until it prints `0 hits`; it skips fenced code blocks:

```bash
perl -ne '
  if (/^\s*(```|~~~)/) { $fence = !$fence; next }
  if (!$fence && /\xe2\x80[\x93\x94\x98\x99\x9c\x9d] | (?<=[a-z0-9,)])\s-\s(?=[a-z0-9(])
      | \bnot\s(just|only)\s[^.]{1,60}?\bbut\b | \bit.?s\snot\s[^.,]{1,40},\sit.?s\b
      | \b(delve\w* | pivotal | tapestry | testament | underscor\w* | foster\w* | garner\w* | interplay
      | intricate | crucial | vibrant | showcas\w* | utiliz\w* | leverag\w* | seamless\w* | paradigm | bedrock
      | synergy | robust | game-changing | groundbreaking | cutting-edge | revolutionary | world-class
      | next-generation | blazing-fast | empower\w* | serves\sas | stands\sas | boasts | in\sorder\sto
      | due\sto\sthe\sfact | facilitat\w* | experts\s(believe|say|agree) | studies\sshow | industry\sreports
      | in\sthis\s(article|guide|post) | let.?s\sdive | dive\sinto | i\shope\sthis\shelps | as\swe\shave\sseen
      | in\sconclusion | in\stoday.?s | fast-paced | moreover | furthermore | additionally)\b/xi) {
    print "$ARGV:$.: $_"; $hits++
  }
  if (eof) { close ARGV; $fence = 0 }
  END { print $hits + 0, " hits\n"; exit($hits ? 1 : 0) }
' path/to/post.md
```

0 hits is required, not enough: then read it once for what the check cannot see (passive voice that hides who does
what, lists padded to three, one thing called by several names, Title Case headings).
