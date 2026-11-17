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
edge and a faint inner glow (`.glass` in `styles.css`). No text shadows, anywhere: on glass, on footage or on a
gradient. Where white type sits on glass over a bright part of the picture, add a light dark tint inside the glass
(`background-color: rgba(0,0,0,.25)` or the scene's darkest colour) and check the frame at full size.

- The blur must blur the picture. Never put opacity, filter or `will-change` on a wrapper around glass.
- Logos are the real ones, in their own colours (Google's four-colour G, Gemini's gradient, a provider's own mark),
  and one colour only when the brand itself is (OpenAI, GitHub). Take them from the wallet's provider identities first;
  Simple Icons are one-colour only. Show a logo wherever its product is named.
- Logo tiles are near white, so every colour reads on any picture or glass.
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

Rainbow and conic gradients, coloured blobs, tinted panels, drop shadows, text shadows, dark themes, fake windows, a
graphics-only intro before the footage, a black end card, running subtitles of every word, zooms or punch-ins on filmed
clips, film grain, slow drifts, logos that assemble from parts, one-colour logos for brands that have colour. (A
narrated film with no footage has its own look: [motion-films.md](motion-films.md).)
