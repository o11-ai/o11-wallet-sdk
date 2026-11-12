# Rendering without shake

Every bug below happened on a real launch video, and each fix is built into the kit. When something looks wrong,
reproduce it under real render conditions (several pages, real timing) before changing code.

## How a frame is made

1. `page/index.html` stacks the layers: the picture (`#footage` or the UI card), glass overlays, the end card, the
   cursor, then headlines. Footage is a pre-extracted JPEG per output frame, drawn inside the page, which is what lets
   `backdrop-filter` blur real pixels.
2. `window.renderFrame(t)` rebuilds every overlay, headline, UI card and end card from scratch for time `t`.
   `window.settle()` waits for fonts and every image to decode.
3. `scripts/lib/browser.mjs` pins the canvas with `Emulation.setDeviceMetricsOverride`, draws two warm-up frames it
   throws away, waits two `requestAnimationFrame`s after each frame, then captures over CDP.
4. `scripts/render.mjs` gives each shot to one fresh browser, start to finish, one shot at a time by default.

## The bugs, their causes, the fixes

| Symptom | Cause | Fix in the kit |
| --- | --- | --- |
| Headlines cut off at the bottom | Capture followed the headless window (1920×993), not the canvas | Metrics override and an explicit clip on every capture |
| A torn band or flash in a shot's first frames | The first captures after load came from a layout before the override settled | Two warm-up frames per page, and the torn-frame audit |
| The video ends early | Chrome's fast PNG encoder dropped alpha on opaque frames; ffmpeg lost sync at the format change | Frames are opaque JPEGs; encode refuses gaps; the frame audit counts frames |
| Glass that does not blur | `opacity`, `filter` or `will-change` on a wrapper made it a backdrop root | Wrappers only transform; opacity and blur go on the glass surface |
| Text shimmers while moving slowly | Chrome snaps text to whole pixels | Every moving layer uses `perspective(100px) translate3d(...)` (`move()`); no slow drifts; no film grain |
| Held text differs frame to frame | Capture ran before the new frame was drawn | Wait for `settle()` and two animation frames |
| Held components shimmer across a render | Pages kept a layer's first rasterization, which differed by page history | Rebuild every frame from scratch; the same compositing path at rest (`move()` with no motion, never `none`); no `will-change`; contiguous frames per page, split only at cuts |
| A stale screen or old footage in a new cut | Inputs reused from an earlier capture or extraction | Prepare and capture start clean and stamp what they made; render refuses a mismatch |

## Rules for anything you add

- Compute every value from `t` with `core/motion.js`. No CSS transitions or animations, no `requestAnimationFrame`
  state, no `Math.random()` (use `rand(seed)`), no `Date.now()`.
- Move with `move(x, y, scale)`. At rest, keep `move()` rather than removing the transform.
- Never put opacity, filter or `will-change` on an element that contains glass.
- Something that animates on purpose (a counter, a waveform) declares when it stops (`still`) or that it loops (`loop`).
- Never round positions to whole pixels and never add a slow holding drift.

## Proof

Stillness renders six consecutive frames of every hold, alternating across three pages with different histories, and
needs identical hashes. A single page cannot see the history bug: that check passed while the video still shimmered.
Run the audits after every change to `page/`, `edit/scenes.js` or the timeline, and before every cut you show.

## Speed

Rebuilding every frame is slower (about 0.25s a frame at 1080p) and worth it. Iterate at `--scale 0.5` and re-render
only the changed range with `--from`/`--to`. `--jobs 2` renders two shots at once on a fast machine; the result is the
same because each shot still gets its own browser.
