# A full video from several parts

Most UGC that sells is three parts: a presenter says a hook, the product is shown while a voice explains it, and the presenter closes. Each part is its own shot, so one part can be replaced without buying the others again.

## Parts

| Part | Length | Picture | Sound | Where it comes from |
| --- | --- | --- | --- | --- |
| Hook | 2-5 s | Presenter to camera | The presenter's own speech | A talking clip ([talking-clip.md](talking-clip.md)) |
| Product | 4-10 s | The product in use: the user's phone or screen recording, or a generated clip with no speech | A voiceover in the same voice, laid over the shot | The user's recording, or `alibaba#v1/video/wan2.7-i2v` with a first frame and no audio. Speech from `fishaudio#text-to-speech` ([voice.md](voice.md)) |
| Close | 2-4 s | Presenter to camera | The presenter's own speech | A talking clip, or a later stretch of the hook's take |
| Product still | 1.5-4 s inside the product part | A close-up over the footage | The voiceover continues | Any image, any shape, as a cutaway |

Keep the hook a separate shot. A new hook then costs one short clip, and every other part is reused ([variants.md](variants.md)).

## One voice

A cut between two voices reads as two videos. Make every spoken part from the same speech route with the same settings, or from the same voice clip:

1. Write the whole script first. Mark which sentences the presenter says on camera and which play over the product.
2. Make the on-camera speech as one or two audio files and drive the talking clips with them, using an exact-audio route in [talking-clip.md](talking-clip.md). On the H3 voice-reference route the same files are the voice reference.
3. Make the voiceover as its own file from the same route. Register it with `--role voice`; it lands in `media/narration/`.

## Register what you already have

Every file the plan uses is registered first. Run these from the video folder; `node` and `bun` both work.

```bash
node scripts/ugc.mjs ingest . --file <take.mp4>    --role reference --id presenter-1
node scripts/ugc.mjs ingest . --file <product.mp4> --role reference --id product-1
node scripts/ugc.mjs ingest . --file <vo.mp3>      --role voice     --id vo
```

A clip made by `generate` is already registered as its stage ID plus `-1`. `ingest` copies the file under a name with a hash added, such as `media/narration/vo-80ad0f8b4499.mp3`; read the name from its output and use that in the plan. A product still needs no registration: put it in `media/assets/` as a JPEG.

## The shot plan

Save this as `shot-plan.json` in the video folder.

```json
{
  "width": 1080, "height": 1920, "fps": 30,
  "shots": [
    { "id": "hook",   "assetId": "presenter-1", "keep": [[0, 4.4]] },
    { "id": "demo",   "assetId": "product-1",   "keep": [[1.0, 6.2]], "mute": true, "speech": "vo-80ad0f8b4499.mp3" },
    { "id": "payoff", "assetId": "presenter-1", "keep": [[6.95, 9.9]] }
  ],
  "headlines": [], "narration": [], "music": { "file": "narration/bed-3f9c2a71d0e4.mp3" }
}
```

- `keep` ranges are seconds in the source clip. Cut on a word boundary: end a range 0.1 s after the last kept word ends and start one 0.1 s before the first kept word starts. Read the times from the clip's word timings.
- Two shots may use the same clip. Here the hook and the close are two stretches of one 10 s take.
- `speech` names a file in `media/narration/` that plays from the shot's first frame and replaces the clip's own sound. `mute` beside it is harmless and makes the intent plain. This is the current way to lay a voice over a shot; the `narration` list in older notes is for a `.wav` bed across shots.
- End a voiceover shot 0.1 s after the voiceover's last word ends, not at the end of its file. A speech file usually has a silent tail, and a shot as long as the file leaves a pause at the cut. In the first run a 0.23 s tail became a 0.46 s pause.
- Pick the stretch of the product clip where the thing being said is on screen. Pull a strip (`ffmpeg -i <clip> -vf "fps=1,scale=216:-2,tile=10x1" -frames:v 1 strip.jpg`) and start the `keep` range where the action begins, not at the clip's first frame.
- Leave `zoom` off every presenter shot, which keeps it at 1.0. Add a `zoom` only where the reference zooms at that beat, and never on top of a still framed closer than chest-up.
- `music.file` is a path under `media/`, and the mix ducks it under every phrase. Register the bed with `--role music --id bed`; `ingest` saves it in `media/narration/` with a hash in its name, so read the name from its output. Use `"music": null` when there is no bed: the mix stops on a music file that is not on disk.
- Compile with `node scripts/ugc.mjs shots . --file shot-plan.json`. Do not edit `edit/timeline.js` by hand.
- Leave out the end card unless the brand file has a mark and a line to put on it. An empty card is two dead seconds.

