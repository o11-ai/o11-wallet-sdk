# Routes

The o11 route for each check, its input and its price. Every id here resolved with `o11 inspect` on 14 November 2026, and the prices were read that day. Prices and inputs change, so inspect each route again before its first call of a run.

Contents: how to call · reading the table · site · stack, partners, news, funding · traffic · search and AI answers · ads · who talks about it · own content · videos mode · links · hiring · creator mode · no public route · what a run costs

## How to call

```sh
o11 session-id > run_id.txt                   # once per teardown, so the bill can be totalled
export O11_RUN_ID=$(cat run_id.txt)           # first line of every shell call; an export does not carry over
o11 inspect '<id>'                            # inputs and the current price
o11 quote '<id>' --input '<json>' --max-cost-micros <ceiling>   # the price of this exact request; fails without a ceiling
o11 call '<id>' --input '<json>' -o raw/<step>-<name>-p<NN>.json --max-cost-micros <n>
o11 run-status $(cat run_id.txt)              # total charged so far in this run; needs the id
```

- Pass input fields flat in `--input`. o11 places each one in the query or the body. Path fields go in `--path`, as in `--path 'company_id_or_domain=TARGET'`.
- Quote each route before its first call and add the quote to the running total. If the total would pass the cap, stop and ask. The quote's `--max-cost-micros` is the inspect price for a fixed route and what is left under the cap for a variable one.
- `-o` refuses to write over an existing file. Number the pages of a paged pull (`-p01`, `-p02`) and leave the suffix off a single call.
- `--max-cost-micros` is the ceiling for one call, in millionths of a dollar. Set it to the quote.
- If a call is interrupted, do not call again. `o11 history --since 10m` finds it and `o11 status <id> --wait` returns it.
- A route that fails gets one try on its alternative. If that fails too, write "unavailable" for that check and move on. If the table has no alternative, run `o11 discover "<the job>" --limit 10` once and inspect the best match.

## Reading the table

- **Fixed** means inspect shows one price per call. **Variable** means the price depends on rows returned or on which provider answers. For a variable route the table gives the formula and an estimate, and you rely on `o11 quote` for the real number.
- `TARGET` is the bare domain (`example.com`). `BRAND` is the company name as written. `HANDLE` has no `@`.
- No route here publishes a reviewed output contract. Field names quoted from a result are whatever the first real call returns. Read the saved JSON before you write a parser, and note in method notes any field you expected and did not get.
- Country: the examples use the United States (`location_code` 2840, `language_code` `en`, `"US"`). Change all three together for another country.

## 2. The site

| Job | Route | Input | Price |
| --- | --- | --- | --- |
| List every URL | `crawl4ai.web.map` | `{"domain":"TARGET","max_urls":2000}` | Fixed, $0.00015 |
| List every URL, alternative | `firecrawl#map` | `{"url":"https://TARGET","limit":2000}` | Fixed, $0.001 |
| Read a page | `tinyfish.web.fetch` | `{"urls":["https://TARGET/pricing"],"format":"markdown","links":true}` | Free. Takes several URLs in one call. |
| Read a page, alternative | `o11.web.extract` | `{"url":"https://TARGET/pricing"}` | Variable: each provider the route tries bills at its own price, a miss costs nothing. Quote it. |
| Find founders or a page | `o11.web.search` | `{"q":"BRAND founder","limit":"10"}` | Variable, as above. Quote it. |
| Search, fixed price | `bravesearch.web.search` | `{"q":"BRAND founder","count":10}` | Fixed, $0.005 |

### Handles the site does not link

A site often links YouTube and X and leaves out TikTok or Instagram. Work in this order, and stop at the first step that gives a handle:

1. Read what the accepted accounts link: the description of the newest YouTube video or Short, the YouTube channel's links, and the Instagram bio. These usually list the other handles, and they cost nothing more when the posts are already pulled.
2. Only then try guesses with the profile routes in the creator table: the bare domain as the handle (`example.com`), then the domain without its TLD (`example`). Each guess is a paid call, so quote it.
3. Accept an account only if its bio links the target's domain or an account already accepted links it. A matching name with no link is not accepted.

Write every handle tried and rejected in method notes, with the reason. A platform with no accepted account is "not seen".

## 3. Stack, partners, news, funding

