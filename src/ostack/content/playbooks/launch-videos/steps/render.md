---
summary: Rendering frames without shake, and encoding the video.
used_by: [irl, reel, product-demo, ugc]
changed: 0.11.0
---
Read the skill's `references/rendering.md` before changing anything in `page/` or `scripts/`.

1. `node scripts/prepare.mjs --scale 0.5` (filmed or generated clips), `node scripts/capture.mjs` (product-demo), `node scripts/speech.mjs`, `node scripts/sound-effects.mjs`, `node scripts/mix.mjs`.
2. `node scripts/render.mjs --scale 0.5`, then `node scripts/encode.mjs --scale 0.5`. Re-render only what changed with `--from`/`--to` (seconds) while iterating.
3. Render the full size (`--scale 1`, or 2 for 4K) when the user has accepted the edit or already authorized final production, with prepare run at the same scale.

The render refuses footage or captures made for a different edit; run the step it names instead of working around it. Long renders: tell the user how far along it is.

For UGC, `--scale 0.5` is the preview flag: `output/video-0.5x.mp4` is 540x960 and is for review only. The final is rendered without it (`prepare`, `render` and `encode` at the default scale), which writes `output/video-1x.mp4` at 1080x1920. Before the final, check the edit: zoom is 1.0 on presenter shots unless the reference zooms; no stretch runs over 2 seconds without a new title, caption, sticker, cutaway or layout; there is one caption system, heavy with a coloured box on the spoken word, and no two texts say the same words at once; the presenter and the product sit in tiles or a split layout, not a cut-out over product UI; a music bed sits under the speech. Reconcile pending jobs before new generation. Re-rendering accepted media at a new size does not regenerate source clips. Source-byte and edit hashes determine which derived assets are stale.
