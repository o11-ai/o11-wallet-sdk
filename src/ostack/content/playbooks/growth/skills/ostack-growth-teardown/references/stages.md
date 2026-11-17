# Videos by stage of growth

What a company posts when it has 2,000 followers is different from what it posts at 2 million, and only the first is useful to a company that has 2,000. This mode dates every short video a company published, groups them by the stage the company was in, and hands the stage that matches the user's own to the video skills.

## Order of work

Run the parts in this order: step 1, step 2 (handles only), V2, step 3 and step 4 for the dates, V1, V3, V4, V5. V2 comes before the dates because cover and video links expire within hours, and because a small cap should stop before the traffic call, the most expensive one. Each of those nine parts gets its own entry in `checkpoints.md`, written before the next part starts. V1 and V3 to V5 make no calls; the cost in V1's heading belongs to steps 3 and 4.

## V1. Stages (the dates cost about $0.17, or nothing after a full teardown)

Reuse `traffic.csv`, `moves.csv` and the funding and launch dates when the folder has them. Otherwise steps 3 and 4 run before V1, and only for what gives dates:

- From step 3, the funding rounds and news events routes ($0.05). Skip technology detections and connections.
- From step 4, the traffic route with `date_from` set to the January before the first post in `videos.csv` ($0.1212 for one domain, whatever the window), then `python3 teardown_math.py moves traffic.csv moves.csv`.

Cut the company's history into stages at dated events, never at round numbers. The script returns one inflection month, so only First traction is cut from traffic:

| Stage | Starts at | Where the date comes from |
| --- | --- | --- |
| Pre-launch | The first post on any accepted account | `videos.csv` |
| Launch | The public launch date | The target's own launch or rebrand post, then Product Hunt, then press. The funding and news routes do not give it. |
| First traction | The first day of the inflection month | `inflection.month` in the `moves` output |
| Scale | The first funding round after the inflection labelled Series A or later. When rounds carry no label, the first of $20M or more. Pre-seed, seed and angel rounds never open Scale. | The funding route |
| Category leader | The first round of $100M or more after the round that opened Scale | The funding route |

- One round opens one stage. A Series A of $100M or more opens Scale, and Category leader waits for the next round of $100M or more.
- A launch date known only to the month is written as the first of that month and marked inferred.
- When the launch falls in the inflection month, or after it, drop the Launch stage and say so. First traction then starts at the first of the inflection month.
- If the company relaunched under a new name, date the launch at the relaunch and call the earlier period "Before relaunch" in place of Pre-launch.
- With no inflection, cut First traction at the first dated customer or revenue report in the news events, marked inferred. With none of those either, leave the stage out.
- With no qualifying round, cut Scale at the month paid ads or creator co-posts are first seen (the `paid` and `author` columns of `videos.csv`), marked inferred. With no later round of $100M or more, cut Category leader at the first dated press piece that names a larger company as its competitor, or leave the stage out.
- A round's date is seen. That the round marks category leadership is inferred, so that boundary is always marked inferred.
- `effective_date` on the news route is often a month bucket or wrong. Read the event's summary text before using its date.

A company may skip a stage or sit in one for years. Write `stages.csv` with `stage, from, to, evidence_url, seen_or_inferred`. A boundary with no dated source is marked inferred.

The choice of the Scale boundary decides how many videos First traction holds. In the report, say how many videos the matched stage would hold under the next-best boundary (the round before or after the one used).

## V2. Every short video, dated (about $0.01 to $0.08)

When the site links no account on a platform, find the handle as "Handles the site does not link" in [routes.md](routes.md) says. Then, for each of TikTok, Instagram Reels and YouTube Shorts where the company has an accepted account:

1. Pull the account's posts back to its first one, paging until the route runs out or 300 posts are in. The six-month limit of the channel step does not apply here: early posts are the point. Send the inputs in the videos-mode table of [routes.md](routes.md); the TikTok pull must not send `trim:true`.
2. Compare the rows pulled with the post count on the profile and report both. A list that stops short of the count did not reach the first post.
3. In the same sitting, download every cover into `images/<platform>/`, and save the video file link of every Instagram and TikTok row.
4. Write `videos.csv`: `platform, url, posted_at, author, own_account, kind, paid, views, likes, comments, shares, saves, seconds, first_line, sound_title, sound_id, sound_original, on_camera, format, stage, outlier`. The table in [routes.md](routes.md) names the field behind each column and the columns each platform leaves empty.
5. Add founder and employee accounts only when the company's bio links them, and mark them as such.

How to fill the columns the routes do not hand over directly:

- `author` is the account that posted. `own_account` is 1 when the author is one of the accepted handles, otherwise 0.
- The Instagram route also returns creators' co-posts: the creator is the owner and the company is a co-author. Keep them, with the creator as `author` and `own_account` 0. They count in the stage's formats and outliers, always labelled as a creator's post, and the earliest one dates "creator posts first seen". They do not count in the rhythm.
- `kind` is `video`, `carousel` or `photo`. Carousels and photos stay in the file and are left out of every video count, format share, median and outlier. Report how many each stage had.
- `paid` is `ad` when the TikTok row has `is_ad` true, `partnership` when a TikTok or Instagram row has `is_paid_partnership` true, `caption` when the caption opens with "#ad" or "sponsored", otherwise empty. YouTube Shorts rows carry no paid field, so the column is empty there and the report says so.
- `sound_original` is 1 for the account's own audio and 0 for a platform sound. Own audio is titled "Original audio" on Instagram and "original sound - <handle>" on TikTok, with a new id on every post.
- `first_line` is the caption's first sentence, or the title on Shorts. `format` and `on_camera` are filled in V3, `stage` and `outlier` in code after V1.

## V3. What each stage looked like

Join `videos.csv` to `stages.csv` by date, in code. For each stage with at least eight videos (the 20-post floor belongs to the channel patterns of step 8, not to stages):

1. **Rhythm.** Videos per week from the company's own accounts: own-account videos in the stage divided by the weeks between the first and the last of them. Also give the number of separate posting days and the longest gap. The same edit posted to three platforms counts three times in the rate, so give the posting days beside it.
2. **Formats.** Look at the cover of every video in the stage and label it: founder to camera, employee to camera, creator or customer to camera, street interview, customer story, screen recording, presenter over screen, text over footage, meme or trend, office skit, event or office footage, produced brand or launch film, animation. Count them. Contact sheets are fine for this: tile about 35 covers a sheet and open a single cover only when a label is unsure.
3. **Outliers.** The videos at three times the median views of that platform's videos in that stage, or more. Never one median across platforms: a view on Shorts is not a view on TikTok. Skip a platform with fewer than five videos in the stage. A stage's hits are judged against that stage, not against the account today.
4. **Paid.** List the outliers with a `paid` value apart from those without. An ad-flagged video's views were probably bought, so never call it a winner; say how many of the stage's outliers carry a flag.
5. **Hooks.** For the unpaid outliers and five median videos, write each hook as a fill-in formula with the real line beside it. With `ostack-video-teardown` installed, break each one down with it. Without it, make a strip of the first four seconds from the saved file link. No route here returns audio or a transcript, and a Short has no file link, so the hook then rests on the caption or title plus any on-screen title in the strip. Mark the spoken line "not heard", and say in the hooks section and in the limits that the hooks rest on captions.
6. **Sounds.** Report the share of videos on own audio first. Then count `sound_id` over the platform sounds and name any used three times or more. When no platform sound repeats, report that the stage ran on the company's own audio. Say which kind the outliers used.
7. **The product's first second.** When the product is first named or shown, as a median over the outliers and five median videos only. It needs a breakdown or a strip; with neither, write "not measured".
8. **What changed at the boundary.** Compare this stage with the one before in one line each: who is on camera, the top format, the rhythm, the spend (ad flags first seen, creators first credited).

The two image commands, run on files already downloaded:

```sh
# one tile per cover, then a 7 by 5 sheet; format=yuvj420p stops mixed pixel formats from dropping tiles
ffmpeg -i cover.jpg -vf "scale=170:300:force_original_aspect_ratio=decrease,pad=174:304:(ow-iw)/2:(oh-ih)/2:white,format=yuvj420p" tiles/001.jpg
ffmpeg -framerate 1 -i tiles/%03d.jpg -vf tile=7x5 -frames:v 1 images/sheets/sheet-01.jpg
# first four seconds of one video as five frames
ffmpeg -user_agent "Mozilla/5.0" -t 4.2 -i "<video file link>" -vf fps=1,scale=270:-2,tile=5x1 -frames:v 1 images/strips/<id>.jpg
```

A stage with fewer than eight videos gets counts and its best video, and no pattern.

If the matched stage holds few videos while the traffic estimate or reported revenue grew through it, say that short video did not carry that stage, and name what was seen instead (the moves dated inside it).

## V4. The user's stage

Ask the user for what places them, in one message, and use what the workspace already says: followers per platform, monthly visitors or users, whether the product is public, funding, team size, and whether a founder will be on camera. Match them to the nearest stage by the same evidence that defined it, not by ambition. Say which stage and why in two lines, and say when the user sits between two.

The stage the user gave in step 1 maps like this: before launch is Pre-launch; launched is Launch; first customers or early revenue is First traction, or Launch when the target has no First traction stage; scaling up is Scale; category leader is Category leader.