| Job | Route | Input | Price |
| --- | --- | --- | --- |
| Tools on the site, with first-seen dates | `predictleads.companies.technology_detections` | `{"limit":1000}` with `--path 'company_id_or_domain=TARGET'` | Fixed, $0.04 |
| Tools, alternative | `leadmagic.x.technographics` | `{"company_domain":"TARGET"}` | Fixed, $0.025 |
| Tools, cheapest | `dataforseo#domain/domain-technologies` | `{"target":"TARGET"}` | Fixed, $0.012 |
| Partners, customers, investors | `predictleads.companies.connections` | `{"limit":1000}` with `--path 'company_id_or_domain=TARGET'` | Fixed, $0.04. No alternative found. |
| News events | `predictleads.companies.news_events` | `{"limit":1000}` with `--path 'company_id_or_domain=TARGET'` | Fixed, $0.04 |
| News, alternative | `o11.companies.news` | `{"domain":"TARGET","limit":"50"}` | Variable. Quote it. |
| Funding rounds | `aviato.companies.funding_rounds` | `{"website":"TARGET","perPage":100,"page":0}` | Fixed, $0.01 |
| Funding, alternative | `predictleads.companies.financing_events` | `{"limit":1000}` with `--path 'company_id_or_domain=TARGET'` | Fixed, $0.04 |

The news date filters (`found_at_from`) filter on when the event was found, not when it happened. Pull everything and filter by the event's own date in code. That date, `effective_date`, is often a month bucket, missing or wrong, so read the event's summary text before a stage boundary rests on it. Neither the news nor the funding route gives a launch date.

## 4. When it grew

| Job | Route | Input | Price |
| --- | --- | --- | --- |
| Monthly organic and paid traffic estimate | `dataforseo#labs/historical-bulk-traffic-estimation` | `{"targets":["TARGET"],"location_code":2840,"language_code":"en","date_from":"2024-11-01"}` | Variable: $0.12 a call plus $0.0012 per target. One domain is $0.1212 for any window. |
| Fixed-price fallback | `seranking.google.domain.ranked_keywords` | `{"source":"us","domain":"TARGET","year":2025,"month":10,"limit":1000,"cols":"keyword,position,volume,traffic,url"}` | Fixed, $0.0179 per snapshot. One call per month wanted: sum the traffic column for that month. Eight quarterly snapshots cost $0.14, and a quarterly series is too coarse for the inflection rule, so say so. |
| Traffic by channel, latest | `akta#v1/company/website-traffic` | `{"company":"https://TARGET"}` | Fixed, $0.075. Optional. Takes a URL, not a name. Whether it returns history is unverified. |

`date_from` is the first day of the month 24 months back. The window length does not change the price, so videos mode sets it to the January before the first post. The `cols` names on the fallback are unverified: drop `cols` if the call rejects them. `dataforseo.x.dataforseo-labs-google-domain-rank-overview-live` returns today's snapshot only, so it is no substitute for history.

## 5. Search and AI answers

| Job | Route | Input | Price |
| --- | --- | --- | --- |
| Ranked keywords with URL, position, volume | `seranking.google.domain.ranked_keywords` | `{"source":"us","domain":"TARGET","limit":1000,"order_field":"traffic","order_type":"desc"}` | Fixed, $0.0179 for up to 1,000 rows |
| Ranked keywords, alternative, with monthly search history per keyword | `dataforseo.google.domain.ranked_keywords` | `{"target":"TARGET","location_code":2840,"language_code":"en","limit":200,"order_by":["ranked_serp_element.serp_item.etv,desc"]}` | Variable: $0.012 a call plus $0.00012 a row. 200 rows is about $0.036, 1,000 rows about $0.13. |
| A buyer question asked to ChatGPT with web search | `cloro.ai-search.chatgpt.scrape` | `{"prompt":"QUESTION","country":"US","include":{"markdown":true}}` | Listed as variable at $0.0028 a call. Extra includes cost more, so ask for markdown only. |
| Same, fixed price | `crawl4ai.ai-search.chatgpt.scrape` | `{"prompt":"QUESTION","country":"us"}` | Fixed, $0.0032 |
| Same question to Google AI Mode (optional second engine) | `crawl4ai.google.serp.ai_mode` | `{"q":"QUESTION","deep":"0","gl":"us","hl":"en"}` | Fixed, $0.00015 |

`order_field` on the first route and the `order_by` field name on the second are unverified. If either is rejected, drop it and sort in code. Use the second route only when you want `brand.csv` for the arithmetic: it is the one whose rows may carry monthly searches per keyword.

## 6. Ads

