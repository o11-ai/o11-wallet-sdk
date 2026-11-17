---
name: ostack-video-edit
description: "Edit a short-form video that already has footage: restyle or move its captions, set the caption breaks by hand, add a header or sticker, cut away to a product still or clip over the speaker, add punch-ins, handheld drift, flashes or a grade, dub a clean speech track over a take, apply the edit style of a reference video, then re-render and audit. Use for \"edit this video\", \"edit it in this style\", \"change the captions\", \"make the captions bigger and yellow\". Works on a launch-videos video folder through its edit/style.json. Chains from ostack-video-teardown, which writes a style.json from a reference video, and from ostack-ugc, which produces the footage and word timings. Not for generating footage, voices or characters (ostack-ugc), analysing a reference (ostack-video-teardown), or filming and cutting a launch film, reel or product demo in the house look (ostack-launch-videos)."
---

# Edit a video

A video folder holds one video: `edit/` (what it is), `media/` (sources), `output/` (renders), `scripts/`, `page/` and `core/` (the renderer). The look lives in one file, `edit/style.json`. Without that file the renderer draws the house look. With it, the renderer draws what the file says. You edit the file, re-render what the change touched, run the audits and report what you checked.

Nothing here spends money. Rendering, mixing and the audits run on this computer.

This skill supports the `launch-videos/ugc` workflow of ostack's launch-videos playbook. It has no run of its own: when a UGC or launch-videos run is open, the edit is part of it.

## 1. Open the folder

1. Find the folder: the user names it, or it is under `videos/` in the ostack workspace. It has `edit/timeline.js`.
2. Run `o11 ostack launch-videos check`. If ffmpeg or Chrome is missing from PATH, set `FFMPEG=<path>` and `CHROME=<path>` for every command below.
3. Check the renderer reads styles: `ls core/style.js`. If it is missing, the folder was made by an older kit. Make a fresh one with `o11 ostack launch-videos new <name>-kit --format ugc --dir <tmp>` and copy its `core/`, `page/` and `scripts/` over the old ones. Keep `edit/`, `media/`, `ugc/` and `output/`.
4. Read `edit/timeline.js` (shots and cuts), `edit/captions.js` (word timings) and `edit/style.json` if it exists.
5. If `edit/captions.js` is empty and the request needs captions, the clip has no word timings yet. Transcribing is a paid call: follow `o11 ostack context launch-videos/transcribe` and the ostack-ugc skill, then import with `node scripts/ugc.mjs captions . --file <words.json> --shot <shot-id>`.

Style files are for `ugc` videos. The `irl`, `reel` and `product-demo` formats have house rules against running captions and punch-ins (ostack-launch-videos). Apply a style to one of those only when the user asks for that look by name, and say in the report that its audits do not cover captions or punch-ins.

## 2. Get a style file

Pick the first that applies:

| Situation | Do |
| --- | --- |
| The user points at a reference that was torn down | `cp references/<id>/style.json edit/style.json` |
| The user points at a reference with no teardown yet | Run ostack-video-teardown first. It writes `references/<id>/style.json` |
| `edit/style.json` exists | Edit it in place |
| No style and no reference | Copy a preset from [references/presets.md](references/presets.md) into `edit/style.json`. Default to `boxed-lower` for a generated presenter video, `native-sans` for a filmed talking clip, `karaoke-small` when the user wants small word-by-word captions, `native-serif` for one quiet title, `text-stack` when the hook is text over footage with no speech. `bold-pop` only when they ask for loud |

Captions that look native to the app are small, in the platform's own typeface, white with a thin outline or a soft shadow, and in sentence or lower case. Giant upper-case words with heavy outlines read as an ad. Unless the user asks otherwise, stay near the presets' sizes: captions 41 to 56 px, a hook 58 to 72 px, outlines 3 to 7.

A generated presenter video with no reference takes the heavier default: weight 700 to 900, two to four words at a time, a coloured box on the spoken word (`captions.active.mode: "box"`). A reference's `style.json` still wins over it. Use one caption system per video. A header and a caption never say the same words at once: while a header carries the spoken line, turn the captions off for that shot or change the header to other words.

### Fonts

A style names real font files. Without them the text falls back to whatever this computer has, which is what makes captions look cheap. After copying or editing a style, run:

```bash
node scripts/fonts.mjs --style
```

