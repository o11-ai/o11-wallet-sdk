# Character image

One still fixes who the presenter is. Every clip reuses it, so settle it before any video call.

## Read this first: whether the file arrives depends on the server

| Where | Date | What happened |
| --- | --- | --- |
| Production (go.o11.ai) | 13-14 November 2026 | Every image call was charged and its file was never delivered: four of four, on three routes, including `alibaba#v1/image/wan2.7-image-pro` twice. Each call settled as succeeded, `result.media[0].status` was `failed` with "File could not be saved.", and the provider's link was replaced with null |
| A test server running a fix to how results are saved | 14 November 2026 | `alibaba#v1/image/wan2.7-image` delivered twice at $0.03 each: a 720x1280 PNG of 1.6 MB and a 1080x1920 PNG of 3.6 MB, both saved and downloaded. `minimax.image-gen.from_text` was still charged and lost, three of three |

The fix had not been released to production on 14 November 2026. So on any server, before the first batch of a project:

1. Run one call on the cheapest route, `alibaba#v1/image/wan2.7-image` with `n: 1` ($0.03). It can be the first of the two model options.
2. Confirm the file exists: `node scripts/ugc.mjs status .` shows the stage as succeeded with an asset, and the image opens from `media/assets/`.
3. Only then run the route and count you planned.

Once one image has arrived in a project, the step is done for that project. Do not use the MiniMax image route on either server.

If the stage ends with no asset, stop and do not retry the same call. First open the stage's receipt in `ugc/receipts/` and look at `result.output.choices[0].message.content[0].image`. The runner does not read that field, so a live link there means the image exists: download it at once with `curl -o media/assets/<name>.png '<link>'` and register it with `node scripts/ugc.mjs ingest`. If the field is null and `result.media[0].status` is `failed`, the file is lost. Keep the invocation ID for a refund request, tell the user what was charged, and use the fallback below.

## Fallback: a frame from an accepted clip (proven on production)

Use this when an image call cannot deliver, or when a clip of the presenter already exists.

The character image used in both proven talking clips was a 720x1280 JPEG frame taken from a generated presenter clip. Both video routes accepted it and held the identity.

```bash
"${FFMPEG:-ffmpeg}" -v error -ss <second> -i media/clips/<clip>.mp4 -frames:v 1 -q:v 2 media/assets/character.jpg
```

Pick a frame with the mouth closed or nearly closed, eyes on the lens, both hands and the prop visible, and no motion blur. Then `node scripts/ugc.mjs ingest . --file media/assets/character.jpg --role actor --id character`.

Where the clip comes from:

- A clip the project already accepted.
- A recording the user supplies of a presenter who has agreed to be used.
- A short text-only clip made from the character description (proven). The frame used in the proven talking clips came from a 6 s clip on `bytedance#v1/video/seedance-2.0-mini`, generated through the runner on 13 November 2026 and charged $0.457. Its quote was $3.00, so the per-call cap had to be 3000000. Provider fields: `{"content":[{"type":"text","text":"<character description, then one spoken line in quotes>"}],"resolution":"720p","duration":6,"ratio":"9:16","generate_audio":true,"watermark":false}`. Send text only: this route rejects presenter images. `alibaba#v1/video/wan2.7-t2v` is a second option at $0.10/s (contract only).

## Lock the character as JSON

Write the character as one JSON object with eight keys and save it as `media/assets/character.json`, next to the image it makes. Send it, minified, as the `prompt`. A file can be compared key by key between runs, and a retyped paragraph drifts.

| Key | Holds | Rule |
| --- | --- | --- |
| `shot` | The view and the framing | Vertical phone video still, front camera at arm's length, slightly below eye level. Chest-up: head and both shoulders in frame with clear space above the head. The face fills no more than a quarter of the frame width. When matching a reference, its `look.subject` sets the face size instead, and this rule does not apply |
| `subject` | The person and the expression | Age, skin, hair, one or two details. Calm, a closed-mouth half smile, eyes on the lens. This is the clip's first frame, and a video that starts on an open mouth or a big expression keeps shouting |
| `wardrobe` | Clothes | One garment someone would remember, with its colour and fabric. A grey hoodie reads as stock footage |
| `prop` | What they hold | One object, which hand, and where. A small clip-on microphone at the collarbone gives the hand a job and makes the clip read as a creator's |
| `setting` | The room | A real, lived-in room in saturated colour: a painted wall, things taped to it, a lamp, a screen, clutter. A white or beige wall with nothing on it fails |
| `light` | Sources | Light that is in the room, such as a warm lamp and a cool screen. No studio light and no rim light |
| `camera` | How a phone captured it | Sensor noise, slight softness, pores and small blemishes, uneven brows. No HDR, no beauty filter, no sharpening halo. Leave out quality words such as "photorealistic" or "8K" |
| `exclude` | What must not appear | Text, captions, watermark, logo, extra fingers, studio backdrop, a perfectly symmetrical face, glossy skin. These routes have no negative prompt field, so exclusions go here (contract) |