| Network | Route | Input | Price |
| --- | --- | --- | --- |
| Meta: find the Page id | `meta-ad-library.meta-ads.library.search` | `{"search_terms":"BRAND","ad_reached_countries":["US"],"ad_active_status":"ALL","fields":"id,page_id,page_name","limit":25}` | Free |
| Meta: the Page's ads | `meta-ad-library.meta-ads.library.advertiser` | `{"search_page_ids":["PAGE_ID"],"ad_reached_countries":["US"],"ad_active_status":"ACTIVE","fields":"id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms,media_type","limit":100}` | Free |
| Meta, alternative: find the Page | `scrapecreators.x.v1-facebook-adlibrary-search-companies` | `{"query":"BRAND"}` | Fixed, $0.00188 |
| Meta, alternative: its ads | `scrapecreators.x.v1-facebook-adlibrary-company-ads` | `{"pageId":"PAGE_ID","status":"ACTIVE","country":"US","trim":true}` | Fixed, $0.00188 a page of results |
| Google: find the advertiser id | `dataforseo#serp/google-ads-advertisers` | `{"keyword":"BRAND","location_code":2840}` | Fixed, $0.0012 |
| Google: its creatives | `dataforseo#serp/google-ads-search` | `{"advertiser_ids":["ADVERTISER_ID"],"location_code":2840,"depth":40}` | Fixed, $0.0012 |
| Google, alternative, by domain in one call | `scrapecreators.x.v1-google-company-ads` | `{"domain":"TARGET","region":"US"}` | Fixed, $0.00188. Leave `get_ad_details` unset: it costs 25 times more. |
| LinkedIn | `scrapecreators.x.v1-linkedin-ads-search` | `{"company":"BRAND","countries":"US"}` | Fixed, $0.00188 |
| LinkedIn, alternative, by domain | `adyntel.linkedin.search.ads.company` | `{"company_domain":"TARGET"}` | Fixed, $0.011 a page |
| TikTok | `scrapecreators.x.v1-tiktok-ad-library-search` | `{"query":"BRAND"}` | Fixed, $0.00188 |
| TikTok, alternative, by domain | `adyntel.tiktok-ads.library.search.company` | `{"company_domain":"TARGET"}` | Variable, listed at $0.011 a page |

Pick the Meta Page and the Google advertiser whose name, domain or linked Instagram matches the target, and say which you picked. If the free Meta route returns no ads for a brand you can see advertising, use the alternative before writing "no ads".

## 7. Who talks about it

| Place | Route | Input | Price |
| --- | --- | --- | --- |
| X search | `tikhub.x.twitter-web-fetch-search-timeline` | `{"keyword":"from:FOUNDER","search_type":"Top"}`, then `{"keyword":"BRAND -from:BRANDHANDLE min_faves:300","search_type":"Top"}` | Fixed, $0.001 a page |
| X search, alternative | `anyapi#twitter.search` | `{"query":"BRAND min_faves:300","queryType":"Top","limit":40}` | Variable: between $0.00054 a call and $0.0044 a call plus $0.00022 a result, by the provider used. Quote it. |
| YouTube search | `youtube.youtube.search.videos` | `{"part":"snippet","q":"BRAND","type":"video","order":"viewCount","maxResults":25}` | Free. May return no view counts. |
| YouTube search with views | `scrapecreators.x.v1-youtube-search` | `{"query":"BRAND","sortBy":"popular","type":"videos"}` | Fixed, $0.00188. `sortBy` accepts only `relevance` or `popular`. |
| Reddit search | `litescrape#reddit/search` | `{"q":"BRAND","sort":"top","time":"year","limit":50}` | Fixed, $0.00015 |
| Reddit search, alternative | `scrapecreators.reddit.search.posts` | `{"query":"BRAND","sort":"top","timeframe":"year","trim":true}` | Fixed, $0.00188. Next page with `after`. |

The X search operators (`from:`, `min_faves:`) are unverified on these routes. If they are ignored, filter by author and likes in code.

## 8. Own content, per channel

One row per channel and its alternative. Page until you have 60 posts or reach six months back.

