---
name: ostack-launch-videos
description: Make a launch video, a vertical reel or a product demo that looks professionally edited and never shakes: from filmed clips (founders talking to camera, an announcement, an IRL demo), from one selfie clip (a 9:16 reel for Instagram Reels, TikTok or Shorts, with a hook and light cuts), or from the user's real product (a narrated demo with a gliding camera and cursor). Headlines timed to the words, frameless glass components, an end card, the camera's own voice or generated narration, and frame-exact jitter, layout, frame and loudness audits, with voice, transcription, music and sound from the user's o11 wallet. Use whenever someone wants to make, edit, caption, re-render or fix a launch video, reel, short, TikTok, demo video, product walkthrough, announcement video or social cut, or sends clips or a product URL and asks for a video, even if they never say "ostack". Setting up ostack or changing the team's video rules belongs to ostack-setup.
---

# Launch videos

This skill is the `launch-videos/irl`, `launch-videos/reel` and `launch-videos/product-demo` workflows of ostack's launch-videos playbook. Both are made of named steps with defaults; the team customizes any step in plain language with files in their o11 workspace (`launch-videos/<step>.md`), and their files win over the defaults, except for the rules at the end of this file.

A video is a folder on the user's computer made from the renderer kit. Every frame is a pure function of time: `page/` draws one complete frame for any second, headless Chrome captures each one, and ffmpeg encodes them with the mix. One timeline (`edit/timeline.js`) drives the picture, the sound and the audits.

## First reply

When someone asks for a video, answer before running anything, in a few short lines:
- **The three kinds:** a launch film from filmed clips, a vertical reel from one selfie clip, or a product demo of their real product with a narrated, gliding camera.
- **What you will need from them:** for a launch film, the clips and where they are; for a reel, the one clip; for a product demo, the product's URL and them signed in to it in the browser you open (they type their own password, never you). For any kind: what the video is for and who watches, in a sentence each, and whether you may spend from their o11 wallet on narration or music (you quote first).
- **What happens:** you send a link to pick a template film to follow, agree a short brief, show a rough cut early, take their notes, then upload the finished cut to o11, where the team watches and downloads it.

Then ask only the first question: what the video is about and which kind, unless they already said. Ask the rest as the steps need them, never as one long form.

## Start

1. `cd` to the ostack workspace (the folder with `ostack.json`) and run `o11 ostack doctor`. Stop on any `fail`. With no workspace, create one without an interview: `o11 ostack init --dir ~/ostack --playbooks launch-videos` (or `o11 ostack playbooks add launch-videos` when a workspace lacks it), and tell the user where it is. Never run the full setup interview before the first video: an empty brand kit is fine. Ask what a step needs (logo, colors, end card line) when it needs it, and afterwards offer to save what holds for every video with the ostack-setup skill.
2. Run `o11 ostack launch-videos check` and fix anything that fails (ffmpeg, Google Chrome, Node or Bun).
3. Pick the format: **irl** for a launch film from filmed clips, **reel** for a vertical short from one selfie clip, **product-demo** for the product on screen. For a new video: `o11 ostack launch-videos new <name> --format <format>`, then `bun install` (or `npm install`) in that folder. To continue one, work in its existing folder.
4. Run `o11 ostack run start launch-videos/<format>`, and `o11 ostack run end launch-videos/<format> --summary "<one line>" --counts renders=<n>,audits_passed=<n>` when you stop, including when you stop early. If it says `run_in_progress`, another session is working on this format here: ask the user before going on.
5. Run `o11 ostack context --playbook launch-videos` and read every general file: the brand kit (brand, words, product, voice, music and spend) and anything else the team said.
6. Look for design files in the repo or folder you are working in: `design.md` in any case or folder, a brand guide, theme or token files, a Tailwind config. Log what holds for every video into the brand kit: read `o11 ostack files show launch-videos/brand.md`, merge in the colors, fonts and weights, logo use and style rules it lacks (note where each came from, and keep what the team wrote unless the design file is clearly newer), then save it with `o11 ostack files write launch-videos/brand.md --text-file - --base-version <n>`. Tell the user what you added. Only an owner or admin can write team files: if the write is refused, use the design file for this video and tell the user what an admin could add. Never log anything about this one video.
7. Find the video in o11. Every video has a page in the o11 workspace where the team picks its template, reads its brief and watches every cut.
   - **The prompt names a video id:** run `o11 ostack launch-videos video <id>`.
   - **The prompt names a template** (from "Copy prompt" on a film): create the video with that template, `o11 ostack launch-videos create --title "<short name>" --format <format> --template <slug>`, and send the user the `url` it prints.
   - **Neither** (say, "make me a launch video"): ask what the video is about in one question, then create it without a template and send the user its `url` in one line: "Pick a template here: <url>". Run `o11 ostack launch-videos video <id> --wait 300` until a template is picked, repeating while the user is still choosing; if they say to start blank, go on without one. List the workspace's videos with `o11 ostack launch-videos videos` when they mean an existing one. To suggest films yourself, search with `o11 ostack launch-videos templates --search <text>`.

   You name the video: a short title for what it is, such as "Inbox launch". `video` returns the brief, the template's recipe and every version. The brief answers the brief step's questions; ask only what it leaves out. Save what the user tells you about this video to its brief with `o11 ostack launch-videos update <id> --goal "<text>"` (also `--audience`, `--storyboard`, `--material`, `--notes`, `--length`, `--aspect`, `--title`, `--template`, and `--part <name>=<text>` for a part only this kind of video has, such as a UGC video's `hook`), so the team sees it on the video's Brief tab and the next version starts from it. The team rarely types there: they tell you. To have them check a storyboard or brief, send the `url` that `update` prints, which opens that tab. The recipe points to the template film: study it, then match its shape, look and sound; the team's files still win over it, and the rules below win over both.

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
- **Media stays local, except finished cuts.** Clips, renders, narration and `media/auth.json` stay in the video folder. Never commit them or write them to o11 files. The only upload is a finished cut to its video in o11 with `o11 ostack launch-videos upload`, once the user agrees to it. Never type the user's passwords.
- **Spend only with a quote.** Every paid generation is quoted first and fits the budget; a failed call is never resubmitted blindly.

When the user corrects how something looks or sounds, ask whether it holds for every video. If it does, offer to save it to the brand kit with the ostack-setup skill, so the next video starts there; if it is about this video only, save it to the video's brief with `o11 ostack launch-videos update`. The brand kit never holds one video's audience, story, screens, length or budget.

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
