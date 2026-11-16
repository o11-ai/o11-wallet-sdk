---
id: social
name: Social
summary: Grow your own X, LinkedIn and Instagram, and get every planned post drafted, with its videos made, days before it goes out.
access: beta
workflows:
  - id: growth
    skill: ostack-social-growth
    summary: Find fresh posts in your niche, follow the people behind them, like them and comment where you have something to add.
    schedule: { days: daily, at: "11:00" }
  - id: calendar
    skill: ostack-content-calendar
    summary: Every night, make what your content calendar has coming up (videos uploaded to o11, captions for each platform) and mark it ready for review.
    schedule: { days: daily, at: "00:01" }
---
Growth on social comes from showing up every day where your buyers already talk. **growth** runs once a day in each
person's own browser, signed in to their own accounts: it finds fresh posts in the team's niche, follows the people
posting them, likes them, and leaves a short, specific comment only where there is something real to add, in that
person's voice. It works slowly through the day toward every daily target, inside the hourly limits, and stops a
platform for the day at the first warning.

Public engagement only: no direct messages, connection requests or posts of its own, and never a pitch. The team shares
its niche, comment style and limits; each person keeps their own accounts and voice examples. Runs need a browser the
agent can drive (Claude in Chrome, or the agent's own browser) with the person signed in; passwords are never typed by
the agent.

**calendar** works from the team's content calendar: a Google Sheet, Notion database or whatever tool the team already
plans in, where each post is a row with a date and a plain prompt. Every night it takes the posts due within the next
few days (three by default), makes each video with the launch-videos skill and uploads it to o11, drafts the caption for
every platform, writes the o11 links and drafts back to the row and marks it ready for review. The calendar is the
record: ostack keeps none of it. It drafts and never publishes; the team reviews, approves and posts.
