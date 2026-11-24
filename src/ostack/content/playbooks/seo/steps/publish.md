---
summary: How a piece reaches the site.
used_by: [growth]
changed: 0.13.1
change: "Indexing is checked with Search Console's URL Inspection on the next run; its API cannot ask Google to index a page."
---
Publish where and how `seo/publish.md` says. With nothing set, open a pull request in the site's repo with the post in
the folder and format the existing posts use (front matter, images, slug), one pull request per piece, and never merge
it. Without a repo, save a draft in the CMS; without either, write a Markdown file or doc for the team to post.

Before it goes out, check the build or preview renders it: the title, description, canonical, structured data and every
link resolve. When the site keeps a sitemap or `llms.txt` by hand, add the page to both in the same change.

Then update the content plan: the piece, its search, where it went (the pull request, draft or doc link), its status
(`draft`, `in review`, `published`) and today's date. A piece counts as published only when it is live; check the live
URL on the next run and, when the team's Search Console is connected, whether Google indexed it
(`google-search-console.url_inspection`). Its API cannot ask Google to index a page; when a page stays out of the index,
find the cause the way the `crawl` step checks pages, instead of resubmitting it.