It downloads each font the style names into `media/fonts/` from the Fontsource catalogue, only if its licence is the SIL Open Font License, and saves the licence text and a record (`media/fonts/fonts.json`) beside it. To add another family: `node scripts/fonts.mjs "Playfair Display" --weights 600,700`, then set `font` to `{ "family": "Playfair Display", "weight": 700, "file": "media/fonts/playfair-display-700.woff2" }`. Tested families: TikTok Sans, Montserrat, Inter, Poppins, DM Serif Display, Playfair Display, Bebas Neue. A font file the style names but that is not on disk stops the render and names the font and the command to fetch it. Never commit font files; `media/` is ignored. For the user's own brand font, put their file in `media/brand/` and point `font.file` at it.

Keep the file whole when you edit it. Change the fields the request names and leave the rest, including fields you do not recognise. Copying a reference's style copies its look only. It gives no right to reuse that video's person, voice, footage, music or branding.

## 3. Change it

Sizes are pixels on the style's `canvas` (1080 wide unless it says otherwise) and scale to the video. Positions are fractions of the frame, measured to the centre of the element. Full field list and what the renderer supports: [references/style-fields.md](references/style-fields.md).

| Request | Change |
| --- | --- |
| Bigger or smaller captions | `captions.size`. Step by a quarter: 72 to 90, or 72 to 54. Keep it between 44 and 110 |
| Yellow captions | `captions.color: "#ffe600"`. If they mean only the spoken word, set `captions.active` to `{ "mode": "color", "color": "#ffe600" }` and keep `captions.color` white |
| Upper or lower case | `captions.case`: `upper`, `lower`, `sentence`, `asis` |
| Bolder or lighter | `captions.font.weight` and the matching `font.file` (`…-700.woff2`), then `node scripts/fonts.mjs --style`. Each weight is its own file |
| A different typeface | `captions.font`: family, weight and file, as in Fonts above. An overlay takes its own `font` the same way |
| Words light up as they are spoken | `captions.active`: `{ "mode": "fill", "dim": 0.55 }`. Spoken words are solid, the rest dimmed |
| Tighter or looser letters | `captions.letterSpacing` in ems; -0.02 is the native look |
| Narrower caption lines | `captions.width`: a fraction of the frame, such as 0.58. `captions.align` is `center` or `left` |
| No commas or full stops | `captions.punctuation: false` |
| Outline | `captions.stroke`: `{ "color": "#000000", "width": 8 }`, or `null` for none. Half the width shows outside the letter |
| A box behind the text | `captions.box`: `{ "color": "#000000", "opacity": 0.7, "radius": 16, "padding": 16 }`, and set `stroke` to `null` |
| Move captions up or down | `captions.position.y`. 0.72 is the default. Stay between 0.15 and 0.76 so two lines clear the app's top bar and buttons |
| Fewer words at a time | `captions.maxWords` (1 to 4) and `captions.maxChars` (18 fits two or three short words at size 72) |
| Mark the spoken word | `captions.active.mode`: `color`, `underline`, `scale`, `box` or `none` |
| Captions pop or fade in | `captions.enter`: `{ "kind": "pop", "seconds": 0.08 }`; also `fade`, `slide`, `none` |
| No captions | `captions.enabled: false` |
| A title on screen all video | Add to `overlays`: `{ "kind": "header", "text": "…", "position": { "x": 0.5, "y": 0.14 }, "from": "start", "to": "end", "size": 54, "stroke": { "color": "#000000", "width": 6 } }` |
| Lines of text that appear one by one (no speech needed) | `{ "kind": "stack", "lines": ["first line.", "second line.", "", "last line."], "every": 0.7, "position": { "x": 0.5, "y": 0.66 }, "size": 58 }`. Start from the `text-stack` preset. Keep it to six lines of at most 24 characters |
| A sticker on a word | `{ "kind": "sticker", "text": "new!", "position": { "x": 0.3, "y": 0.2 }, "from": { "word": 7 }, "to": { "word": 18 }, "size": 64, "color": "#111111", "box": { "color": "#ffe600", "opacity": 1, "radius": 18, "padding": 14 } }` |
| A progress bar | `{ "kind": "progress", "position": { "x": 0.5, "y": 0.99 }, "size": 8, "color": "#ffffff" }` |
| Zoom in on the important lines | `camera.punchIn`: `{ "scale": 1.12, "seconds": 0.12, "on": "emphasis" }`. Use `"on": "cut"` when the clip has jump cuts. Keep scale at or under 1.2. Leave it out on a generated presenter shot unless the reference zooms: zoom stays 1.0 there |
| A flash on every cut | `transitions`: `{ "default": "flash", "kinds": [{ "kind": "flash", "seconds": 0.1 }] }` |
| A locked-off clip should feel handheld | `camera.shake`: `{ "amplitude": 8, "frequency": 0.5, "seed": 1 }`. Amplitude is pixels (4 to 12), frequency is sways per second (0.3 to 0.8). Off unless set. Change `seed` for a different path |
| More contrast or colour | `grade`: `{ "contrast": 1.05, "saturation": 1.08 }`. Stay within 0.9 to 1.2 |
| Louder or quieter music | `sound.music`: `{ "level": -22, "duckUnderSpeech": -8 }` (dB). Without it the bed sits at -27. Only applies when the timeline has music. A generated presenter video gets a bed under its speech unless the user or the team's `sound.md` says none |

