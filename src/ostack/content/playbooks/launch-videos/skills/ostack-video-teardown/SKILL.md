---
name: ostack-video-teardown
description: Break a reference video down into its structure and its edit style. Use when the user gives a video file or a TikTok, Instagram, YouTube Shorts or X link and asks to break it down, asks why it works, or wants a new video made or edited like it. Writes references/<id>/reference.json (source, transcript, hook, beat sheet), references/<id>/style.json (captions, cuts, overlays, transitions, sound, grade) and labelled contact sheets. Chains to ostack-video-edit, which applies the style to other footage, and ostack-ugc, which remakes the structure for a product. Not for editing or generating video, for finding trending videos (ostack-video-trending), or for analysing how a company grew.
---

# Video teardown

A teardown turns one video into two files that other skills read:

- `references/<id>/reference.json`: what the video is and how it is built, beat by beat, with every piece of on-screen text timed and placed and the script's measurements (cut times, shots, loudness, silences, speaking rate) in its `measured` block.
- `references/<id>/style.json`: how it is edited, in terms the editor can apply to other footage.

The script `scripts/teardown.mjs` measures what ffmpeg can measure: length, size, cuts, loudness, silences, colours. It makes no model call and no paid call. You supply what it cannot: you read the contact sheets and describe each beat, the hook, the text on screen, the caption look, the overlays and the transitions. The script then checks your two files against the contract and names any field that is wrong.

A reference records structure. It never authorizes reusing the person, voice, footage, music or branding in it. Say this when you hand the teardown over, and keep source files out of commits and uploads.

This skill supports the `launch-videos/ugc` workflow of ostack's launch-videos playbook. It has no run of its own: the skill that asked for the teardown records the run.

## Before you start

Work in a video folder made by `o11 ostack launch-videos new <name> --format ugc` (any format works). Run commands from that folder, or add `--dir <folder>` to each one. If `scripts/teardown.mjs` is missing, the folder was made by an older kit: make a new folder and work there. The script needs nothing else from the folder, so an empty folder works when you run it by its path in another video folder.

ffmpeg must be on PATH, or set `FFMPEG=<path>`. Tile labels need a bold font; the script finds DejaVu, Liberation or Arial, and takes `--font <file.ttf>` when none is installed.

Pick the id once and keep it:

| Source | Id |
| --- | --- |
| TikTok | `tt-<video id from the link>` |
| Instagram | `ig-<shortcode>` |
| YouTube | `yt-<video id>` |
| X | `x-<post id>` |
| Local file | a short slug of the file name |

## 1. Get the video

A local file needs nothing: go to step 2.

For a link, read [references/getting-the-video.md](references/getting-the-video.md). In short: discover a public o11 download tool for that platform, inspect it, quote the exact request, tell the user the price, then call it. Downloading costs money, about $0.001 for one video at full size. A row from a trending search already carries `videoUrl` and the cover as `image`; that link downloaded with plain curl 25 minutes after the search as a 576x1024 file, enough to measure cuts and sound, and free. Use the paid route when the remake needs the full 1080x1920 file. Do not call before the user has approved spending for this teardown; an approved project budget that covers it is enough.

Save the file as `references/<id>/source.mp4`. If no tool can download it (YouTube and X have no reliable route today), ask the user for the file. If they cannot supply one, continue from a transcript alone and record `"frames"` and `"audio"` in `unseen`.

## 2. Run the script steps in order

```bash
node scripts/teardown.mjs probe references/<id>/source.mp4 --id <id> --url <link>
node scripts/teardown.mjs shots
node scripts/teardown.mjs sheet
node scripts/teardown.mjs audio
node scripts/teardown.mjs words --file <words.json>
```

| Step | What it gives you |
| --- | --- |
| `probe <video> --id <id>` | Creates `references/<id>/`, copies the file in as `source.mp4`, hashes it, reads length, size, frame rate and audio. Add `--url`, `--author`, `--posted-at` for a link. `probe --url <link> --id <id>` with no file records the link and marks frames and audio unseen. |
| `shots` | Cut times, shot lengths, mean and median shot length. Default threshold 0.3; cuts closer than 0.25s merge. Also lists the strongest changes it did not count. |
| `sheet` | `sheet.jpg`: one frame per second, each tile stamped with its time in the source, 24 tiles a sheet (`sheet-2.jpg` and so on for longer videos). |
| `sheet --from <s> --to <s>` | A dense strip at 4 frames per second, `strip-<from>-<to>.jpg`. Six seconds fill one strip. `--fps 8` for fast cutting. |
| `frame --at <s> --grid` | One full-size frame with a line every tenth of the width and height, for measuring positions. |
| `frame --at <s> --region x0,y0,x1,y1` | The colours filling that part of the frame, as hex with their share. Fractions, top left then bottom right. |
| `audio` | `audio.wav` (mono, 16 kHz) for transcription, loudness in LUFS, true peak, mean level, and every silence of 0.25s or more below -35 dB. `--noise -25` finds pauses under room tone. |
| `words --file <json>` | Imports word timings into `reference.json`. Reads `result.words`, `words` or `segments`, with the word under `text` or `word`. Drops spacing entries, stretches zero-length words to 0.04s, keeps order. |

