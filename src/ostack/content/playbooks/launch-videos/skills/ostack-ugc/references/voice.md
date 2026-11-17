# Voice

Three jobs use a voice: speech as an audio file, speech in a voice sampled from a recording, and the short voice clip a talking clip follows.

## Permission comes first

A voice sample needs the speaker's permission. That covers a recording the user gives you and a clip cut from someone else's video. "Make it sound like this creator" is a request to match pace and energy; it gives no right to that person's voice. For a voice nobody owns, use a library voice or generate one.

Record in the shoot plan where each voice file came from, who the speaker is, and the basis for using it. Keep the recording local and out of shared text.

## Speech from text (proven)

`fishaudio#text-to-speech`, $0.015 per 1,000 bytes of text on the default model. The proven call sent 188 bytes, cost $0.003 and returned a 9.9 s mono MP3.

```json
{ "text": "<script>", "model": "s2.1-pro" }
```

- The JSON shapes in this skill show the provider's fields. The runner's input file wraps them as `{"body": { ... }}`; `o11 call --input` takes them unwrapped ([generation.md](generation.md)).
- The result has `audio.download_link` and a saved file in `media[]`. The file is kept 7 days; the link lasts about an hour. The runner downloads it on completion.
- Text is 1-5,000 characters and is billed by UTF-8 byte (contract).
- With no `voice_id` the route uses its default voice, which is what the proven call did. It is a man's voice: about 131 Hz by pitch estimate, and a reel that put it on a woman was rejected on sight (15 November 2026). Never use the default voice for a character it does not fit. Pick a `voice_id` from `fishaudio#voices` (free; filter by `tag` such as `["female"]` and `language`), then estimate the pitch of the finished file before buying any video: roughly 85 to 155 Hz reads as a man, 165 to 255 Hz as a woman. `licensed: true` returned no English voices on that date, so say to the user that the library voice is unlicensed and offer their own recorded sample instead.
- These routes are marked as writes: add `--allow-write` to `o11 call`, or it is refused with `WRITE_NOT_ALLOWED` (no charge).
- `fishaudio#text-to-speech/timestamps` is the default speech route: the same input, and the result also has `segments` with each word's start and end, so a generated line needs no transcription (proven, several calls).
- `prosody.speed` works (1.4 gave 4.1 to 4.2 words a second against 3.75 at the default). To match a reference, set it to the reference's `measured.wordsPerSecond` divided by 3.75, at most 1.4.
- When a name or number is spelled out for the voice ("oh eleven dot A I"), merge its timed words into one caption word with the first start and the last end, and write it as it should read ("o11.ai").

Contract only, none of these has run:

- `voice_id` selects a library voice. `fishaudio#voices` lists them for free, with filters `title`, `tag`, `language` and `licensed`, and returns preview audio. Prefer `licensed: true`.
- Bracket cues inside the text, such as `[laughs]`, steer delivery.
- `fishaudio#voice-design` makes 1-4 preview voices from a description in `instruction` and a line to read in `reference_text`, for $0.01 per call.

## Cast a voice from the library (contract only)

When the user has no voice in mind, choose one by ear from the public library. The agent cannot hear, so the user does the choosing.

1. Search `fishaudio#voices`, which is free. Filters: `title`, `tag` (one tag or a list that must all match, such as `["female", "calm"]`), `language`, `licensed`, `author_id`. Order with `sort_by`: `score`, `task_count` or `created_at`. Page with `page_size` (1-100) and `page_number`. Each result has a `voice_id`, title, tags, languages, a licensed flag, usage counts and a preview audio link that expires in about an hour.
2. Shortlist three to five. Prefer `licensed: true`, a language match and a high `task_count`.
3. Write one test line of about five seconds, 18 words, in the tone of the script and containing the product's name. Generate that same line with each shortlisted `voice_id` on `fishaudio#text-to-speech`. Each call costs a fraction of a cent.
4. Give the user the files named by voice, side by side, and stop for their pick. Record the chosen `voice_id` and the test line in `shoot-plan.md`.
5. Cut the voice clip for the talking clip from speech made with that voice, as described below.

The proven speech call used the default voice with no `voice_id`. Selecting a library voice has not been run.

