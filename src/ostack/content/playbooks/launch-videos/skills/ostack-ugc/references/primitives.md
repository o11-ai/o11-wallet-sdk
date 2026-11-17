# Primitives

Any short video is some of these building blocks put together. To make a video, pick the blocks it needs. To remake one, tear it down, name the blocks it uses, and rebuild each ([reconstruct.md](reconstruct.md)). Every block below has run on a real video; the last table says which.

## Take a video apart

| Block | Does | With |
| --- | --- | --- |
| Find | Rank what is working in a niche, with each video's sound and kind | `ostack-video-trending` |
| Tear down | Beats, hook, text, layers, cuts, sound, and where the camera and subject sit | `ostack-video-teardown` |
| Stage | What a company posted at each stage of its growth, matched to the user's stage | `ostack-growth-teardown`, videos mode |
| Score | How close a remake is to its reference, line by line | `node scripts/match.mjs` ([match-loop.md](match-loop.md)) |

## Picture

| Block | Does | With |
| --- | --- | --- |
| Character | A person from a description, held across images | `alibaba#v1/image/wan2.7-image` ([character-image.md](character-image.md)) |
| Edit a frame | Change named regions and keep the rest | The same route with `images` and `bbox_list` ([match-loop.md](match-loop.md)) |
| Talking clip | A character speaks a line | Three routes ([talking-clip.md](talking-clip.md)) |
| Action clip | A character does something, no speech | `alibaba#v1/video/wan2.7-i2v` from a first frame |
| Motion transfer | One person's movement performed by another character | `kling#v1/video/kling-3.0-omni` ([recreate.md](recreate.md)) |
| Screen footage | The product on screen | The user's recording, or a page capture turned into footage ([full-video.md](full-video.md)) |
| Cut-out | A person with their background removed | `node scripts/cutout.mjs`, local and free |
| Still | A product photo or screenshot as a shot or a cutaway | `edit/cutaways.json` |

## Sound

| Block | Does | With |
| --- | --- | --- |
| Speech | A line in a voice, with word timings | `fishaudio#text-to-speech` and `/timestamps` ([voice.md](voice.md)) |
| Voice transfer | A later clip speaks in an earlier clip's voice | `reference_voice` on `alibaba#v1/video/wan2.7-r2v` ([full-video.md](full-video.md)) |
| Exact audio | A clip's lips follow a prepared speech file | `driving_audio` on `alibaba#v1/video/wan2.7-i2v` |
| Same sound | The reference's platform sound under the cut, and its link for posting | `sound` in `reference.json` ([match-loop.md](match-loop.md)) |
| Music | A generated bed | `elevenlabs#v1/music` |
| Word timings | For captions and cuts | Transcription, speech timestamps or forced alignment ([full-video.md](full-video.md)) |

## Layout and time

| Block | Does | With |
| --- | --- | --- |
| Shots | Order, trims, jump cuts, a fixed crop | The shot plan (`keep`, `zoom`) |
| Replace speech | A shot plays another sound | `speech` on the shot |
| Window | A clip or still in a box over the picture | An inset cutaway |
| Cut-out over footage | A person over a screen with no box | An inset cutaway with `"alpha": true` |
| Cover | A clip or still fills the frame while the voice continues | A full cutaway |
| Captions | Word-timed, in any measured style, over or under an inset | `edit/style.json`, `captionsOver` on the cutaway |
| Header and text | A header for one beat, a stack of lines, stickers | Overlays, anchored to seconds, words or a shot |
| Look | Brightness, contrast, saturation, punch-ins, shake, transitions | `grade` and `camera` in the style |
| Check | Layout, stillness, torn frames, loudness, pauses at cuts | The audits and the join checks |

## Kinds of video these have built

All on the test server on 14 November 2026. Each passed its layout, stillness and sound audits.

| Kind | Blocks used | Result |
| --- | --- | --- |
| Text over footage with the reference's sound | Tear down, character, edit a frame, action clip, same sound, text stack, score | 8.5 s remake; 39 to 73 out of 100 by an independent scorer |
| Talking hook, product, close | Character, exact audio, action clip, speech, still cutaway, captions per shot | 12.2 s; transcript matches the script |
| Presenter cut out over the product's screens | Tear down, character, talking clip, voice transfer, screen footage, cut-out, header for one beat, captions over the inset | 15 s remake of a 1.46 million-view video |
| Faceless voiceover over product footage | Speech with timestamps, screen footage, captions | 9.4 s; no generated picture at all, under a cent |
| Reaction over a screenshot | Talking clip, cut-out, still screen, captions over the inset | 5 s |
| Motion transfer onto another character | Motion transfer | 3 s; a man's lean-in and expressions performed by a woman character in her own room, $0.38 |

Not built: a skit with several people, a clip longer than 15 s in one take, and anything that needs lip-sync onto existing footage.