In an unattended run, place the user from the request and `company.md`, list the facts you did not have, and say the match is provisional.

When the target's matching stage has no pattern (too few videos), use the nearest earlier stage that has one and say so. If no earlier stage has one, report the videos that exist, say there is no pattern, and write no hook formulas: `hooks` in the handoff is then an empty list.

## V5. Hand off to the video skills

Write `video-plan.md` and `video-plan.html` as [reports.md](reports.md) lays out, and `ugc-handoff.json` in the teardown folder. The values below are placeholders; every one is replaced with a value from this run's CSVs.

```json
{
  "version": 1,
  "target": "<target>",
  "stage": { "name": "<stage name from stages.csv>", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "matchedBecause": "<why the user sits in this stage>" },
  "rhythm": { "postsPerWeek": 0.0, "postingDays": 0 },
  "formats": [{ "format": "<format label from V3>", "share": 0.0 }],
  "hooks": [{ "formula": "<the line with [blanks]>", "example": "<the real line>", "url": "<post url>", "views": 0, "heard": false, "paid": "" }],
  "sounds": [{ "id": "<sound id>", "title": "<sound title>", "uses": 3 }],
  "ownAudioShare": 0.0,
  "references": [{ "url": "<post url>", "why": "<platform, multiple of that platform's stage median, paid signal>", "views": 0, "paid": "" }],
  "avoid": ["<a format that first appears in a later stage, and the stage>"]
}
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `version` | integer | yes | Always 1 |
| `target` | string | yes | The bare domain |
| `stage.name` | string | yes | The matched stage, spelled as in `stages.csv` |
| `stage.from`, `stage.to` | string | yes | That row's dates, `YYYY-MM-DD` |
| `stage.matchedBecause` | string | yes | Two lines at most. Says "provisional" when the user was not asked. |
| `rhythm.postsPerWeek` | number | yes | Own-account videos per week, as V3 defines it. Creators' co-posts are left out. |
| `rhythm.postingDays` | integer | no | Separate days with an own-account video in the stage |
| `formats[]` | list | yes | Every format with at least one video in the stage, largest first |
| `formats[].format` | string | yes | A label from the V3 list |
| `formats[].share` | number | yes | 0 to 1, of the stage's videos. The shares sum to 1, give or take 0.02 for rounding. |
| `hooks[]` | list | yes | Empty when the stage has no pattern |
| `hooks[].formula`, `.example`, `.url` | string | yes | The fill-in line, the real line, and the post it came from |
| `hooks[].views` | integer | yes | Views on the read date |
| `hooks[].heard` | boolean | no | False when the hook rests on the caption or title |
| `hooks[].paid` | string | no | The post's `paid` value. Leave a hook from an ad-flagged post out unless nothing else shows the formula. |
| `sounds[]` | list | yes | Platform sounds used three times or more in the stage. `[]` is valid and common. |
| `sounds[].id`, `.title` | string | yes | As in `videos.csv` |
| `sounds[].uses` | integer | yes | Videos in the stage on that sound |
| `ownAudioShare` | number | no | 0 to 1, share of the stage's videos with a known sound that used own audio |
| `references[]` | list | yes | The stage's outliers, unpaid ones first, six at most |
| `references[].url`, `.why` | string | yes | The post, and its platform, multiple and paid signal in words |
| `references[].views` | integer | no | Views on the read date |
| `references[].paid` | string | no | The post's `paid` value. Required when it is not empty. |
| `avoid[]` | list of strings | yes | Formats and spend that first appear in a later stage, and the identity rule |

Check the file in code before finishing: it parses, every required field is present with the right type, `stage` equals a row of `stages.csv`, and every `url` is a row of `videos.csv`.

Then offer, by name:

1. `ostack-video-trending`: `trending import --url <link>` for each reference, so the videos are saved as references with their sounds.
2. `ostack-video-teardown` on the two or three references the user picks.
3. `ostack-ugc` to remake them for the user's product: the hook formulas feed its hook list, the format shares decide which format to make first, and the rhythm sets how many variants a week.

Do not start them unasked.

## Limits to state in the report

- Deleted and private videos are not seen, so an early stage can look thinner than it was.
- A platform's post list may stop before the first post. Give, per account, the rows pulled, the profile's post count and how far back the list reached.
- View counts are today's, not the count at the time. An old video has had longer to collect views; compare within a stage and within a platform.
- Paid promotion is partly visible. TikTok rows carry `is_ad` and `is_paid_partnership`, and Instagram rows carry `is_paid_partnership`. YouTube Shorts rows carry no paid field, and a boosted Reel is not labelled.
- Format labels come from covers. Hooks come from captions, titles and strips unless a video was broken down; say which.
- Instagram gives no views for carousels and photos, and no shares or saves for any post.
