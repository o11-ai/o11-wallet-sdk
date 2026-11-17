---
summary: Word-level timings for accepted footage and speech, so edits and captions follow the words.
used_by: [irl, reel, ugc]
changed: 0.11.0
---
Every headline, glass scene and cut is timed to the spoken words, so each clip needs word timings in `media/words/<shot id>.json`, with times from the start of the clip file.

Transcribe the accepted **original, uncut source file** in `media/clips/`, before its `from`, `to` or `keep` edits. `output/audio/<shot>.wav` from prepare is already trimmed and starts a new clock; importing its timestamps for a shot would apply the cuts twice.

If the tool needs audio, extract the full source without `-ss`, `-to` or concatenation:

```bash
mkdir -p output/transcription
ffmpeg -i media/clips/<source-file>.mp4 -vn -ac 1 -ar 16000 output/transcription/<shot>-source.wav
```

Use the wallet: `o11 discover "speech to text"` and pick a tool that returns word timestamps. Quote it first (`o11 quote`), then transcribe that full source audio and save the result as `media/words/<shot>.json`. A free local alternative is Whisper with word timestamps, when the user already has it. Add `"clock":"source"` to the result object to record its clock. The speech helper rejects an explicitly different clock for shot imports; unmarked legacy timing files are treated as source-clock data. Do not relabel prepared timestamps as source timestamps.

Then `node scripts/speech.mjs` writes `edit/speech.js` and prints each phrase with its times. Read the transcript against the clip: names and product terms are often misheard. Fix the word text in the JSON, never the times.

To start a clip on its first word or cut a long pause, run `node scripts/pauses.mjs <clip>`. It finds pauses from the audio itself (word timings can be 0.35s off and merge words), cuts only pauses with real silence in them, and prints suggested `keep` ranges and the pauses it would not cut and why. Paste the ranges into the shot's `keep`. After the mix, transcribe `output/mix.wav` into `media/words/final.json` for the clipped-word check (the audit step). Those final-mix timestamps use output time: never import them with `ugc captions --shot`. For visible captions from final-mix timings, omit `--shot`.

For generated speech, reuse returned word timings when they match the accepted audio; otherwise align the exact approved text to that audio or transcribe it. Record the tool, receipt and audio hash. Timing/word agreement does not prove voice likeness or lip sync. Do not transcribe a rejected take and attach its timings to the accepted one.