| Channel | Route | Input and paging | Price |
| --- | --- | --- | --- |
| YouTube long videos | `scrapecreators.x.v1-youtube-channel-videos` | `{"handle":"HANDLE","sort":"latest"}`, more pages via `continuationToken`. A second call with `"sort":"popular"` returns the channel's most viewed videos ever. | Fixed, $0.00188 a page |
| YouTube Shorts | `scrapecreators.x.v1-youtube-channel-shorts` | `{"handle":"HANDLE","sort":"newest"}`, more pages via `continuationToken`. `sort` takes `newest` or `popular` here, not `latest`. | Fixed, $0.00188 a page |
| YouTube, alternative | `crawl4ai.youtube.channel.videos` | `{"channel":"@HANDLE","limit":30}` | Fixed, $0.0009. At most 30 videos. |
| TikTok | `scrapecreators.x.v3-tiktok-profile-videos` | `{"handle":"HANDLE","region":"US"}`, next page with `max_cursor`. Do not send `trim:true`: it removes the `music` object, and with it the sound name and id. | Fixed, $0.00188 a page |
| TikTok, alternative | `litescrape#tiktok/profile-videos` | `{"handle":"HANDLE","count":30}`, next page with `cursor` | Fixed, $0.00015. Has answered 503; a failed call is not charged. |
| Instagram | `scrapecreators.instagram.user.posts` | `{"handle":"HANDLE"}`, next page with `next_max_id` | Fixed, $0.00188 a page |
| Instagram, alternative | `tikhub#api/v1/instagram/v1/fetch_user_posts_v2` | `{"user_id":"NUMERIC_ID","count":30}`, next page with `end_cursor`. Needs the numeric id from the profile route in the creator table. | Fixed, $0.001 |
| X posts | `tikhub.x.user.posts` | `{"screen_name":"HANDLE"}`, next page with `cursor` | Fixed, $0.001 a page |
| X media posts | `tikhub.x.twitter-web-fetch-user-media` | `{"screen_name":"HANDLE"}`, next page with `cursor` | Fixed, $0.001 a page |
| X, alternative | `litescrape#x/user-posts` | `{"username":"HANDLE"}`, next page with `cursor` | Fixed, $0.00015 |
| LinkedIn company page | `harvestapi.linkedin.company.posts` | `{"companyUniversalName":"SLUG","scrapePostedLimit":"6months","page":1}`, raising `page` each time and sending back `paginationToken` if the result includes one | Fixed, $0.004 a page |
| LinkedIn, alternative | `scrapecreators.x.v1-linkedin-company-posts` | `{"url":"https://linkedin.com/company/SLUG","page":1}` | Fixed, $0.00188 a page |
| Reddit, the company's own account | `crawl4ai.reddit.user.posts` | `{"user":"NAME","kind":"posts","sort":"new","limit":100}` | Fixed, $0.0009 |

Thumbnails, covers and first slides are downloaded from the URLs in these results with `curl`, which costs nothing. TikTok and Instagram image links expire within hours, so download in the same sitting as the pull.

### Videos mode

The same three routes, paged back to the first post or 300 posts. Field names are as the routes returned them on 15 November 2026; read the saved JSON before writing the parser.

| Platform | Rows and paging | Fields behind the `videos.csv` columns | Columns left empty |
| --- | --- | --- | --- |
| TikTok | `aweme_list[]`; send `max_cursor` back while `has_more` is 1 | `create_time`, `desc`, `statistics.play_count`, `.digg_count`, `.comment_count`, `.share_count`, `.collect_count`, `video.duration` (milliseconds), `music.id_str`, `music.title`, `music.is_original_sound`, `is_ad`, `is_paid_partnership`, `author.unique_id`, cover `video.cover.url_list[0]`. `author.aweme_count` is the profile's post count. | None |
| Instagram | `items[]`; send `next_max_id` back while `more_available` is true | `taken_at`, `caption.text`, `play_count`, `like_count`, `comment_count`, `video_duration`, `product_type` (`clips` is a Reel), `media_type` (8 is a carousel, 1 a photo), `owner.username`, `coauthor_producers[].username`, `is_paid_partnership`, cover `display_uri`, else `image_versions2.candidates[0].url`. Sound: `clips_metadata.original_sound_info` (own audio; `original_audio_title`, `audio_asset_id`) or `clips_metadata.music_info.music_asset_info` (a platform sound; `title`, `audio_cluster_id`) | `shares`, `saves`; `views` on carousels and photos |
| YouTube Shorts | `shorts[]`; send `continuationToken` back until it is absent | `publishDate`, `title`, `viewCountInt`, `likeCountInt`, `commentCountInt`, `durationMs`, cover `thumbnail` | `shares`, `saves`, `sound_title`, `sound_id`, `sound_original`, `paid` |

