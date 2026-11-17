---
summary: Proving the cut is clean before anyone sees it.
used_by: [irl, reel, product-demo, ugc]
changed: 0.11.0
---
Run every check and fix what it finds, before showing the user anything:

| Check | Command | Pass |
| --- | --- | --- |
| Compositor layers that should stay still | `node scripts/audit/stillness.mjs` | 0 moving |
| Layout | `node scripts/audit/overlap.mjs` | 0 layout problems |
| Frames | `node scripts/audit/torn-frames.mjs --video <file>` | every frame present, 0 torn |
| Sound | `node scripts/audit/sound.mjs` | about −14 LUFS, true peak ≤ −1 dBFS, left = right |
| No clipped words (any cut) | `node scripts/audit/words.mjs` | every kept word heard, in order |

For a reel the layout audit checks every frame: inside the side margins, clear of the Reels top bar and bottom 350px, no headline over a card, every card 8px above the measured head line. The head line follows the background down each column; on a busy background, check `output/head/<shot>.json` against a contact sheet and lower the cards if needed.

Then look yourself:
- One frame per second, tiled into contact sheets: `ffmpeg -i <video> -vf "fps=1,scale=480:-1,tile=6x6" sheet-%02d.jpg`.
- Full-size frames of every glass scene and every UI zoom over the real picture, not over black.
- Text readable on bright footage and gradients without any text shadow, nothing covering a face, no real customer data on screen.
- Every card at full size: equal padding, no half-empty card, no text running past its edge, logos in their own colours.
- Every frame present: the master's frame count equals the timeline's, and no frame is blank or flashes.

When one frame is wrong, look for the whole class of problem across the video, then fix them all. Report what you checked, by name, and what you could not check.

For UGC, check every generated shot has the intended duration, complete dialogue and selected character/voice references. Inspect lip sync and delivery by playback when available; otherwise mark those checks unverified. Test overlays separately from intentional motion in source footage. An unknown voice-likeness check cannot be reported as a pass from transcript accuracy alone.
