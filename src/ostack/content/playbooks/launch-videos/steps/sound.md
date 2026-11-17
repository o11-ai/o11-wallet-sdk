---
summary: "The soundtrack: the voice first, sound effects cued to the picture, and music on the score's grid."
used_by: [irl, reel, product-demo]
changed: 0.10.1
---
- **Voice:** the camera's own audio for filmed clips, untouched: no denoise, no EQ, no compression (a compressor also raised the noise against the voice). Cuts join with 6ms fades so they never click. The mix puts it in both ears (cameras often record the mic on one channel) and level-matches each clip. For a product demo, the narration from the narrate step.
- **Sound effects:** `node scripts/sound-effects.mjs` cues a soft whoosh on the first headline (a reel's hook) and as each glass scene enters. Add the rest from the animation's own cues: pops on cards that land, ticks on checks, typing under typed text, a chime on what completes, a swell under the logo, each short and well under the voice. For a sound the synthesizer cannot make, the wallet has sound-effect generation (`o11 discover "sound effects"`), quoted first.
- **Music:** as `launch-videos/sound.md` or the user says: the track they give you, or a generated one from the wallet (`o11 discover "music generation"`), quoted first. A song with vocals is split into instrumental and vocals with the wallet's stem separation (`o11 discover "stem separation"`): the instrumental under the voice, the vocals back over the end card. Put the edit on the song's grid and land its biggest moment on the biggest cut (the skill's `references/audio.md` has how). Set `music: { file: "music.wav" }` in the timeline; the mix ducks it under every phrase.
- **Loudness:** `node scripts/mix.mjs` normalizes once to −14 LUFS with a peak limiter.

You cannot listen to the mix. Every claim about sound comes from a measurement (`node scripts/audit/sound.mjs`), and you say it was measured.
