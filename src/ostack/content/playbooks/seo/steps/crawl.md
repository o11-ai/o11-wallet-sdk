---
summary: Check the site the way a search engine and an AI crawler read it.
used_by: [audit, tracking]
changed: 0.9.2
change: First release.
---
Read the site, do not guess at it. Start from `robots.txt`, the sitemap(s) and the home page, then follow internal links
until every important page (product, pricing, every post and landing page) has been checked, up to about 500 pages.
Use `o11 call o11.web.extract` for rendered pages, and the wallet's page audit and page speed tools for each template
(home, a post, a landing page, pricing).

Check, and record the URL and evidence for every problem:
- **Can it be found:** robots.txt does not block pages that matter or AI crawlers the team wants (GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended); every important page is in the sitemap and returns 200; no orphan pages; noindex only
  on private pages; Search Console's indexing report agrees.
- **Is it one page:** each page has one self-referencing canonical; www, http and trailing-slash variants redirect once;
  no duplicate titles or near-duplicate pages competing for one search.
- **Does it say what it is:** a unique title under 60 characters with the search first, a description under 160, one H1,
  headings in order, descriptive link text, alt text on meaningful images, Open Graph and X tags with a 1200x630 image.
- **Structured data:** Organization and WebSite on the home page, Article (with author and dates) on posts,
  Product or SoftwareApplication where it fits, FAQ only for real questions on the page, BreadcrumbList. It validates.
- **Speed:** Core Web Vitals pass (LCP under 2.5 s, INP under 200 ms, CLS under 0.1) on mobile; images sized and lazy
  below the fold; no render-blocking scripts on content pages.
- **AI readiness:** an `llms.txt` that lists the important pages; key facts (what it is, who it is for, pricing) in plain
  text on the page, not only in images or scripts.
- **Links:** no broken internal or external links; important pages within three clicks of home; related posts link to
  each other and to the product page they support.

Grade each problem by what it costs: blocking indexing of pages that matter first, then anything across every page of a
template, then single pages.
