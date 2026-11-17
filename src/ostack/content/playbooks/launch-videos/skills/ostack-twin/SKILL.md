---
name: ostack-twin
description: Make a reusable presenter of the user from one recording, then videos of them saying new words. Sends a secure link to record a talking video, a voice sample or photos (or takes an attached file), saves it in the o11 wallet, and makes each video on Captions by default, with HeyGen or Runway when asked. Use for "make an avatar of me", "clone me", "clone my voice", "make a digital twin", "here is a video of me talking" and "make another video with my avatar", even without saying "ostack". Handles the recording, uploads and platform setup without asking the user to manage IDs. A fictional presenter, the script, captions and the edit belong to ostack-ugc.
---

# A twin from one recording

The user's flow is: attach their talking video, name the twin, then say what it should say. Handle the files and provider setup for them. Reuse their existing wallet, selected card, connections, recording and approvals. Ask only for a missing choice that affects the likeness, consent or spending. Do not ask the user to extract audio, take a portrait, paste signed URLs or copy provider IDs.

When the user has no recording yet, send them the recording link below. Ask for one person, facing the camera, face in frame throughout, quiet room, even light, no music or cuts, and for them to speak with energy and vary the delivery; a twin reproduces only the range it has seen and heard. A platform that trains from video may ask for a longer take (about two minutes).

Use this skill for the person's own recording or an explicitly authorized recording. Preserve any provider's separate consent-video or verification requirements; an ordinary talking sample does not replace them. A video-generation approval does not authorize unrelated training charges or recurring fees.

This skill supports the `launch-videos/ugc` workflow of ostack's launch-videos playbook. It has no run of its own: the UGC skill starts and ends the run, and its rules hold here.

## Start with a saved recording

The default is the wallet's own recording, with Captions making each video. It needs no video folder and no platform setup, and the recording is kept in the wallet under Resources for every later video.

- **Reuse first.** `o11 resources list -p o11 -t avatar-capture` lists the recordings already saved, and `o11 avatar status --capture-id <id>` shows one and what each platform has made from it. Use one the user already has before asking for another.
- **No recording yet:** `o11 avatar clone --name "<name>"` prints a secure link, opens it and waits for the take. The person reads a short script to camera. The link works without signing in and lasts 24 hours, so send it only to the person being recorded. `--collect voice` records a voice sample only; `--collect photos` takes photos.
- **They attached a file:** `o11 avatar clone --name "<name>" --video <file> --portrait <still>` saves it as the take with no browser (mp4 or webm under 32 MB, and one still of the face, which Captions needs). `--audio <file>` alone saves a voice sample. Running the same command again resumes an unfinished upload.
- **Make a video:** `o11 avatar video --capture-id <id>` makes one Captions video from the recording's portrait and speech and shows the price first: $1.25 for each started 6 seconds on o11's account, up to 60 seconds, or billed by Captions on a connected key (`--connection <id>`). Captions has no text to speech. For new words, make the speech audio first as the `narrate` step describes, then pass it with `--audio-url` or `--audio`.

Use the rest of this skill only when the user asks for a trained avatar on another platform, or a model needs the recording as a reference bundle.

## Prepare the attachment

A reference bundle (`o11.avatar.create`) is a separate saved item from the recording above. It holds the original video, a portrait and the voice sample for models that take them as references.

Use an existing launch-videos UGC folder or create one through the launch-videos playbook. Initialize its UGC manifest once with the existing CLI, profile, selected card and connected wallet origin:

```sh
node scripts/ugc.mjs init . --mode talking-head --budget-micros APPROVED_TOTAL --profile PROFILE --card CARD --origin https://WALLET_HOST
node scripts/twin.mjs prepare . --video ATTACHMENT --name NAME --id presenter
```

Zero budget supports preparing and saving a reference without authorizing provider training. Reuse an existing manifest; do not reinitialize it or change its account to recover an error.

The helper keeps the original, extracts one portrait and a mono WAV of its full audio, hashes all three and saves private state under `ugc/twins/`. It checks readable audio/video streams and a maximum ten-minute recording, without claiming to verify speech quality, identity, consent or the number of speakers. It does not submit provider work. Inspect the portrait and listen to the source; choose another frame with `--portrait-at SECONDS` on a new twin ID if the face is unclear. Keep the full original for providers that accept video references or require a different preparation.

