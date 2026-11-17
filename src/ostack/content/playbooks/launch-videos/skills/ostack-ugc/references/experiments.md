# Try options side by side and let the user choose

Which person, which model and which voice are matters of taste, and each one sits before a rise in cost. The decision is the user's: make the options cheaply, show them in one image, say what each cost and what the full version will cost ([spend.md](spend.md) has the per-second prices), recommend one, and ask.

## One experiment, one variable

| Experiment | Change | Hold fixed | Cheapest tier that shows it |
| --- | --- | --- | --- |
| People | The `subject` and `wardrobe` keys of `character.json`, taken from the looks the user picked in `trending/presenter-candidates.md` when that file exists | Model, and every other key word for word | One still each, $0.03 |
| Image model. Always run for a new character | The route | The exact `character.json` | One still each, $0.03 to $0.075 |
| Video model | The route | The first frame, the prompt, the length | 3 s each; 360p where the route has it |
| Voice | The voice | The test line | One line each, under a cent ([voice.md](voice.md)) |
| Hook | The first line | Everything after it | Text first, then one short clip each ([hooks.md](hooks.md)) |

Two or three options are enough. Change two things at once and the user cannot tell which one they are choosing.

Order, when the user asks for several: people first, then image models on the person they picked, then voices, then video models from the accepted frame. "Models" with no other word means both image and video; say which you are comparing at each stop.

## Run it

1. Say the plan and the price before spending: "three people on one model, $0.09".
2. Write each option's request under `ugc/requests/experiments/<name>/<option>.json`. Options differ in one field.
3. Generate each one through the runner, one stage per option, named `x-<experiment>-<option>`: `node scripts/ugc.mjs generate . --stage x-people-a --tool '<route>' --input ugc/requests/experiments/people/a.json --approve-max-micros <cap>`. The request file wraps the provider's fields as `{"body": { ... }}`. Options are independent, so they can run at the same time. Their cost counts against the video's budget; they are not takes of a shot, so they do not use up the three generations planned per shot. The runner saves each result under `media/` with a hash in its name; read the path from its output.
   On production, generated images were still being charged and lost on 14 November 2026. Run one option first and confirm its file arrived before running the rest.
4. Build one labelled sheet:

   ```bash
   node scripts/match.mjs sheet experiments/people.jpg "A: late 20s=<file for a>" "B: mid 30s=<file for b>" "C: early 50s=<file for c>"
   ```

   Each option is `<label>=<file>`. A video contributes its frame at `--at` seconds (default 1). It needs ffmpeg (`FFMPEG=<path>` when it is not on PATH) and a bold font (`--font <file.ttf>` when none is found). Up to eight options; keep a label under 22 characters so it fits its tile, and put the price in your message, not the label.
5. For clips, check each one with numbers before showing it: did it speak the whole line (transcribe it), does it end on time, is the character still the character.
6. **Ask.** Show the sheet, and for clips give the files to play. List each option in one line with what you saw and what it cost, say which you would pick and why, and ask one question with one answer per option. If your agent has a tool for asking a multiple-choice question, use it. Then wait.
7. Record the answer in `shoot-plan.md`: the experiment, the options, the pick, and the options not taken with their files, so a later change of mind costs nothing.

A choice the user already made stands, and a user who asks to see options gets them even when the team has a standing choice. The team's standing choices are in `launch-videos/character.md`; read them with `o11 ostack context launch-videos/character` and do not ask again. When the user says "you choose", choose, say which and why, and carry on.

## What to compare, by route

Routes and prices change. Run `o11 discover "<what you need>"` and `o11 inspect <route>` first; these are the ones that ran on 14 November 2026, on the test server.

**Images, same prompt.** All three returned a usable phone-selfie frame.

| Route | Price | What came back |
| --- | --- | --- |
| `alibaba#v1/image/wan2.7-image` | $0.03 | Square-on, centred, prop held flat to the lens. The most literal reading of the prompt |
| `alibaba#v1/image/wan2.7-image-pro` | $0.075 | The same framing with more of the room and softer light |
| `alibaba#v1/image/qwen-image-3.0` | $0.03 | A different face, an arm reaching to the lens, head tilted. It reads most like a real selfie and follows the prompt least |

The same words gave three different faces. Compare models to choose a look, then keep one model for every image of that character.

**Video, same first frame and prompt, 3 s.** All three spoke the scripted line in full.

| Route | Price | What came back |
| --- | --- | --- |
| `alibaba#v1/video/wan2.7-i2v`, 720P, no audio item | $0.10/s, $0.30 | Kept the sweater and the room. Big open-mouth delivery. It speaks a line written in the prompt even with no audio supplied |
| `gemini#v1/video/omni-flash-i2v`, 720p | $0.11/s, $0.33 | Followed "taps the cover" most closely. Changed the sweater to a cardigan |
| `gemini#v1/video/omni-flash-i2v`, 360p | $0.04/s, $0.12 | The same performance at a third of the price: the draft tier for trying a prompt before a 720p take |

Other routes exist and were not run in this comparison: `kling#v1/video/kling-4.0-i2v` (proven on its own, [talking-clip.md](talking-clip.md)) and `minimax#v1/video/minimax-hailuo-2.3`.

**Talking routes, same still and the same 5.6 s speech file, 15 November 2026.** The still was chest-up with a closed mouth and the direction was calm ([character-image.md](character-image.md), [talking-clip.md](talking-clip.md)). All three were good enough to use.

| Route | Price | What came back |
| --- | --- | --- |
| `alibaba#v1/video/wan2.7-i2v`, 720P, speech as `driving_audio` | $0.10/s, $0.60 | Lip-sync to the exact file. Slightly more animated brow |
| `minimax#v1/video/minimax-h3`, 768P, speech as `reference_audio` | $0.08/s, $0.48 | Spoke the quoted line in a voice like the reference. Natural |
| Captions (`captions.avatar.video`) | $1.25 for each started 6 seconds on o11's account; billed by Captions on a connected key | The calmest and most natural. Exact audio |
| `bytedance#v1/video/seedance-2.0` | Not charged | Refused the still: "may contain real person" |

The still and the direction changed the result more than the route did. Settle those on stills before comparing video models.

**People, same model and framing.** Three descriptions (a woman in her late twenties, a man in his mid thirties, a woman in her early fifties) on `alibaba#v1/image/wan2.7-image` gave three distinct, consistent presenters for $0.09. Vary age, build, hair, clothes and room; hold the camera, light and prop wording word for word, so the user compares people and not photographs.

## After a video model is chosen

A route that speaks a line from the prompt picks its own voice each time, so two clips will not match. For a video with more than one spoken part, keep the chosen route for its look and drive every spoken clip with the same prepared speech ([full-video.md](full-video.md)), or use a voice-reference route with one voice clip ([talking-clip.md](talking-clip.md)). If the chosen route takes neither, say so before the user commits to it.

## What this does not tell you

A still does not show how a face moves, and a 3 s clip does not show whether a model holds a character for 10 s. After the user picks, make one full-length take of the pick before planning the rest.

Not run: comparing voices by ear (the agent cannot hear; the user does), a comparison across more than three options, and any route on production.
