---
summary: Handing over the cut.
used_by: [irl, reel, product-demo, ugc]
changed: 0.11.0
---
- Copy the review cut to where `launch-videos/deliver.md` says (default: the user's Downloads), replacing the previous review cut, and give the path.
- Say in a few lines: what changed since the last cut, which audits passed, what you measured about the sound, any demo values on screen, and what you could not check.
- When the user is reviewing a draft, collect the requested changes and update only their affected shots or layers.
- Every cut you hand over gets the next version number (`<name>-v3.mp4`); never overwrite one the user has seen. With it, a web cut for posting: two-pass H.264 at a size the platforms take (about 40 MB for a 90-second 1080p film).
- Render the master when requested or when final production is already authorized, then hand over every size `deliver.md` asks for (re-time the edit for vertical rather than cropping a landscape cut).
- When the user authorizes uploading a finished cut to the team's video, use `o11 ostack launch-videos upload <video-id> <master> [<the master in another shape>...] --note "<what changed>"`. The version holds each supplied size; ffmpeg makes its preview loop and poster. The team watches and downloads the version on the video's o11 page. Upload a review cut only when that upload is authorized too. If an upload fails, retain the local cuts and retry the upload without regenerating footage; incomplete uploads stay out of the published version.
- A reel's master is 1080×1920 (the Reels maximum). Also give a phone preview under 30 MB, since bigger files can't be sent to a phone: `ffmpeg -i <master> -c:v libx264 -preset slow -crf 22 -maxrate 7M -bufsize 14M -pix_fmt yuv420p -c:a copy -movflags +faststart <name>-phone-preview.mp4`.
- When the user corrects something about how videos should look or sound, offer to save it to the team's files (`launch-videos/<step>.md`) with the ostack-setup skill, so the next video starts there.

For UGC, the delivered file is the full-size render at 1080x1920, never the half-size preview (`video-0.5x.mp4`): confirm its size with `ffprobe` and report its measured loudness (the kit mixes to about -14 LUFS). Include the editable local project, selected takes, contact sheet, unresolved checks and `bill.md`: each paid step with its receipt and charge, then the total divided by the number of finished clips. Preserve prior accepted assets and active invocation IDs so another session can resume safely. Do not publish, send or delete voice resources unless requested.
