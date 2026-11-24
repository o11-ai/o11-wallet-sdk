---
summary: Check the site the way a search engine and an AI crawler read it, and sort each problem into a tier.
used_by: [audit, tracking]
changed: 0.13.1
change: "Prices must be in the raw HTML AI crawlers get; no firewall or robots.txt block on AI crawlers; unknown URLs return 404; reciprocal hreflang; thin programmatic pages; numbers that disagree; demo-only walls. Problems sort into Fatal, Revenue, Compounding and Fluff."
---
Read the site, do not guess at it. Start from `robots.txt`, the sitemap(s) and the home page, then follow internal links
until every important page (product, pricing, every post and landing page) has been checked, up to about 500 pages.
Use `o11 call o11.web.extract` for rendered pages, and the wallet's page audit and page speed tools for each template
(home, a post, a landing page, pricing).

Check, and record the URL and evidence for every problem:
- **Can it be found:** robots.txt does not block pages that matter or AI crawlers the team wants (GPTBot,
  OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended), and does not allow only Google (`User-agent: *` with
  `Disallow: /` and a Googlebot group that allows): that hides the site from Bing, which feeds ChatGPT search and
  Copilot, and from every AI crawler. Every important page is in the sitemap and returns 200; a made-up URL
  (`/this-page-does-not-exist-<random>`) returns 404, not 200 or the home page, and `sitemap.xml` and `robots.txt` are
  not served as HTML. noindex only on private pages; Search Console's indexing report agrees.
- **AI crawlers get the page:** fetch the pricing page and one key page without JavaScript as GPTBot, OAI-SearchBot,
  PerplexityBot and ClaudeBot (below). Each must get a 200, not a 403, a challenge page or a captcha, and the plans,
  prices and limits must be in the HTML as text once scripts, comments and `<head>` are stripped. Most AI crawlers do
  not run JavaScript: a price that only a script renders is a price they never see.
- **Is it one page:** each page has one self-referencing canonical; www, http and trailing-slash variants redirect once;
  no duplicate titles or near-duplicate pages competing for one search. Language versions list each other both ways:
  every page in a hreflang set names every other page and itself, plus `x-default`; a one-way tag is ignored.
  Half-translated languages are near-duplicates: keep one only when it is fully translated and earns its traffic.
- **Does it say what it is:** a unique title under 60 characters with the search first, a description under 160, one H1,
  headings in order, descriptive link text, alt text on meaningful images, Open Graph and X tags with a 1200x630 image.
- **Structured data:** Organization and WebSite on the home page, Article (with author and dates) on posts,
  Product or SoftwareApplication where it fits, FAQ only for real questions on the page, BreadcrumbList. It validates.
- **Speed:** Core Web Vitals pass (LCP under 2.5 s, INP under 200 ms, CLS under 0.1) on mobile; images sized and lazy
  below the fold; no render-blocking scripts on content pages.
- **AI readiness:** an `llms.txt` that lists the important pages; key facts (what it is, who it is for, pricing) in plain
  text on the page, not only in images or scripts. The same number (a price, a count, a limit) reads the same in the
  H1, the FAQ, structured data and `llms.txt`; when they disagree, AI answers trust none of them. Fix it at one source.
- **Pages made from a template:** sample 20 URLs per template (from the sitemap). When over 10% show 0 or 1 results,
  those pages get `noindex, follow` below 3 results and leave the sitemap. Indexed search, sort or page URLs
  (`?q=`, `?sort=`, `?page=`) get `noindex` first and a robots.txt `Disallow` only after they drop out of the index:
  a disallowed page cannot be recrawled to see its `noindex`. The same FAQ text on over 30% of them is boilerplate.
- **No demo-only wall:** when the only call to action is "Book a demo" or "Talk to sales", or the core value sits
  behind an account, a searcher arriving cold gets nothing. Suggest one thing they can use right away without signing
  up (a calculator, sample report, lookup or live preview).
- **Links:** no broken internal or external links; important pages within three clicks of home; related posts link to
  each other and to the product page they support. Count the contextual links into each key page (product, pricing,
  comparisons, alternatives, use cases, tools, integrations): links in the body of other pages only, never the nav,
  header, footer or sidebar. A key page with fewer than 3 is an orphan (Revenue). Save the counts in the report; they
  are the "before" numbers `refresh` compares with.

Fetch as each AI crawler (run it yourself; it costs nothing). Without a shell, use `litescrape.web.fetch.post` with the
same `user_agent`, `"engine":"curl"` and `"respond_with":"html"` (a paid call, quoted first):

```bash
url=https://acme.com/pricing
for ua in GPTBot OAI-SearchBot PerplexityBot ClaudeBot; do
  curl -sL -A "$ua" -w '\n%{http_code}' "$url" | UA="$ua" perl -0ne '
    my ($html, $code) = /\A(.*)\n(\d{3})\z/s;
    $html =~ s/<script\b.*?<\/script>//gis; $html =~ s/<!--.*?-->//gs; $html =~ s/<head\b.*?<\/head>//is;
    my %seen; my @prices = grep { !$seen{$_}++ } $html =~ /(?:\$|\xe2\x82\xac|\xc2\xa3)\s?[0-9][0-9,.]*/g;
    print "$ENV{UA}: $code ", (@prices ? "@prices" : "NO PRICES"), "\n"'
done
```

This tests rules on the crawler's name only. A firewall that checks a crawler's real address (Cloudflare bot settings,
a host's firewall) can still block the real GPTBot: check those settings when the team gives access, and otherwise say
it is unverified.

Sort every problem into a tier, and fix in tier order:
1. **Fatal:** stops search engines or AI crawlers from crawling, indexing or reading a page that earns money (a robots.txt
   that allows only Google, a firewall block, prices only in scripts on the pricing page, a key page with `noindex`).
2. **Revenue:** the page is indexed but cannot rank or convert (soft 404s, thin template pages, numbers that disagree,
   a demo-only wall, a key page with almost no internal links, a title that hides the search).
3. **Compounding:** authority, links and AI visibility that grow over time.
4. **Fluff:** alt text, description length, heading order, minor structured data warnings. One line at the bottom;
   Fluff waits until Fatal and Revenue are empty.

Within a tier, put problems across every page of a template before problems on a single page.
