# Audio

`scripts/mix.mjs` builds the soundtrack from the timeline and normalizes it once. State whether a sound check came from signal measurement, transcript comparison or actual playback review.
When playback/listening is unavailable, keep likeness, natural delivery and lip-sync judgments unverified.

## Voice

- **Filmed clips: the camera's own audio, untouched unless the user requests processing.** No automatic denoise, EQ or compression. A light denoise was tried and
  heard immediately ("it sounds like you tried to noise cancel"). A quiet location is fixed at the shoot, not in the mix.
- **Both ears.** Cameras often record the lav on one channel; kept as is, the voice plays in one ear. `centerVoice()`
  measures each channel and copies the live one to both, or downmixes when both carry signal.
- **Level-matched after centring:** one static gain per clip to −17 LUFS, measured after the pan (copying a mono voice
  to both channels makes it louder).
- **Narration** gets the same treatment: centred, one static gain to −18 LUFS per line.

## Narration

Generated narration comes from the wallet's text-to-speech tools (`o11 discover "text to speech"`), quoted first. Pick
one that returns word timings with the speech, or align the audio against its text afterwards
(`o11 discover "forced alignment"`). Then:

- **One voice, one set of settings, one seed** for every line, and pass the neighbouring lines as context where the
  tool takes it, so the lines sound like one read.
- **Spell names the way they are said:** "Oh-stack" for Ostack, "Oh-Eleven" for o11, "S.E.O." for SEO. Write the real
  spelling on screen.
- **Pace:** a little faster than the tool's default (about 1.1×) reads as confident; slower reads as an audiobook.
- **Check every take by transcription.** Transcribe each line and compare it to the script; a misheard word ("whether"
  heard as "with a") means the take is unclear. Generate that one line again with another seed and check again.
- **Trim each take's tail** where its speech ends: tails carry breaths and the start of the next word.

## Sound effects

Cue every effect from the animation's own timings, so it can never drift: a soft whoosh on each scene change and
morph, pops on cards and pills that land, ticks on checks and rows, typing under typed text, a chime on what completes,
a swell under the logo. Place whooshes and swells by their peak and everything else by its onset. Keep them well under
the voice (about −18 to −27 dB) and short. The wallet's sound-effect tools make any sound the synthesizer cannot
(`o11 discover "sound effects"`), quoted first.

## Music

- Use the track the user gives you, or a generated one from the wallet (`o11 discover "music generation"`), quoted first.
- **A song with vocals:** split it into vocals and instrumental with the wallet's stem separation
  (`o11 discover "stem separation"`). The instrumental is the bed under the narration (sung words fight spoken ones);
  bring the song's own vocals back over the end card, after the last spoken word.
- **Find the grid.** Measure the tempo from the instrumental's kick onsets over the whole song and fit the period and
  phase together. Watch for half-time and triplet readings: a drill or trap beat reads as 1.5× or 0.5× its pulse.
  Map the song's sections (energy per 8 beats): where the beat drops in, where it thins and where it comes back.
- **Edit on the grid.** Start every narration line on a half beat and cut every scene half a beat before its line, so
  the picture leads the voice. Choose where the song starts so its biggest moment (the drop, or the beat coming back
  after a breakdown) lands exactly on the film's biggest cut; solve the offset from the timeline, then check the cut is
  on a full beat. Starting mid-song needs a short fade-in.
- **Levels:** the bed sits at about −25 LUFS under −18 LUFS narration, lifted 5 dB only in gaps longer than 1.2 s, with
  ramps that sit wholly inside the gap so the bed never pumps between lines. Under filmed speech, duck it with a
  volume ramp (0.3 s down, 0.5 s up) over the phrases in `edit/speech.js`; a sidechain compressor pumped.

## End card

The end clip's own sound (birds, air) plays low (about −32 LUFS), fading in over 0.8 s and out over the last 1.4 s.

## Loudness

Mix everything, measure the integrated loudness, apply one static gain to −14 LUFS, then a peak limiter. Never a
one-pass `loudnorm` on the whole mix: it pumps.

## Checks

`node scripts/audit/sound.mjs`: −14 LUFS ± 1, true peak at or under −1 dBFS, left and right within 1 dB in every shot
with filmed speech. Then transcribe the finished mix and compare it to the script or the original: every line must be
heard over the music, and a cut that clips a quiet trailing word shows up as a missing word. A transcript sometimes
invents words over a song's own vocals ("Thanks for watching"); check those against the timeline before calling them
a fault.
