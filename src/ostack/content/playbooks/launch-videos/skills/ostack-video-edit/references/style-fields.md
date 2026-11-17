# Style fields the renderer reads

`edit/style.json` follows the shared video-skills contract (`version: 1`). This page lists what the launch-videos renderer does with each field. A section that is `null` or absent keeps the house look for that section. A field marked "not applied" renders without the feature and is listed by `node scripts/render.mjs --check`. A style file never fails a render; a font or image file that is missing does, and the message names the file.

## canvas

| Field | Effect |
| --- | --- |
| `width` | Sizes in the style are pixels at this width and scale to the video's width. Default: the video's own width |
| `safe` | `{ top, bottom, left, right }` in pixels. Captions and overlays wrap inside it and the overlap audit enforces it. Default 200, 350, 60, 120 |
| `height`, `fps` | Not used. The video's size and frame rate come from `edit/timeline.js` |

## captions

Captions need word timings in `edit/captions.js`.

| Field | Values | Default in a captions block |
| --- | --- | --- |
| `enabled` | `false` hides captions | `true` |
| `font.family`, `font.weight`, `font.file` | Family name, 100 to 900, path under the video folder or `null`. The file is loaded at that weight before any frame is drawn; a missing file stops the render and names the font | brand or system font, 800, `null` |
| `letterSpacing` | Ems between letters, -0.1 to 0.4 | 0 |
| `lineHeight` | Line pitch as a multiple of the size | 1.18 |
| `width` | Widest a caption may run before wrapping, as a fraction of the frame | the safe area |
| `align` | `center` (lines balanced) or `left` (lines share a left edge and fill before wrapping) | `center` |
| `punctuation` | `false` drops trailing commas and full stops from the words on screen | `true` |
| `size` | Pixels | 72 |
| `case` | `upper`, `lower`, `sentence`, `asis` | `asis` |
| `color` | CSS colour | `#ffffff` |
| `stroke` | `{ color, width }` or `null` | black, 8 |
| `box` | `{ color, opacity, radius, padding }` or `null` | `null` |
| `shadow` | `{ color, blur, y }` or `null` | `null` |
| `position` | `{ x, y }`, centre of the caption | 0.5, 0.72 |
| `maxWords`, `maxChars` | A caption breaks before it would pass either | 3, no limit |
| `active.mode` | `none`, `color`, `underline`, `scale`, `box`, `fill` | `none` |
| `active.dim` | `fill` only: opacity of the words not yet spoken, 0 to 1 | 0.45 |
| `active.color`, `active.scale` | Colour for the mark; a scale above 1 also grows the word in any mode. Above 1.15 the word crowds its neighbours | `#ffe600`, 1 |
| `enter` | `{ kind: none|pop|fade|slide, seconds }` | none |

A caption also breaks at a sentence end, at a pause longer than 0.45 s and at every shot change. It stays on screen up to 0.25 s past its last word, or until the next caption starts. A caption that does not fit two lines shrinks, down to half its size. Sentence case capitalises the first word of each sentence and leaves every other word as transcribed, so names keep their capitals. `lower` lowercases everything, names and "I" included.

## overlays

