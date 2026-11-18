---
name: ostack-launch-videos
description: "Make a launch video, a vertical reel or a product demo that looks professionally edited and never shakes: from filmed clips (founders talking to camera, an announcement, an IRL demo), from one selfie clip (a 9:16 reel for Instagram Reels, TikTok or Shorts, with a hook and light cuts), or from the user's real product (a narrated demo with a gliding camera and cursor). Headlines timed to the words, frameless glass components, an end card, the camera's own voice or generated narration, and frame-exact jitter, layout, frame and loudness audits, with voice, transcription, music and sound from the user's o11 wallet. Use when someone wants to edit filmed clips, caption or re-render a launch video or reel, or capture a real product demo. Generated presenter footage and reference-driven AI remakes belong to ostack-ugc. Setting up ostack or changing the team's video rules belongs to ostack-setup."
---

# Launch videos

This skill is the `launch-videos/irl`, `launch-videos/reel` and `launch-videos/product-demo` workflows of ostack's launch-videos playbook. These workflows are made of named steps with defaults; the team customizes any step in plain language with files in their o11 workspace (`launch-videos/<step>.md`), and their files win over the defaults, except for the rules at the end of this file.

A video is a folder on the user's computer made from the renderer kit. Every frame is a pure function of time: `page/` draws one complete frame for any second, headless Chrome captures each one, and ffmpeg encodes them with the mix. One timeline (`edit/timeline.js`) drives the picture, the sound and the audits.

## First reply