`--id` can be left off once `references/` holds a single folder.

The script cannot tell speech from music. If there may be speech, transcribe `audio.wav` with a public o11 speech-to-text tool that returns word timestamps (`fishaudio#speech-to-text` returned word timings for a 35 s video for $0.0036 and holds little; `elevenlabs#v1/speech-to-text` holds $3.30 before it runs, so it fails on a small wallet; both need `--allow-write`) (see the same reference file; about $0.22 per hour of audio, so well under a cent for a short video, after the user approves). Save the response as a file and pass it to `words`. If you do not transcribe, set `media.hasSpeech` from what you can defend and write what was not checked into `unseen`.

## 3. Read the sheets

Read `sheet.jpg` first, the whole video at one frame per second. Then make 4 fps strips for:

- the first 3 seconds, always: the hook lives there;
- every cut the `shots` step reported, and every "strongest change" it listed, one second either side;
- any second where text appears, changes or moves;
- the last 3 seconds: the call to action.

Read the image files directly. Do not describe a frame you have not opened.

What `shots` gets wrong, and what to do:

- A fast animated move or a flash can score as a cut. Confirm each cut on a strip; raise `--threshold` to 0.4 if several are false.
- A dissolve, a slide or a scene built by animation scores low. Motion graphics often report 0 cuts. Count the scene changes yourself from the strips and use the video's length divided by that count for `cuts.meanShotSeconds`. Say so in the style file's `notes`.
- One continuous take reports 1 shot as long as the video. That is correct.

## 4. Write the beat sheet

Read [references/beats.md](references/beats.md) for the field-by-field rules and a worked example. The rules that matter most:

- Beats cover the video from 0 to its length with no gap and no overlap. Each beat's `start` equals the previous beat's `end`. The last `end` equals `media.seconds`.
- Start a new beat when the job of the footage changes: hook, problem, proof, demo, payoff, call to action. A cut inside the same job is not a new beat. A 15 to 30 second video usually has 4 to 8 beats.
- Put beat boundaries on word starts when there is speech (use `transcript.words`), on cuts or scene changes when there is not.
- `hook` is the opening until the viewer knows what the video is about, normally 1.5 to 3.5 seconds. Record what is said and what is on screen separately.
- `camera` and `action` describe only what the frames show. "Selfie at arm's length, eye level, one take", not "engaging presenter".
- Give every beat a `look`, read from a grid frame, with positions as fractions of the frame. A remake is generated from these numbers; "presenter in a cafe" is not enough to rebuild the shot. See [references/beats.md](references/beats.md).
- For text on screen, read a strip of the first two seconds at 4 frames a second and record whether all of it is there from the first frame or arrives piece by piece.
- `onScreen` lists every piece of text in reading order, each as `{ "text", "from", "to", "position" }`. `text` is the words exactly as they appear. `from` and `to` are the source seconds it comes on and goes off, read from a 4 fps strip to the nearest 0.25s. `position` is `top`, `center`, `bottom`, `left`, `right` or a corner such as `top-left`, or `{ "x", "y" }` for its centre read from a grid frame. Add `style` when it does not look like the captions. `[]` when there is none.
- When a beat holds more than one shot, say in `camera` what the framing is in each and name the cut times.
- `formula` is one line a writer could reuse for another product: the order of jobs, no names from the source.
- `metrics` come only from the platform's own numbers. Use null for any the tool did not return. Never estimate.

## 5. Measure the style

Read [references/style.md](references/style.md) before writing `style.json`. Measure; do not guess from a thumbnail-sized tile:

- **Caption position.** Open a grid frame while a caption is up. Read the centre of the caption block against the lines: `position.y` is its height as a fraction from the top. Check three frames from different beats and use the middle value.
- **Words per group.** List the caption text from at least five different groups on 4 fps strips. `maxWords` is the largest count you saw; `maxChars` is the longest group's character count.
- **Colours.** `frame --region` over the caption block. The largest share is the background showing through; the next clear colour is the fill; a dark colour hugging it is the stroke. Confirm against the grid frame.
- **Active word.** Compare two tiles 0.25s apart inside one group. What changes on the word being spoken: colour, underline, size, or a box behind it. Nothing changes means `"none"`.
- **Size.** Measure the height of a capital letter on a full-size frame in pixels and multiply by 1.4 for the font size. Scale to the canvas if the frame is not the canvas size.
- **Case and weight.** Read them off a full-size frame: `upper`, `lower`, `sentence` or `asis`; weight 400 for regular, 600 to 700 for bold, 800 to 900 for heavy display type.

