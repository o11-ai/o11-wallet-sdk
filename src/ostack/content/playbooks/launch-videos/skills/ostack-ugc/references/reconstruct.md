# Rebuild what the teardown found

A remake is built from the teardown, line by line. For each thing the reference does, use the technique that produces the same thing. Do not reach for a layout because it is familiar: if the reference has no window over footage, neither does the remake.

Read `references/<id>/reference.json` and `style.json` first. Every row below starts from a field in them.

## Sound

| The reference has | Rebuild with |
| --- | --- |
| A platform sound under silent footage (`sound` in `reference.json`, no speech) | The same sound: cut the reference's own audio track, lay it under the cut, and give the user the sound's link to attach when posting ([match-loop.md](match-loop.md)) |
| Speech only | Speech in one voice across every part ([full-video.md](full-video.md), [voice.md](voice.md)) |
| Speech over a platform sound or music | Speech in the cut; the sound added in the app at posting, at low volume. No public route separates the two |
| Music that is a released track | A generated bed in the same tempo and mood (`elevenlabs#v1/music`), or the platform's own library at posting. Say which |
| Sound effects on cuts | `sound.sfx` in the style, on the same cuts |

## Hook

| The reference has | Rebuild with |
| --- | --- |
| A spoken question or claim to camera | The same hook shape with the user's product, as its own short shot so it can be swapped ([hooks.md](hooks.md)). Keep its length within half a second |
| A large header over the hook, gone after it | A `header` overlay with `to` set to the word where the next beat starts |
| Text only, all on screen from the first frame | A `stack` overlay with `"every": 0` |
| A visual stunt before any words | A generated clip of that action; name each action and its seconds in the prompt |

## Layers: what sits on top of what

Write down, for each beat, what fills the frame and what sits over it (`look` and `shot` in the beat). Then:

| The reference shows | Rebuild with |
| --- | --- |
| The presenter filling the frame | A talking clip as the shot ([talking-clip.md](talking-clip.md)) |
| The presenter filling the frame, cutting to the product and back | Separate shots, or a `"mode": "full"` cutaway over the speaker while they keep talking |
| The product on the whole screen with the presenter in a box in a corner | The screen as the shot, the presenter as an inset cutaway ([full-video.md](full-video.md)) |
| The product on the whole screen with the presenter cut out of their background, standing over it | The same, with the background removed: `node scripts/cutout.mjs <clip> --crop w:h:x:y`, then the inset with `"alpha": true`. It runs locally and costs nothing |
| A screenshot or post behind a reacting presenter | The screenshot as a still shot or full cutaway, the presenter cut out over it |
| Text over footage with nobody speaking | One b-roll clip and a text overlay ([match-loop.md](match-loop.md)) |
| A product photo or screen with a voice and no face | Voiceover over the user's footage, or footage made from a page capture ([full-video.md](full-video.md)) |

`cutout.mjs` keeps a person and drops everything else. It is right for a presenter on a plain or busy background; it is wrong for a shot where the background matters, and it softens hair and fast hands. Look at one frame over a flat colour before using the whole clip.

## Captions and text

Take the values from `style.json`, not from a preset by habit: typeface, size, colour, outline, position, words per line, whether the spoken word is marked. The preset sizes are for a video with no reference; when matching, the measured size wins, even a 120 px header. Over a white or busy screen, raise the outline to 8 and add a dark shadow. Copy where the text sits relative to the layers: when the reference's captions lie over the bottom of a cut-out, set `"captionsOver": true` on that cutaway and the layout audit allows it.

## Plan clip lengths from the reference's clock, before buying

Cuts can be moved in the edit; a beat that is too short cannot be stretched. Before any clip is bought, turn the reference's beats into a word budget for each shot: seconds times 3.75 words. A 3.8 s beat is 14 words, an 8.3 s beat is 31. Write each line to its budget, and buy each clip a second longer than its beat. In one run the second beat came out 2.4 s against the reference's 3.8 s because the line was written first and the clip bought to fit it.

## Cuts and pace

Copy the count and the places as fractions of the running time. Count a change of picture inside a screen recording (a new page, a pop-up) as a cut on both sides; a scroll or a slide is not one. Check a suspected cut on a 5 frames-a-second strip before building it in. A shot the reference holds for three seconds is held for three seconds.

## Then score it

Run [match-loop.md](match-loop.md) on the result. The score names what is still different, and a second agent gives the number you report.

## What cannot be rebuilt today

- The same room, wall or props as the reference: expect the same kind of place.
- Lip-sync onto footage that already exists.
- Speech separated from the music under it.
- The reference's person, voice or footage: these are not ours to copy.