After the requested upload is authorized:

```sh
node scripts/twin.mjs create . --video ATTACHMENT --name NAME --id presenter
```

This resumes signed 4 MiB uploads of the recording, portrait and voice sample and saves one O11 avatar-reference ID. It checks bytes and hashes before sending, pins the wallet/card, and journals native calls through the existing UGC invocation/recovery path. Repeat the same command after an interruption. Preserve an expired or deleted upload's saved ID and report its state; do not silently reserve replacements. Signed links stay in private receipts and never belong in shared briefs or chat output.

`node scripts/twin.mjs status . --id presenter` returns the reusable ID and local file hashes. Its `reference_ready` state means the source bundle is saved. It does not mean a provider has trained a clone.

## Provision the supported platform

Resolve the O11 avatar reference for fresh source links. Inspect `o11.media.plan` and the live tools for the requested platform. Feed the probed recording metadata to the plan, then meet its actual format, duration, consent and account requirements. The same original can supply different derived inputs; a platform-specific consent recording may still require the user.

Use an existing compatible provider/account from the user's context. If none is selected, discover available avatar, voice-clone and audio-driven video tools and choose a route that can deliver the requested result with the user's existing connections and budget. State that choice once. Do not make the user choose IDs or expose a list of unsupported routes.

- For Captions, nothing is provisioned: use `o11 avatar video` above.
- For Runway, the reviewed chain is `runway.voice.clone` from the extracted audio, `runway.voice.get` until ready, `runway.avatar.create` from the portrait and that ready voice, then `runway.avatar.get` until ready. This creates an image-and-voice avatar; it is not HeyGen-style video training.
- For a reference-video platform, pass the resolved original video only when its inspected contract supports that input. If it requires separate narration, synthesize with the compatible saved voice and use that exact audio in an inspected lip-sync or audio-driven endpoint.
- For HeyGen, the reviewed chain trains a real twin from the recording: `heygen.avatar.create` with the resolved video link (re-encode under 32 MB first), `heygen.avatar.consent.start` for the 24-hour consent link the person opens on camera, `heygen.avatar.get` until `completed` and `heygen.avatar.consent.get` until `accepted`, then `heygen.avatar.video` with the script. The create response also returns the voice cloned from the same footage. It needs the workspace's connected HeyGen key, and HeyGen bills that account.
- Use any other video-trained twin endpoint only when its creation, consent, readiness, generation and deletion adapter is available on the actual connected backend. Withheld adapters must not be described as implemented because the provider has a website.

Quote exact inputs before paid work. Supplier-billed connections can charge the user even when the wallet quote is zero. Carry forward explicit supplier/recurring authorization where applicable; otherwise request the missing approval once with the concrete operation and known cost limit. UGC generation stages reject recurring services, so do not bypass that guard for clone creation. Use the native owned-resource lifecycle and an exact saved invoke request for those tools.

Before creating a provider resource, list the saved resources on the same card/provider/connection and reuse a compatible one. Record the O11 reference ID, source SHA, provider, connection, owned-resource ID and accepted invocation in the private project. Save the request and idempotency key before submitting, then recover that invocation after an uncertain reply. Never recreate a clone just to recover its ID. Confirm resource readiness through its owned status tool before generation.

Keep one O11 reference ID as the user's twin. Each platform's trained voice/avatar remains bound to its own account. Resolve the source bundle to provision another supported platform; never transplant an external clone ID across providers or connections. Report which platforms are ready and the exact setup still needed for another platform.

## Generate and reuse

When the user gives a script, load the saved twin, resolve fresh source links and select its ready binding for the requested platform. Use the user's saved voice rather than a stock voice when voice cloning was requested. Ask for a sample-quality review if likeness or speech remains uncertain, then follow the existing `ostack-ugc` workflow for generation, captions, editing, browser rendering and delivery.

Show the user their twin name and finished video, plus any setup they must complete. Keep the provider plumbing in private state. Report actual charges and whether voice likeness and lip sync received playback review. Reuse the same recording, twin and accepted resources for later scripts. Deletion must distinguish the O11 reference, source recordings, provider avatars and provider voices; deleting a reference alone leaves the others intact.

When the user corrects how you did something, ask whether it holds every time. If it does, offer to save it to the team's files (a standing presenter or voice goes in `launch-videos/character.md`) with the ostack-setup skill so it sticks.
