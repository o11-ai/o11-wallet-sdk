---
summary: Capturing the real product's screens for a product demo.
used_by: [product-demo]
changed: 0.8.0
---
The product on screen is the real product, never a mockup, an invented window or a drawn interface.

1. Open the app where `launch-videos/capture.md` says, with a demo account and demo data. If it needs a sign-in, ask the user to run `node scripts/capture.mjs --login <url>` and sign in themselves in the Chrome window it opens. Never type their password.
2. In `edit/capture.js`, list one capture per state the video shows: its URL, the actions that reach it (click, fill, press, wait, scroll), and the targets the camera and cursor will use (stable selectors: test ids, roles, visible text).
3. Run `node scripts/capture.mjs`. Every run starts clean, so a screen is never reused from an older capture.
4. Open every image in `output/ui/` and look at it at full size. Stop and fix the data if any real customer name, email, number or private message shows. Check nothing is half-loaded: spinners, skeletons, toasts, a hover state.

Capture at the size the product is used (1440×900 by default); the camera zooms in on the part that matters, never past 1.8×.
