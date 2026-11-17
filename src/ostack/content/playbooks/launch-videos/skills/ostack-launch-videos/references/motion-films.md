# Narrated motion films

A launch film with no footage and no screen capture: generated narration over brand gradients, with each idea shown
as the product's real components rebuilt in the page (a wallet card, a versions list, a brief, a report), landing on
the word that names it. It follows the product-demo steps; the capture step is replaced by building the scenes. The
rules in [design.md](design.md) and [rendering.md](rendering.md) still hold; this file adds what is different.

## Shape

1. **Logo first.** The mark is on screen from the first frame, on black. The brand gradient grows out of the mark
   itself (its rounded tile opening into the whole frame), the name writes on beside it, and a glass pill beneath names
   what launches, with the product's own mark in it. No band wipes, no circular reveals (a growing circle reads as a
   black hole), no empty frame before the logo.
2. **The hook:** one line on what changed for the viewer, shown as the thing itself (the same question typed into two
   search boxes side by side, a frame shrinking into a tile).
3. **One scene per idea**, in the order the narration says them, each with one layout and one hero component.
4. **Proof:** the product's real numbers, a measured price, or the film itself ("this film was made by Claude").
5. **The close:** the lockup, the one-line offer and the link typed in, with the logos it works with.
6. **The sign-off** from the team's brand kit (for example the founder's invitation and link), on the same gradient
   as the close.

## Look

- **A different gradient per scene**, from the brand palette (the glass-art guide: mostly warm reds and oranges, blues
  and greens; purple and pink at most a fifth): silk for calm scenes, ribbed glass for energy, the brand horizon for
  the close. Change the texture as well as the colour, and change how scenes enter: a pale stage opening from the
  top, a panel growing out of the last one, a crossfade of fields.
- **No two films alike:** a new film gets a new open, new gradients and new layouts; reuse the craft, not the scenes.
- **Glass over gradients** with no text shadow; on a bright field, a light dark tint inside the glass keeps white type
  readable. White cards for the product's own screens and documents; near-white pills for states and labels.
- **Real product UI, rebuilt from the product's own components and copy:** the real card, the real page sections,
  the real tab names. A blog post looks like the team's own blog (breadcrumb and date, the title large, the author
  line, the outline beside the cover, a cover in the team's cover style). No mock windows or title bars.
- **Real logos where a product is named**, in their own colours, on near-white tiles (see [design.md](design.md)).
- **Layout:** equal padding on every side of a card, cards sized to their content (no half-empty cards), content
  centred in the frame vertically, comparisons side by side rather than stacked, and a fixed width for anything that
  types or counts so it never grows.
- **Measure, don't estimate:** text-width estimates run a few pixels wide per word. Render once, measure the real
  extent, and correct the centring and pill widths from the measurement.
- **Overflow:** long URLs and titles truncate inside their card (`min-width: 0` on every flex or grid child that holds
  them, then `text-overflow: ellipsis`); check every card at full size for text past its edge.
- **Examples are labelled.** When the film follows a made-up company, every number on screen is illustrative and you
  say so at handover; real prices and counts come from a measurement made for the film.

## Timing

- Every element lands on the word that names it (from the narration's word timings), the picture half a beat ahead
  of the voice.
- Typed text finishes before its scene leaves; a list that types in gets the speed it needs to land with time to read.
- Scenes hand over without an empty frame: the next scene's first element lands on the cut, or the outgoing
  background crossfades into the incoming one over 14 to 18 frames. The film's biggest cut lands on the music's
  biggest moment ([audio.md](audio.md)).

## Before you show it

Render the first three scenes and look at them at full size before rendering the rest; take the user's notes on a
base cut before polishing. Then every audit in the audit step (`o11 ostack context launch-videos/audit`) and, at handover, what you
measured and what was illustrative.
