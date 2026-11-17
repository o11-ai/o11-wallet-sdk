# Content, channel by channel

How to read what a company or a person publishes on one channel and say what wins there. Content mode and creator mode are built on this file. Full mode uses it in step 8.

The work has five stages: collect, rank, view, score, report. Routes are in [routes.md](routes.md). The arithmetic is in [moves-vs-growth.md](moves-vs-growth.md).

## Collect

For each channel, collect up to 60 recent posts and go back no further than six months. Stop sooner when one more page would break the cap. Save each raw result under `raw/`, then add a row per post to `posts.csv` using the columns the arithmetic file lists. Put the collection date at the head of the channel's section in the report.

Each channel has one engagement number, so posts are only ever compared with posts of the same kind:

| Channel | Engagement number | Other fields worth saving |
| --- | --- | --- |
| YouTube | views | title, thumbnail URL, duration, long video or Short, publish date |
| TikTok | plays | description text, hashtags, cover URL, saves, shares, duration, sound name |
| Instagram | likes plus comments | post type, image URL, caption |
| X | views, or likes when the route gives no views | text, reposts, attached media |
| LinkedIn | reactions plus comments | text, attached image or document, who posted |
| Reddit | score | title, subreddit, post type, comment count |
| Threads | likes | text, replies, reposts |
| Substack | reactions plus comments | title, subtitle, free or paid |

When a route returns no engagement number for a channel, list the posts, report the rhythm and call no pattern.

## Rank

Run `python3 teardown_math.py rank posts.csv --as-of <pull date>`. Posts younger than 7 days are left out because their numbers are still moving. The script sorts each channel and labels the top quarter and the bottom half. Rankings never cross channels: a view on X and a view on YouTube measure different things.

A channel needs 20 settled posts before a pattern may be called. Below that, list what was found and state that the sample is too small.

## View

Save the image for each top-quarter post and for five posts from the bottom half into `images/<channel>/`: the thumbnail on YouTube, the cover on TikTok, the first slide or photo on Instagram, the attached image elsewhere. Do this in the same sitting as the pull, because some platforms' image links stop working within hours. Then open every file and look at it.

If an image failed to download, record it as unread. A caption or title is no substitute for seeing the picture.

## Score

Score each top and bottom post on the questions for its channel. Write one row per post and question to `traits.csv` (`channel,url,tier,trait,value`), with a yes, a no or a value. What you can see in the image or text is seen. Any reason you give for why it performs is inferred.

| Channel | The words | The picture | The format |
| --- | --- | --- | --- |
| YouTube | Title length in characters. Does it contain a figure or a price? Is it told in the first person? Is it a question? Does it use brackets? What result does it promise? | Is there a face, and what is it doing? How many words are on the thumbnail? Does it show the product, the outcome, or a split comparison? What is the dominant colour? Is the logo present? Does the thumbnail repeat the title or complete it? | Long video or Short. Duration. |
| TikTok | The opening line of the description. The text shown on screen in the first seconds. Number of hashtags. | Which moment was picked as the cover, and what text sits on it. | Person talking, screen capture, photo slideshow, sketch, or person over a background image. Popular sound or the creator's own audio. Duration. |
| Instagram | The part of the caption visible before it is cut off. Word count on the cover. | How large the headline is on the cover or first slide. Whether a template repeats. Across the profile grid: recurring colours, typefaces, borders and logo position. | Share of reels, carousels and photos in the top quarter against the bottom half. For carousels: number of slides and the request on the final one. |
| X | The opening line. Total length. Whether a figure such as revenue, user count or a date appears. | No media, a product screenshot, a chart or metric, a video, or a joke image. | One post or a thread. For a company, score the founder's account and the brand's account as two separate channels. |
| LinkedIn | The opening lines visible before the post is cut off. | Whether the image shows people or the product. | Plain text, image, document carousel or video. Posted by the company page or by staff. In full mode, compare the top posts with the LinkedIn ads from step 6. |
| Reddit | Is the title a question, a story or a show-and-tell? | Usually none. | Which subreddits. Text post or link. Does the account disclose its employer? |
| Threads | The opening line and the length. | Text only or with media. | Standalone post or a reply chain on the author's own post. |
| Substack and other newsletters | Title shape and length. What the subtitle promises. A recurring series name. | Cover image style, if any. | Free or paid. Issue length when the page shows it. |

## Report

Each channel gets four short parts.

1. **Pattern.** Three to five traits that are common in the top quarter and rare in the bottom half. State each as two counts from `traits.csv`, for example "7 of 10 top covers carry three words or fewer, against 3 of 20 bottom covers". Do the counting in code: a few lines of Python over `traits.csv` that print, per channel and trait, how many top and how many bottom posts have it. A trait equally common in both groups belongs under house style.
2. **House style.** What stays the same from post to post: colours (named, with the hex value read from the image), lettering, layouts that repeat, logo position, named series.
3. **Formulas.** Two or three templates with blanks that the best titles, covers or opening lines follow, such as "How we got [number] [users] without [the usual method]". Pair each with one real post that fits it, linked.
4. **What changed.** Where the dates allow, how the channel differed before and after the inflection (full mode), or before and after a visible change in rhythm or format (content and creator modes).

Close with the sample: number of posts, first and last post date, pull date, images read and images unread.

## Creator mode additions

Read a creator's platforms the same way, and add these for each one:

- **Rhythm.** Posts per week and the median gap between posts, from the `rank` output. Note the weekdays and the hour when the route returns a time.
- **Audience.** Today's follower or subscriber count, dated. History only as [routes.md](routes.md) allows.
- **Where it sends people.** The link in the bio, the links inside the top-quarter posts, the pinned post, and what the end of a video or carousel asks the viewer to do. Record each destination.
- **Role.** From those links, say what the platform does for the creator: reach (it points to another platform), capture (it points to a newsletter or a list) or sale (it points to an offer). This is inferred from the links, so mark it that way.
