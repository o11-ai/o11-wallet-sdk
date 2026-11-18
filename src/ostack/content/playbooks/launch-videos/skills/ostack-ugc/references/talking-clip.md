# Talking clip

A character speaks a script to camera. Make the speech first, as one audio file, then pick the video route by what the clip needs. Captions are added afterwards in the editor.

## Make the speech first

Generate every on-camera line as audio before any video call ([voice.md](voice.md); `fishaudio#text-to-speech`, under a cent a line). The words and their timing are then settled before the dollar is spent, a mispronounced name is fixed for a fraction of a cent, and the same voice carries into the voiceover parts of the video ([full-video.md](full-video.md)). Run the pace and pause checks below on the speech file, host it, and use that one file on whichever route you pick: as the driving track, or as the voice reference.

## Pick a route

| | Exact audio | Exact audio, Captions | Voice reference |
| --- | --- | --- | --- |
| Route | `alibaba#v1/video/wan2.7-i2v` | `captions.avatar.video`, or `o11 avatar video` from a saved recording | `minimax#v1/video/minimax-h3` |
| Inputs | Character image as `first_frame`, the speech file as `driving_audio`. No script in the prompt | Character image as `image_url`, the speech file as `audio_url`. No script, no voice setting | Character image as `reference_image`, the speech file as `reference_audio`, script quoted in the prompt |
| Voice | Exactly the supplied audio | Exactly the supplied audio | The model speaks the quoted line in a voice like the reference. The words are close to the file, not identical to it |
| Look | Slightly more animated brow | The calmest and most natural of the three | Natural. The image is a reference, so the framing can shift a little |
| Length | 2-15 s. The audio may be 2-30 s but output stops at 15 s (contract) | As long as the speech file, 1-60 s. 720p | 4-15 s |
| Price | $0.10/s at 720P, $0.15/s at 1080P | $1.25 from the wallet for each started 6 seconds, on o11's Captions account. On the workspace's own Captions key, Captions bills that key (about $0.90 per 6 seconds in testing) and the wallet is not charged, so ask the user to confirm | $0.08/s at 768P. The contract adds $0.04 per input image; the receipt of the run showed $0.48 for 6 s. It has no 720p |
| Proven run | Test server, 15 November 2026: 6 s, 720P, from a 5.6 s speech file. Charged $0.60 | Same day, same still and speech file | Same day, same still and speech file: 6 s, 768P. Charged $0.48 |

All three ran on the same chest-up still and the same 5.6 s line, and all three were good enough to use. The still and the direction decided the quality more than the route did ([character-image.md](character-image.md), "Write the prompt" below).

Which to use:

