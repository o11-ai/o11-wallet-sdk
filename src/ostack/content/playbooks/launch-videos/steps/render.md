---
summary: Rendering frames without shake, and encoding the video.
used_by: [irl, reel, product-demo]
changed: 0.8.0
---
Read the skill's `references/rendering.md` before changing anything in `page/` or `scripts/`.

1. `node scripts/prepare.mjs --scale 0.5` (irl), `node scripts/capture.mjs` (product-demo), `node scripts/speech.mjs`, `node scripts/sound-effects.mjs`, `node scripts/mix.mjs`.
2. `node scripts/render.mjs --scale 0.5`, then `node scripts/encode.mjs --scale 0.5`. Re-render only what changed with `--from`/`--to` (seconds) while iterating.
3. Render the full size (`--scale 1`, or 2 for 4K) only after the user approves the review cut, with prepare run at the same scale.

The render refuses footage or captures made for a different edit; run the step it names instead of working around it. Long renders: tell the user how far along it is.