Each entry has `kind`, `position`, `from`, `to`, and for text kinds `text`, `size`, `color`, `weight`, `font` (its own `{ family, weight, file }`; the captions' family when left out), `letterSpacing`, `lineHeight`, `width`, `stroke`, `box`, `shadow`, `enter`. `from` and `to` are `"start"`, `"end"`, seconds, or `{ "word": n }` (the start of word n, counted from 0 across the whole script, placed on the cut if that word was removed). Defaults: `"start"` to `"end"`.

| Kind | Draws |
| --- | --- |
| `header` | Text centred on `position`, default `y` 0.12 and size 54. `|` or a line break in `text` starts a new line. Colour emoji draw in colour when the computer has an emoji font |
| `stack` | Several lines that appear in turn and stay. `lines` is a list of strings or `{ text, from }`; an empty string is a blank line. A line with no `from` arrives `every` seconds (default 0.6) after the one before. Each line fades in over `enter.seconds`. Needs no speech |
| `sticker` | Text or an emoji, rotated (`rotate`, default -4 degrees), popping in over 0.12 s |
| `progress` | A bar across the safe width that fills as the video plays. `size` is its height, `position.y` its line |
| `image` | The image at `file`, `size` pixels wide |
| `card` | Not applied |

An anchor past the last word is reported and the overlay is left out.

## camera

| Field | Effect |
| --- | --- |
| `punchIn.scale`, `punchIn.seconds` | Zoom factor (1 to 2) and how long the move takes. 0 seconds is a hard jump |
| `punchIn.on` | `emphasis`, `cut` or `none`. Punch-ins toggle: the first zooms in, the next returns to full frame |
| `punchIn.at` | Optional list of anchors. Replaces the `on` rule with exact times |
| `punchIn.origin` | `{ x, y }` the zoom holds still. Default 0.5, 0.4, about face height |
| `push.scale` | A slow zoom from 1 to this value across each shot |
| `shake` | `{ amplitude, frequency, seed }`: handheld drift on footage. Amplitude in pixels (default 6), frequency in sways per second (default 0.5), seed fixes the path (default 1). Off when `null` or absent. The footage is scaled up by four times the amplitude over the short side so no edge shows |

Emphasis means the first word of every sentence after the opening one. If the script has no sentence punctuation, it is the first word after each pause of 0.3 s or more. Only footage zooms. Captions, overlays and glass stay put. A push and a shot's own `zoom` hold the same origin still.

## transitions

| Field | Effect |
| --- | --- |
| `default` | `cut`, `flash` or `fade`, played on every cut, including jump cuts inside a clip |
| `kinds[]` | `{ kind, seconds }` sets how long that kind lasts (flash 0.1 s, fade 0.3 s by default). With `at: [anchors]` it also plays at those times |
| `whip`, `zoom` | Not applied |

A flash peaks white on the cut frame and decays. A fade dips to black, centred on its time. A shot's own `transition` in the shot plan replaces the default for the cut into that shot.

## grade, sound

| Field | Effect |
| --- | --- |
| `grade.contrast`, `grade.saturation` | Applied to footage only |
| `grade.brightness` | 0.2 to 3, default 1. Multiplies the footage's brightness; captions and overlays are not affected |
| `grade.vignette` | 0 to 1, darkens the corners |
| `grade.temperature` | Not applied |
| `sound.music.level`, `sound.music.duckUnderSpeech` | Bed loudness and how far it drops under speech, when the timeline has music. Re-run `mix` |
| `sound.sfx[]` | `{ "on": "cut", "kind": "whoosh", "level": -18 }` puts the house whoosh on every cut. Other cues are not applied. Re-run `sound-effects` and `mix` |

## broll and cutaways

`broll.mode` (`full` or `inset`) is the default mode for this video's cutaways. `broll.coverage` and `broll.meanSeconds` describe the reference's pacing and are listed as not applied: use them to decide how many cutaways to place and how long each runs.

Cutaways themselves are in `edit/cutaways.json`: `{ "version": 1, "cutaways": [ … ] }`.

| Field | Values | Default |
| --- | --- | --- |
| `file` | A png, jpg or webp still, or an mp4, mov, m4v or webm clip, inside the video folder | required |
| `from`, `to` | `"start"`, `"end"`, seconds or `{ "word": n }` | required |
| `mode` | `full` or `inset` | `broll.mode`, else `full` |
| `push` | 1 to 1.5: the picture grows to this scale across the cutaway | 1.06 for a still, 1 for a clip |
| `start` | Seconds into a clip where it begins | 0 |
| `position`, `width`, `radius` | Inset only: centre as fractions, width as a fraction of the frame, corner radius in pixels | 0.5 and 0.3, 0.7, 28 |

An inset keeps the picture's own shape. A cutaway that overlaps another, names a missing file or anchors past the script stops the render with its index. Clips are extracted by `prepare`; stills are drawn directly.

## Hand-written caption phrases

A caption group in `edit/captions.js` may carry `phrases`: strings that spell its words in order, or `[first, last]` inclusive word ranges counted from 0 within that group. They replace `maxWords`, `maxChars`, the pause rule and the sentence rule for that group. They must cover every word exactly once; otherwise `render.mjs --check`, the render and `ugc.mjs captions` all fail with the word where it went wrong. Import them with `ugc.mjs captions` rather than editing `edit/captions.js`, which is regenerated.

## Replacement speech

A clip shot with `speech: "<file>"` in the shot plan plays `media/narration/<file>` (wav, mp3, m4a, aac or flac) from its first frame instead of its own sound, cut at the end of the shot. Its caption group is stored with `clock: "shot"`: word times are seconds from the start of the shot, not of the source clip. Word timings are filed as `media/words/<file without extension>.json`.

## Planning fields

`cuts` describes the reference's pacing. The renderer plays the timeline it is given, so it is listed as not applied. Use it when you write the shot plan: `cuts.tightenPausesOver` is the pause length to cut with `node scripts/pauses.mjs <clip>`.

## Text quality

Text is drawn by Chrome: anti-aliased, kerned from the font's own tables, with the outline painted under the fill so it sits outside the letterforms (half of `stroke.width` shows). Emoji draw in colour from the computer's emoji font. Fonts from `scripts/fonts.mjs` are the Latin subset; other scripts fall back to a system font.

## Anchors

`from` and `to` on an overlay or a cutaway take `"start"`, `"end"`, seconds, `{ "word": n }` or `{ "shot": "<id>" }`. A shot anchor is that shot's first frame as a `from` and its last as a `to`, so a header can end exactly on a cut and an inset can start exactly on one. A cutaway also takes `"alpha": true` for a clip with transparency and `"captionsOver": true` to let captions lie over it.