- **Paid signals.** `is_ad` on a TikTok row means the post ran as an ad. `is_paid_partnership` on a TikTok or Instagram row is the platform's partnership label. Both survive `trim:true`; the sound fields do not. Shorts rows carry neither.
- **Co-posts.** The Instagram route returns posts a creator published with the company as co-author. `owner.username` is then the creator and the company's handle is in `coauthor_producers`.
- **Video files.** Free, from links in the rows: Instagram `items[].video_url`, TikTok `aweme_list[].video.play_addr.url_list[0]`. They expire like the covers, so save or use them in the same sitting. YouTube Shorts rows carry no file link, and no route here returns audio or a transcript. A video with no file is read from its cover, title and caption, and its hook is marked "not heard".
- **Post counts.** Compare the rows pulled with the profile's post count (the profile routes in the creator table, or `author.aweme_count` on TikTok). The TikTok list can stop well short of it.

## 9. Links and loops

| Job | Route | Input | Price |
| --- | --- | --- | --- |
| Anchor texts by number of referring domains | `dataforseo.web.anchors.list` | `{"target":"TARGET","limit":40,"order_by":["referring_domains,desc"]}` | Variable: $0.024 a call plus $0.000036 a row. 40 rows is about $0.025. |
| Anchors, alternative | `moz.web.anchors.list` | `{"target":"TARGET","scope":"root_domain","limit":40}` | Variable: $0.006667 a result. 40 rows is about $0.27, so use it only when the first route fails. No fixed-price anchor route was found. |
| Referring domain totals | `serpstat.web.backlinks.summary` | `{"method":"SerpstatBacklinksProcedure.getSummaryV2","params":{},"id":"1","params.query":"TARGET"}` | Fixed, $0.0025 |
| Totals, alternative, with TLD breakdown | `dataforseo.web.backlinks.summary` | `{"target":"TARGET","include_subdomains":true}` | Variable: $0.024 a call plus $0.000036 a row |

Pages that carry a loop anchor are read with `tinyfish.web.fetch`.

## 10. Hiring

| Job | Route | Input | Price |
| --- | --- | --- | --- |
| Open roles with first-seen and last-seen dates | `predictleads.companies.job_openings` | `{"limit":1000,"not_closed":true}` with `--path 'company_id_or_domain=TARGET'` | Fixed, $0.04 |
| Alternative | `o11.companies.jobs.search` | `{"domain":"TARGET","limit":"100"}` | Variable. Quote it. |
| Free fallback | `tinyfish.web.fetch` | the careers page URL from step 2 | Free. Gives no dates, so mark each role's date "not seen". |

## Creator mode

| Job | Route | Input | Price |
| --- | --- | --- | --- |
| Other platforms from one handle | `scrapecreators.creators.socials.connected` | `{"platform":"x","handle":"HANDLE"}` (platform is `instagram`, `tiktok`, `youtube`, `x` or `facebook`) | Fixed, $0.0188. Skip it when the bio and link page already list every account. |
| X profile | `crawl4ai.x.user.profile` | `{"username":"HANDLE"}` | Fixed, $0.0002 |
| X profile, alternative | `litescrape#x/profile` | `{"username":"HANDLE"}` | Fixed, $0.00015 |
| X posts | `tikhub.x.user.posts`, `tikhub.x.twitter-web-fetch-user-media` | as in step 8 | Fixed, $0.001 a page |
| LinkedIn profile | `tikhub.x.linkedin-web-v2-get-user-profile` | `{"url":"https://www.linkedin.com/in/SLUG/"}` | Fixed, $0.001 |
| LinkedIn posts | `tikhub.x.linkedin-web-v2-get-user-posts` | `{"url":"https://www.linkedin.com/in/SLUG/","start_date":"2026-05-14","end_date":"2026-11-14"}` | Fixed, $0.001. The date format is unverified: drop both dates if rejected. |
| LinkedIn posts, alternative | `village.people.posts` | `{"linkedin_url":"https://www.linkedin.com/in/SLUG","limit":50}`, next page with `cursor` | Fixed, $0.02 a page |
| Instagram profile | `scrapecreators.instagram.user.profile` | `{"handle":"HANDLE"}` | Fixed, $0.00188 |
| Instagram profile, alternative | `crawl4ai.instagram.user.profile` | `{"username":"HANDLE"}` | Fixed, $0.0009 |
| Instagram posts | `scrapecreators.instagram.user.posts` | as in step 8 | Fixed, $0.00188 a page |
| YouTube channel | `scrapecreators.youtube.channel.profile` | `{"handle":"HANDLE"}` | Fixed, $0.00188 |
| YouTube channel, alternative | `crawl4ai.youtube.channel.profile` | `{"channel":"@HANDLE"}` | Fixed, $0.0009 |
| YouTube videos and Shorts | as in step 8 | | |
| TikTok profile | `crawl4ai.tiktok.user.profile` | `{"username":"HANDLE"}` | Fixed, $0.00064 |
| TikTok profile, alternative | `scrapecreators.tiktok.user.profile` | `{"handle":"HANDLE"}` | Fixed, $0.00188 |
| TikTok videos | as in step 8 | | |
| Threads profile | `scrapecreators.x.v1-threads-profile` | `{"handle":"HANDLE"}` | Fixed, $0.00188 |
| Threads posts | `scrapecreators.x.v1-threads-user-posts` | `{"handle":"HANDLE","trim":true}` | Fixed, $0.00188. Recent posts only, with no paging field. |
| Threads posts, alternative | `crawl4ai.threads.user.posts` | `{"username":"HANDLE","limit":10}` | Fixed, $0.00165. About 10 posts, no paging. |
| Substack archive | `litescrape#substack/posts` | `{"publication":"NAME","limit":50,"offset":0}`, then raise `offset` | Fixed, $0.00015 |
| Substack, alternative, also custom domains | `crawl4ai.substack.publication.posts` | `{"publication":"NAME.substack.com","limit":50}` | Fixed, $0.00015. At most 50 posts. |
| Link-in-bio page on Linktree | `scrapecreators.x.v1-linktree` | `{"url":"https://linktr.ee/NAME"}` | Fixed, $0.00188 |
| Any other link page, offer page or newsletter archive | `tinyfish.web.fetch` | `{"urls":["URL"],"format":"markdown","links":true}` | Free |

