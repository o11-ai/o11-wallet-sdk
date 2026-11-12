# Reels

A reel is one talking-to-camera clip turned into a 1080×1920 short (Instagram Reels, TikTok, YouTube Shorts) with the
same glass, type and motion as a launch film. Start one with `o11 ostack launch-videos new <name> --format reel`; its
`edit/timeline.js` and `edit/scenes.js` are a worked example to change.

## Workflow

1. Put the clip in `media/clips/` and look at it as a 1 fps contact sheet: where the open space is, where hands go.
2. `node scripts/pauses.mjs <clip>`: the first word, every pause of 0.3s or more, the ones it would not cut and why,
   and suggested `keep` ranges. Transcribe the clip (the transcribe step) for the words.
3. Write the edit: paste `keep` into the shot, then the headlines and cards, every time in the clip's seconds.
4. `node scripts/prepare.mjs --scale 0.5` also measures the speaker's head line on every frame.
5. Speech, sound effects, mix, render, encode and the audits, as in any video. Iterate on one second at a time with
   `--from`/`--to` before rendering the whole reel.

## Layout

- The speaker is centred, so the open space is the top third. Headlines are centred at the top (resting at 214px,
  76px type; the hook 96px). Cards are centred under them: `y` 412 under a two-line headline, 335 under one line.
- Keep clear of the app's own UI: nothing rests above 200px (the top bar), in the bottom 350px (caption and buttons)
  or on the right rail.
- Never cover the head. The head line is measured per frame because a real hairline moved by 100px across one reel;
  the layout audit keeps every card 8px above it on every frame.
- Make visuals big: phone viewers asked for larger. The reel layout sizes rows, pills and type up on its own.
- No corner mark. The mark appears in the call-to-action capsule.

## The hook

The speaker's own words, on screen from the first frame (start it a beat before the first kept second so it is already
arriving). A real credibility mark can sit inline before the first line, sized to the cap height. Real marks only.

## Cutting

Launch films are never cut. Reels are, lightly: start on the first word and tighten only the big pauses, keeping natural
beats of 0.3–0.6s ("don't need many cuts").

- Find cuts in the audio, never from word timings: one transcriber put the first word 0.35s early, and merged a spoken
  link into one word, which made speech look like a 0.9s pause.
- Word endings trail quietly ("easy" stayed 0.4s under the loud threshold), so a pause is cut only when it lasts at least
  0.8s and holds at least 0.5s of true silence. The cut sits inside the silence.
- Keep about 0.07s before the first word and 0.4s after the last sound, so the reel loops cleanly.
- The suggested ranges are a start: read the "not cut" lines. The clipped-word audit is the backstop.

## Timing

- Every time is in the clip's seconds. A time inside a removed pause lands on the cut, so a headline that ends there and
  the next one change exactly at the cut and nothing jumps.
- Each card leaves as its headline starts to leave. Otherwise the next headline, which rises 145px, slides through it.
- A card enters at least 0.3s after its own headline; closer and the rising headline crosses it.
- Counters, chips and slots land on the spoken word, from `edit/speech.js`.
- The last headline and the call to action hold to the end (`99`): no fade.

## Cards

`page/primitives.js`: a `row` with a real logo and a counting pill (`countUp`), checked `chips` that land on their words
(`reveal`), a `capsule` that widens from the mark into the link (`widen`), and a checked `claim` under it. Logos the
speaker only mentions (a mail app, a calendar) are demo values: say so at handover.

## Sound and delivery

The camera voice exactly as recorded, centred, one gain, cuts joined with 6ms fades. A plain whoosh on the hook and as
each card scene enters; nothing else, and no music. Deliver the 1080×1920 master (the Reels maximum) and a phone preview
under 30 MB (the deliver step).