- **Captions** is the default when it can run: on o11's Captions account (`o11 inspect captions.avatar.video` shows whether it is available) or on a Captions key the workspace connected (`o11 connections captions`). In the 15 November test it gave the calmest, most natural clip from the same still and audio. It trains nothing, so a generated portrait works. State its price before the call: $1.25 from the wallet for each started 6 seconds on o11's account, or Captions' own bill on a connected key. Each started 6-second block is charged, so 6.01 s of audio costs two blocks: end the line just under a block. On o11's account pass `audio_seconds` (the clip's length) so the quote holds only that length's price; without it the quote holds $12.50, the price of 60 seconds. A HeyGen twin is not a route here: it is trained from a real recording of a person who then gives consent on camera, so it cannot take a generated portrait.
- **HeyGen Avatar 6** (`openrouter.video.heygen-avatar-6-turbo`, or `heygen-avatar-6`) is exact audio at 1080p or 2K, trains nothing and takes a generated portrait. Send `resolution`, `audio_seconds` (the clip's length rounded up) and `input_references`: the image as `image_url` (a short MP4 of the person as `video_url` also works) and the speech as `audio_url`. On o11's account the speech must be a saved o11 link (an upload or an o11 speech tool's output); o11 measures it before sending and charges nothing if it runs longer than `audio_seconds`. Turbo costs $0.05/s at 1080p ($0.0875/s at 2K), Avatar 6 $0.10/s ($0.145/s), billed on the video's own length. `provider: {"options": {"heygen": {"motion_expressiveness": "less"}}}` calms the gestures and `prompt` directs them. Dev wallet run, 18 November 2026: Turbo, 1080p, a 9.87 s speech file gave a 9.76 s 1080x1920 video and was charged $0.488. From a saved recording, `o11 avatar video --capture-id ID --model avatar-6-turbo` does this and shows the price first.
- **Exact audio on Wan** is the fallback when Captions cannot run, and the cheaper route ($0.60 against $1.25 for 6 seconds): the words are exactly the file, and it needs no account beyond the wallet.
- **Voice reference** when a little variation in the performance is wanted, or the line must be re-performed and not lip-synced. Transcribe the result: the model may change a word.

An earlier exact-audio run on Wan, on the test server on 14 November 2026: 10 s from a 9.9 s speech file, charged $1.00. The clip's audio matched the supplied file (loudness envelope correlation 1.000 at zero offset; 0.9996 on a second measurement). One run on production on 13 November 2026 was charged $1.00 and the file was lost to the saving fault described in [spend.md](spend.md). Until the fix is released there, confirm delivery with a short clip first.

### Other routes that ran

| | Voice clip on the image | Image only |
| --- | --- | --- |
| Route | `alibaba#v1/video/wan2.7-r2v` | `kling#v1/video/kling-4.0-i2v` |
| Inputs | Character image as `reference_image`, a voice clip of 1-10 s on that item as `reference_voice`, script quoted in the prompt | Character image as `first_frame`, script quoted in the prompt |
| Voice | The model performs the line in a voice that follows the clip | The model chooses. No audio or voice field exists |
| Length and price | 2-15 s. $0.10/s at 720P, $0.15/s at 1080P | 3-30 s. $0.157/s at 720p, $0.2355/s at 1080p |
| Proven run | On production: 10 s, 720x1280. All 37 scripted words spoken at 227 words per minute. Face, clothes and prop held. Charged $1.00 | On production: 5 s, 720p. All 16 words spoken at 224 words per minute. Identity held. Charged $0.785 |
| Result | `output.video_url`, a provider link that expires in about 24 hours | `outputs[].url` and a saved file in `media[]`, kept 7 days |

Use the first when the only voice material is a short clip, and the second when there is no voice at all, the shot wants more movement, or a single clip must run past 15 s (contract only past 5 s). Both production runs used a close-up frame and a louder delivery than the rules below allow. No route has been run with a photo of a real person.

### Routes that do not work today

- **Seedance's default filter refuses photoreal faces.** `bytedance#v1/video/seedance-2.0` refused the 15 November still with "may contain real person", and `bytedance#v1/video/seedance-2.0-mini` refused an earlier one the same way. Neither was charged (proven). Both images were generated. The contract for `bytedance#v1/video/seedance-2.0-fast` carries the same rule (contract only). Do not pass a presenter image to any Seedance route. A text-only request on the mini tier does make a speaking presenter (proven; see [character-image.md](character-image.md)), with no way to hold the same person across clips.
- **Lip-sync onto existing footage** has no public route.

## Request shapes

The JSON shapes in this skill show the provider's fields. The runner's input file wraps them as `{"body": { ... }}`; `o11 call --input` takes them unwrapped ([generation.md](generation.md)). Every `url` is a public `https://` link. Host local files first ([spend.md](spend.md)) and save the request as `ugc/requests/<shot>.json`, where the shot ID is also the runner's stage ID. Quote first. The per-call cap must cover the quoted estimate, which can be higher than `duration` times the rate; the charge settles at the real cost. The two production calls ran with a cap of 1500000 micros and were charged 1000000 and 785000.

Exact-audio route, as it ran on 15 November 2026. It takes `720P` and has no `ratio` field: the clip keeps the image's shape, so the first frame must already be 9:16.

```json
{
  "prompt": "A woman in a blue sweater in her bedroom speaks to her phone's front camera in lip-sync with the supplied audio. She talks to the phone like a voice note to a friend: calm, a little amused, small natural mouth movements, never shouting, teeth barely visible. She blinks irregularly, breathes visibly, tilts her head slightly once, and keeps the small microphone near her collarbone. The phone is handheld with faint tremor. One unbroken take, no cuts, no zoom, no text, no captions, no music.",
  "negative_prompt": "shouting, wide open mouth, exaggerated expression, zoom, text, subtitles, watermark, studio light",
  "media": [
    { "type": "first_frame", "url": "<signed URL of the character image>" },
    { "type": "driving_audio", "url": "<signed URL of the speech file>" }
  ],
  "resolution": "720P",
  "duration": 6,
  "prompt_extend": false
}
```

- `driving_audio` is WAV or MP3, 2-30 s (contract). The files that ran were mono MP3s of 5.6 s and 9.9 s from `fishaudio#text-to-speech`.
- Set `duration` to the audio's length rounded up to a whole second: 6 for 5.6 s, 10 for 9.9 s.
- `prompt_extend` defaults to true, which lets the provider rewrite the prompt. Set it to false.
- Each media type appears at most once. `last_frame` is optional (contract only).
- The prompt carries no script. It names the person and room in a few words, says the lips follow the supplied audio, and gives the delivery.
- The first frame was a 720x1280 JPEG.

Voice-reference route on H3, as it ran on 15 November 2026. It takes `768P` and `ratio`. The reference audio cannot be the only reference, and this route cannot combine a first frame with a reference audio, so the still goes in as `reference_image` (contract).

```json
{
  "model": "MiniMax-H3",
  "content": [
    { "type": "text", "text": "The woman from the reference image, in the same teal bedroom with the orange lamp, speaks to her phone's front camera in the voice of the reference audio. She says: \"Okay, so my agent just paid for its own tools. One wallet, and I can see every call.\" Chest-up framing, handheld with faint tremor, one unbroken take. Calm and a little amused, like a voice note to a friend: small mouth movements, never shouting, irregular blinking, one slight head tilt, she keeps the small black microphone at her collarbone. No text, no captions, no music, no zoom." },
    { "type": "image_url", "image_url": { "url": "<signed URL of the character image>" }, "role": "reference_image" },
    { "type": "audio_url", "audio_url": { "url": "<signed URL of the speech file>" }, "role": "reference_audio" }
  ],
  "resolution": "768P",
  "duration": 6,
  "ratio": "9:16"
}
```

Captions takes two links and nothing else: `{"body": {"image_url": "<character image>", "audio_url": "<speech file>"}}` to `captions.avatar.video`, with `model` left unset. Both must be public https links or saved o11 media links. Run `o11 inspect captions.avatar.video --detailed` for the limits. For a real person recorded through `o11 avatar clone`, `o11 avatar video --capture-id ID --connection ID --audio FILE` sends their saved portrait and shows the cost first.

Voice clip on the image (`alibaba#v1/video/wan2.7-r2v`), as proven. Field values are case-sensitive: this route takes `720P` and `ratio`.

```json
{
  "prompt": "<prompt>",
  "media": [
    {
      "type": "reference_image",
      "url": "<signed URL of the character image>",
      "reference_voice": "<signed URL of the voice clip>"
    }
  ],
  "resolution": "720P",
  "ratio": "9:16",
  "duration": 10,
  "prompt_extend": false,
  "watermark": false
}
```

- `prompt_extend` defaults to true, which lets the provider rewrite the prompt. Set it to false so the quoted script stays as written.
- `reference_voice` is WAV or MP3, 1-10 s (contract). The proven clip was 8 s of mono MP3. [voice.md](voice.md) covers making one.
- `duration` is a whole number of seconds.
- Other fields in the contract, none of them run: `negative_prompt` (500 characters), `seed`, a `first_frame` item (then `ratio` is ignored), a `reference_video` item, up to five images and videos in total. The contract tells you to address references in the prompt as "Image 1" and "Video 1"; the proven prompt said "the woman from the reference image" with a single image and worked.

Image-only route, as proven. This route takes lowercase `720p`, and `resolution` is required. It has no ratio field: the output keeps the image's shape, so the first frame must already be 9:16.

```json
{
  "prompt": "<prompt>",
  "media": [{ "type": "first_frame", "url": "<signed URL of the character image>" }],
  "resolution": "720p",
  "duration": 5
}
```

Audio is always on for this route. The image must be JPG or PNG, at least 300 px, at most 30 MB (contract).

## Write the prompt

One paragraph, five parts, in this order. The two requests above are the wording that ran on 15 November 2026.

1. **Where we are.** Point at the image in a few words: the same person, room, clothes and prop. A phone's front camera, handheld with faint tremor. Chest-up framing.
2. **How they speak.** Like a voice note to a friend: calm, a little amused, small mouth movements, never shouting, teeth barely visible.
3. **The words.** On a voice-reference or image-only route, the full script in double quotes. On an exact-audio route, leave the words out and say the lips follow the supplied audio.
4. **Face and hands.** Irregular blinks, visible breathing, one small head tilt. The prop stays where the still has it. Name nothing else for the hands.
5. **Camera and what stays out.** One unbroken take, no cuts, no zoom. No text, no captions, no music.

Never write "leans closer", "upbeat", "slightly fast" or "raised eyebrows", or anything that asks for more energy. In earlier runs those words produced a push-in to a close-up, a yelling mouth and a fixed wide-eyed stare. Do not ask for a locked camera or a phone on a stand either: a frame that does not move a pixel in five seconds reads as a tripod. Where the route has a `negative_prompt`, put the same bans there: shouting, wide open mouth, exaggerated expression, zoom, text, subtitles, watermark, studio light.

What the runs support:

- A script quoted in the prompt is spoken in full, in order (both production runs, and the H3 run).
- Clauses joined with commas inside the script gave pauses of 0.26-0.38 s.
- Calm direction on a chest-up still gave small mouth movements and a steady frame on all three routes of the 15 November test, as far as frame strips show.
- A ban on text and music gave clips with no text in them.

Working rules that are untested here:

- A full stop inside the script may cause a longer hold than a comma.
- A prop the image does not show may be invented and may change between clips, so describe only what is in the image.
- Exact finger counts and text on objects come out wrong. Put numbers and words in captions.
- On a voice-reference route, pace and pronunciation follow the reference audio more than the prompt ([voice.md](voice.md)).

Stay under 5,000 characters on the Wan routes. Longer prompts are cut silently (contract).

## Write the hook take

Working rules for the opening take. All four are untested here; [hooks.md](hooks.md) scores drafts against them before any spend and tests the chosen ones against each other after posting. When hooks will be tested, make the hook its own shot of about 3 s, 11 words, so each variant regenerates only that shot.

- **45-75 words for a 12-18 s take.** At the measured 3.75 words per second, 12 s holds 45 words and 18 s holds 67; 75 words needs 20 s. Every route but the image-only one stops at 15 s, which is 56 words. A longer hook take is either two takes joined in the edit, or one clip on the image-only route (contract only past 5 s).
- **Name the product late, as the answer.** Open on the problem or the result. The product arrives once the viewer wants to know what did it.
- **One concrete number in the first three seconds**, which is the first 11 words, when the product's facts support one. Never invent a number.
- **Commas where no pause is wanted, full stops where one is.** The proven scripts joined clauses with commas and paused 0.26-0.38 s at them.

## Size the clip

Both production takes in which the model performed the line spoke at about 3.75 words per second with no pace instruction that changed it. On an exact-audio route the speech file sets the pace, so size the clip from the file.

| Take | Words | `duration` | Speech ended at | Pace |
| --- | --- | --- | --- | --- |
| Voice clip on the image | 37 | 10 s (file 10.03 s) | 9.78 s | 227 words per minute |
| Image only | 16 | 5 s (file 5.04 s) | 4.46 s | 224 words per minute |

- **Default.** `duration` = words divided by 3.75, rounded up to a whole second. That gives 10 s for 37 words and 5 s for 16, which is what ran.
- **Write to fill the clip.** A clip of D seconds holds about D times 3.75 words: 18 words for 5 s, 37 for 10 s, 56 for 15 s. The 16-word take left 0.58 s of silence at the end; two more words would have filled it.
- **The rule this skill was asked to carry** is words divided by four, minus one second. It is not proven on these routes. On the two proven takes it asks for 8 s and 3 s, shorter than the speech that came out (9.78 s and 4.28 s of talking). Do not use it as the default here. It may suit a route that speaks faster; test it there before relying on it.
- **Split above 15 s.** Cut the script at a sentence boundary, as near the middle as the sense allows, and make one take per part. Every take uses the same character image and speech made in one voice with the same settings, with `character.json` unchanged, so the takes match. Size each take on its own word count. Join them in the edit as consecutive shots in the shot plan; a small change of pose at the cut reads as a normal jump cut. Do not feed one take's last frame into the next. Two joined takes have not been run. On the image-only route a single clip can run to 30 s (contract only).

## Check every take

Run these before showing the clip to anyone. Speech checks need word timings, so transcribe the clip first. On an exact-audio route the words and pace are those of your speech file, so run the pace and pause checks on that file before generating, and afterwards confirm that the clip's transcript matches it and check the frame strip. On H3, transcribe the clip: the words are the model's reading of the prompt.

1. Pull the audio from the whole, uncut clip: `mkdir -p output/transcription && "${FFMPEG:-ffmpeg}" -v error -i media/clips/<clip>.mp4 -vn -ac 1 -b:a 128k output/transcription/<shot>-source.mp3`
2. Host the MP3 ([spend.md](spend.md)) and transcribe it with `elevenlabs#v1/speech-to-text` (proven; under $0.001 per clip, but it holds $3.30, see [spend.md](spend.md)):

   ```json
   { "audio_url": "<signed URL of the MP3>", "timestamps_granularity": "word" }
   ```

   ```bash
   node scripts/ugc.mjs generate . --stage <shot>-words --tool 'elevenlabs#v1/speech-to-text' --input ugc/requests/<shot>-words.json --depends-on <shot> --approve-max-micros 3300000
   ```

   The runner saves the transcript as data; `node scripts/ugc.mjs status .` shows its path as that stage's `dataPath`. The proven transcriptions were called with the CLI directly, so this runner path is untested. The result has `text` and `words[]`. Each word has `text`, `start`, `end` and `type`; entries with `type: "spacing"` are gaps, and some words come back with zero length.
3. Save the script exactly as sent to `output/transcription/<shot>-script.txt`. Save the block below as `output/take-check.mjs` and run:

   ```bash
   bun output/take-check.mjs <transcript.json> output/transcription/<shot>-script.txt <clip seconds> output/transcription/<shot>-words.json
   ```

   `<transcript.json>` is the `dataPath` from step 2. The clip's seconds are `assets[].probe.duration` in `node scripts/ugc.mjs status .`. This script reproduced the numbers in the table above from the saved transcripts of both proven takes.

```js
import { readFileSync, writeFileSync } from "node:fs";
const [file, scriptFile, seconds, out] = process.argv.slice(2);
const data = JSON.parse(readFileSync(file, "utf8"));
const list = (data.result ?? data).words.filter((w) => (w.type ?? "word") === "word")
  .map((w) => ({ text: String(w.text ?? w.word).trim(), start: Number(w.start), end: Math.max(Number(w.end), Number(w.start) + 0.04) }));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
const heard = list.map((w) => norm(w.text)).filter(Boolean);
const scripted = readFileSync(scriptFile, "utf8").split(/\s+/).map(norm).filter(Boolean);
const missing = []; let at = 0;
for (const word of scripted) { const i = heard.indexOf(word, at); if (i < 0) missing.push(word); else at = i + 1; }
const span = list.at(-1).end - list[0].start;
const report = {
  words: list.length, scriptedWords: scripted.length, missing,
  doubled: heard.filter((w, i) => i > 0 && w === heard[i - 1]),
  wordsPerMinute: Math.round(list.length / span * 60),
  speechStart: list[0].start, speechEnd: list.at(-1).end,
  tailSeconds: Number((Number(seconds) - list.at(-1).end).toFixed(2)),
  pauses: list.slice(1).map((w, i) => ({ after: list[i].text, at: list[i].end, seconds: Number((w.start - list[i].end).toFixed(2)) })).filter((p) => p.seconds >= 0.25),
};
report.pass = !missing.length && !report.doubled.length && report.wordsPerMinute >= 220 && report.wordsPerMinute <= 250 && Math.abs(report.tailSeconds) <= 0.3;
console.log(JSON.stringify(report, null, 2));
if (out) writeFileSync(out, JSON.stringify({ clock: "source", words: list }, null, 2));
```

The fourth argument writes cleaned word timings: real words only, zero-length words widened to 0.04 s, marked `"clock":"source"`. Import them for captions with `node scripts/ugc.mjs captions . --file output/transcription/<shot>-words.json --shot <shot id>`, which is local and free. That import ran on the cleaned file from the default-route take.

| Check | Pass | If it fails |
| --- | --- | --- |
| Speech ends near the clip end | `tailSeconds` between 0 and 0.3 | Up to a second early: trim the tail in the edit, or add words on the next take. More than a second early: shorten `duration` by one second. Speech runs to the last frame: the line may be cut off, so add a second |
| Pauses | Every pause of 0.25 s or more is listed. The proven takes had one or two, each under 0.4 s | Treat 0.7 s or more as a stall (working threshold, untested here). Replace the full stop before it with a comma, or cut the pause in the edit |
| Pace | 220-250 words per minute on a take the model performed. A prepared speech file sets its own pace and may be slower: the 15 November line was 18 words in 5.6 s, 193 by its own word timings, so `pass` reads false on pace alone and that is accepted | Both production routes chose about 225 on their own. Outside the band, check the voice clip's pace first, then change `duration` (untested here) |
| Every scripted word | `missing` is empty | Read the transcript first. A misheard brand name is a transcript error: fix the word's text in the words file, never its times. A dropped word is a rerun |
| Repeats | `doubled` is empty, unless the script repeats the word | A stutter. Rerun |
| Identity and hands | Frame strip, below | Rerun with the hand rule tightened or the prop removed |
| Mouth and framing | On a 5 fps strip of two seconds, the mouth never opens to a yell, and the face is no wider at the last frame than at the first | Rerun with the delivery line tightened. A push-in means a banned phrase is in the prompt |

Frame strip, one frame per second:

```bash
"${FFMPEG:-ffmpeg}" -v error -i media/clips/<clip>.mp4 -vf "fps=1,scale=240:-1,tile=<seconds>x1" -frames:v 1 output/<shot>-strip.jpg
```

For the mouth, pull two seconds at five frames a second: `"${FFMPEG:-ffmpeg}" -v error -ss 2 -t 2 -i media/clips/<clip>.mp4 -vf "fps=5,scale=240:-1,tile=10x1" -frames:v 1 output/<shot>-mouth.jpg`.

Open the strip beside the character image. Compare the face, hair, clothes and prop in every frame. Look for a hand on the face or mouth, extra fingers, a prop that changes shape, and text or a watermark in the frame.

Change one thing per rerun and write the user's complaint into the plan as a thing to avoid.

## Good picture, wrong voice: replace the audio

When a take passes the frame strip but the user says the voice drifts or a word is mispronounced, fix the sound before buying a new clip. New speech costs under a cent; a new take costs a dollar.

There are two fixes. Replacing the audio in the edit, below, costs nothing more but keeps the old mouth movement. Regenerating on the exact-audio route with the corrected speech file costs a new take and gives a mouth that follows the new audio (proven on the test server). Try the edit first when the change is one word; go straight to the exact-audio route when the whole voice is wrong.

1. Generate the same line as speech with `fishaudio#text-to-speech` ([voice.md](voice.md)). For a mispronounced name, spell it the way it sounds. To keep the take's voice, use the sampled-voice fields with the recording the voice clip was cut from (contract only).
2. Convert it for the mixer: `"${FFMPEG:-ffmpeg}" -v error -i <speech>.mp3 -ar 48000 media/narration/<shot>-dub.wav`
3. Get word timings for the new audio, clean them with the take check, and save them as `media/words/<shot>-dub.json`, which is where the mix looks for a narration file's words. Compare them with the take's. The lips were generated for the take's timing, and word timings can be 0.35 s off, so the numbers can only show a clear miss: if the new line's length differs from the take's speech by more than 0.3 s, or words start more than 0.35 s apart, regenerate the take instead. Inside those limits only watching decides, and the exact-audio route is the fallback.
4. In the shot plan, set `"mute": true` on the shot and add `["<shot id>", 0, "<shot>-dub"]` to `narration` ([project-state.md](project-state.md)). Run `node scripts/speech.mjs`. For visible captions, import the new timings with `node scripts/ugc.mjs captions . --file media/words/<shot>-dub.json` and no `--shot`; those are timeline times, so for a shot that does not open the video add its start time to every word first.
5. Render the review cut and ask the user to watch the mouth.

A plan with a muted shot and a narration entry compiled in a local test, and `speech.mjs` placed the narration's words from that file. No render or mix followed, and replacing a generated take's voice this way is untested. Only a person watching can accept the result.

## What these checks cannot tell you

You have not heard or watched the clip. Tell the user that, and ask them to play it for:

- whether the voice sounds like the reference
- whether the lips match the words
- whether the delivery sounds natural
- pronunciation of names and numbers
- motion between the sampled frames

A take that passes every number can still fail on any of these.

## Two more things the comparison showed

- `alibaba#v1/video/wan2.7-i2v` speaks a line written in quotes in the prompt even with no `driving_audio` item (3 s, $0.30, all eight words). The voice is the model's choice, so use it for drafts and one-off clips, and the exact-audio or voice-reference route when the voice must hold across shots.
- `gemini#v1/video/omni-flash-i2v` takes `{"prompt", "image_urls": ["<first frame>"], "resolution": "360p|720p|1080p|4k", "aspect_ratio": "9:16", "duration": 3-10}` and also speaks a quoted line. At 360p it costs $0.04/s, which makes it the cheapest way to try a prompt. It changed the presenter's clothes in one of two clips, so check identity on the strip. See [experiments.md](experiments.md).