## Speech in a sampled voice (contract only)

The same route imitates a recording for one call. Nothing is saved.

```json
{
  "text": "<script>",
  "model": "s2.1-pro",
  "reference_audio_url": "<signed URL of the sample>",
  "reference_text": "<exact transcript of the sample>"
}
```

- The sample is a clean recording of 10-30 s, WAV, MP3 or FLAC, at most 20 MB: one speaker, no music, no echo.
- `reference_text` must match the sample word for word. Transcribe the sample and correct the transcript by reading it against the audio's word list.
- `reference_audio_url` cannot be combined with `voice_id`.
- This has not been run. Make one short line first and have the user listen before the rest.

A finished speech file becomes a talking clip on the exact-audio route, which uses the file as the clip's sound ([talking-clip.md](talking-clip.md)). That route is proven on the test server with speech from the default voice.

## Saved voice clones: no public route yet

The speech routes mention cloned voices, but no route to create, read or delete a saved voice is public (checked 13-14 November 2026). Do not plan around a reusable voice ID. Until a route exists, pass the same sample on every call that needs the voice. If `o11 discover "clone a voice"` later returns a create route, inspect how it proves ownership of the recording before using it, and keep to the ownership rules in the main skill file.

## Cut a voice clip for a talking clip

The default talking-clip route takes a `reference_voice` clip of 1-10 s (contract). The proven clip was the first 8 s of the proven speech file, as mono MP3 at 128 kbps.

```bash
"${FFMPEG:-ffmpeg}" -v error -ss <start> -t 8 -i <source audio or video> -vn -ac 1 -ar 44100 -b:a 128k media/narration/voice-ref.mp3
```

Choose the stretch, 2-10 s long:

- Take a passage where the speaker is at the pace and energy you want. In a real recording that is often past the opening (untested here; the proven clip started at zero on generated speech).
- One speaker, no music, no laughter, no long pause. Start and end on a word boundary; use word timings if you have them.
- Keep the source file, the start time and the length in the shoot plan so the cut can be repeated.
- Use one clip per character and reuse it for every clip of that character.

Then `node scripts/ugc.mjs ingest . --file media/narration/voice-ref.mp3 --role voice --id voice-ref` and host it ([spend.md](spend.md)).

Two ways to get the source:

- **No sample needed (proven chain).** Generate a line with `fishaudio#text-to-speech`, cut 8 s from it, and pass it as `reference_voice`. The proven talking clip did this: its voice clip matches the first 8.0 s of the generated speech file sample for sample.
- **A real speaker, with permission.** Cut it from their recording.

One file cannot serve both uses. The talking-clip route wants 1-10 s and the sampled-speech route wants 10-30 s, so cut two clips from the same recording.

Untested here: pace and pronunciation follow the voice clip more than the prompt. If a brand name or a number matters, put it in the line the voice clip speaks and check the take's transcript.

### Add a pronunciation clip

A video model reads a brand name, a price or a number from the prompt and guesses how to say it. The working rule, untested here, is that it says a hard word correctly only when the voice clip has already said it.

1. List every brand name, price and number in the script.
2. Write one short line that says them all, in the script's language: "Lumo, twenty-nine ninety-nine, three hundred milliliters."
3. Generate it with `fishaudio#text-to-speech` in the same voice as the voice clip. Spell a name the way it sounds if the first result is wrong, and have the user confirm it by ear.
4. Join it to the end of the voice clip, keeping the total inside the 10 s limit, for example 6 s of voice and 4 s of hard words:

   ```bash
   "${FFMPEG:-ffmpeg}" -v error -t 6 -i <voice source>.mp3 -t 4 -i <hard words>.mp3 -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1" -ac 1 -ar 44100 -b:a 128k media/narration/voice-ref.mp3
   ```

5. Check each hard word in the take's transcript, and ask the user to listen for them.

After joining, register the new file again with `ingest` under the same `--id` and host it again. Do this before the first clip is submitted: a changed voice clip marks the clips that used it stale.

## When a take's voice drifts

Listen first; the checks cannot hear likeness. If the picture is good and the voice is wrong, replace the take's audio in the edit before buying a new take. The steps are in [talking-clip.md](talking-clip.md).
