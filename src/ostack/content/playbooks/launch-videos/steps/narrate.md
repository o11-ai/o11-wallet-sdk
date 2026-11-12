---
summary: The narration voice for a product demo, generated with word timings.
used_by: [product-demo]
changed: 0.8.0
---
Use the voice in `launch-videos/narrate.md`. If none is chosen yet, find one: `o11 discover "text to speech"` (ElevenLabs, Fish Audio and MiniMax voices are in the wallet; Fish Audio can also design a voice from a description). Quote one line (`o11 quote`), and play the user a sample before generating the rest.

Generate one file per line of the script, as WAV (or convert to 48 kHz WAV with ffmpeg), into `media/narration/<name>.wav`. Get word timings for each line in `media/words/<name>.json`: a tool that returns them with the speech (Fish Audio speech with word timings), or forced alignment of the audio against its text (ElevenLabs). Keep the same voice, model and settings for every line.

Place each line in `edit/timeline.js` (`narration: [shot, start, name]`), leaving about half a second between lines, and run `node scripts/speech.mjs`. Generate a line again only when its words change; record the voice id in `launch-videos/narrate.md` so the next video sounds the same.

The user's own recorded voice works the same way: their WAV files in `media/narration/`, transcribed for timings.
