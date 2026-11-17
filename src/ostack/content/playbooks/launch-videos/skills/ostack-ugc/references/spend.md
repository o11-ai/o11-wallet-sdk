# Spend

Generated video costs about a dollar per ten seconds, and not every take is usable. Most of the saving comes from deciding things before the expensive call.

## Settle each decision at the cheapest tier

| Tier | Costs | Decide here |
| --- | --- | --- |
| Text | Nothing | Hook, script, word count, shot list, which reference does what, the mode of a remake |
| Still | $0.03 per image (proven on the test server), $0.075 on the larger model, or a frame from an existing clip for nothing | The character, clothes, prop, room, framing |
| Motion draft | $0.15 for 4 s at 480P, plus $0.04 per input image (contract only) | Framing, blocking, camera and how the subject moves |
| Short draft | $0.40-$0.80 for 4-5 s at 720p | Whether the final route holds the face, speaks the words and moves the way the shot needs |
| Final | $1.00 per 10 s at 720P on the default route | The accepted script, at full length |

A question moves up a tier only after the user accepts the answer at the tier below. Do not use a video call to find out whether the user likes the character's jacket.

Both proven talking-clip routes ran at 720p. 1080p costs 50% more on both and has not been run. Render the final at 720p unless the user asks for more.

### The motion draft route (contract only)

`minimax#v1/video/minimax-h3` at 480P is listed at $0.038/s, against $0.10/s for the default route. Use it to try a camera position, a walk or a two-person layout before paying for the final. Nobody has run it at 480P or with a first frame; it ran at 768P as a talking route ([talking-clip.md](talking-clip.md)).

```json
{
  "model": "MiniMax-H3",
  "content": [
    { "type": "text", "text": "<prompt>" },
    { "type": "image_url", "image_url": { "url": "<signed URL of the keyframe>" }, "role": "first_frame" }
  ],
  "resolution": "480P",
  "duration": 4
}
```

- These are the provider's fields. Wrap them as `{"body": { ... }}` for the runner ([generation.md](generation.md)).
- `model`, `content`, `resolution` and `duration` are required. `duration` is 4-15 s. `resolution` is `480P`, `768P` ($0.08/s) or `2K` ($0.13/s). Each input image adds $0.04.
- `content` holds exactly one `text` item (7,000 characters at most) plus media items. An image is `{"type":"image_url","image_url":{"url":...},"role":...}`.
- **It cannot combine a pinned first frame with other references.** Send either `first_frame` (and optionally `last_frame`) images, or `reference_image` (up to 9), `reference_video` and `reference_audio` items. The contract says the two families cannot be mixed. So a draft either starts on your exact keyframe, or follows a character sheet and a voice sample, never both.
- `ratio` must be set, and not to `adaptive`, for a text-only request. With a first frame the image decides the shape.
- A reference video's length is billed on top of the output.
- The result is at `task.content.url`, a link that expires. The runner reads that field.
- The contract says a 5 s clip takes 2-3 minutes on this tier.

A draft comes from a different model than the final, so it settles framing and movement only. It says nothing about the final's face, voice or lip movement. Do not show a draft to the user as a preview of the presenter.


## Budget three generations per usable shot

Tell the user before spending: plan for three takes of each shot. A take can stall, move a hand wrongly or drop a word, and each rerun changes one thing. Three is a planning number. The two proven takes each ran once.

Worked example, a 20 s video in two 10 s talking clips on the default route:

| Item | Sum | Cost |
| --- | --- | --- |
| Talking clips | 2 shots x 3 takes x $1.00 | $6.00 |
| Voice line for the voice clip | one call | $0.01 |
| Transcription of each take | 6 calls, under $0.001 each | $0.01 |
| Expected spend | | about $6 |
| Project budget to approve | expected spend plus the $3.30 transcription hold | about $9.50 |

Proven prices: `alibaba#v1/video/wan2.7-r2v` $0.10/s at 720P; `kling#v1/video/kling-4.0-i2v` $0.157/s at 720p; `kling#v1/video/kling-3.0-omni` with a video input $0.126/s at 720p; `fishaudio#text-to-speech` $0.015 per 1,000 bytes. Quote every call. The quote is a ceiling and can sit well above the charge: one 6 s clip on a per-token route was quoted $3.00 and charged $0.457. The per-call cap and the project budget both have to cover the quote.

