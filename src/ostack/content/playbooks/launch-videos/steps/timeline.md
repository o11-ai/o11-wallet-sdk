---
summary: The edit, with shots in order, headlines on the words and the end card.
used_by: [irl, reel, product-demo]
changed: 0.8.0
---
`edit/timeline.js` is the one source of truth: the picture, the mix, the sound effects and the audits all read it.

- **Shots** play in order. A clip shot names its file and `from`/`to` in seconds in that file. Every time you write for a clip is on that clock (the transcript's), so headlines and cards stay on the words through any cut. Give each shot its open side for glass (`overlays`) and the free top corner for the mark (`corner`), from where people actually stand across the whole clip.
- **Cuts:** a launch film plays its clips whole. A reel starts on the first word and tightens only the big pauses (`keep` ranges from `node scripts/pauses.mjs`), keeping natural beats of 0.3–0.6s. A time inside a removed pause lands on the cut, so a headline that ends there and the next one change exactly at the cut.
- **UI shots** name the captured states on screen (`images`), the camera moves (`camera`: a target and a zoom, gliding over about 1.3s) and the cursor (`cursor`: glide to a target, then click). Land a click on the moment the next state appears. Let the camera rest at least a second on each part the narration names.
- **Headlines** come from the script step: `[shot, start, end, side, "line one|line two"]`, low on the open side, each covering a whole phrase.
- **End card:** a quiet moving clip with its sound low (`kind: "end"` with a file), or the brand background. It holds to the last frame: no fade to black. A reel has none: its link capsule plays over the speaker and holds to the end, and it ends about 0.4s after the last sound so it loops cleanly.
- **Frame rate** matches the camera for irl (24000/1001 for 23.976); 30 for reels and product demos.

Start the video on the footage or the product, not on a title card. Never zoom or punch in on filmed clips.
