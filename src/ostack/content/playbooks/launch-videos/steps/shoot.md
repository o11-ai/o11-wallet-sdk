---
summary: How the clips are filmed (irl), so they edit cleanly.
used_by: [irl, reel]
changed: 0.8.0
---
When the user has not filmed yet, give them a one-page shoot sheet:
- Landscape for 1920×1080, upright for 1080×1920; the same frame rate for every clip (24, 25 or 30).
- One speaker per clip, standing to one side, with open space on the other: the glass components go there. Two-person clips get headlines only.
- A lavalier or shotgun mic. A quiet place beats a clean-up later: the voice is never denoised.
- Say each idea in one take, with a short breath between ideas. Start talking a second after recording starts.
- A few seconds of a quiet, moving scene (trees, water, a street) for the end card.
- Daylight, the same grade across clips.

For a **reel**: one clip, filmed upright on a phone, the speaker centred with open sky or a plain wall above their head (the headlines and cards go there), arm's length, one take. Say the hook first. End on the call to action, said out loud ("book a time at acme.com/demo").

When the clips exist, check each with `ffmpeg -i <clip>`: frame rate, size, duration, audio channels. Contact-sheet each clip (one frame per second, tiled) and note where the speaker stands, so you know which side is open. Put them in `media/clips/`.
