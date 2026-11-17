# Recreate a video

"Recreate this" can mean four things. Each mode is named by what it keeps. Ask which one the user means when the request does not say; the cost differs by a factor of ten.

| Mode | Keeps | Replaces | Done by | Status |
| --- | --- | --- | --- | --- |
| Structure | Hook pattern, beat order, pacing of ideas | All footage and all words | `ostack-video-teardown` writes `reference.json`; this skill writes a new script and generates new clips ([reference-remake.md](reference-remake.md)) | Proven piece by piece: talking clips and the local render ran. Teardown is its own skill |
| Edit style | Caption look, cut rhythm, zooms, transitions, sound, grade | Footage and words | `ostack-video-teardown` writes `style.json`; `ostack-video-edit` applies it as `edit/style.json` to any footage | Local, no paid call. See that skill for what the renderer supports |
| Motion | Movement, expression timing and camera of one shot | The person and the setting | `kling#v1/video/kling-3.0-omni` with a `feature_video` and a `refer_image` | Proven on the test server, including replacing the person |
| Swap | Everything except one element | One person, product or place | A `base_video` edit on `kling#v1/video/kling-3.0-omni` or `kling#v1/video/kling-4.0-omni`, or `alibaba#v1/video/wan2.7-videoedit` | Contract only. Only on footage the user owns |

Most requests are Structure plus Edit style: the user wants a video that works the same way and looks the same, about their product. Start there, and score the result against the reference with [match-loop.md](match-loop.md): a remake that copies only the caption style is a different video. Both modes use nothing from the reference except what teardown wrote down.

A reference records how a video is built. It does not authorize reusing the person, voice, footage, music or branding in it. Motion and Swap send footage itself to a model, so use them only on footage the user owns or has permission to use, and never on a third party's video saved by teardown.

## The simplest case: one photo in, a short clip out

The user has one image and wants it to move. No reference video, no teardown, no shoot plan beyond one shot.

| Route | The photo goes in as | Price | Status |
| --- | --- | --- | --- |
| `kling#v1/video/kling-4.0-i2v` | `first_frame`. The clip starts on the photo and keeps its shape | $0.157/s at 720p, 3-30 s. Audio is always on | Proven: 5 s, $0.785 |
| `alibaba#v1/video/wan2.7-r2v` | `reference_image`. The clip shows the same subject and need not start on the photo | $0.10/s at 720P, 2-15 s | Proven: 10 s, $1.00, with a voice clip |
| `alibaba#v1/video/wan2.7-i2v` | `first_frame`, with or without a `driving_audio` item | $0.10/s at 720P, 2-15 s | With audio: proven on the test server, 10 s, $1.00. Without audio: contract only |

Request shapes are in [talking-clip.md](talking-clip.md). Start with the shortest clip, 3 s on the first route ($0.47), and describe the motion in one or two sentences: what moves, how the camera behaves, what stays still.

Every proven run used a generated presenter image and speech. A clip with no speech is proven on `alibaba#v1/video/wan2.7-i2v` on the test server. A product or landscape photo and a photo of a real person are untested. A real person's photo needs that person's permission.

## Before any mode

1. Get the reference torn down. The `ostack-video-teardown` skill writes `references/<id>/reference.json` (what the video is: transcript, hook, beats, formula) and `references/<id>/style.json` (how it is edited). If that skill is not installed, build the beat sheet by hand as [reference-remake.md](reference-remake.md) describes.
2. Read `reference.json`. Check `unseen`: anything listed there was not inspected, so say so before relying on it.
3. State the mode, what will be kept and what will be replaced, and the expected cost, before any paid call.

## Structure

Follow [reference-remake.md](reference-remake.md). Each beat in `reference.json` becomes one planned shot with new words about the user's product. Presenter beats become talking clips ([talking-clip.md](talking-clip.md)). Screen and product beats use the user's real product. Nothing from the reference file is uploaded.

## Edit style

Copy `references/<id>/style.json` to `edit/style.json` and hand over to the `ostack-video-edit` skill. The style applies to footage from any source: new generated clips, the user's own recordings, or both. A style field the renderer cannot honour is reported and skipped; it does not fail the render.

## Motion

Route `kling#v1/video/kling-3.0-omni`. Proven request, 3 s at 720p, charged $0.378 ($0.126/s, the with-video rate):

```json
{
  "prompt": "<prompt>",
  "media": [
    { "type": "refer_image", "url": "<signed URL of the character image>" },
    { "type": "feature_video", "url": "<signed URL of the reference shot>" }
  ],
  "resolution": "720p",
  "duration": 3,
  "audio": "off",
  "aspect_ratio": "9:16"
}
```