## Captions for every part

Import word timings once per shot, in shot order, so word numbers run in the order they are heard:

```bash
node scripts/ugc.mjs captions . --file hook-words.json   --shot hook
node scripts/ugc.mjs captions . --file demo-words.json   --shot demo
node scripts/ugc.mjs captions . --file payoff-words.json --shot payoff
```

- A words file is `{"clock": "source", "words": [{"word", "start", "end"}]}`. Raw transcriber output also carries spacing entries; keep only the entries whose type is a word. The take check in [talking-clip.md](talking-clip.md) writes a cleaned file, and its pace and tail limits are for a new talking take, not for a voiceover or a clip already accepted.
- A shot that plays its own sound takes the timings of its source clip, marked `"clock": "source"`. For two shots cut from one clip, write one file per shot holding only the words that fall inside that shot's `keep` range.
- A shot with `speech` takes the timings of the replacement file. Remove the `clock` field from that file.
- Changing a `keep` range does not need a new import.
- If a phrase breaks badly, such as one word left alone on screen, set the breaks by hand with `phrases` (the `ostack-video-edit` skill).
- If you import out of order, remove a group with `captions-remove --shot <id>` and import it again; it goes to the end.

One style file covers all parts, so the header and caption look hold across every cut. Copy a preset from the `ostack-video-edit` skill into `edit/style.json`: the reference's own `style.json` when one is being matched, otherwise `boxed-lower`. Its header text is a placeholder: write the video's promise in six words or fewer, or delete the header overlay. Fonts are fetched with `node scripts/fonts.mjs --style`; font files already in `media/fonts/` are used as they are.

## Show the product over the footage

A cutaway in `edit/cutaways.json` places a still or a clip of any shape over the picture while the voice continues. Anchor it to the word that names what it shows:

```json
{ "version": 1, "cutaways": [
  { "file": "media/assets/page.jpg", "from": { "word": 21 }, "to": { "word": 25 }, "mode": "inset", "position": { "x": 0.47, "y": 0.70 }, "width": 0.7 }
] }
```

- Word numbers count across the whole video in the order the caption groups were imported. Print them with the command in the `ostack-video-edit` skill and use your own numbers, not these.
- `from` is the start of that word and `to` is the start of the word after the last one covered. Here the still shows for "tiny checklist built in" and leaves as the next sentence begins.
- Place a landscape inset below the captions, over the torso or the desk: with captions at y 0.56, a width of 0.7 centred at x 0.47, y 0.70 fits the usual safe area. Between the header and the captions it covers the face, and the overlap audit does not check for faces. A portrait still or clip can use `"mode": "full"`.
- The still should show what the footage shows. A printed checklist over footage of a handwritten one reads as two products.

## Edit rules for a presenter video

These hold unless the reference being matched does otherwise. Each came from comparing finished videos with a reference that looked better.

- **Zoom stays 1.0 on presenter shots.** No shot `zoom`, no `camera.punchIn`, no `camera.push`. A 720p clip on a 1080 canvas is already enlarged 1.5 times, and a 1.18 zoom on top showed every flaw in the face.
- **No stretch of more than 2 seconds without a change on screen.** A change is a new title or sticker, a new caption group, a cutaway, a cut, or a change of layout. A header may stay up for the whole video as long as something else changes under it. Check the one-frame-a-second sheet: two neighbouring tiles that look the same are a fault.
- **One caption system.** Heavy weight (700 to 900), two to four words at a time, a coloured box on the spoken word: `captions.active.mode: "box"` in the style, which `boxed-lower` has. Never two texts saying the same words at once. While a header carries the hook's words, give that shot no captions or cut the header to a label of other words.
- **Tiles or a split before a cut-out.** The kit draws two layouts, a full-frame cutaway and a rounded inset. Build a split from them: the presenter as the shot with the product as a wide inset in the lower half, or the product as the shot with the presenter in a rounded window that sits clear of the control being shown. A cut-out head pasted over product UI hides the UI and shows its matte edge. Use a cut-out only when the reference has one.
- **One UI element per beat.** Crop or zoom the product footage to the control being talked about. A slow scroll of a whole page leaves its text under 2% of the frame height.
- **A music bed under the speech.** A generated bed costs a few cents (`elevenlabs#v1/music`, $0.025 in one run); quote it first. The team's `sound.md` wins when it says no music. Start the style's `sound.music` at `{ "level": -22, "duckUnderSpeech": -8 }`. A user who will add a platform sound at posting gets the file without a bed.
- **About -14 LUFS on the delivered file.** The kit's mix and its sound audit are set to -14, so the finished file needs no extra gain. Measure it, as in Render below.
- **Deliver the full-size render.** `--scale 0.5` is the kit's preview flag and writes a 540x960 `output/video-0.5x.mp4`. The final is rendered without it: `output/video-1x.mp4`, 1080x1920.

