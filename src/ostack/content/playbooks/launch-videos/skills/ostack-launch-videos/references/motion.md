# Motion

The motion was matched to professional references by measuring them frame by frame, not by eye. "Close" was not
accepted. Every value is a pure function of time (`core/motion.js`), so any frame renders the same on any page.

## Curves

```js
glide = bezier(0.16, 1, 0.3, 1)   // long deceleration, no overshoot: entrances and settles
ease  = bezier(0.65, 0, 0.35, 1)  // smooth in-out: exits and camera moves
p(t, start, duration, curve)      // progress of one tween
```

Springs with overshoot were tried and rejected as cheap.

## Headlines: the Vertical Slide (`page/headlines.js`)

- **In:** each line rises about 145px on a strong exponential ease-out (`expoOut`), at full brightness within about
  three frames while the rise keeps settling for 1.1s. The second line follows 0.1s behind.
- **Hold:** completely still. No drift.
- **Out:** lifts about 70px over up to 0.9s on `ease`, fading through the second half. Short headlines compress the exit.

## Glass components (`page/overlays.js`)

- Each piece glides in over 1.05s; opacity and blur clear faster (0.45s).
- The whole scene settles together from 5% larger and 28px lower over 1.3s, about its outer top corner, like a camera
  easing back.
- A scene lifts out 46px over 0.7s while the next one rises in, so the frame is never empty.
- Patterns that read well: stagger a stack by 0.06–0.25s; gather logo tiles from scattered `from` offsets into a grid;
  run live content inside a held card (a counter, a progress bar, a switch flipping on), then hold still.

## Product UI (`page/ui-shot.js`)

- **Camera:** glides to a target over about 1.3s on `ease`, zooming in log space, never past 1.8× (the capture is at 2×
  pixels). A move that starts before the last one ended starts from where it got to. Rest at least a second on each
  part the narration names; constant motion reads as nervous.
- **Cursor:** glides to its target over about 0.9s on `glide`, from just below and to the right of the first target.
  A click dips the pointer briefly and ripples once (0.5s). Put the click on the frame where the next state appears:
  the app changes instantly, as it does for a real user.
- One camera move per idea. Do not move the camera and scroll the UI at the same time.

## End card (`page/end-card.js`)

The mark appears in a glass circle that widens into a pill as the name slides out beside it; the call to action rises
beneath and its words fill from 35% to full white one after another. It holds to the last frame.

Rejected: a mark that assembles itself from parts, a name rising from below the frame, any fade to black.

## Measuring a reference

To match a reference exactly, extract it at its native frame rate and crop to the element:

```bash
ffmpeg -ss 13.2 -t 3.5 -i reference.mp4 -vf "fps=30,crop=330:300:10:300,format=gray" -f rawvideo ref.raw
```

Per frame, find the rows with bright pixels and group them into lines. Each line's position over time is the travel
and the easing; its pixel count is the opacity curve.
