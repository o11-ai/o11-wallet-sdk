---
summary: The soundtrack, with the voice first, soft whooshes, and music only when asked.
used_by: [irl, reel, product-demo]
changed: 0.8.0
---
- **Voice:** the camera's own audio for filmed clips, untouched: no denoise, no EQ, no compression (a compressor also raised the noise against the voice). Cuts join with 6ms fades so they never click. The mix puts it in both ears (cameras often record the mic on one channel) and level-matches each clip. For a product demo, the narration from the narrate step.
- **Sound effects:** `node scripts/sound-effects.mjs` cues one soft whoosh on the first headline (a reel's hook) and as each glass scene enters. Ticks, pops, chimes and swells were rejected as bells and whistles; add one only when the user asks. For a sound the synthesizer cannot make, the wallet has sound-effect generation (`o11 discover "sound effects"`), quoted first.
- **Music:** none unless `launch-videos/sound.md` or the user says otherwise. Never use a copyrighted track without a license. With a go-ahead: the user's licensed file, or a generated one from the wallet (`o11 discover "music generation"`: ElevenLabs Music, MiniMax Music), quoted first. Set `music: { file: "music.wav" }` in the timeline; the mix ducks it under every phrase.
- **Loudness:** `node scripts/mix.mjs` normalizes once to −16 LUFS with a peak limiter.

You cannot listen to the mix. Every claim about sound comes from a measurement (`node scripts/audit/sound.mjs`), and you say it was measured.