## One shoot plan, one change per rerun

Keep one file, `shoot-plan.md` beside `brief.md` in the video folder, that holds exactly what each model receives. Nothing reaches a model that is not in it.

For each shot it records:

- the shot ID, which is also the runner's stage ID
- the route and the path of its input JSON file
- the full prompt, and `character.json` as sent
- each reference file, its hash, and its one job: appearance, voice, motion or first frame
- the script, its word count and the `duration`
- a list of things to avoid, one line per complaint from an earlier take
- the takes so far: invocation ID, cost, check numbers, verdict

Two working rules for the plan, untested here:

- **Keep prompts to a moderate length.** A prompt that scripts every movement second by second tends to give a stiffer clip than one that sets the scene, the delivery, one hand action and the limits. When a take is wrong, fix the plan or the asset: a clearer keyframe, a better voice clip, a tighter character description, one more line in the avoid list. Do not answer each failure by making the prompt longer.
- **The first keyframe decides the look.** Before generating from a still, check its light, background, faces and the spacing between people. A fault in the still is in every frame of the clip.

To rerun, edit the plan, write the new input JSON from it, and state in one or two lines what changed. Change one thing per rerun. The routes give no dependable seed, so a rerun that changes two things cannot tell you which one helped, and it can break something that worked.

Keep the old take. A new take sits beside it until the user picks one.

### Blocking, for two people or a moving shot (optional)

When a shot has more than one person, or someone or the camera moves, write the layout as data in the plan and say the same positions in the prompt.

```json
{
  "space": { "width": 4.0, "depth": 3.0, "unit": "m", "origin": "back-left corner, seen from above" },
  "camera": { "x": 2.0, "y": 3.0, "height": 1.5, "facing": "back wall", "distanceToSubject": 1.2 },
  "people": [
    { "id": "host", "x": 1.6, "y": 1.8, "facing": "camera" },
    { "id": "guest", "x": 2.5, "y": 1.9, "facing": "host" }
  ],
  "beats": [
    { "from": 0, "to": 4, "action": "host speaks to camera, guest listens" },
    { "from": 4, "to": 8, "action": "guest turns to camera and answers" }
  ]
}
```

In the prompt, say it in plain words: who is on the left, who is nearer the camera, how far the camera is, and who moves when. Keep the same positions in every shot of the scene and in the keyframe.

Generating more than one person is untested on these routes. By contract the default talking-clip route takes up to five references, each with its own `reference_voice`, addressed in the prompt as "Image 1" and "Image 2". Try the layout on the motion draft route first.

## Host references (proven)

Routes take public `https://` URLs and reject base64. Host a local file through the workspace file store. All three steps are free. Four files went up this way and each remote hash equalled the local one; both video providers and the transcriber fetched the links.

```bash
o11 call 'sfs#put' --allow-write --input '{"path":"ugc/<video>/character.jpg","sizeBytes":<exact bytes>,"ttl":"1d"}'
curl -T media/assets/character.jpg '<uploadUrl from the result>'
o11 call 'sfs#cat' --input '{"path":"ugc/<video>/character.jpg","ttl":"1d"}'
```

- `sizeBytes` is the exact file size (`wc -c < file`). A larger upload is rejected.
- The upload is a raw PUT (`curl -T`). The contract rules out a multipart upload (`curl -F`).
- The file's content type comes from its extension, so name it `.jpg`, `.mp3` or `.mp4`.
- `sfs#cat` returns `url`. Put that in the request's `url`, `reference_voice` or `audio_url` field. `ttl` is `1h`, `1d`, `7d` or `30d`; use `1d` so the link outlives a queued job.
- Verify once per file: `curl -s '<url>' | sha256sum` must equal `sha256sum <file>` (`shasum -a 256` on macOS).
- The file stays until removed. An expired link needs a fresh `sfs#cat`, with no new upload. The workspace has 1 GB.

These two calls were run with the CLI directly. They are free and create no paid stage. Running them through `node scripts/ugc.mjs generate` is untested.

A signed URL is a credential for that file. Keep it in the input JSON under the video folder. Never paste it into the brief, the video in o11, a handoff or team playbook text.