Give each key one value. "Brown or dark blonde hair" lets the model choose again on every call. Aspect ratio and size are request fields and stay out of the JSON.

This file made the still used in the 15 November 2026 test, on the test server. The same still then held its face, sweater, room and microphone on three talking routes ([talking-clip.md](talking-clip.md)):

```json
{
  "shot": "vertical 9:16 phone video still, front camera of a recent iPhone held at arm's length, slightly below eye level, chest-up framing with head and both shoulders fully in frame and clear space above the head, the face fills no more than a quarter of the frame width",
  "subject": "woman in her late twenties, light brown skin, dark wavy shoulder-length hair with a few loose strands, small gold hoop earrings, relaxed closed-mouth half smile, looking straight into the lens, calm",
  "wardrobe": "oversized cobalt blue knit sweater, thin silver necklace",
  "prop": "holds a small black clip-on wireless microphone near her collarbone in her right hand",
  "setting": "her bedroom desk corner at dusk, warm orange lamp on the left, teal wall with two taped posters and a string of small lights, a monitor glowing softly behind her shoulder, lived-in clutter",
  "light": "mixed warm lamp and cool screen light, soft shadows, no studio light, no rim light",
  "camera": "phone sensor look, mild noise, slight softness, natural skin with visible pores and small blemishes, uneven eyebrows, real slightly imperfect teeth not showing, no HDR, no beauty filter, no sharpening halo, no bokeh blur stronger than a phone gives",
  "exclude": "text, captions, watermark, logo, extra fingers, studio backdrop, symmetrical perfect face, glossy skin"
}
```

Rules that came from faults:

- **A close-up still makes a worse clip.** With the face at half the frame width, every flaw of the video model is on show and the mouth is large enough to watch fail. Chest-up with the face at a quarter of the width was the largest single improvement in the 15 November test, ahead of the choice of video model.
- **Never name a stand or tripod** (proven on the test server, 14 November 2026). "A mid-range phone on a small tripod at eye level" produced an image with a phone on a tripod in front of the presenter. A phone held at arm's length is out of its own picture.
- **Say where a prop is and what it must not cover.** "Holding the notebook just below her chin" put the notebook over her chin. "At chest height, her whole face clear above it" fixed that.
- **On a rerun, change one key.** Compare the image with the file key by key, tighten the key that drifted, and save the earlier file as `character-1.json` so the versions can be compared.

The file describes a new person. It names no one and describes no real person's face, whether from a trending video or anywhere else.

## Asset sheets

For a video with more than one shot, lock every recurring thing on a still before any video call. Each sheet is one image with one job.

| Sheet | What it shows | Its job |
| --- | --- | --- |
| Character, one per person | A clean, front-facing face on the left. The full outfit from the front and from the back on the right, with the head cropped out | Left half: identity. Right half: outfit |
| Location plate, one per place | The empty room from the main camera position, with no people | Place |
| Reverse plate | The same room from the opposite side | Place, for any shot that looks the other way |
| Prop, one per important object | The product alone on a plain surface, label legible, in the light of the scene | Product shape |
| Keyframe, one per scene or important moment | The character, in the outfit, in the place, holding the prop, framed as the shot will be | The first frame of that shot |

Rules:

- Make sheets in that order. Each keyframe is built from the sheets above it, passed in the image route's `images` list, with the prompt stating what each image is for and what it must not supply: "Image 1 gives the face only. Image 2 gives the clothes only. Image 3 gives the room."
- The outfit views have no face so the model cannot average two faces.
- Register each accepted sheet with `node scripts/ugc.mjs ingest` and record its job and hash in `shoot-plan.md`.
- The user approves every keyframe before any video is generated from it. The keyframe decides the look of the clip, so check the light, the background, the face and the spacing between people on the still.
- A video route receives the keyframe, or the single character frame. The default talking-clip route's contract asks for one character per subject image, so do not send it a sheet that shows the same person three times.

