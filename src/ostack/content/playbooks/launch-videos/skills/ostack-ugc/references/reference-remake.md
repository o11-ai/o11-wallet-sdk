# Remake a reference video's structure

This is the Structure mode in [recreate.md](recreate.md): keep how the reference is built, replace every frame and every word.

## Read the reference files

The `ostack-video-teardown` skill writes two files per reference. Read them; do not re-derive them.

- `references/<id>/reference.json`: what the video is. `source`, `metrics`, `media`, `transcript.words`, `hook`, `beats[]`, `formula`, `productFirstSeen` and `unseen`.
- `references/<id>/style.json`: how it is edited. That file belongs to the `ostack-video-edit` skill; copy it to `edit/style.json` when the user wants the same look.

What to take from `reference.json`:

| Field | Use it for |
| --- | --- |
| `hook.kind`, `hook.spoken`, `hook.onScreen`, `hook.end` | The opening pattern and how long it has to land. Write a new hook of the same kind |
| `beats[].role` in order | The argument: hook, problem, proof, demo, payoff, call to action |
| `beats[].start` and `end` | Each beat's length, which sets each new line's word budget. Take the pace from `measured.wordsPerSecond` when the teardown has it, otherwise about 3.75 words per second. The shot plan cuts on `measured.cuts`, not on beat ends |
| `beats[].shot` | Which beats need a talking clip (`presenter`) and which use real product footage (`screen`, `product`) |
| `beats[].camera`, `beats[].action` | Framing and the one hand action for the talking-clip prompt |
| `beats[].onScreen` | The text on screen, each item with its `from`, `to` and `position` when the teardown timed it. The editor draws it at those times and places; it never goes into a generation prompt |
| `formula` | A one-line check that the new script is still the same kind of video |
| `productFirstSeen` | When the product should first appear |
| `unseen` | What teardown could not inspect. Say so before relying on a beat built from it |
| `metrics` | Context only. A null value means the platform did not return it; never fill it in |

All times are seconds. Paths are relative to the video folder.

## When there is no reference.json

If teardown is not installed or could not get the file, build the beat sheet by hand in `reference.md`. Save the source URL or local file, the capture time and the content hash. Download through a supported tool when a URL was supplied. If the download is blocked, work from the transcript or preview frames and record which parts remain unseen.

Record for each beat: time range, spoken words with uncertain words marked, the hook, the shot type, camera and action, the edit (cuts, overlays, captions, transitions), the audio, and the product's role. Use scene cuts, spaced contact-sheet frames and word timings together. A transcript alone cannot establish composition or delivery, and a model's prose description of a video is evidence to check against the frames.

## Write the new video

1. Copy the beat order and each beat's length into the shoot plan.
2. Write new words for each beat about the user's product, inside its word budget. Keep the hook's kind and the formula. Use only product behavior and claims the user supports.
3. Give each beat a source: a talking clip ([talking-clip.md](talking-clip.md)), the user's real product recording, or a graphic the editor draws.
4. Create an original character, or use the user's existing one ([character-image.md](character-image.md)). Save the selected image and its description in the shoot plan.
5. Join neighbouring presenter beats into one talking clip when together they stay under 15 s. Fewer clips cost less and hold identity better.
6. For each generated shot, state which file supplies appearance, voice, motion or first frame, and match those jobs to the route's input fields. Do not send every source file as an unlabelled list.

"Make it like this" asks for the rhythm, framing or hook pattern. It does not ask for the original presenter's face, voice, exact words, music or branding. If the user asks for the same speaker or voice, treat that as a separate request that needs that person's permission, and record the basis.

A whole-video remix through one model call is right only when a public route supports the source's length, its media limits, the intended changes and the output format. The Motion and Swap modes in [recreate.md](recreate.md) list what exists. Otherwise generate separate shots and assemble them locally. Tell the user before paid work when the method changes fidelity or cost.

Keep `reference.json` and the new shoot plan as separate files. A later request such as "keep the pacing, change the hook" then changes one field of one file.

## When the budget is shorter than the reference

Add up the presenter seconds in `beats[]` and price them before the user picks a reference. If the budget buys fewer seconds than the reference has on camera, keep the hook at full length, shorten the close, and tell the user which beat was dropped. Never shorten the hook.

## A designed animation in the middle

Some references spend most of their length on an animated graphic of the product's interface, not a screen recording. Build it as an HTML page driven by one time value, capture its frames with the kit's Chrome (the same way `scripts/capture.mjs` captures product UI), encode them to a clip and register it with `ugc.mjs ingest`. Count its state changes against the reference's and match the number: a graphic with fewer changes reads slower than the original.