Threads routes return about one page, so a Threads account rarely reaches the 20 posts a pattern needs. Report the posts and say so.

## No public route

Searched with `o11 discover` on 14 November 2026 and not found. Write "no public route" in the report and use the fallback.

| Wanted | What discovery showed | Fallback |
| --- | --- | --- |
| Follower or subscriber history on X, LinkedIn, Instagram, YouTube, Threads or TikTok | Nothing for these platforms. The only follower-history routes cover Xiaohongshu. One creator-analytics route exists: `influencersclub.creators.enrich.analytics`, input `{"handle":"HANDLE","platform":"instagram"}` (also `tiktok`, `twitter`, `youtube`), fixed at $0.4784 a platform. Whether its result holds a follower history is unverified, so call it only when the user approves that price for one platform. | Record today's count from the profile route, dated. For earlier points, read archived copies of the profile page with `tinyfish.web.fetch` on `https://web.archive.org/web/<YYYYMMDD>/<profile URL>`. A count read off an archived page is seen, with that link. Most profiles have few or no usable captures, and then the history is "not seen". Never draw a curve between two points. |
| Newsletter subscriber counts | None | Use only a number the creator published, linked and dated, and label it "reported". |
| Newsletters outside Substack (beehiiv, Kit, Ghost, others) | None | Read the public archive page with `tinyfish.web.fetch`. It gives titles and dates and no engagement, so rhythm can be reported and no pattern can be called. |
| LinkedIn follower history and post impressions | None | Reactions and comments only. |
| Traffic split by channel with history | Only the latest-snapshot route in step 4, unverified | The organic and paid split from the traffic history route. |

## What a run costs

Estimates from the listed prices, with the default routes, one page where a route pages unless stated. The quotes are the real numbers.

| Step | Calls assumed | Estimate |
| --- | --- | --- |
| 2 Site | one map, page reads free | $0.0002 |
| 3 Stack, partners, news, funding | three at $0.04, one at $0.01 | $0.13 |
| 4 Traffic | one domain, any window | $0.121 |
| 5 Search and AI answers | 1,000 keywords fixed, three questions | $0.026 |
| 6 Ads | Meta free, Google two calls, LinkedIn, TikTok | $0.006 |
| 7 Who talks | three X pages, YouTube free, Reddit | $0.003 |
| 8 Own content | five channels, 60 posts each | $0.04 |
| 9 Links | anchors, summary | $0.028 |
| 10 Hiring | one call | $0.04 |
| Full mode | | about $0.39 |
| Content mode | steps 2 and 8 | about $0.04 |
| Videos mode | three profiles, three accounts paged to the first post, funding, news, traffic | about $0.20 to $0.30 |
| Creator mode | six platforms, profiles and posts | about $0.04 |

Steps 1, 11 and 12 make no calls.
