# Hooks

The hook is the first three seconds: the opening words, the text on screen and the opening shot. One video with one hook is a guess. This file is a loop that makes several hooks from patterns that are working now, lets the audience rank them, and carries what was learned into the next round.

o11 cannot post. The user publishes every variant and tells you the links. Everything after that is measured from public numbers.

The whole loop is untested: no round has been run with this skill. The scoring rubric, the variant mechanics and the measuring commands each exist; nobody has yet posted variants and closed a round.

## Round 0: find the patterns

1. Pull what is trending in the niche with the `ostack-video-trending` skill. It ranks saved search results by views per day and records views per follower.
2. Take the top five, preferring small accounts: a video with many views per follower travelled on its own, without an audience behind it.
3. Tear each one down with the `ostack-video-teardown` skill. Read `hook`, `beats[0]` and `formula` in each `reference.json`, and `captions` and `overlays` in each `style.json`.
4. Write the hook patterns you found into `hooks/ledger.json`. A pattern is the reusable shape with the specifics removed: "a stack of numbers that ends in a payoff", "a question the viewer wants answered", "the boring way to get a result". Each pattern lists its evidence: the reference IDs, their views per day and their views per follower. A pattern needs three videos from three different accounts. With fewer, record it with `"status": "candidate"` and say so at the stop.
5. Stop. Show the user the patterns with their evidence and ask which reference or pattern to build on.

One real pull shows what this looks like. In a ranked pull of 59 TikToks in an app-and-UGC niche on 14 November 2026, the top row by views per day was an 8.5 s clip with no speech: six short lines of text over footage of someone working in a coffee shop ("emailed 150 brands. 13 said yes. $350 per deal. ..."). It had 705,757 views in 3.4 days, about 208,000 a day, from an account with 6,106 followers: 115.6 views per follower. Eight of the top ten rows came from accounts under 10,000 followers and five of the ten were under 16 s. That is one niche on one day, and one video: a candidate until two more accounts show the same shape. Pull your own.

A pattern is a shape to reuse. The words, numbers, person and footage of a reference are not yours to reuse, and every number in your hook must be one the user can support.

## Each round

1. **Write ten hooks** from the two or three best patterns. In round 1 that is three or four per pattern. Each hook states its pattern and, from round 2, the one element it changes.
2. **Score them** with the rubric below and record all ten in the ledger.
3. **The user picks three to five.** Show the top of the list with scores, the pattern each uses, and what each costs to produce. Stop here.
4. **Produce them as variants** ([variants.md](variants.md)). Every variant shares everything after the first three seconds: the same demo, the same character, the same voice, the same edit style, the same call to action. Only the hook differs. Plan the video so the hook is its own shot of about three seconds, 11 words. A hook variant then costs one short clip, $0.30-$0.50, or nothing when the hook is text on screen.
5. **The user posts them** on the same account and platform, with the same caption and sound apart from the hook words. Agree a schedule first; see the limits below. Record each link and posting time in the ledger.
6. **Measure at 1 h, 6 h, 24 h and 48 h** after each post. At each checkpoint, save the post's detail result as the `ostack-video-trending` skill describes and record it:

   ```bash
   o11 ostack launch-videos trending measure --input <detail.json> --url <post-url> --test <round>-<pair> --label A --posted <ISO time with zone>
   o11 ostack launch-videos trending compare --test <round>-<pair>
   ```

   `compare` reads two posts, labelled A and B. With more than two variants, measure every post, rank them in the ledger by views per hour at the same checkpoint, and run `compare` on the top two. It calls a lead only when both readings are at least 20 hours old, their ages are within 1.25 times of each other, the stronger post has 1,000 views or more, and its views per hour are at least 1.2 times the other's. Use the same test for the ledger's verdict.
7. **Record the result** in the ledger: which pattern each hook used, its readings, and the round's verdict.

## The next round

- **Keep the winning pattern.** The round's best hook becomes the control and is posted again or carried as the baseline.
- **Mutate one element at a time.** Each new hook changes exactly one of: the number, the claim, the first word, the on-screen text, the opening shot. A hook that changes two things teaches nothing about either.
- **Drop a pattern that lost twice.** A pattern whose best hook trailed the round's winner in two rounds is marked dropped and gets no more hooks.
- **Bring in one new pattern** from a fresh pull every second round, so the loop does not narrow to a single idea while the feed moves on.

## When to stop

Stop when any of these is true, and say which:

- The control has won two rounds in a row and no mutation in the latest round led it by the 1.2 times rule. The hook has stopped improving; spend on the next video.
- Three rounds have passed and no variant reached the account's own median views. The fault is probably not the hook. Go back to round 0, or look at the product and the demo.
- The budget the user set for rounds is spent.
- The user says stop.

## Honest limits

Say these to the user before round 1, in plain words.

- **Small samples.** One post per hook is a single sample. A post can do five times better or worse than its twin for reasons nobody can see. A lead in one round is a hint; the same pattern leading in two rounds is evidence.
- **A 48-hour window.** It measures the first push. A post can be picked up a week later, and this loop will not see it.
- **Posting time and order.** Variants posted in the same hour compete with each other for the same followers. Variants posted on different days meet different days. Neither is clean. The default is one variant a day at the same hour, in an order drawn at random, and the ledger records the time of every post.
- **Account effects.** The same hook does differently on a new account, a large account and an account that posted an hour ago. Results hold for this account only.
- **Views are what is measured.** Views per hour is not sales, sign-ups or watch time. If the user can see retention or clicks in their own analytics, ask for them and record them in `notes`.
- **The platform's numbers lag and can be hidden.** A null reading is recorded as null, never estimated.
- **o11 cannot post, schedule or read private analytics.** The user does all three.

## The ledger

