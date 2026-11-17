# Getting the video and its words

Every tool here is a public o11 tool paid from the user's wallet. Prices and availability change, so inspect each default below before relying on it. The sequence is always:

1. `o11 discover "<the job in plain words>"` (free).
2. `o11 inspect '<tool id>'` (free): read the exact inputs, outputs and price.
3. `o11 quote '<tool id>' --input '<json>'`: the price of this exact request.
4. Tell the user the total for the teardown and get their approval, unless an approved budget already covers it.
5. `o11 call '<tool id>' --input '<json>'`. Save the response next to the reference, as `references/<id>/download.json`, `detail.json` or `words.json`.

Use `o11 <command> --help` for current flags. A whole teardown of one short video normally costs under one cent: a download, a detail call for the numbers, and a transcription.

## Download

Discover by job: "download a TikTok video file from its link", "Instagram reel video file and stats from its link".

| Platform | Default tool | Input | Price when checked | Returns |
| --- | --- | --- | --- | --- |
| TikTok | `anyapi#tiktok.video_download` | `{"url": "<link>"}` | $0.0008 a call | `videoUrl` (no watermark), width, height, duration |
| Instagram | `anyapi#instagram.post` | `{"url": "<link>"}` | $0.0005 a call | `videoUrl`, plays, likes, comments. Add `"hostVideo": true` ($0.0045) if the plain URL will not download without a session |
| YouTube Shorts | none | | | No public tool returns a downloadable file. Ask the user for the file |
| X | none known | | | Discover "download an X post video"; if nothing public comes back, ask the user for the file |

The tool returns a link, not the file. Fetch it straight away, because these links expire:

```bash
mkdir -p references/<id>
curl -L --fail -o references/<id>/source.mp4 '<videoUrl>'
node scripts/teardown.mjs probe references/<id>/source.mp4 --id <id> --url '<original link>' --author <handle> --posted-at <YYYY-MM-DD>
```

If `probe` cannot read a video stream, the download was a web page or an error body. Do not continue with it: try the tool's other route if it has one, then ask the user for the file.

`source.mp4` stays on this machine. Do not commit it, upload it, or pass it to a generation tool as a reference.

## Numbers

`metrics` holds views, likes, comments, shares and saves as the platform reported them at `capturedAt`.

| Platform | Default tool | Price when checked |
| --- | --- | --- |
| TikTok | `scrapecreators.tiktok.video.detail` with `{"url": "<link>"}` | $0.00188 a call |
| Instagram | the same `anyapi#instagram.post` response used for the download | included |
| YouTube | `youtube.youtube.video.detail` with `part` and `id` | free |

Copy a number only when the response names it. A field the response lacks is null. If a trending import already wrote `reference.json` with metrics, `probe` keeps them.

## Words

Captions and beat boundaries need word timings: `{ word, start, end }` for every spoken word.

| Case | Default tool | Price when checked |
| --- | --- | --- |
| Any audio or video URL, including TikTok and YouTube links | `elevenlabs#v1/speech-to-text` with `{"audio_url": "<url>", "timestamps_granularity": "word"}` | $0.22 per hour of audio. The hold while it runs is several dollars and is released when it settles; tell the user |
| Text only, no timings, cheapest | `anyapi#tiktok.video_transcript`, `anyapi#instagram.media_transcript`, `anyapi#youtube.video_transcript` | about $0.001 a call |

A text-only transcript fills `transcript.text` but leaves `words` empty. Use it when the user wants the structure and not the captions, and add `"word timings"` to `unseen`.

For a local file, the transcription tool needs a URL it can fetch. Host `references/<id>/audio.wav` (written by the `audio` step, about 2 MB a minute) with o11's free file storage:

1. `sfs#put` with `{"path": "teardown/<id>/audio.wav", "sizeBytes": <exact bytes>}` returns an `uploadUrl`.
2. `curl -T references/<id>/audio.wav '<uploadUrl>'`: a plain PUT, not a form upload.
3. `sfs#cat` with `{"path": "teardown/<id>/audio.wav", "ttl": "1h"}` returns a URL to pass as `audio_url`.
4. After the transcription settles, remove it with `sfs#rm`.

Upload the audio, not the video: it is smaller and it is all the tool needs.

Save the full response as `references/<id>/words.json` and import it:

```bash
node scripts/teardown.mjs words --file references/<id>/words.json
```

The import prints how many words it read, how many zero-length words it stretched to 0.04s, and the speaking rate. If the last word ends more than half a second past the video's length, the timings belong to another file and the import stops.

## When nothing can be downloaded

Run `probe --url <link> --id <id>` with no file. It records the link, sets `source.file` and `source.sha256` to null, and puts `"frames"` and `"audio"` in `unseen`. You can still import a transcript and write beats from the words alone, with `shot`, `camera` and `action` limited to what the words establish, and `style.json` reduced to `{ "captions": null }` and the sections you can defend. Tell the user that the visual half of the teardown is missing and what file would complete it.
