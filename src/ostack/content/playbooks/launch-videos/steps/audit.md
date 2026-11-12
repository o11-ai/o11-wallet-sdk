---
summary: Proving the cut is clean before anyone sees it.
used_by: [irl, reel, product-demo]
changed: 0.8.0
---
Run every check and fix what it finds, before showing the user anything:

| Check | Command | Pass |
| --- | --- | --- |
| Nothing jitters | `node scripts/audit/stillness.mjs` | 0 moving |
| Layout | `node scripts/audit/overlap.mjs` | 0 layout problems |
| Frames | `node scripts/audit/torn-frames.mjs --video <file>` | every frame present, 0 torn |
| Sound | `node scripts/audit/sound.mjs` | about −16 LUFS, true peak ≤ −1.5 dBFS, left = right |
| No clipped words (any cut) | `node scripts/audit/words.mjs` | every kept word heard, in order |

For a reel the layout audit checks every frame: inside the side margins, clear of the Reels top bar and bottom 350px, no headline over a card, every card 8px above the measured head line. The head line follows the background down each column; on a busy background, check `output/head/<shot>.json` against a contact sheet and lower the cards if needed.

Then look yourself:
- One frame per second, tiled into contact sheets: `ffmpeg -i <video> -vf "fps=1,scale=480:-1,tile=6x6" sheet-%02d.jpg`.
- Full-size frames of every glass scene and every UI zoom over the real picture, not over black.
- Text readable on bright footage, nothing covering a face, no real customer data on screen.

When one frame is wrong, look for the whole class of problem across the video, then fix them all. Report what you checked, by name, and what you could not check.
