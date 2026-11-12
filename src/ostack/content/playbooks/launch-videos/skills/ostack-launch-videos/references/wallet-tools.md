# Wallet tools for video

The o11 wallet sells pay-per-call tools for voice, transcription, music and sound. Search by capability, inspect the
closest match, quote, then call:

```bash
o11 session-id                                   # once per video; pass it as --run-id on every paid call
o11 discover "text to speech"
o11 inspect <tool>
o11 quote <tool> --input @input.json --run-id <id>
o11 call <tool> --input @input.json --run-id <id>
o11 run-status <id>                              # what this video has cost so far
```

Search order is not a recommendation: check each candidate's inputs, outputs and price before choosing. Generated
media comes back as download links in the receipt; save the file into `media/` right away. A call that failed is
never resubmitted blindly: read the receipt first.

## By step

| Step | Search for | Use it for | Check |
| --- | --- | --- | --- |
| transcribe | `speech to text` | word timestamps for each clip (ElevenLabs speech to text) | words, not just segments; times in seconds from the clip start |
| narrate | `text to speech` | the narration voice (ElevenLabs, Fish Audio, MiniMax voices) | the same voice and settings for every line; WAV, or convert to 48 kHz |
| narrate | `design voice` | a new voice from a description (Fish Audio) | play a sample before the rest |
| narrate | `speech with word timings`, `forced alignment` | word timings for generated lines (Fish Audio; ElevenLabs alignment) | one timing file per line in `media/words/` |
| sound | `sound effects` | a sound the synthesizer cannot make (ElevenLabs) | only when the user asks for it |
| sound | `music generation` | a licensed backing track (ElevenLabs Music, MiniMax Music) | only with a go-ahead; long enough for the video |
| overlays | `brand logo`, `company logo` | real logos and brand colors for components (brand.dev) | the logo is the current one; SVG or a large PNG |

Not from the wallet:
- **Screen capture.** Product screens come from the user's own app through `scripts/capture.mjs` on their computer;
  the wallet's browser tools fetch and search pages but do not record sessions.
- **AI-generated footage.** Filmed videos use real clips. Generated video is never mixed into an IRL cut unless the user
  asks for it by name.
- **Voice clean-up.** Voice isolation exists in the wallet, but the camera's voice stays untouched unless the user asks.

## Money

- Quote before every paid call, and keep a video inside the budget from its brief (`launch-videos/sound.md`).
- Generate a sample first (one narration line, a short music preview) and get a yes before the rest.
- Regenerate only what changed: one edited line, not the whole script.
- Report what the video cost from `o11 run-status <id>` at handover.
