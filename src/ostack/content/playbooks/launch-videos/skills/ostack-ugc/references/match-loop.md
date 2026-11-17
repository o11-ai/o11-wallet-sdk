# Match a reference, round by round

A remake matches its reference when a person shown both would call them the same video about a different product. Copying the caption style alone does not get there. On 14 November 2026 a remake made from the caption style scored 32 out of 100 against its reference: the reference was shot from the tabletop in a coffee shop with all its text on screen from the first frame, and the remake was an eye-level selfie in a bedroom with lines appearing one by one. Eight rounds later an independent scorer, shown only the two videos, put it at 73: the same kind of video, and still a different cafe.

Work in rounds. Each round changes one thing, is scored against the reference, and names the next thing to fix.

## The tool

`node scripts/match.mjs` runs locally and calls nothing paid.

```bash
node scripts/match.mjs compare --reference references/<id>/source.mp4 --ours output/video-0.5x.mp4
node scripts/match.mjs score
node scripts/match.mjs ledger
```

`compare` writes these in `match/r<n>/` (plus each side's own strip and extracted audio):

- `pair.jpg`: the reference on top and yours below, eight columns, each column the same fraction of each video's running time.
- `measures.json`: length, cut times, brightness, saturation, warmth and whether there is sound, for both, with a 0 to 1 score per line.
- `rubric.json`: eleven lines for you to score from 0 to 3 by looking at `pair.jpg`.

`score` refuses a rubric with a blank line, and refuses a score below 3 with no note saying what differs. It adds the round to `match/ledger.json`, prints the score out of 100 and the three largest gaps, and says so when a round is worse than the one before.

Either file may be a still. Two stills are scored on the six lines a single frame can show, so a first frame can be matched for $0.03 a try before any clip is bought.

The cut detector misses a jump cut inside one framing, and the pair sheet's columns are a second apart, too coarse to place one. Pull a 5 frames-a-second strip across any change you suspect, then pass what you found: `--reference-cuts none --our-cuts 2.4`.

The total is 90% the rubric and 10% the measured lines. The measured lines alone flatter a weak remake: a bedroom selfie measured 82 against a coffee-shop reference.

If you cannot listen, score `sound` from the measurements (both have sound, similar loudness), give it at most 2, and say so.

**Have someone else score it.** The agent that made a remake scores it high. In the run below the maker gave rounds 0 and 3 scores of 32 and 80; a second agent given only the two videos gave 39 and 72, and found that the "jump cut" the maker had copied was one continuous take. Before reporting a score to the user, have a fresh agent fill the rubric from the videos alone, and report that number. If you cannot start a second agent, report the number as the maker's score, say it usually runs 5 to 10 points high, and ask the user to have it scored.

## The rubric

| Line | Weight | Look for |
| --- | --- | --- |
| `camera` | 14 | Lens height, tilt and distance. A phone lying on a table looking up is a different video from a selfie |
| `framing` | 12 | Where the subject's head sits and how tall it is, as fractions of the frame |
| `action` | 12 | What the subject does in each beat, in the same order, at the same moments |
| `setting` | 10 | The kind of place and what is behind the subject |
| `light` | 10 | Direction, warmth, brightness |
| `textLayout` | 10 | Typeface, size, colour, outline, position, line breaks |
| `foreground` | 8 | Objects between the lens and the subject, and at the frame edges |
| `textTiming` | 8 | When each piece of text appears and leaves |
| `gaze` | 6 | At the lens, at their work, away |
| `cuts` | 6 | How many, where, what kind |
| `sound` | 4 | Speech, music or silence, in the same places |

Score 3 only when you cannot tell the two apart on that line. Write notes as numbers: "her head is at 48% from the left; the reference is at 30%".

The person, the product, the words and the brand are meant to differ. Do not score them. A reference gives no right to copy its person, voice or footage. Its sound is the one thing a platform lets a post reuse, and only in the way "Use the same sound" below describes.

## The rounds

0. **Rebuild from the teardown, not from a favourite layout.** [reconstruct.md](reconstruct.md) maps each thing a reference does (its sound, hook, layers, captions, cuts) to the technique that produces it.
1. **Round 0: read the reference before writing a prompt.** From its contact sheet and one full frame, write down for every beat: lens height and tilt, how far the lens is from the subject, where the head sits and how tall it is as fractions of the frame, what is in front of the subject and at each edge, the light, where the subject looks, and what they do. Read a strip of the first two seconds at 4 frames a second to see whether the text is all there from the first frame or arrives line by line. These go in `beats[].look` and the style's overlays, which the `ostack-video-teardown` skill writes.
2. **Stills first.** Generate the first frame from that description at $0.03 and `compare` it to the reference's frame. State positions as fractions: "her face is centred at 27% from the left and 44% from the top and is 15% of the frame height", "ceiling fills the top 38%". Regenerate until `camera` is 3. Three or four tries is normal. Camera position is the line a later step cannot repair.
3. **One clip.** Generate the motion from the accepted frame with `alibaba#v1/video/wan2.7-i2v`, naming each action and how many seconds it lasts. Ask for more seconds than the reference runs, so a jump cut has footage to drop.
4. **Edit to the reference's clock.** Set the shot's `keep` ranges so the cut falls at the same fraction of the running time. Put the text on with the reference's timing: `"every": 0` and `"enter": {"kind": "none"}` when all of it is there from the first frame.
5. **Repair for free before regenerating.** When the subject is in the wrong place, crop the accepted still so they sit where the reference has them, scale it back to the clip size, and score it as a still before buying the next clip: `ffmpeg -i frame.png -vf "crop=576:1024:144:128,scale=720:1280:flags=lanczos" frame.jpg` keeps the right 80% and the middle 80% of the height. A crop in the edit (`"zoom": 1.25` on the shot, with the point to hold still as `"camera": {"punchIn": {"scale": 1, "seconds": 0, "on": "none", "origin": {"x": 0.8, "y": 0.6}}}` in the style) also works, but pull a frame to see which edge it kept, and note that a later shot plan inherits `zoom` unless it sets `"zoom": 1`. Brightness, contrast and saturation are `grade` (`{"brightness": 1.1}`); warmth is not adjustable in the edit. Text size and position are the overlay.
6. **Stop** when two rounds in a row gain under 3 points, when the next fix costs more than the user approved, or at 85. On the routes used here the independent score levelled off in the low 70s, so the first of those is the usual stop. Report the ledger and the gaps that remain.

One change per round. A round that changes the frame, the clip and the text at once cannot tell you which one helped.

## What ran

Reference: an 8.5 s video with no speech, six lines of text, one continuous take, a music bed. Total spend $3.45.

| Round | Kind | Change | Maker's score | Independent |
| --- | --- | --- | --- | --- |
| 0 | clip | The earlier remake, made from the caption style alone | 32 | 39 |
| 1 | still | A new first frame. Four prompts at $0.06 each; the second was used | 80 | |
| 2 | clip | A 10 s clip from that frame ($1.00), cut to 8.4 s with a jump cut; all text from the first frame; a generated music bed ($0.025) | 75 | |
| 3 | clip | A 1.25x crop in the edit. It kept the wrong edge and moved her only a little | 80 | 72 |
| 4 | still | The round 1 still cropped locally so her head sits at 33% from the left. Nothing bought | 85 | |
| 5 | clip | A new 10 s clip from the cropped still ($1.00), asked to write for five seconds before typing; cut with a jump cut at 3.5 s | 90 | |
| 6 | clip | The same clip as one continuous 8.5 s stretch, after the independent scorer showed the reference has no cut. Nothing bought | 79 | 69 |
| 8 | clip | The cup and laptop fixed in the first frame with a boxed edit ($0.06); a new clip in which she slides right to the laptop ($1.00); the reference's own sound under it | 80 | 73 |

Maker's scores for rounds 0 to 5 used an earlier weighting (80% rubric); the tool now uses 90%.

A still round and a clip round are scored on different lines, so `score` compares each round with the last one of its own kind.

Left at round 8, in the independent scorer's order of what a viewer notices first:

1. A pause the reference does not have: she puts the pen down a second early, sits up and leans toward the lens for about two seconds, then types. The reference goes from pen to keys in half a second with her head down.
2. The room: a plain wall where the reference has a map, a different ceiling, and a horizon tilted about 9 degrees against 3.
3. Everything is closer: the cup, notebook, laptop and her face fill more of the frame, and the picture is 12% darker.

What moved the score between rounds 6 and 8:

- **A boxed edit of the accepted frame.** `bbox_list` on `alibaba#v1/image/wan2.7-image`, with one box round the cup and one round the laptop and a prompt that names only those two changes, replaced the dome lid with a flat lid and straw and cut the laptop to a sliver. The camera, the wall and the subject did not move. An edit with no boxes, asking for five changes, had repainted the wall.
- **Naming the body movement.** "Slides her whole upper body sideways to the right, her head moving across to the right half of the frame" moved her from 36% to 52% of the width. It also brought the lean toward the lens, so say "keeps her head down" as well.
- **The same sound.** The scorer measured the two audio tracks as the same recording.

Two tries before that did not help ($0.12): a new prompt written from an independent teardown's `look` got the map wall and lost the camera, and an unboxed edit kept the camera and repainted the wall dark.

On these routes, expect a remake to reach "the same kind of video" (camera position, action, text, timing, sound) in the low 70s and to stop short of "the same room". Say that to the user before they pay for more rounds.

What did not work:

- **A block-out image.** A flat diagram of coloured blocks passed as a first input image, with an earlier still as the second, did not move anything: the model returned the earlier still nearly unchanged.
- **Asking for the subject off-centre in words.** Every prompt put her within a few percent of the centre. Cropping the still in round 4 fixed what four prompts did not.
- **Asking for the action timing loosely.** "Writes, then types" gave 2.4 s of writing against the reference's 3.5 s. "For the first five full seconds she keeps writing" gave 4.5 s, enough to cut from.
- **Reading a cut from one-second tiles.** The maker saw writing in one tile and typing in the next and built a jump cut into rounds 2 to 5. A 5 frames-a-second strip shows the pen put down and the arm reaching: one take.

## Use the same sound

A trending video's sound is part of why it travels, and on TikTok and Instagram a sound is there to be reused: a post that attaches it is listed on the sound's page. A generated track in a guessed genre is not a match.

1. **Identify it.** `sound` in the imported `reference.json` holds the sound's id, title, author and link. The `ostack-video-trending` skill says how to look up how many videos use it.
2. **Get the audio for the cut.** When the reference has no speech, its own audio track is the sound: `ffmpeg -i references/<id>/source.mp4 -vn -c:a libmp3lame -b:a 160k sound.mp3`, then `node scripts/ugc.mjs ingest . --file sound.mp3 --role music --id sound` and name the file under `music` in the shot plan. Time the cut to it. When the reference has speech over the sound, no public route separates the two; cut to the picture and add the sound when posting.
3. **Post with the sound attached, not baked in.** Give the user the sound's link with the finished file. They open the link in the app, choose to use the sound, and upload a copy of the video with its music muted, or keep the video's own audio low under it. A sound that is only baked into the file is not linked to the sound's page.
4. **Say what the user has to decide.** An "original sound" is another creator's audio; a released track on a business account may be limited to the platform's commercial library. Whether to use it is their call at posting. Keep the file with the sound in it local: do not upload it to o11 or send it to a model.

This ran in round 8: the reference's sound was "original sound - ryuretro", used in 108,788 videos, and its audio was laid under the remake from the reference file.
