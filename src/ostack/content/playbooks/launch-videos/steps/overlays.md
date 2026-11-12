---
summary: Frameless glass components that show what is being said.
used_by: [irl, reel, product-demo]
changed: 0.8.0
---
Glass components (`edit/scenes.js`) show the idea while it is said: a price, a result, a state, a number, a real logo. One idea per scene, timed to the words, on the shot's open side. In a product demo the product itself is the picture; add glass only for what the screen does not show.

- Build them from `page/primitives.js`: rows, pills, stats, real logo tiles, checks, switches, and cropped real screenshots. Logos are real files in `media/brand/` (the wallet's brand.dev tools can fetch a company's logo: `o11 discover "brand logo"`).
- Minimal text. No sentences inside components, no mock windows or title bars, no dark panels, no drop shadows, no rainbow gradients.
- Stagger pieces of one scene by 0.06 to 0.25s; let a scene leave on the word that changes the idea while the next rises in.
- Numbers are real and add up across the video. Demo names are demo names; say so when you hand over.
- Pieces that keep animating (a counter, a switch) set `still` (when they stop, in shot seconds); one that loops on purpose sets `loop: true`.

**reel:** cards are centred above the head in the open space, big enough for a phone (`layout: "reel"` sizes them up): `y` 412 under a two-line headline, 335 under a one-line one. A card enters at least 0.3s after its headline and leaves when that headline starts to leave, so the next headline never rises through it. Nothing rests above 200px (the Reels top bar), in the bottom 350px (caption and buttons) or on the right rail. No corner mark: the mark goes in the call to action, a capsule that widens into the link (`capsule` with `widen`), with an optional `claim` under it. Time chips, counters and slots to the spoken word from `edit/speech.js`.

Never cover a speaker's face or the part of the screen being talked about. The overlap audit checks margins, gaps and headlines, and for a reel every frame against the speaker's measured head line.
