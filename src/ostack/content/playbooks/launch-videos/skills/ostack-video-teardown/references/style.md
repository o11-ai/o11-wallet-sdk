# Writing style.json

`style.json` is what the editor applies to other footage. Every value should trace to a frame, a region sample or a script measurement. Record how you got the uncertain ones in a `notes` field; readers ignore fields they do not know.

`write` adds `version`, `name` (the reference id) and, when you leave them out, `canvas` from the probe and `cuts.meanShotSeconds` from the `shots` step.

Three states for every section, and they mean different things:

| You write | Meaning |
| --- | --- |
| The section with values | The video does this; copy it |
| The section switched off (`"captions": { "enabled": false }`, `"overlays": []`, coverage 0) | The video does not do this |
| null, or the section left out | Not recorded; the editor uses its house default |

## Captions

Captions are the words of the speech drawn on screen in time with it. Titles, labels and price tags are overlays.

Work from full-size frames, not sheet tiles. A tile is 270 or 480 pixels wide, which is too small to measure type.

1. Find three moments with a caption up, in different beats. Run `frame --at <s> --grid` for each and open them.
2. **Position.** The grid lines are labelled `y 0.1` to `y 0.9` down the left and `x 0.1` to `x 0.9` along the top. Read where the middle of the caption block sits. A block between the 0.7 and 0.8 lines, nearer 0.8, is `y: 0.77`. Take the middle of your three readings. `x` is 0.5 unless the block is clearly off centre.
3. **Size.** On a frame without the grid (`frame --at <s>`), measure a capital letter's height in pixels. Font size is about 1.4 times that. For lower-case text with no capitals, measure a digit or a tall letter such as l or d. If the frame is 720 wide and you want the size on a 1080 canvas, multiply by 1.5. Write the size for the canvas in `style.json`.
4. **Colours.** `frame --at <s> --region x0,y0,x1,y1` with a box drawn tightly round the caption. Expect the footage behind it to take the largest share. The fill is the brightest colour with a clear share; pure text fill usually reads within a few steps of its true value (`#fbfbfb` for white). A dark colour at a similar share is the stroke or the shadow.
5. **Stroke, box, shadow.** Stroke: a dark outline all the way round each letter; estimate its width in pixels on the full-size frame. Box: a filled shape behind the whole group; sample its colour and estimate corner radius and padding. Shadow: darkness on one side only. Each is an object or null.
6. **Case and weight.** `upper`, `lower`, `sentence` (first word capitalised), `asis` (mixed, as spoken). Weight 400 regular, 600 to 700 bold, 800 to 900 heavy. Name the font family only if you can identify it; otherwise give the closest common family and say so in `notes`. `font.file` is null.
7. **Words per group.** On 4 fps strips, write down the text of at least five different groups. `maxWords` is the largest word count, `maxChars` the longest group's characters including spaces. If groups break at punctuation, say so in `notes`.
8. **Active word.** Within one group, compare tiles 0.25s apart. `color`: the spoken word changes colour (sample it for `active.color`). `underline`: a line under it. `fill`: the words already spoken are solid and the ones to come are dimmed, with the whole line on screen (set `active.dim`). `scale`: it is larger (estimate `active.scale`, 1.1 to 1.3 is typical). `box`: a filled shape behind that word only. `none`: the group appears whole and nothing moves.
9. **Entrance.** Make an 8 fps strip across one group change (`sheet --from <s> --to <s+1> --fps 8`). `pop`: appears slightly large or small and settles within about 0.1s. `fade`: opacity ramps. `slide`: moves in. `none`: on in one frame. `seconds` is the number of tiles it takes divided by 8.

A measured example, from a 540x960 clip: the grid frame at 1.5s shows the block centred just under the 0.8 line, so `position` is `{ "x": 0.5, "y": 0.79 }`. Groups read "Okay, I have", "to show you", "this notebook because", "it honestly changed", "how I plan", "my week.", "Every page has": `maxWords` 3, `maxChars` 21, case `asis`. The spoken word carries a thin line under it and nothing else changes: `active.mode` is `underline`.