When someone asks for a video, the first reply shows the video taking shape, not a menu. Learn what you need from what they said, their site and their repo (the ostack-setup skill's `references/first-run.md`), then in a few short lines:
- **The kind**, picked for them: a launch film from filmed clips, a vertical reel from one selfie clip, or a product demo of their real product with a narrated, gliding camera.
- **The script or storyboard**, with the point in the first three seconds and their call to action at the end ([coaching.md](references/coaching.md)), and any guess about the feature or audience labelled once.
- **What you need to make it real**, in one line: for a launch film, the clips and where they are; for a reel, the one selfie clip, and when they have none yet, a short shoot sheet for this script (the `shoot` step) plus the offer of a product demo or narrated motion film they can have without filming; for a product demo, the product's URL and them signed in to it in the browser you open (they type their own password, never you). Narration or music is quoted before anything is spent, and the spending yes is asked only when a paid step is next.
- **What happens next**, in one line: a template film to follow when the library has films of this kind, a rough cut early, then the finished cut uploaded to o11, where the team watches and downloads it.

End with one line saying what you saved to the brand kit, when you saved anything. Ask only what blocks the next step, never as one long form.

## Start

1. `cd` to the ostack workspace (the folder with `ostack.json`) and run `o11 ostack doctor`. Stop on any `fail`. With no workspace, create one without an interview: `o11 ostack init --dir ~/ostack --playbooks launch-videos` (or `o11 ostack playbooks add launch-videos` when a workspace lacks it), and tell the user where it is. Never run setup before the first video: an empty brand kit is fine. Learn what a step needs (name, logo, colors, fonts, end card line) from their repo and site as the ostack-setup skill's `references/first-run.md` says, ask only what cannot be found, and save what holds for every video to the brand kit as soon as you have shown work that uses it.
2. Run `o11 ostack launch-videos check` and fix anything that fails (ffmpeg, Google Chrome, Node or Bun).
3. For generated presenter footage or an AI remake of a reference video, use the `ostack-ugc` skill and its `launch-videos/ugc` workflow. Otherwise pick the format: **irl** for a launch film from filmed clips, **reel** for a vertical short from one selfie clip, **product-demo** for the product on screen. For a new video: `o11 ostack launch-videos new <name> --format <format>`, then `bun install` (or `npm install`) in that folder. To continue one, work in its existing folder.
4. Run `o11 ostack run start launch-videos/<format>`, and `o11 ostack run end launch-videos/<format> --summary "<one line>" --counts renders=<n>,audits_passed=<n>` when you stop, including when you stop early. If it says `run_in_progress`, another session is working on this format here: ask the user before going on.
5. Run `o11 ostack context --playbook launch-videos` and read every general file: the brand kit (brand, words, product, voice, music and spend) and anything else the team said.
6. Look for design files in the repo or folder you are working in: `design.md` in any case or folder, a brand guide, theme or token files, a Tailwind config. Log what holds for every video into the brand kit: read `o11 ostack files show launch-videos/brand.md`, merge in the colors, fonts and weights, logo use and style rules it lacks (note where each came from, and keep what the team wrote unless the design file is clearly newer), then save it with `o11 ostack files write launch-videos/brand.md --text-file - --base-version <n>`. Tell the user what you added. Only an owner or admin can write team files: if the write is refused, use the design file for this video and tell the user what an admin could add. Never log anything about this one video.
7. Find the video in o11. Every video has a page in the o11 workspace where the team picks its template, reads its brief and watches every cut.
   - **The prompt names a video id or link:** run `o11 ostack launch-videos video <id or link>`.
   - **The prompt names a template** (from "Copy prompt" on a film, or a film link copied from the library): create the video with that template, `o11 ostack launch-videos create --title "<short name>" --format <format> --template <slug or link>`, and send the user the `url` it prints.
   - **The user points to one of their own videos to follow** (its o11 link): create this one blank and download theirs with `o11 ostack launch-videos download <link> --dir media/reference`, then study it the way a template recipe says.
   - **Neither** (say, "make me a launch video"): work out what the video is about from what they said and their site (ask in one question only when nothing says), then create it without a template. When the library has films of this format (`o11 ostack launch-videos templates --search <format>`), send the user its `url` in one line: "Pick a template here: <url>"; when it has none, as for reels today, go on without one. Run `o11 ostack launch-videos video <id> --wait 300` until a template is picked, repeating while the user is still choosing; if they say to start blank, go on without one. List the workspace's videos with `o11 ostack launch-videos videos` when they mean an existing one. To suggest films yourself, search with `o11 ostack launch-videos templates --search <text>`.

   You name the video: a short title for what it is, such as "Inbox launch". `video` returns the brief, the template's recipe and every version. The brief answers the brief step's questions; ask only what it leaves out. Save what the user tells you about this video to its brief with `o11 ostack launch-videos update <id> --goal "<text>"` (also `--audience`, `--storyboard`, `--material`, `--notes`, `--length`, `--aspect`, `--title`, `--template`, and `--part <name>=<text>` for a part only this kind of video has, such as a UGC video's `hook`), so the team sees it on the video's Brief tab and the next version starts from it. The team rarely types there: they tell you. To have them check a storyboard or brief, send the `url` that `update` prints, which opens that tab. The recipe points to the template film: study it, then match its shape, look and sound; the team's files still win over it, and the rules below win over both.

## Steps

**irl:** brief → shoot → transcribe → script → timeline → overlays → sound → render → audit → deliver
**reel:** the same steps as irl; [references/reels.md](references/reels.md) has what differs (layout, cuts, hook, call to action)
**product-demo:** brief → script → capture → narrate → timeline → overlays → sound → render → audit → deliver

The first time you reach a step, run `o11 ostack context launch-videos/<step>`. It returns the step's `default`, then the team's `before`, `files` and `after` for it, lowest priority first. Do the `before` files, then the step as the default describes, refined by the files (where they conflict, the later one wins), then the `after` files.

Ask the user about anything needing their judgment: the brief, the words, which take, the music. Show a low-resolution cut early and often; never polish what has not been agreed.

## Runs from the content calendar

The ostack-content-calendar skill makes videos overnight with nobody to answer. When it hands you a calendar row:
- Skip the first reply and the brief interview. The row, the team's files and the template are the brief: save it to
  the video's brief, decide what is left from them, and note every assumption for the row.
- Make your best choices where you would normally ask (which take, which words, which track), and say each in the
  note. The team changes them by moving the row back to Planned with a new prompt.
- Every audit still runs and must pass. A cut that cannot pass is not uploaded; the row needs help.
- The row is the go-ahead to upload: upload the audited cut as a version with every shape the row needs, as a draft
  for the team to review, and return its link. Never render a master the row did not ask for.
- Paid calls stay inside the nightly cap the calendar skill gives you, quoted first.
- Anything only a person can do (clips that are not there, a product sign-in, a password, a choice the row and files
  cannot settle) stops this video with that one need, for the calendar to write back.

## Wallet tools

Transcription, narration, music, sound effects and logos come from the user's o11 wallet: `o11 discover "<capability>"`, `o11 inspect <tool>`, `o11 quote <tool> --input @input.json`, then `o11 call`. [references/wallet-tools.md](references/wallet-tools.md) lists what to search for at each step and what to check. Quote before anything paid, and stay inside the video's budget from the brief. Start a video's paid calls with one run id (`o11 session-id`, then `--run-id`) so `o11 run-status` shows what the video cost.

## Rules no customization can change

- **The product is real.** Use the user's actual product screens, logos and supported claims. Never invent UI or results or show real customer data. An explicitly requested fictional presenter is allowed in the UGC workflow; a generated presenter cannot fabricate a customer testimonial.
- **Composition stays steady.** Every animated overlay moves through `move()` (perspective plus translate3d); frames are rebuilt from scratch; renders split only at shot cuts. Audit layers that should stay still. Preserve intentional motion in source footage or a requested camera move. See [references/rendering.md](references/rendering.md).
- **Captured voice stays intact.** Keep the camera's audio unchanged unless the user requests processing; centre and level-match it. Generated narration follows the selected voice and saved settings.
- **Audit rendered edits.** Before showing a rendered cut, run its applicable layout, frame, compositor-motion, word and sound checks and inspect the result. Label raw generation samples as samples. State what was measured and what was reviewed by playback; leave voice likeness or lip sync unverified when the available tools cannot assess them.
- **Media stays in the project.** Keep clips, narration, renders and `media/auth.json` in the local video folder and out of commits and shared playbook files. Upload a finished cut to its video in o11 with `o11 ostack launch-videos upload` only when the user authorizes that upload (a content calendar row asking for the video counts). Authorized generation may upload selected references through the selected service and inspected storage, with access and expiry recorded. Credentials and browser sessions are never reference assets. Never type the user's passwords.
- **Spend only with a quote.** Every paid generation is quoted first and fits the budget; a failed call is never resubmitted blindly.

When the user corrects how something looks or sounds, save it right away: to the brand kit when it clearly holds for every video (as the ostack-setup skill's `references/first-run.md` says, and say so in one line), so the next video starts there; when it is about this video only, save it to the video's brief with `o11 ostack launch-videos update`. The brand kit never holds one video's audience, story, screens, length or budget.

## References

| File | Read it when |
| --- | --- |
| [rendering.md](references/rendering.md) | Before changing anything in `page/` or `scripts/`, and whenever a frame looks wrong. |
| [motion.md](references/motion.md) | Animating headlines, glass, the UI camera or the cursor. |
| [design.md](references/design.md) | Designing or styling anything: type, the glass recipe, layout, the end card. |
| [storytelling.md](references/storytelling.md) | Turning words into headlines and scenes; shaping a product demo. |
| [audio.md](references/audio.md) | Mixing, narration, music, loudness, stereo. |
| [reels.md](references/reels.md) | Making or changing a vertical reel. |
| [coaching.md](references/coaching.md) | Every script, cut and review: the red flags to raise without being asked. |
| [motion-films.md](references/motion-films.md) | Making a narrated film with no footage: scenes built from the product's real components over brand gradients. |
| [wallet-tools.md](references/wallet-tools.md) | Any step that uses the wallet. |
