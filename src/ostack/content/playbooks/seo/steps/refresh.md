---
summary: Keep published pages winning, and route links from pages that get traffic to the pages that earn money.
used_by: [growth]
changed: 0.13.1
change: "Internal link rules: a key page with fewer than 3 contextual links in is an orphan; at least one link in the top 40% of a post; link text of 3 to 7 words, 5 or more versions per page, none reused more than 3 times; a before-and-after count. Search Console reads through the user's own connection, with a stated fallback."
---
A page is due for a refresh when Search Console shows its clicks or position falling for four weeks, when it ranks 4 to
20 for its search, when the facts in it (prices, versions, years, screenshots) are out of date, or when it is over a year
old on a search that changes. Read clicks and position by page with `google-search-console.performance` through the
user's own connection (`research`). Without one, use the positions in the last tracking reports, say that the four-week
click trend could not be checked, and never stand in estimates for Search Console numbers.

Refresh it, do not rewrite it: keep the URL, read what now ranks above it and what AI answers say, then add what is
missing, fix what is stale (from the team's proof files), tighten the opening answer, improve internal links to and
from it, and update the date only when the content really changed. Publish it the same way as a new piece and note the
refresh in the content plan.

Merge two pages competing for one search into the stronger one with a redirect from the other, and say so in the report.

**Internal links.** Pages that get traffic should send readers and ranking signals to the pages that earn money.
- **Targets:** key pages (product, pricing, comparisons, alternatives, use cases, tools, integrations) with fewer than 3
  contextual links in, counted as `crawl` counts them (body links only; nav, header, footer and sidebar never count).
  Under 10 is under-linked.
- **Sources:** the 20 posts with the most Search Console clicks over 90 days (without it, the most linked-to posts).
  Link a source to a target only when the post already talks about what the target does.
- **Placement:** 2 to 4 new links per source post, one per target at most, and at least one in the top 40% of the
  post (by position in the text after the front matter; code blocks count). Wrap a phrase that is already there, or
  add one sentence that is useful on its own. Never rewrite the paragraph or only add a "related reading" list.
- **Link text:** 3 to 7 words that say what the target does ("compare plans at 5 and 25 seats"), never "click here"
  or "learn more". Each target gets at least 5 different link texts across the site (or one per linking page when
  fewer than 5 link to it), and no exact text is used more than 3 times. Internal links are never `nofollow`.
- **Count before and after:** the contextual links into each target before editing and after, in the report and the
  content plan, with any page still an orphan and why (no post talks about it yet: plan one).

Check a target (here `/pricing`) across the posts: where its first link sits, and how often each link text is used.

```bash
TARGET=/pricing perl -0ne '
  s/\A---\n.*?\n---\n//s;
  my $at = /(?:\]\(|href=["\x27])(?:https?:\/\/[^\/)"\x27]+)?\Q$ENV{TARGET}\E(?=[\/)#?"\x27])/ ? $-[0] : -1;
  printf "%s %s %s\n", $ARGV, $at < 0 ? "none" : int(100 * $at / length) . "%",
    $at >= 0 && $at <= 0.4 * length ? "PASS" : "FAIL"' content/blog/*.md
TARGET=/pricing perl -ne '
  print lc($1), "\n" while /\[([^\]]+)\]\((?:https?:\/\/[^\/)]+)?\Q$ENV{TARGET}\E(?=[\/)#?])/g;
  print lc($1), "\n" while /href=["\x27](?:https?:\/\/[^\/"\x27]+)?\Q$ENV{TARGET}\E(?=[\/"\x27#?])[^>]*>([^<]+)</g' \
  content/blog/*.md | sort | uniq -c | sort -rn
```
