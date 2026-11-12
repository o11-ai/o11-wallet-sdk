# Audio

`scripts/mix.mjs` builds the soundtrack from the timeline and normalizes it once. You cannot listen, so every claim
about the sound comes from a measurement, and you say it was measured.

## Voice

- **Filmed clips: the camera's own audio, untouched.** No denoise, EQ or compression. A light denoise was tried and
  heard immediately ("it sounds like you tried to noise cancel"). A quiet location is fixed at the shoot, not in the mix.
- **Both ears.** Cameras often record the lav on one channel; kept as is, the voice plays in one ear. `centerVoice()`
  measures each channel and copies the live one to both, or downmixes when both carry signal.
- **Level-matched after centring:** one static gain per clip to −17 LUFS, measured after the pan (copying a mono voice
  to both channels makes it louder).
- **Narration** (product demo) gets the same treatment: centred, one static gain to −17 LUFS per line.

## Sound effects

One soft whoosh (pink noise, 320 Hz–2.6 kHz, 0.95s) cued 0.08s before each glass scene, on the first headline and on
the end card, from the animation timings so it cannot drift. Ticks, pops, chimes, swells and air on every headline
were rejected.

## Music

- None by default. Never a copyrighted track without a license: it also gets videos muted or taken down.
- With a go-ahead: the user's licensed file, a generated track from the wallet (quoted first), or the platform's
  library at upload.
- In the mix it sits about 10 dB under the voice in gaps and about 17 dB under while someone speaks, ducked with a
  volume ramp (0.3s down, 0.5s up) over the phrases in `edit/speech.js`. A sidechain compressor pumped; don't.

## End card

The end clip's own sound (birds, air) plays low (about −32 LUFS), fading in over 0.8s and out over the last 1.4s.

## Loudness

Mix everything, measure the integrated loudness, apply one static gain to −16 LUFS, then a peak limiter. Never a
one-pass `loudnorm` on the whole mix: it pumps. −14 LUFS was "too loud"; −16 was accepted.

## Checks

`node scripts/audit/sound.mjs`: −16 LUFS ± 1, true peak at or under −1.5 dBFS, left and right within 1 dB in every
shot. Then, when you cut speech, transcribe the finished audio and compare it to the original: a cut that clips a quiet
trailing word shows up as a missing word.