## Render

The review cut, at half size:

```bash
node scripts/prepare.mjs --scale 0.5 && node scripts/speech.mjs && node scripts/sound-effects.mjs && node scripts/mix.mjs && node scripts/render.mjs --scale 0.5 && node scripts/encode.mjs --scale 0.5
node scripts/audit/stillness.mjs; node scripts/audit/overlap.mjs; node scripts/audit/sound.mjs
```

`speech.mjs` prints each phrase with its times in the finished video. A gap of 0.3 s or more between two lines that straddle a cut is a pause to fix before rendering.

The final, once the review cut is accepted. Run `prepare`, `render` and `encode` again with no `--scale`, then measure the loudness:

```bash
node scripts/prepare.mjs && node scripts/render.mjs && node scripts/encode.mjs
cp output/video-1x.mp4 output/<name>-final.mp4
"${FFMPEG:-ffmpeg}" -i output/<name>-final.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -12
```

The kit already mixes to -14 LUFS with a limiter at about -1.5 dBFS, so the file is copied as it is. Read the integrated loudness and true peak from the third line and report them. Confirm the file is 1080x1920 with `ffprobe` before handing it over.

## The presenter over product footage

One split layout puts the product on the whole screen and the presenter in a small rounded window over it, still talking. Build it with the screen as the shot and the presenter as an inset:

```json
{ "id": "demo", "assetId": "screen-1", "keep": [[0, 10.03]], "mute": true, "speech": "demo-speech-d826699e7629.mp3" }
```

```json
{ "version": 1, "cutaways": [
  { "file": "media/broll/presenter-inset.mp4", "from": 4.98, "to": "end", "mode": "inset", "position": { "x": 0.47, "y": 0.60 }, "width": 0.42, "radius": 18 }
] }
```

1. **The talking clip supplies two things.** Its sound becomes the shot's `speech`: `ffmpeg -i <clip> -vn -c:a libmp3lame -b:a 192k demo-speech.mp3`, registered with `--role voice`. Its picture becomes the inset: crop it to the face, `ffmpeg -i <clip> -vf "crop=720:900:0:120" -an presenter-inset.mp4`, and put the file in `media/broll/`. A 4:5 crop reads as a window; the full 9:16 clip is too tall.
2. **The screen is the shot.** Use the user's screen recording. With none, capture the product's real public page at phone width and make footage from it: one stretch of the page per sentence, each drifting down slowly, joined in the order they are spoken about.

   ```bash
   ffmpeg -loop 1 -framerate 30 -t 2.58 -i page.png -vf "crop=1080:1920:0:7505+30*t,format=yuv420p" -r 30 -c:v libx264 -crf 16 -an seg-2.mp4
   ```

   `7505` is where that section starts in the capture, in pixels, and `-t` is how long its sentence lasts. Remove a cookie notice from the capture; it is not the product. Show only real pages, and nothing that needs a login the user has not given.
3. **Line the inset up with the sound.** Set `"from": { "shot": "demo" }`: the inset starts on that shot's first frame and plays the clip from its own first frame, so the lips match the `speech` file. Typing the second by hand can miss by a frame, because cuts are rounded to frames. Run `node scripts/prepare.mjs` again whenever the inset is added, moved or resized, or the render stops and says so.
4. **Place the inset where the reference has it.** Measure the reference's presenter on a grid frame: left and right edges, top and bottom, and head height. Build to those numbers. When the reference lays its captions over the presenter's chest, set `"captionsOver": true` on the cutaway so the layout audit allows it. With no reference, keep the three apart: the control being talked about in the top 45% of the frame, the inset near 60% of the height at 0.42 of the width, the captions at 79%.
5. **Captions over a white page** need a heavy outline: a stroke of 8 and a dark shadow. The thin outline that reads over a face disappears on a white screen.