## Cuts

- `meanShotSeconds`: from `shots`, after you have confirmed the cuts on strips. For motion graphics with no hard cut, the length divided by the number of scenes you counted.
- `tightenPausesOver`: the longest pause the edit leaves in. Compare gaps between words in `transcript.words` with the `audio` silences. If no gap between words exceeds 0.25s, pauses were cut: write 0.25. If sentence pauses of 0.3 to 0.5s remain, they were not: write null.
- `cutOn`: `word` when cuts land within 0.1s of a word start, `beat` when they land on a regular musical interval (equal gaps between cuts), `free` otherwise or when there are no cuts.

## Camera

Compare the presenter's size across a strip. A punch-in is a jump or fast ramp to a tighter frame with no change of shot: measure head width before and after for `scale` (1.1 to 1.2 is common), count tiles for `seconds`, and set `on` to `emphasis` when it lands on a stressed word or `cut` when it lands on cuts. `push` is a slow continuous zoom over a whole shot. `shake` is added jitter. Set each to null when it is absent.

## Transitions

`default` is how most shot changes happen. Look at the two tiles either side of each cut on a strip:

| You see | Kind |
| --- | --- |
| Shot A in one tile, shot B in the next | `cut` |
| One white or bright frame between | `flash` |
| Horizontal blur streaks | `whip` |
| A fast scale-up into the next shot | `zoom` |
| Both shots blended, or A dimming to a plain colour before B | `fade` |

List in `kinds` every transition used with its length in seconds. Use an 8 fps strip to time anything shorter than 0.25s.

## Overlays

Everything drawn over the footage that is not a caption. One entry each, with `kind`:

| Kind | Example |
| --- | --- |
| `header` | a title or line of text that stays up across speech |
| `sticker` | an emoji, arrow or small graphic |
| `progress` | a bar or counter that advances |
| `card` | text or data on its own filled shape |
| `image` | a logo, screenshot or photo placed over the frame |

`position` is the element's centre as fractions, read from a grid frame. `from` and `to` are `"start"`, `"end"`, seconds, or `{ "word": n }` when the overlay appears on a spoken word (n is the index in `transcript.words`, from 0). Prefer the word form when it fits within 0.1s of a word start, because it survives a new script. Measure `size` and `color` as for captions.

## B-roll

`coverage` is the share of running time where cutaway footage hides the speaker: add the lengths of the `broll` stretches and divide by the video's length. `mode` is `full` when it fills the frame, `inset` when the speaker stays visible. `meanSeconds` is the average stretch.

## Sound

The `audio` step gives integrated loudness, true peak, mean level and silences. It cannot separate music from speech.

- No speech: the whole mix is the bed. `music.level` is the mean level rounded to a whole dB, `duckUnderSpeech` 0.
- Speech with a bed: the level inside the pauses the `audio` step reports with `--noise -25` approximates the bed. If you cannot isolate it, leave `music` out and say so in `notes`.
- No bed that you can detect (the level falls below -35 dB as soon as speech stops): write `"music": null`, say why in `notes`, and add an `unseen` entry in the reference, because nobody listened.
- `sfx`: list only effects a tool or a visible cue establishes. Otherwise `[]` plus the `unseen` entry.

## Grade

You cannot measure a grade without the ungraded source. Write 1, 1, 0, 0 (contrast, saturation, temperature, vignette) when the picture looks untreated, and adjust a value only for something visible on a full-size frame: darkened corners (vignette 0.2 to 0.4), a clear warm or cool cast (temperature plus or minus 10 to 20), crushed blacks (contrast 1.1 to 1.2). Say in `notes` that these are read by eye.

## Safe area

`canvas.safe` is the margin the source keeps clear of text, in pixels. Record it only when the video has text near an edge: the distance from the nearest text to each edge, read from grid frames. Otherwise leave it out and the editor uses the platform default. When you do record it, write `width`, `height` and `fps` beside it: a `canvas` holding only `safe` fails `write`.
