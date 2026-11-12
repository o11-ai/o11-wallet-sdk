---
summary: Word-level timings for every clip (irl), so everything is timed to the words.
used_by: [irl, reel]
changed: 0.8.0
---
Every headline, glass scene and cut is timed to the spoken words, so each clip needs word timings in `media/words/<shot id>.json`, with times from the start of the clip file.

Use the wallet: `o11 discover "speech to text"` and pick a tool that returns word timestamps (ElevenLabs speech to text does). Quote it first (`o11 quote`), then run it on the clip's audio (`output/audio/<shot>.wav` after the prepare step) and save the result. A free local alternative is Whisper with word timestamps, when the user already has it.

Then `node scripts/speech.mjs` writes `edit/speech.js` and prints each phrase with its times. Read the transcript against the clip: names and product terms are often misheard. Fix the word text in the JSON, never the times.

To start a clip on its first word or cut a long pause, run `node scripts/pauses.mjs <clip>`. It finds pauses from the audio itself (word timings can be 0.35s off and merge words), cuts only pauses with real silence in them, and prints suggested `keep` ranges and the pauses it would not cut and why. Paste the ranges into the shot's `keep`. After the mix, transcribe `output/mix.wav` the same way into `media/words/final.json` for the clipped-word check (the audit step).