The JSON shapes in this skill show the provider's fields. The runner's input file wraps them as `{"body": { ... }}`; `o11 call --input` takes them unwrapped ([generation.md](generation.md)).

What the one run showed:

- Motion and expression timing matched the reference shot closely.
- The character image was ignored. The output showed the person and room from the reference shot. Putting a new character on copied motion is therefore unproven, and that is the part most users want.

Limits from the contract: one video per request, MP4 or MOV, 3-15.5 s, at most 200 MB. At most four `refer_image` items alongside a video. With a video supplied, `audio` is `off` or `original`; the contract allows `native` only with no video input. `duration` is 3-15 s.

The proven prompt asked for the person in the reference image to perform the head movement, expression timing and hand gestures of the person in the reference video, in the room from the image, in vertical framing with a locked camera and no text on screen.

This mode uploads the reference footage to a provider. The video contract keeps `references/<id>/source.mp4` local and never uploaded, so do not host that file. Use this mode only when the user supplies the footage and owns it or has permission for it: register their file with `node scripts/ugc.mjs ingest . --file <their file> --role reference --id motion-source`, trim the one shot you need (at least 3 s) from the ingested copy in `media/clips/`, and host the trimmed clip ([spend.md](spend.md)). You pay for output seconds at the with-video rate.

```bash
"${FFMPEG:-ffmpeg}" -v error -ss <start> -t 3 -i media/clips/<ingested file>.mp4 -an -c:v libx264 -pix_fmt yuv420p output/motion-ref.mp4
```

If the user accepts an experiment, change one thing and run 3 s again ($0.378). Untried ideas, in the order to try them:

1. Give each item an `id` (`image_1`, `video_1`) and name them in the prompt as `@image_1` and `@video_1`, saying the video supplies motion only and the image supplies the person and the room. The contract documents these handles; the proven run did not use them.
2. Add the character image as `first_frame` so the clip opens on the new person.
3. Describe the character's clothes and room in the prompt in the same words as the character description.

Tell the user before each run that the swap has not worked yet.

`kling#v1/video/kling-4.0-omni` takes the same roles and up to 30 s, but its quotes came back far above the listed rate: $3.30 for a 5 s output with a 6.6 s reference and $3.11 for 3 s with a 3 s reference, against a listed $0.0942/s. That is about seven times the listed rate for the 5 s job. Neither was run. Always quote this route with a cap before considering it.

## Swap

Replace one element in existing footage and leave the rest. Contract only; nothing here has run.

| Route | Input | Limits | Listed price |
| --- | --- | --- | --- |
| `alibaba#v1/video/wan2.7-videoedit` | One `video` item plus up to four `reference_image` items, with an instruction in `prompt` | Source 2-10 s, at most 100 MB. `audio_setting: "origin"` keeps the original sound | $0.10/s at 720P |
| `kling#v1/video/kling-3.0-omni` | One `base_video` plus up to four `refer_image` items | 3-15 s. A base video cannot be combined with frames, multi-shot or native audio | $0.126/s at 720p |
| `kling#v1/video/kling-4.0-omni` | One `base_video` plus `refer_image` items | 3-30 s | Quote first; see the note above |

In the prompt, say what changes and what must stay. Start with the shortest clip the route allows.

No public route puts new speech onto existing footage. A swap cannot change what a person says, and a swapped speaker's lips will follow the original words.

## After any mode

Generated shots go through the take checks in [talking-clip.md](talking-clip.md) when they speak, and a frame strip against the reference shot when they copy motion. Then the `ostack-video-edit` skill assembles them. Keep `reference.json` and the new shoot plan as separate files, so "keep the pacing, change the hook" is a change to one of them.

## Motion with a different person (proven)

On 14 November 2026 a 3 s clip of one generated presenter drove a different generated character: her face, hair, clothes, prop and room came from the image, and his lean toward the lens, eyebrow raises and mouth movement came from the video. Charged $0.378. The first attempt, a day earlier, kept the video's person. The difference was the prompt, which has to say who is replaced and that they must not appear:

```json
{
  "prompt": "Replace the man in the reference video with the woman from the reference image. The output shows only her: her face, her hair, her clothes and her room from the image. She performs exactly the head movement, lean toward the lens, eyebrow raises and mouth movement of the man in the video. The man, his clothes and his room must not appear. Vertical selfie framing, no captions, no on-screen text.",
  "media": [
    { "type": "refer_image", "url": "<signed URL of the character image>" },
    { "type": "feature_video", "url": "<signed URL of the motion source>" }
  ],
  "resolution": "720p", "duration": 3, "audio": "off", "aspect_ratio": "9:16"
}
```

The output has no sound, so add speech as a `speech` track, and check the mouth against it. The motion source must be footage the user owns or made; a third party's video is not a motion source.