Only when the reference shows the presenter cut out of their background, do the same: `node scripts/cutout.mjs <clip> --out media/broll/presenter-cutout.mov --crop 720:1040:0:100`, then name that file in the cutaway with `"alpha": true`. It runs a person-segmentation model in headless Chrome on this machine, downloads the model on first use, and costs nothing; 300 frames took three minutes. The matte softens hair and leaves a fringe at the shoulder, so with no reference use the window. [reconstruct.md](reconstruct.md) lists which layout goes with which reference.

## One voice with no speech file

When there is no prepared speech, the first talking clip can set the voice. Make the hook on a route that speaks a quoted line (`alibaba#v1/video/wan2.7-i2v`), cut its sound out as an MP3, host it, and pass it as `reference_voice` on `alibaba#v1/video/wan2.7-r2v` for every later talking clip. The second clip then speaks in the first clip's voice. A voice from the public library is not a safe default: on 14 November 2026 the most used English voices were impressions of game characters, none licensed.

## Word timings when transcription is refused

`elevenlabs#v1/speech-to-text` reserves $3.30 for every call and is refused when the wallet holds less. `elevenlabs#v1/forced-alignment` reserves $2.20, costs a fraction of a cent, and returns each word's start and end when you give it the audio link and the script as plain text. Drop the entries that are only a space. It places the words you gave it, so it does not prove they were all spoken: check that the last word ends near the end of the clip and that no word is stretched over a second.

## Check the joins

The existing audits check each frame. These check the cuts, on the review cut:

1. **Pauses, free.** `ffmpeg -i output/video-0.5x.mp4 -vn -af silencedetect=noise=-35dB:d=0.3 -f null -` should report no silence at a cut, unless the reference pauses at that cut. If it reports one the reference does not have, shorten the shot before it. A pause inside a bought take stays: cutting it would break the lips of a clip that is on screen.
2. **Words, paid.** Transcribe the finished file (under $0.001, with a $3.30 hold) and compare it to the script: every word present, in order.
3. **Loudness.** Measure each shot's stretch of the finished file: `ffmpeg -ss <from> -to <to> -i output/video-0.5x.mp4 -vn -af ebur128 -f null -`. Cut times are `CUTS` in `edit/timeline.js`. The shots should sit within 1 LU of each other; if one is off, change that clip's level before the mix, not the whole mix.
4. **Frames.** Pull one frame 0.1 s before and after each cut. No caption carries across the cut, the header is unchanged, the subject's head is at a similar height on both sides, and the last frame before a cut does not catch closed eyes.

Then say what you could not judge: whether the voice sounds like one person across the cut needs someone to play it.

## What ran

On 14 November 2026, on the test server: a 12.6 s video of three shots from two clips already bought, plus a new voiceover ($0.0012), one product still ($0.03) and two transcriptions (under $0.001).

- The finished file's transcript matched the script word for word, with no pause of 0.3 s or more.
- The three shots measured -15.9, -16.0 and -15.9 LUFS.
- The first render had two faults, both caught before delivery: the inset still covered the header, and an end card with no brand mark showed an empty frame. Nothing catches an empty end card, so look at the last frame.
- An agent given only this skill and the bought clips then built the same video with no paid call. Its first cut had a 0.46 s pause at the second join and the still over the presenter's face. Both rules above come from that run, and the video was re-cut with them: no silence of 0.3 s or more, the still below the captions, and the product footage starting where the writing starts.
- Source clips were 720x1280 on a 1080x1920 canvas. The renderer scales them up without a warning.

A second video ran the whole workflow on 14 November 2026 for $1.57: a 15 s remake of a 1.46 million-view video (a question to camera under a large header, a "now it can" beat, then the presenter over the product's screens), made for a real product from its public page. One 5 s hook clip ($0.50), one 10 s clip in the hook's voice ($1.00), two presenter stills ($0.06), a transcription and an alignment. Its audits passed with no layout problem, its three shots measured -15.9, -15.9 and -16.0 LUFS, and it has no pause at a cut.

Not run: a user's own phone or screen recording as the product part, music under speech, a full video built to the edit rules above, and more than three shots.

## Keep the presenter on screen

A video that opens on the presenter and then spends most of its length on slides or a bare screen recording reads as a slideshow. The version that worked kept the presenter full-frame for the whole video, as two or three short talking clips cut back to back, and showed the product as inset tiles above their head (`mode: "inset"`, width about 0.46, centred near y 0.19, a new tile every 3 seconds or so, each cropped from real product footage). Buy enough presenter seconds for the whole script before spending on anything else. When the provider bills in blocks (6 seconds, for one), write each line to end just under a block and check the audio file's length before sending it: 6.01 s is billed as 12.