`{ "word": n }` counts words from 0 in the video's own script, in the order they are spoken. Print them with their indexes before you anchor anything:

```bash
node -e 'import("./edit/captions.js").then(m => console.log(m.CAPTIONS.flatMap(g => g.words).map((w, i) => `${i}:${w.word}`).join(" ")))'
```

### Show the product over the speaker (cutaways)

A cutaway covers the speaker with a still or a clip while the speaker keeps talking. Cutaways are this video's own content, so they live in `edit/cutaways.json`, not in the style:

```json
{
  "version": 1,
  "cutaways": [
    { "file": "media/broll/app.png", "from": { "word": 17 }, "to": { "word": 25 }, "mode": "full", "push": 1.08 },
    { "file": "media/broll/demo.mp4", "from": 12.0, "to": 15.5, "mode": "inset", "position": { "x": 0.5, "y": 0.32 }, "width": 0.4, "start": 2 }
  ]
}
```

- `from` and `to` are seconds or `{ "word": n }`, like overlays. Start a cutaway on the word that names what it shows, and hold it 1.5 to 4 seconds.
- `mode` is `full` (fills the frame) or `inset` (a rounded card; `width` is a fraction of the frame, 0.4 for a vertical clip, 0.7 for a wide one). Left out, it takes the style's `broll.mode`.
- A still gets a slow push to 1.06 by default; set `push` (1 to 1.5), or 1 for none. A clip plays from `start` seconds and holds its last frame if it is shorter than its stretch. Its sound is not used.
- Use the user's real screenshot or recording. Put files in `media/broll/`.
- On a generated presenter video, nothing on screen stays unchanged for more than 2 seconds: add a sticker, a cutaway or a layout change where the sheet shows two tiles alike. Put the presenter and the product in tiles or a split (the presenter as the shot with the product as a wide inset in the lower half, or the product as the shot with the presenter in a rounded inset). A cut-out presenter (`"alpha": true`) over product UI is for a reference that has one.
- Cutaways may not overlap. A missing file, an anchor past the script or an overlap stops the render and names the cutaway.

### Break the captions by hand

Automatic grouping is the default. When the user gives the lines, or a break lands badly ("has a" / "tiny checklist"), supply the phrases with the words. In the words file you import, add `phrases`: either strings that spell the transcript in order, or `[first, last]` word ranges.

```json
{ "words": [ … ], "phrases": ["Okay, I have to show you", "this notebook", "because it honestly", "changed how I plan"] }
```

```bash
node scripts/ugc.mjs captions . --file <words-with-phrases.json> --shot <shot-id>
```

The phrases must cover every word once, in order. Case and punctuation do not matter. If they do not match, the import fails and names the word: fix the phrase, do not drop the word. With phrases set, `maxWords` and `maxChars` are ignored for that shot. To go back to automatic grouping, import the words without `phrases`.

### Dub a clean speech track over a take

When a take looks right but the voice drifted, replace the shot's sound. Put the new audio in `media/narration/` and name it on the shot in the shot plan:

```json
{ "shots": [{ "id": "hook", "assetId": "clip", "keep": [[0.5, 9.8]], "speech": "hook-clean.wav" }] }
```

The track starts on the shot's first frame, the clip's own sound is muted, and the track is cut where the shot ends. Then import the replacement's word timings for that shot (`ugc.mjs captions --shot hook`): they are read as seconds from the start of the track, and captions, anchors and punch-ins follow them. Transcribing the new track is a paid call. Re-import captions whenever you add or remove `speech` on a shot. Lips will only match if the track was spoken at the take's pace; say in the report that lip-sync was not checked.

### Cuts and shots

Cuts, shot order and which clip plays are not in the style file. Change those in the shot plan (`node scripts/ugc.mjs shots . --file <plan.json>`). A shot there may carry `zoom` (1 to 2, a fixed crop-in for that shot; leave it off a generated presenter shot unless the reference zooms) and `transition` (`{ "kind": "flash", "seconds": 0.1 }`, for the cut into that shot). Both are drawn only when `edit/style.json` exists; `{ "version": 1 }` is enough.

