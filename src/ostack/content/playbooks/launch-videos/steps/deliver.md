---
summary: Handing over the cut.
used_by: [irl, reel, product-demo]
changed: 0.8.0
---
- Copy the review cut to where `launch-videos/deliver.md` says (default: the user's Downloads), replacing the previous review cut, and give the path.
- Say in a few lines: what changed since the last cut, which audits passed, what you measured about the sound, any demo values on screen, and what you could not check.
- Ask what to change. Take one round of notes at a time.
- Render the master only when the user says so, then hand over every size `deliver.md` asks for (re-time the edit for vertical rather than cropping a landscape cut).
- A reel's master is 1080×1920 (the Reels maximum). Also give a phone preview under 30 MB, since bigger files can't be sent to a phone: `ffmpeg -i <master> -c:v libx264 -preset slow -crf 22 -maxrate 7M -bufsize 14M -pix_fmt yuv420p -c:a copy -movflags +faststart <name>-phone-preview.mp4`.
- When the user corrects something about how videos should look or sound, offer to save it to the team's files (`launch-videos/<step>.md`) with the ostack-setup skill, so the next video starts there.