A single character image from text is proven on the test server. Sheets built with reference images in `images` have not been run anywhere. A one-shot talking clip needs only one character image.

**Always make the character on two image models.** Prefer one Wan route and `piapi.image-gen.gemini-3-pro-image`, so the two differ in more than detail. With budget for one image only, make one, show it and ask yes or no. Add "no readable text, no real band, brand or person names on posters or clothes" to `exclude`: one model wrote a real band's name on a poster. Send the same `character.json` to two routes, build one labelled sheet ([experiments.md](experiments.md)) and show both with the price of each: $0.06 for `alibaba#v1/image/wan2.7-image` and `alibaba#v1/image/qwen-image-3.0`, or $0.105 with `alibaba#v1/image/wan2.7-image-pro` as the second. The same prompt gave three different faces and framings on those three routes (proven on the test server). The user picks one, and that model makes every later image of the character. The Wan and Qwen routes take reference images; `minimax.image-gen.from_text` is text only and its files were still refused on 14 November 2026.

## Routes and request shape

| Route | Price | Notes | Status |
| --- | --- | --- | --- |
| `alibaba#v1/image/wan2.7-image` | $0.03 per image | Default. Sizes up to 2K. Up to nine input images | Proven on the test server, text to image, twice. Not run on production |
| `piapi.image-gen.gemini-3-pro-image` | $0.105 per image at 1K (hold $0.181) | Body `{"model":"gemini","task_type":"nano-banana-pro","input":{"prompt":"<character.json>","resolution":"1K","aspect_ratio":"9:16","output_format":"jpeg"}}`. The most photographic of the three: real skin texture and a true selfie perspective | Proven on the test server, once, 15 November 2026 |
| `reapi.image-gen.gpt-image-2-5` | $0.017 at `quality: low`, 1024x1536 (hold up to $0.45) | Body `{"model":"gpt-image-2.5-flare","prompt":"<character.json>","size":"1024x1536","quality":"low","n":1}` | Charged and the file was not saved on the test server (15 November 2026); fixed in this release by accepting its result host. Check `media[0].status` before relying on it |
| `alibaba#v1/image/wan2.7-image-pro` | $0.075 per image | Same fields, up to 4K for text to image | On production: charged and file lost, twice. Run once on the test server ([experiments.md](experiments.md)) |

```json
{
  "prompt": "<character.json, minified to one line>",
  "size": "720*1280",
  "n": 1,
  "watermark": false
}
```

The JSON shapes in this skill show the provider's fields. The runner's input file wraps them as `{"body": { ... }}`; `o11 call --input` takes them unwrapped ([generation.md](generation.md)).

Fields, all from the contract:

- `size` is `1K`, `2K` (default), or `width*height`. `720*1280` and `1080*1920` both ran. The 720x1280 image went straight in as a talking clip's first frame after conversion to JPEG. The cheaper route allows up to `2048*2048` in total pixels.
- `n` is 1-4 and sets the charge. Always pass `n: 1`. Left out, the route holds money for its maximum count.
- `images` takes up to nine public image URLs for edits and references: the character in a new place, or the product in the character's hand. Input images are free. The output takes the shape of the last image in the list. Say in the prompt what each image is for.
- `seed` exists, and the contract says the same seed does not guarantee the same result.
- `enable_sequential` makes a set of up to 12 images from one request and the model decides how many, each one charged. Leave it false.

On the test server the result carried a saved PNG in `media[]`, kept 7 days, which the runner downloads on completion. Provider links expire in about 24 hours (contract). Convert the PNG to JPEG for a video route when size matters: `"${FFMPEG:-ffmpeg}" -v error -i <image>.png -q:v 2 media/assets/character.jpg`.

## Check a character image

- Open the file. Check every key of `character.json` against the image, one by one.
- Measure the face: it is at most a quarter of the frame width, both shoulders are in frame, and the mouth is closed.
- Zoom on hands, teeth, ears and any text in the room.
- Confirm the shape is 9:16 and the short side is at least 720 px. `kling#v1/video/kling-4.0-i2v` keeps the image's shape and needs at least 300 px.
- When an attribute drifts, make that key more exact and rerun once. Change one key per rerun.
- Show the user the still and get a yes before any video call. A still costs cents and a clip costs a dollar.