When the request is vague ("make it pop"), change at most three things, say which, and render.

## 4. Check the file, then render what changed

```bash
node scripts/render.mjs --check
```

This prints each cutaway with its window, what the style will draw, and a list headed `style fields not applied`. Each line is a field the renderer skips, with the reason. It also stops on a font or image file that is not on disk and names it. Fix typos it reports. Carry the rest of the list into your report: the render still succeeds without those fields.

Re-run only the steps the change touches, in this order:

| You changed | Run |
| --- | --- |
| `captions`, `overlays`, `camera`, `transitions`, `grade`, or `edit/brand.js` | `render`, `encode` |
| `sound` | `sound-effects`, `mix`, `encode` |
| Word timings (`ugc.mjs captions`) | `speech`, `render`, `encode` |
| `edit/cutaways.json` with stills only | `render`, `encode` |
| `edit/cutaways.json` with a clip added, moved or resized | `prepare`, `render`, `encode` |
| The shot plan: cuts, order, clips, `speech` | `prepare`, `speech`, `sound-effects`, `mix`, `render`, `encode` |

```bash
node scripts/prepare.mjs --scale 0.5
node scripts/speech.mjs
node scripts/sound-effects.mjs
node scripts/mix.mjs
node scripts/render.mjs --scale 0.5
node scripts/encode.mjs --scale 0.5      # output/video-0.5x.mp4
```

Work at `--scale 0.5`. A 10 second clip renders in about 35 seconds. A caption change touches every captioned frame, so render the whole video. When the change sits in one stretch (one sticker, one overlay window), render that stretch: `node scripts/render.mjs --scale 0.5 --from 4 --to 7`, then encode. Render `--scale 1` only after the user approves the review cut. `--scale 0.5` is the preview: the file handed over is always the full-size `output/video-1x.mp4` (1080x1920 for a vertical video), never `video-0.5x.mp4`. Never skip `prepare` after a shot plan change: render refuses footage made for a different edit.

## 5. Audit and look

```bash
node scripts/audit/stillness.mjs
node scripts/audit/overlap.mjs
node scripts/audit/torn-frames.mjs --video output/video-0.5x.mp4
node scripts/audit/sound.mjs
```

| Audit | Pass | On a ugc video it also checks |
| --- | --- | --- |
| stillness | 0 moving | Each header, sticker and image holds still. Captions, flashes, cutaways and footage are left out because they move on purpose |
| overlap | 0 layout problems | Captions, overlays and inset cutaways stay inside the safe area, and no caption crosses a headline, glass, overlay or inset |
| torn-frames | every frame, 0 torn | Frames a flash, fade, punch-in or cutaway edge is meant to change are skipped |
| sound | -14 LUFS, peak at or under -1 dBFS, left equals right | The audit measures the kit's mix, which is also the loudness of the delivered file |

`audit/words.mjs` needs a transcription of the finished mix, which is a paid call. Run it only after a cut changed and the user approved the spend. Otherwise report it as not run.

Then look at the picture yourself. Pull one frame where a caption's spoken word is marked, one inside each overlay's window, one inside each cutaway, one just after each punch-in, and a contact sheet:

```bash
${FFMPEG:-ffmpeg} -ss 5.7 -i output/video-0.5x.mp4 -frames:v 1 -y output/check-5.7s.jpg
${FFMPEG:-ffmpeg} -i output/video-0.5x.mp4 -vf "fps=1,scale=270:-1,tile=6x2" -y output/sheet.jpg
```

Check: the caption is readable over the brightest part of the footage, nothing covers the face, the header and captions do not collide, the text is spelled as spoken, a cutaway shows what is being said at that moment and its own text does not sit under a header or caption, and a punch-in does not crop the chin or the product. If a frame is wrong, fix the style and repeat steps 4 and 5.

## 6. Report

Say, in this order:

1. What changed, as field and value: "`captions.size` 72 to 90, `captions.active` colour #ffe600".
2. The review cut: `output/video-0.5x.mp4`, its length and size, and the frames you looked at. Say it is the half-size preview and not the delivery.
3. Each audit by name with its result line.
4. Style fields not applied, copied from `render.mjs`.
5. What you did not check. You cannot hear the mix or judge lip-sync from frames. Say so.

Ask before a full-size render or before anything is uploaded or posted.

When the user corrects how you did something, ask whether it holds every time. If it does, offer to save it to the team's files (`launch-videos/<step>.md`) with the ostack-setup skill so it sticks. A change for this video only stays in its `edit/style.json`.
