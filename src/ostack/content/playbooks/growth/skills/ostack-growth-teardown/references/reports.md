# Report formats

What each mode delivers and how each file is laid out. Everything goes in one folder in the user's working directory.

## The folder

```
growth-teardown/<target>-<YYYY-MM-DD>/
  setup.md              inputs, cap, country, run id
  run_id.txt            the run id every shell call exports
  checkpoints.md        one entry per finished step, written as the step ends
  raw/                  every call result as returned, named <step>-<name>.json, or <step>-<name>-p<NN>.json per page
  images/<channel>/     thumbnails, covers and first slides that were read
  images/sheets/  images/strips/                              videos mode
  posts.csv  ranked.csv  traits.csv
  traffic.csv  moves.csv  brand.csv  moves-vs-growth.csv      full mode
  keywords.csv  ads.csv  mentions.csv  anchors.csv  jobs.csv  full mode
  platforms.csv  offers.csv                                   creator mode
  stages.csv  videos.csv                                      videos mode
  teardown_math.py
  playbook.md  playbook.html      full mode
  content-report.md  content-report.html   content mode
  blueprint.md blueprint.html     creator mode
  video-plan.md  video-plan.html  ugc-handoff.json   videos mode
```

A folder the user names replaces this one; say so in `setup.md`. `<target>` is the domain or the handle, lowercased, with dots and `@` removed. Raw results and images stay local. Do not commit or upload them.

## Marking findings

Every finding line starts with one of three marks:

- **Seen.** A call result or an image shows it. Follow it with a link to the page, the post or the raw file.
- **Inferred.** Reasoned from seen findings. Say from which.
- **Not seen.** Looked for and not found, or the route was unavailable. Never replace it with a guess.

Every count carries the date it was read: "412 active ads (seen 14 Nov 2026)".

## playbook.md (full mode)

In this order:

1. **Summary.** Five lines at most: what the company sells, when it grew, which cluster had the biggest lift, which channel runs ahead of growth, and the play to start with.
2. **Timeline.** The traffic series by month with the inflection marked, then every dated move in order with its channel, link, cluster, lift and position against the inflection.
3. **The path.** A table with a row for each stage: noticed, signed up, first success, paid, shared. Every cell is marked and linked.
4. **By channel.** A section for each social channel the target uses, then paid ads, then search and AI answers, then the product loop. Each section lists the moves made there, the pattern and house style where one was called, what paid off (with the figure that changed) and what fell flat.
5. **Ten plays.** The table below.
6. **Skip these.** Two or three tempting plays the evidence is too thin for, with the reason.
7. **14-day plans.** A day-by-day plan for each channel worth the user's time.
8. **What is next for them.** Open roles by function and the channel each points to.
9. **Method notes.** Which routes were called, which pages refused to load, which images went unread, when each count was taken, which statements are inferred, which checks were unavailable, and a line saying the report was made without the target's involvement.
10. **The bill.** Cost per step and the total from `o11 run-status $(cat run_id.txt)`, against the cap.

### A play

| Field | Content |
| --- | --- |
| Play | One line, and the stage of the path it works on |
| Evidence | Marked findings with links |
| Timing | Started before, at or after the inflection |
| Lift | The cluster's lift from the arithmetic, or "none measured" |
| Fit | Why it suits the user's company and stage, or what would have to be true |
| Effort | A day, a week or a quarter |
| First result | How long until the first number, and which number |
| Cost to try | In dollars and hours |
| Prompt | Text the user pastes into their agent to start the play |

Order plays by evidence first, then timing, lift and fit. A play with weak evidence never outranks one with strong evidence because it looks easier.

The prompt names the user's company and product, says exactly what to build or draft (pages, posts, rules, events, lists), applies the channel's formula and house style to that product, and states the number to check and when. It must work pasted into a fresh session with no other context.

### A 14-day plan

One table per channel: day, what to publish or set up, the formula used, time needed. End with the one number to read on day 14 and the value that would mean "keep going".

## content-report.md (content mode)

1. For each channel: sample size and date range, then the pattern, house style and formulas with their examples, then links to the five best posts.
2. Across channels: what the brand keeps the same everywhere, and any channel that departs from it.
3. When the user's company is known: five titles or covers per channel built on the formulas for the user's product, and a prompt per channel that drafts a first post in the same style.
4. Method notes and the bill, as above, and a list of channels whose sample was too small.

## blueprint.md (creator mode)

