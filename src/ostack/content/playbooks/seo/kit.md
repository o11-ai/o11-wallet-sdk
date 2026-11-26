---
kit: 1
name: seo
title: SEO
summary: Audit the site, keep publishing and refreshing posts that win search and AI answers, and track what moves.
release: 0.13.1
license: MIT
uses:
  effects: [read, write, spend, publish]
workflows:
  - id: audit
    skill: ostack-seo-audit
    summary: Crawl the site and check its search data, then list the fixes that matter most, in order.
  - id: growth
    skill: ostack-seo-growth
    summary: Pick the next pieces from real search data, write or refresh them, and publish them to the site.
    schedule: { days: "mon,thu", at: "09:00" }
  - id: tracking
    skill: ostack-seo-tracking
    summary: Read Search Console, rankings and AI answers, compare with last week, and report what moved and why.
    schedule: { days: mon, at: "08:00" }
---
SEO is never a one-time audit. **audit** crawls the site and reads its search data once, then lists every fix in order of
what it is worth. **growth** runs twice a week: it picks the next pieces from real search data (bottom of the funnel
first: alternatives, comparisons and the problems the product solves), writes them in the team's voice or refreshes posts
that are slipping, and publishes them where the team publishes: a pull request in their site's repo, a draft in their
CMS, or a doc for review. **tracking** runs every Monday: Search Console, rankings for the searches the team watches, and
whether AI assistants name them, against last week, so the next growth run knows what to do.

Search data comes from the team's o11 wallet: search volume, keyword difficulty and intent, the keywords any domain ranks
for, live search results and AI answers, backlinks, and the site's own Search Console. Runs use fresh, complete data (a raw pull is
reused for up to 7 days) and quote every paid call before it runs. The content plan, posts, reports and history stay
in the team's own repo, CMS or docs. Links worth earning are handed to ostack-outbound when that playbook is set up.