`hooks/ledger.json` in the original video's folder. One file for the whole loop. Unknown fields are kept.

```json
{
  "version": 1,
  "niche": "app-ugc",
  "account": { "platform": "tiktok", "handle": "<the user's handle>", "medianViews": null },
  "patterns": [
    {
      "id": "p1",
      "name": "numbers that end in a payoff",
      "shape": "Three or four short lines, each one number and a noun, then the result, then a two-word push",
      "evidence": [
        { "reference": "tt-7706570171787349262", "viewsPerDay": 208178, "viewsPerFollower": 115.6, "seconds": 8.5, "capturedAt": "2026-11-14" },
        { "reference": "<a second video, from another account>", "viewsPerDay": null, "viewsPerFollower": null, "seconds": null, "capturedAt": "<date>" },
        { "reference": "<a third video, from a third account>", "viewsPerDay": null, "viewsPerFollower": null, "seconds": null, "capturedAt": "<date>" }
      ],
      "status": "active",
      "roundsLost": 0
    }
  ],
  "rounds": [
    {
      "round": 1,
      "startedAt": "2026-11-15",
      "control": null,
      "hooks": [
        {
          "id": "r1-h1",
          "pattern": "p1",
          "mutation": null,
          "spoken": "<the opening words, or null when there is no speech>",
          "onScreen": "<the opening text, or null>",
          "openingShot": "<what the first frame shows>",
          "score": { "stopsScroll": 2, "number": 2, "productLate": 1, "speakable": 2, "total": 7 },
          "chosen": true,
          "variant": "bottle-hook-r1-h1",
          "newSpendMicros": "300000",
          "post": { "url": "<link>", "postedAt": "2026-11-16T17:00:00+00:00" },
          "readings": [
            { "checkpoint": "1h", "hours": 1.1, "views": 240, "likes": 12, "comments": 0, "shares": 1, "saves": 3 },
            { "checkpoint": "24h", "hours": 24.3, "views": 5100, "likes": 410, "comments": 9, "shares": 30, "saves": 88 }
          ],
          "viewsPerHourAt24h": 210,
          "notes": null
        }
      ],
      "verdict": { "leader": "r1-h1", "ratioToSecond": 1.4, "basis": "24h", "called": true, "reason": "Both readings past 20 h, ages within 1.25x, leader over 1,000 views" },
      "next": "Keep p1. Mutate the number and the first word. p2 lost once."
    }
  ]
}
```

Rules for the file:

- `mutation` is null in round 1 and one of `number`, `claim`, `firstWord`, `onScreenText`, `openingShot` afterwards.
- `checkpoint` is `1h`, `6h`, `24h` or `48h`. `hours` is the reading's real age. A metric the platform did not return is null.
- `status` is `candidate`, `active` or `dropped`. A candidate has fewer than three videos from three accounts in `evidence`. `roundsLost` counts rounds in which the pattern's best hook trailed the round's leader.
- `verdict.called` is false when the lead test fails, and `reason` says which condition failed. A round with no called leader keeps every active pattern and does not count as a loss for any of them.
- Money is whole USD micros, as in the runner.
- The numbers in this example are made up to show the shape. Only the evidence row is real.

## Scoring rubric

Score each line 0, 1 or 2. The total is out of 8.

| Criterion | 2 | 1 | 0 |
| --- | --- | --- | --- |
| Stops the scroll in three seconds | The first 11 words, about three seconds, make a claim or show a problem a viewer would stay for | The point arrives, but after the third second | Opens with a greeting, the brand name or scene-setting |
| One concrete number | A number the product's facts support, spoken in the first three seconds | A number later in the line | None, or one the user cannot support |
| Product named late | The product arrives after the problem, as the answer | Named in the middle | Named in the first sentence |
| Speakable in the take length | Fits the take's word count at 3.75 words per second, with no tongue-twisters and no symbols to read out | Fits only if spoken fast | Too long, or needs text on screen to make sense |

For a format with no speech, score the fourth row on whether the text can be read in the time it is on screen. Three words per second is a starting figure, untested.

Never invent a number to win the second row. If the product's facts hold no number, the best score on that row is 0 and the hook can still be chosen.

The rubric is a working rule and is untested here: no hook scored this way has been published and measured. It ranks drafts. It does not predict views.

## Scoring with a route (contract only)

No public route scores hooks or predicts reach. Searches of the catalog on 14 November 2026 for hook scoring and virality prediction returned nothing built for it.

One general judging route can apply the rubric: `typesafe#systemone`. It takes a `state` (the content to judge, a string or an object) and a `questions` map. Each question has a `type` of `noul` (yes or no, returned as a probability), `choice` (one of your options) or `score` (rated on 2-10 ordered levels you write in `criteria`), plus `instructions`. All questions are judged against the same state in one call. The listed price is $0.042 per million tokens, so scoring ten hooks costs well under a cent. Nobody has run it.

```json
{
  "state": { "product": "<one line>", "takeSeconds": 12, "hook": "<the hook>" },
  "questions": {
    "stopsScroll": { "type": "score", "instructions": "Do the first 11 words give a viewer a reason to keep watching?", "criteria": ["Greeting, brand name or scene-setting", "The point arrives after the opening", "A claim or problem in the opening words"] },
    "numberEarly": { "type": "noul", "instructions": "Is a concrete number spoken within the first 11 words?" },
    "productLate": { "type": "noul", "instructions": "Is the product first named after the problem is stated?" }
  }
}
```

These are the provider's fields. Through the runner, wrap them as `{"body": { ... }}` and add `--result-kind data`, because the answer is data and not a file ([generation.md](generation.md)). Count the words yourself for the fourth row; that one is arithmetic. Scoring by hand against the rubric is the default. Use the route when the user wants a second opinion on a long list, and show its answers beside your own scores, not in place of them.