A page that shows a file is not a file URL. If a link returns HTML, the provider fails after you have paid. When unsure, fetch the first bytes and check the type.

## The transcription hold

`elevenlabs#v1/speech-to-text` reserves $3.30 on every call, whatever the clip length, and settles at the real cost, well under a cent: under $0.001 for a 10 s clip (proven on production, and seen again in the 14 November tests).

- Set its per-call cap to at least 3,300,000 micros: `--approve-max-micros 3300000`. A lower cap is refused.
- The runner checks the cap against the remaining project budget, so the project needs $3.30 of headroom when the call starts. The hold is released when the call settles.
- Run transcriptions one at a time so two holds do not stack.
- Tell the user about the hold when you ask for the budget, or the budget will look padded.

`elevenlabs#v1/forced-alignment` holds $2.20 the same way (contract only).

## Download the moment a call completes

Where a result lives depends on the route:

| Route | Result field | Lifetime |
| --- | --- | --- |
| `alibaba#v1/video/wan2.7-r2v` | `output.video_url`, the provider's own link (production) | About 24 hours |
| `alibaba#v1/video/wan2.7-i2v`, `alibaba#v1/image/wan2.7-image` | A saved copy in `media[]` with a `downloadUrl` (test server) | Saved copy 7 days |
| `kling#v1/video/kling-4.0-i2v`, `kling#v1/video/kling-3.0-omni` | `outputs[].url`, and a saved copy in `media[]` with a `downloadUrl` | Saved copy 7 days |
| `fishaudio#text-to-speech` | `audio.download_link`, and a saved copy in `media[]` | File 7 days, link about 1 hour |

The runner downloads as soon as it sees a stage succeed. A generation takes 1-5 minutes by contract, and the one clip generated through the runner in these checks took five. The submit returned in 2 seconds, so run `node scripts/ugc.mjs resume . --stage <id>` until the stage is `succeeded` with an asset, in the same session. Use `resume` only: running `generate` again with a refreshed link buys a new take ([generation.md](generation.md)). Do not leave a submitted stage for tomorrow: a provider link may be dead by then, and the money is spent.

After every stage, confirm the asset is on disk and opens. On production on 13-14 November 2026 five calls were charged $1.18 in total and delivered nothing: the call settled as succeeded, `media[0].status` was `failed` with "File could not be saved.", and the provider link had been replaced with null. That hit every image call and one video call. A fix to how results are saved was tested on 14 November 2026 on a test server, where the same image and video routes delivered; it had not been released to production on that date, and the MiniMax image route still lost its file there. When it happens:

1. Stop. Do not rerun the same request to "get the file"; it charges again.
2. Keep the invocation ID and receipt. Tell the user the amount and ask whether to request a refund.
3. Count the charge as spent in the project until a refund is recorded.

## The bill

Write `bill.md` in the video folder when the video is delivered, and again after any later paid change. Pass one run id to everything: `export O11_RUN_ID=$(o11 session-id)` before the first `o11 call`, and `ugc.mjs init --run-id` with the same value. Build the bill from `o11 run-status <id>` and `o11 history`, because searches, transcripts, downloads and speech are direct calls that never reach `ugc/receipts/`. A wallet can be shared: ignore charges from other run ids. Signed links name the storage host; strip them from anything you hand over.

- One row per paid step: the trend pull, transcripts, each still (both models of the character comparison), each speech line, each take including the rejected ones, each transcription, the music bed. Each row has the route, the invocation ID from its receipt and the charge.
- A charge with no file delivered is its own row.
- A step billed by a connected avatar provider on the workspace's own key is a row with the wallet charge at zero and the provider's price as the user confirmed it, marked as not on the wallet.
- Then the total, the number of finished clips, and the total divided by that number. A finished clip is a video file handed to the user; a variant counts as one.

## Before a paid call

- The user has been told this step's price in this conversation: the route, the seconds or count, and the dollars.

- The request JSON matches the shoot plan.
- Every URL in it was fetched and hashed after hosting.
- Voice clip length is inside the route's limit (1-10 s for `reference_voice`). Prompt length is inside the limit.
- `duration` is a whole number inside the route's range.
- The quote is at or under the cap, and the cap fits the remaining budget.
- The user has approved this spend, or it falls inside a budget they already approved.
