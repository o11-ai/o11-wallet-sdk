# Writing reference.json

`probe` writes a draft with the source, the picture facts and empty slots. `words` fills the transcript. You write the rest in a draft file and `write` merges it. Leave out `source.file`, `source.sha256`, `media.seconds`, `media.width`, `media.height`, `media.fps`, `transcript.words` and `measured`: the script's values replace yours.

## What you fill in

| Field | Rule |
| --- | --- |
| `source.url`, `author`, `postedAt` | From the link and the platform's response. Null for a local file. `--url`, `--author` and `--posted-at` on `probe` set them too |
| `metrics` | Five numbers from the platform, or null each. Never an estimate |
| `media.hasSpeech` | True only if words were imported or you have a transcript. False needs a reason in `unseen` when the audio was not transcribed |
| `media.language` | Two-letter code. `words` sets it from the transcription |
| `hook` | `start` 0, `end` where the viewer knows what the video is about. `spoken` and `onScreen` are null when absent. `kind` is one of the six below |
| `beats` | The beat sheet, rules below |
| `formula` | One reusable line: the order of jobs, with no names from the source |
| `productFirstSeen` | The first second the product, or its name, is on screen. Null if it never appears |
| `unseen` | What was not inspected. `[]` only when frames, audio and speech were all checked |

Hook kinds:

| Kind | The opening... |
| --- | --- |
| `claim` | states a result or an opinion ("this changed how I plan my week") |
| `question` | asks the viewer something |
| `demonstration` | shows the product doing the thing before any explanation |
| `stunt` | does something odd or risky to hold the eye |
| `story` | starts a personal account ("so last Tuesday...") |
| `other` | none of these; say what it is in the first beat's `action` |

## Beats

One beat is one job. Roles:

| Role | The footage is... |
| --- | --- |
| `hook` | earning the next three seconds |
| `problem` | naming the pain or the old way |
| `proof` | giving evidence: a number, a result, a testimonial, a feature stated as fact |
| `demo` | showing the product working |
| `payoff` | landing the benefit or the result |
| `cta` | asking for an action, or closing on the brand |
| `other` | a bridge, a joke, a credit |

Shots:

| Shot | What fills the frame |
| --- | --- |
| `presenter` | a person talking to camera |
| `screen` | a recording of software |
| `product` | the physical product, no face |
| `broll` | cutaway footage that is not the presenter, screen or product |
| `graphic` | designed motion graphics: cards, diagrams, logos |
| `text` | words on a plain background and nothing else |

When a beat mixes shots, pick the one on screen longest and name the others in `action`.

Boundaries:

- With speech, end a beat at the start of the next beat's first word. Read the times from `transcript.words` in `reference.json`; do not eyeball them from tiles.
- Without speech, end a beat at the cut, or at the first tile of the new scene on a 4 fps strip.
- The first beat starts at 0. The last ends at `media.seconds` exactly as `probe` printed it, even if the picture ends a frame or two earlier.
- Times have at most two decimals.

`camera` covers framing, angle, movement and whether it is one take: "selfie at arm's length, eye level, head and shoulders, handheld, one take". For graphics write "flat graphic, no camera".

`action` says what happens, in order, with times for anything that appears mid-beat: "three cards fade in one after another at 4.77, 5.5 and 6.5". It never judges ("strong", "engaging") and never guesses at intent.

`spoken` is the transcript for that beat's time range, copied, not paraphrased. Null when nothing is said.

`onScreen` holds one object for each piece of text, in reading order:

```json
"onScreen": [
  { "text": "POV: you finally found it", "from": 0, "to": 2.75, "position": "top" },
  { "text": "13 said yes.", "from": 1.25, "to": 2.75, "position": { "x": 0.5, "y": 0.31 }, "style": "white, heavy, black outline, pops in" }
]
```

- `text` is copied exactly, with its capitals and line breaks (`\n`).
- `from` and `to` are source seconds, read from a 4 fps strip to the nearest 0.25s. Use an 8 fps strip when text changes faster than that. Text that is up from the first frame has `from` 0; text still up at the end has `to` equal to the video's length.
- `position` is where the centre of the text sits: `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom` or `bottom-right`, or `{ "x", "y" }` as fractions of the frame read from a grid frame. Use the fractions whenever you opened a grid frame.
- `style` is optional: a short description, or an object, for text that does not look like the captions in `style.json`. Say how it enters (cut, fade, pop, slide, typed) when you can see it.
- Text that stays up across several beats is listed in each of them with the same `from` and `to`.
- Captions that follow the speech word by word are not listed here. Their words are in `transcript.words` and their look is in `style.json`.
- A plain string is still accepted, for files written before timing was recorded. `check` prints a note for each beat that has one. Text you could read but not time keeps its string and gets an `unseen` entry with the beat id.

`audio` is one of `speech`, `music`, `sfx`, `silence`, or a list such as `["speech", "music"]`. Use the `audio` step's silences: a beat is `silence` only if a reported silence covers it.

## A worked example

A 10.03 second selfie clip, one take, 37 words, no captions:

```json
{
  "hook": { "start": 0, "end": 1.96, "spoken": "Okay, I have to show you this notebook", "onScreen": null, "kind": "claim" },
  "beats": [
    { "id": "b1", "start": 0, "end": 1.96, "role": "hook", "shot": "presenter",
      "camera": "selfie at arm's length, handheld with slight drift, eye level, head and shoulders, one take",
      "action": "looks into the lens and holds a closed blue spiral notebook at chest height, lower left of frame",
      "spoken": "Okay, I have to show you this notebook", "onScreen": [], "audio": "speech" },
    { "id": "b2", "start": 1.96, "end": 4.6, "role": "payoff", "shot": "presenter",
      "camera": "same take, same framing",
      "action": "keeps talking to the lens; the notebook tilts slightly but stays closed",
      "spoken": "because it honestly changed how I plan my week.", "onScreen": [], "audio": "speech" },
    { "id": "b3", "start": 4.6, "end": 7.3, "role": "proof", "shot": "presenter",
      "camera": "same take, same framing",
      "action": "names the feature while raising the notebook a little; the pages are never opened or shown",
      "spoken": "Every page has a tiny checklist built in,", "onScreen": [], "audio": "speech" },
    { "id": "b4", "start": 7.3, "end": 10.03, "role": "payoff", "shot": "presenter",
      "camera": "same take, same framing",
      "action": "states the result to the lens and stops; speech ends at 9.78 and the last 0.27s is silent",
      "spoken": "and I have not missed a deadline since I started using it", "onScreen": [], "audio": "speech" }
  ],
  "formula": "Tease the object in the first two seconds, say what it changed, name the one feature behind it, close on the result",
  "productFirstSeen": 0,
  "unseen": ["music: no bed is assumed because the level drops below -35 dB once speech ends, but nobody listened"]
}
```

Why it is cut this way: 1.96, 4.6 and 7.3 are the start times of "because", "Every" and "and" in the word timings. Beat 3 is `proof`, not `demo`, because the feature is stated and never shown. There is no `cta` beat because nothing asks for an action.

## Errors from write and check

| Message starts with | Fix |
| --- | --- |
| `beats[n].start: gap of` | Set this beat's `start` to the previous beat's `end` |
| `beats[n].start: overlaps` | Same; two beats claim the same time |
| `beats[n].end: the last beat must end at` | Use the length `probe` printed |
| `beats[n].role: must be one of` | Use a listed value; put the nuance in `action` |
| `beats[n].onScreen[i].to: must be after from` | The text goes off after it comes on; read both times again from the strip |
| `beats[n].onScreen[i].position: must be one of` | Use a listed region, or `{ "x", "y" }` between 0 and 1 |
| `measured...` | The block is written by the script. Run the step again; do not edit it by hand |
| `media.hasSpeech: is false but transcript.words is not empty` | Words were imported; set it true or leave it out |
| `unseen: must say what was not inspected` | The source file is null; list `"frames"` and `"audio"` |
| `source.sha256: does not match` | The source file changed; run `probe` again, then redo the steps |

## `look`: enough to rebuild the shot

`camera` is one line for a reader. `look` is what a remake is generated from. Open a grid frame (`node scripts/teardown.mjs frame --at <seconds> --grid`) and fill it for each beat; write `"same as b1"` when nothing changed.

```json
"look": {
  "lens": "phone lying on the table at its near edge, about 5 cm above the surface, tilted up about 30 degrees, wide",
  "subject": { "x": 0.30, "y": 0.44, "height": 0.15, "note": "seated, seen from below, left third of the frame" },
  "bands": "ceiling in the top 38%, back wall from 38% to 72%, tabletop below",
  "foreground": ["iced drink at the left edge from 62% down, out of focus", "open notebook across the bottom", "laptop edge at the right, from 58% down"],
  "setting": "busy coffee shop, pale wood wall with a warm light strip, one person far behind",
  "light": "warm ceiling spots, dim, soft on the face",
  "gaze": "down at the notebook, never at the lens",
  "textTiming": "all six lines on screen from the first frame to the last"
}
```

- `subject.x` and `subject.y` are the centre of the face; `height` is the face's height. All three are fractions of the frame.
- `lens` says where the camera is, not what the shot is called. "Eye level at arm's length" and "on the table looking up" produce different videos.
- `foreground` lists what sits between the lens and the subject and at each edge. These objects are what make a shot look filmed and not posed.
- `textTiming` comes from a strip of the first two seconds: `node scripts/teardown.mjs sheet --from 0 --to 2 --fps 4`. It is one line for a reader; the times themselves go on each `onScreen` item.
- `check` prints a note for every beat with no `look`. It does not fail, because a reference saved from a link alone has no frames to read.
- A person on camera who does not speak to the lens (working, cooking, walking) is still `shot: "presenter"`; say what they do in `action`. A second beat that continues the same activity under the same text takes the role of what it adds, usually `proof` or `payoff`.
- `hook.onScreen` is one string. When the hook is several lines of text, join them with " / " there and list them one by one in the beat's `onScreen`.
- Decide whether a change is a cut from frames, not from one-second tiles. Pull `sheet --from <s> --to <s> --fps 5` across it: a pen put down and an arm reaching is one take; a hand that jumps between two frames is a cut. A remake built on a cut the reference does not have is scored down for it.
- A picture that is flipped left to right (lettering on a wall reads backwards) goes in `notes`.

## `layers`: what sits on top of what

Add `layers` to every beat's `look`, bottom first, so a remake can stack the same things:

```json
"layers": ["product screen, full frame, scrolling", "presenter cut out of their background, centre, 0.5 of the width", "captions over the presenter's chest", "header, top, first beat only"]
```

Say for the presenter whether they fill the frame, sit in a box with their own background, or are cut out with no background. These three are built differently.