A section the video does not have is written as off, not left out: `"captions": { "enabled": false }`, `"overlays": []`, `"broll": { "coverage": 0, "mode": "full", "meanSeconds": 0 }`. Null or absent means "use the house default", which is a different statement.

## 6. Write and check

Put your two drafts anywhere (for example `references/<id>/reference.in.json` and `style.in.json`) and run:

```bash
node scripts/teardown.mjs write --reference <reference draft> --style <style draft>
node scripts/teardown.mjs check
```

`write` merges your draft over what the script measured. The script's values win for the source file and hash, the picture size, length, frame rate and imported word timings, so leave those out of your draft. It validates both files and writes nothing if either has a problem. Each problem names the file and field, for example `reference.json beats[2].start: gap of 0.20s; beats[1] ends at 4.6 and this one starts at 4.8`. Fix the draft and run `write` again. `check` re-validates the folder at any time and rechecks the hash.

`write` also copies what the script measured into `reference.json` as `measured`: the cut times and scores, the shot list, mean and median shot length, loudness, true peak, the silences and their share of the video, where speech starts and ends, and words a second. Do not type these; a `measured` block in your draft is dropped. `measured.cuts` is what the last `shots` run found. If you corrected it by eye, re-run `shots` with the threshold that gives the right cuts, or name each false or missed cut with its time in `notes`.

`check` prints a note, without failing, for each beat that has no `look`, for each beat whose on-screen text has no `from` and `to`, and when `measured` has nothing from `shots` or `audio`. Clear the notes you can before handing over.

Fields you add beyond the contract (such as `notes`) are kept.

## What a finished teardown contains

An agent handed `reference.json` and the `style.json` it names should be able to rebuild the video without opening `teardown.json` or running the script again. Before you hand over, confirm each line:

| The file holds | Where |
| --- | --- |
| Every beat from 0 to the end, with its job | `beats[]` `start`, `end`, `role`, `action` |
| Every piece of on-screen text with its start, end and position | `beats[].onScreen[]` as `{ text, from, to, position }` |
| The speech, with a time for each word | `transcript.text`, `transcript.words`, and `spoken` on each beat |
| Every cut time and the shot list | `measured.cuts`, `measured.shots` |
| Camera and framing for each shot | `beats[].camera`, `beats[].look`, `beats[].shot` |
| The sound: what kind, how loud, where it is silent | `beats[].audio`, `measured.lufs`, `measured.truePeak`, `measured.silences`, and `sound` (`title`, `original`) when the platform named the track |
| Pacing | `measured.meanShotSeconds`, `measured.medianShotSeconds`, `measured.wordsPerSecond`, `measured.silentShare` |
| Caption style, overlays, transitions | `references/<id>/style.json`, named in the reference's `style` field |
| What nobody read | `unseen` |

`check` ends with `ok` and no notes when all of this is present. A line you cannot fill goes in `unseen` with the reason.

## What to record as unseen

`unseen` is the list of things this teardown did not inspect. A reader treats everything else as checked, so be exact:

| Situation | Entry |
| --- | --- |
| No file downloaded | `"frames"`, `"audio"` |
| Audio not transcribed | `"speech: not transcribed"` and say what `hasSpeech` rests on |
| Music, sound effects | Always unseen by ear. Record `"music and sound effects: only loudness and silence were measured"` unless a tool identified them |
| Text too small to read on a full-size frame | Name it, with the time |
| A stretch you did not strip at 4 fps in a video with fast cuts | The time range |
| Platform numbers missing | Not `unseen`: set the metric to null |

Say what you could not read and do not guess. The script measures how loud the sound is, not which track it is: write `"music: track not identified"` and do not name a song, an artist or a genre from the levels or the post's caption. The same holds for a font you cannot identify, a word too small to read and a cut you could not confirm.

Do not fill a gap with a likely value. A style field you could not measure is left out, and the reason goes in the style file's `notes`.

## Hand over

Report, in this order: where the two files and the sheet are, the formula line, the hook, the number of beats and mean shot length, the caption look in one line, and what is unseen. State the cost of any paid calls made. Then offer the next step:

- "Edit my footage in this style": `ostack-video-edit` reads `references/<id>/style.json`, usually copied to `edit/style.json`.
- "Make this for my product": `ostack-ugc` reads `references/<id>/reference.json` and writes a new script and shots on the same structure, with a new presenter, voice, footage and music.
