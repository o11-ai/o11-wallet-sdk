---
name: ostack-launch-videos
description: Make a launch video, a vertical reel or a product demo that looks professionally edited and never shakes: from filmed clips (founders talking to camera, an announcement, an IRL demo), from one selfie clip (a 9:16 reel for Instagram Reels, TikTok or Shorts, with a hook and light cuts), or from the user's real product (a narrated demo with a gliding camera and cursor). Headlines timed to the words, frameless glass components, an end card, the camera's own voice or generated narration, and frame-exact jitter, layout, frame and loudness audits, with voice, transcription, music and sound from the user's o11 wallet. Use whenever someone wants to make, edit, caption, re-render or fix a launch video, reel, short, TikTok, demo video, product walkthrough, announcement video or social cut, or sends clips or a product URL and asks for a video, even if they never say "ostack". Setting up ostack or changing the team's video rules belongs to ostack-setup.
---

# Launch videos

This skill is the `launch-videos/irl`, `launch-videos/reel` and `launch-videos/product-demo` workflows of ostack's launch-videos playbook. Both are made of named steps with defaults; the team customizes any step in plain language with files in their o11 workspace (`launch-videos/<step>.md`), and their files win over the defaults, except for the rules at the end of this file.

A video is a folder on the user's computer made from the renderer kit. Every frame is a pure function of time: `page/` draws one complete frame for any second, headless Chrome captures each one, and ffmpeg encodes them with the mix. One timeline (`edit/timeline.js`) drives the picture, the sound and the audits.

## Start

1. `cd` to the ostack workspace (the folder with `ostack.json`) and run `o11 ostack doctor`. Stop on any `fail`. With no workspace, or with the launch-videos questions unanswered, use the ostack-setup skill first; a user in a hurry can skip setup, and you ask the brief's questions directly.
2. Run `o11 ostack launch-videos check` and fix anything that fails (ffmpeg, Google Chrome, Node or Bun).
3. Pick the format: **irl** for a launch film from filmed clips, **reel** for a vertical short from one selfie clip, **product-demo** for the product on screen. For a new video: `o11 ostack launch-videos new <name> --format <format>`, then `bun install` (or `npm install`) in that folder. To continue one, work in its existing folder.
4. Run `o11 ostack run start launch-videos/<format>`, and `o11 ostack run end launch-videos/<format> --summary "<one line>" --counts renders=<n>,audits_passed=<n>` when you stop, including when you stop early. If it says `run_in_progress`, another session is working on this format here: ask the user before going on.
5. Run `o11 ostack context --playbook launch-videos` and read every general file: brand, story, budget, and anything else the team said.

## Steps

**irl:** brief → shoot → transcribe → script → timeline → overlays → sound → render → audit → deliver
**reel:** the same steps as irl; [references/reels.md](references/reels.md) has what differs (layout, cuts, hook, call to action)
**product-demo:** brief → script → capture → narrate → timeline → overlays → sound → render → audit → deliver

The first time you reach a step, run `o11 ostack context launch-videos/<step>`. It returns the step's `default`, then the team's `before`, `files` and `after` for it, lowest priority first. Do the `before` files, then the step as the default describes, refined by the files (where they conflict, the later one wins), then the `after` files.

Ask the user about anything needing their judgment: the brief, the words, which take, the music. Show a low-resolution cut early and often; never polish what has not been agreed.

## Wallet tools

Transcription, narration, music, sound effects and logos come from the user's o11 wallet: `o11 discover "<capability>"`, `o11 inspect <tool>`, `o11 quote <tool> --input @input.json`, then `o11 call`. [references/wallet-tools.md](references/wallet-tools.md) lists what to search for at each step and what to check. Quote before anything paid, and stay inside the video's budget from the brief. Start a video's paid calls with one run id (`o11 session-id`, then `--run-id`) so `o11 run-status` shows what the video cost.

## Rules no customization can change

- **The product is real.** Use the user's actual footage, product screens, logos and numbers. Never mock windows, invent UI, fabricate results or show real customer data.
- **Nothing shakes.** Every moving layer moves through `move()` (perspective plus translate3d); frames are rebuilt from scratch; renders split only at shot cuts. Prove stillness with the audits, never by eye. See [references/rendering.md](references/rendering.md).
- **The voice is untouched.** No denoise, no EQ on the camera's audio; it plays in both ears and is level-matched. No copyrighted music without a license.
- **Audit before showing.** Every cut the user sees has passed the stillness, layout, frame and sound audits, and you looked at it yourself. Say what you measured and what you could not check: you cannot listen.
- **Media stays local.** Clips, renders, narration and `media/auth.json` stay in the video folder. Never commit or upload them, and never write them to o11 files. Never type the user's passwords.
- **Spend only with a quote.** Every paid generation is quoted first and fits the budget; a failed call is never resubmitted blindly.

When the user corrects how something looks or sounds, offer to save it to the team's files with the ostack-setup skill, so the next video starts there.

## References

| File | Read it when |
| --- | --- |
| [rendering.md](references/rendering.md) | Before changing anything in `page/` or `scripts/`, and whenever a frame looks wrong. |
| [motion.md](references/motion.md) | Animating headlines, glass, the UI camera or the cursor. |
| [design.md](references/design.md) | Designing or styling anything: type, the glass recipe, layout, the end card. |
| [storytelling.md](references/storytelling.md) | Turning words into headlines and scenes; shaping a product demo. |
| [audio.md](references/audio.md) | Mixing, narration, music, loudness, stereo. |
| [reels.md](references/reels.md) | Making or changing a vertical reel. |
| [wallet-tools.md](references/wallet-tools.md) | Any step that uses the wallet. |
