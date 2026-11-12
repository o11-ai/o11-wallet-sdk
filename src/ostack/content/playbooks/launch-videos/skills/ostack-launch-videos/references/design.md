# Design

Minimal, light, frameless glass over the real picture, with the real product and nothing decorative. The source of
truth is `page/styles.css`; brand specifics come from `edit/brand.js` and `launch-videos/brand.md`.

## Principles

- **The picture is the film.** Never cover a speaker or the part of the screen being talked about. Glass goes only on
  a shot with one person on one side and open space on the other; two-person shots get headlines only.
- **Real, never imitation.** The real mark, the real font, real logos, real screens. No mock windows, title bars,
  traffic lights or invented charts.
- **Minimal text.** A component says one thing: a result, a price, a state, a number. Logos and icons over words.
- **Light only.** No dark panels, no rainbow or blob gradients, no drop shadows on glass. The only gradients are soft
  white sheens inside the glass.
- **Equal margins.** Glass sits 56px from the top and the outer edge; headlines 72px from the bottom and side.

## Type

- The product's own font from `media/brand/` (Inter if they have none), normal tracking everywhere. Tight tracking was
  rejected.
- Weights 500 for headlines and titles, 450 for secondary lines.
- Headlines 66px, line height 1.16, white over footage (dark over the light UI background).
- Components: 42px titles, 30px secondary, 34px pills; tabular numbers for money and counts.

## The glass recipe

Clear glass, not frosted milk: a 4px backdrop blur so the picture reads through it. Legibility comes from a bright top
edge, a faint inner glow and a quiet text shadow (`.glass` in `styles.css`).

- The blur must blur the picture. Never put opacity, filter or `will-change` on a wrapper around glass.
- Logo tiles are glass too; white plates behind logos were rejected.
- Selected state: a brighter edge and fill, never a thick dark ring.
- The end card's glass is clearer still, so the picture shows through.

## Product UI shots

The real screen sits in a frameless rounded card on the brand background, with equal margins and the bottom band free
for headlines. Capture at the size people use the product; zoom in to show detail rather than capturing a tiny window.

## Corner mark and end card

- The mark only, 60px, still and whole, in the free top corner of each shot. It moves only on a cut and never has text
  beside it. Hidden on the end card.
- The end card: a quiet clip that keeps playing with its sound low (or the brand background), a glass pill with the
  mark and the name, and a glass caption with the call to action. No fade to black.

## Rejected, so it does not come back

Rainbow and conic gradients, coloured blobs, tinted panels, drop shadows, dark themes, fake windows, a graphics-only
intro before the footage, a black end card, running subtitles of every word, zooms or punch-ins on filmed clips, film
grain, slow drifts, logos that assemble from parts.