1. **Summary.** Who the person is, where their audience is largest, the platform that feeds the others, what they sell.
2. **Platforms.** One row per platform found: handle, link, followers or subscribers today (dated), history where seen, posts per week, median gap, the platform's role.
3. **Per platform.** The pattern, house style and formulas, as in content mode, plus rhythm and where the platform sends people.
4. **Offers.** One row per offer: what it is, price where shown, the page, and which platforms link to it. From `offers.csv`.
5. **The flow.** A short list of arrows: platform to platform, platform to list, list to offer. Each arrow is a link that was seen.
6. **Five plays.** Same fields as a full-mode play, with "Timing" replaced by "Platform". Order by evidence, then fit.
7. Method notes and the bill, including every platform with no public route and every history marked "not seen".

`platforms.csv` columns: `platform,handle,url,followers,read_on,posts_per_week,median_gap_days,role,pattern_called`. `offers.csv` columns: `offer,kind,price,url,linked_from`.

## video-plan.md (videos mode)

In this order. Columns and rules are in [stages.md](stages.md).

1. **Summary.** Five lines at most: the accounts and how many posts were read, the stage matched to the user and why, what won in that stage with the paid share of its outliers, what changed in later stages, and what to make first.
2. **Stages.** One row per stage from `stages.csv`: dates, boundary seen or inferred, posts, videos, own-account videos per week, longest gap, outliers. Under it, one line per boundary with its source, and the video count the matched stage would hold under the next-best boundary.
3. **One section per stage**, the matched one labelled. Rhythm with a row per platform (posts, first and last date, median views, outliers, own and creator accounts). Formats with counts and shares. Outliers in a table with the multiple of the platform's stage median, views, platform, date, account, format and a paid-signal column. Hooks as formula, real line, views and link, with a line saying whether they were heard or rest on captions. Sounds, own-audio share first. What changed from the stage before. A stage under eight videos gets its counts and best video only.
4. **Where the user sits.** The stage, why, and what was not known. "Provisional" when the user was not asked.
5. **What to make now.** Format, length, rhythm and the hook formulas to start with, each tied to an unpaid outlier.
6. **Skip for now.** Formats and spend that first appear in a later stage.
7. **Next skills.** The three offers from V5, not started.
8. **Limits**, from the list in [stages.md](stages.md), with this run's numbers.
9. **Method notes.** As in full mode, plus the handles accepted and why, the handles rejected, rows pulled against each profile's post count, how many covers and strips were read, and what was not heard.
10. **The bill.**

Videos mode also writes `video-plan.html`.

## The HTML file

One self-contained file per report. It opens from disk with no network: inline CSS and JavaScript, no external fonts, scripts or stylesheets.

- Light and dark by `prefers-color-scheme`, readable at phone width.
- The same sections as the markdown file, in the same order, with every source linked.
- An image grid for each channel: top-quarter images in one row, bottom-half images in the row below, each captioned with its engagement number and linked to the post. Embed images as `data:` URIs, scaled to at most 320 px wide, so the file still works after the source links expire. An image that was not read shows as a labelled empty box.
- Videos mode: in place of the channel grid, one grid per stage with the outliers' covers in the top row and five median covers below. A cover from a post with a paid signal carries that label.
- Full mode: the traffic series as an inline SVG line, the inflection month marked, and a pin per cluster labelled with its lift. Draw it from `traffic.csv` and `moves-vs-growth.csv` in code.
- A button beside every prompt that copies it to the clipboard.
- Seen, inferred and not seen are visually distinct and also written as words.

Keep the file under 10 MB. If the image grids push it over, lower the image width before dropping any image.

## CSVs

Plain UTF-8, a header row, one fact per row, dates as `YYYY-MM-DD`, empty cells for values the source did not give. Every CSV that feeds a count in the report ships with it. Suggested columns for the full-mode files:

| File | Columns |
| --- | --- |
| `keywords.csv` | `keyword,url,family,position,volume,brand` |
| `ads.csv` | `network,advertiser,first_shown,last_shown,days_running,hook,offer,landing_page,url` |
| `mentions.csv` | `place,url,author,label,posted,engagement,paid` |
| `anchors.csv` | `anchor,referring_domains,first_seen,loop` |
| `jobs.csv` | `title,function,location,first_seen,last_seen,url` |

Videos mode: `stages.csv` and `videos.csv` columns are in [stages.md](stages.md).

## Checkpoints

When a step ends, append its entry to `checkpoints.md` before starting the next step, and say the same in chat. One entry per step: never one entry for several steps, and never the whole file written at the end.

```
## Step 4: when it grew (done 14 Nov 2026, $0.121, total $0.25 of $3.00)
Finding: three lines at most, marked.
Next: what step 5 checks, and what it should cost.
```

Videos mode has nine entries, in the order they run: step 1, step 2, V2, step 3, step 4, V1, V3, V4, V5. A step with no calls still gets its entry, at $0.

When the user is present, offer continue, skip or stop. In an unattended run, continue while the total stays under the cap.
