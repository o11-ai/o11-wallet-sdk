---
summary: The narration voice for a product demo or generated video, with word timings.
used_by: [product-demo, ugc]
changed: 0.11.0
---
Use the voice in `launch-videos/narrate.md`. If none is chosen yet, discover current public tools with `o11 discover "text to speech"` and inspect input, output, price and account requirements. Voice design and voice cloning are different operations; use the one the user requested. Quote exact inputs (`o11 quote`) and generate a representative sample when the chosen voice has not been accepted yet. Keep prior approvals and existing accepted voice resources.

Generate one file per line of the script, as WAV (or convert to 48 kHz WAV with ffmpeg), into `media/narration/<name>.wav`. Get word timings for each line in `media/words/<name>.json`: a tool that returns them with the speech (`o11 discover "speech with word timings"`), or forced alignment of the audio against its text (`o11 discover "forced alignment"`). Keep the same voice, model, settings and seed for every line, and spell names the way they are said ("Oh-stack", "S.E.O.").

Transcribe every line once it is generated and compare it to the script: a word the transcript gets wrong is a word a viewer may miss. Generate that line again with another seed and check it again before placing it.

Place each line in `edit/timeline.js` (`narration: [shot, start, name]`), leaving about half a second between lines, and run `node scripts/speech.mjs`. Generate a line again only when its words change; record the public voice preference in `launch-videos/narrate.md` when team reuse is requested. Keep account-scoped private voice ownership and sample hashes in the local project so they cannot be reused under the wrong account.

The user's own recorded voice works the same way: their WAV files in `media/narration/`, transcribed for timings.

For a requested clone, require a publicly callable creation/ownership path and an authorized source recording. Save workspace/provider/account/resource identity, wait for readiness, then synthesize through a compatible speech tool. Native-audio video conditioning is not a reusable voice clone. If cloning is unavailable, state that blocker and continue only with the user’s chosen alternative, such as a supplied recording.
