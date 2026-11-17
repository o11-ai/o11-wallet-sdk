# Starting styles

Copy one block into `edit/style.json`, replace the placeholder text, then run `node scripts/fonts.mjs --style` to download the fonts it names (open-licence files, saved to `media/fonts/` with their licence). All are for a 1080 by 1920 video. The first four were measured from videos trending in November 2026: they are small, in the platform's own typeface, and mostly sentence or lower case. Start there for a filmed clip or a matched reference, unless the user asks for something louder. A generated presenter video with no reference starts from `boxed-lower`.

## Native sans: a hook at the top, small captions mid-frame

The look of text typed in the app itself: TikTok Sans, white, thin dark outline. A two-line hook near the top stays for the whole video; small one-line captions without punctuation sit mid-frame. Measured from a trending talking clip: hook 70 px semi-bold at 18% from the top, captions 49 px medium at 56%.

Fonts: `node scripts/fonts.mjs "TikTok Sans" --weights 500,600`

```json
{
  "version": 1,
  "name": "native-sans",
  "canvas": {"width": 1080, "height": 1920, "fps": 30, "safe": {"top": 200, "bottom": 350, "left": 60, "right": 120}},
  "captions": {
    "enabled": true,
    "font": {"family": "TikTok Sans", "weight": 500, "file": "media/fonts/tiktok-sans-500.woff2"},
    "size": 49, "case": "asis", "punctuation": false, "letterSpacing": -0.02, "color": "#ffffff",
    "stroke": {"color": "#000000", "width": 5}, "box": null, "shadow": null,
    "position": {"x": 0.5, "y": 0.56}, "maxWords": 4, "maxChars": 22, "active": {"mode": "none"},
    "enter": {"kind": "none", "seconds": 0}
  },
  "overlays": [
    { "kind": "header", "text": "write the hook here|in two short lines", "position": {"x": 0.5, "y": 0.184},
      "from": "start", "to": "end", "size": 70, "lineHeight": 1.3, "letterSpacing": -0.02, "color": "#ffffff",
      "font": {"family": "TikTok Sans", "weight": 600, "file": "media/fonts/tiktok-sans-600.woff2"},
      "stroke": {"color": "#000000", "width": 7} }
  ]
}
```

## Native serif: one quiet title, no captions

A single serif title low in the frame, white, no outline, soft shadow, sentence case. DM Serif Display at 72 px, centred at 79% from the top (the reference sits at 80%; this is 10 px higher to clear the app buttons). Captions are off, as in the reference; set `captions.enabled` to `true` for small serif captions at 66%.

Fonts: `node scripts/fonts.mjs "DM Serif Display"`

```json
{
  "version": 1,
  "name": "native-serif",
  "canvas": {"width": 1080, "height": 1920, "fps": 30, "safe": {"top": 200, "bottom": 350, "left": 60, "right": 120}},
  "captions": {
    "enabled": false,
    "font": {"family": "DM Serif Display", "weight": 400, "file": "media/fonts/dm-serif-display-400.woff2"},
    "size": 46, "case": "asis", "color": "#ffffff", "stroke": null, "box": null,
    "shadow": {"color": "rgba(0,0,0,0.35)", "blur": 10, "y": 2}, "position": {"x": 0.5, "y": 0.66},
    "maxWords": 5, "maxChars": 26, "active": {"mode": "none"}, "enter": {"kind": "none", "seconds": 0}
  },
  "overlays": [
    { "kind": "header", "text": "Write the title here", "position": {"x": 0.5, "y": 0.79}, "from": "start",
      "to": "end", "size": 72, "color": "#ffffff",
      "font": {"family": "DM Serif Display", "weight": 400, "file": "media/fonts/dm-serif-display-400.woff2"},
      "stroke": null, "shadow": {"color": "rgba(0,0,0,0.35)", "blur": 10, "y": 2} }
  ]
}
```

## Karaoke small: words fill in as they are spoken

Small heavy captions, up to two lines. Words already spoken are white; the words still to come are dimmed to 55%. TikTok Sans 800 at 46 px with a 1.5 px outline, 74% from the top, lines sharing a left edge and no wider than 58% of the frame.

Fonts: `node scripts/fonts.mjs "TikTok Sans" --weights 800`

```json
{
  "version": 1,
  "name": "karaoke-small",
  "canvas": {"width": 1080, "height": 1920, "fps": 30, "safe": {"top": 200, "bottom": 350, "left": 60, "right": 120}},
  "captions": {
    "enabled": true,
    "font": {"family": "TikTok Sans", "weight": 800, "file": "media/fonts/tiktok-sans-800.woff2"},
    "size": 46, "case": "asis", "punctuation": true, "letterSpacing": -0.01, "color": "#ffffff",
    "stroke": {"color": "#000000", "width": 3}, "box": null,
    "shadow": {"color": "rgba(0,0,0,0.45)", "blur": 4, "y": 1}, "position": {"x": 0.5, "y": 0.742},
    "width": 0.58, "align": "left", "lineHeight": 1.37, "maxWords": 7, "maxChars": 30,
    "active": {"mode": "fill", "dim": 0.55}, "enter": {"kind": "none", "seconds": 0}
  },
  "overlays": []
}
```

## Text stack: the hook is the text

Five or six short centred lines over footage where nobody needs to speak. Each line appears 0.7 s after the one before and stays. TikTok Sans 600 at 58 px, thin outline, centred at 66% from the top. An empty string leaves a blank line. Give a line `{ "text": "…", "from": 3.2 }` or `{ "word": 12 }` to time it yourself. When matching a reference, check its first two seconds: if every line is on screen from the first frame, set `"every": 0` and `"enter": {"kind": "none", "seconds": 0}`. The video this preset was measured from shows all its lines at once.

Fonts: `node scripts/fonts.mjs "TikTok Sans" --weights 600`

```json
{
  "version": 1,
  "name": "text-stack",
  "canvas": {"width": 1080, "height": 1920, "fps": 30, "safe": {"top": 200, "bottom": 350, "left": 60, "right": 120}},
  "captions": {
    "enabled": false
  },
  "overlays": [
    { "kind": "stack",
      "lines": ["first short line.", "second line.", "third line.", "a longer fourth line that may wrap", "", "last line."],
      "every": 0.7, "position": {"x": 0.5, "y": 0.662}, "from": "start", "to": "end", "size": 58,
      "lineHeight": 1.34, "width": 0.68, "letterSpacing": -0.035, "color": "#ffffff",
      "font": {"family": "TikTok Sans", "weight": 600, "file": "media/fonts/tiktok-sans-600.woff2"},
      "stroke": {"color": "#000000", "width": 6}, "enter": {"kind": "fade", "seconds": 0.15} }
  ]
}
```

## Bold pop: loud upper-case with a yellow spoken word

Three words at a time in heavy white capitals with a black outline; the spoken word turns yellow and each caption pops in. Montserrat 900 at 78 px. Use it when the user asks for the loud style by name; the native looks above are what trending videos use.

Fonts: `node scripts/fonts.mjs Montserrat --weights 900`

```json
{
  "version": 1,
  "name": "bold-pop",
  "canvas": {"width": 1080, "height": 1920, "fps": 30, "safe": {"top": 200, "bottom": 350, "left": 60, "right": 120}},
  "captions": {
    "enabled": true,
    "font": {"family": "Montserrat", "weight": 900, "file": "media/fonts/montserrat-900.woff2"}, "size": 78,
    "case": "upper", "color": "#ffffff", "stroke": {"color": "#000000", "width": 10}, "box": null,
    "shadow": null, "position": {"x": 0.5, "y": 0.72}, "maxWords": 3, "maxChars": 18,
    "active": {"mode": "color", "color": "#ffe600", "scale": 1.0}, "enter": {"kind": "pop", "seconds": 0.08}
  },
  "overlays": [],
  "grade": {"contrast": 1.05, "saturation": 1.08, "temperature": 0, "vignette": 0}
}
```

## Boxed lower-case: heavy text with a coloured box on the spoken word

Lower-case white text on a dark rounded box, the spoken word on a blue box, no zoom. Inter 800 at 56 px. The default for a generated presenter video with no reference. Change the box colour to the brand's. For a reference that punches in, add `"punchIn": {"scale": 1.15, "seconds": 0.12, "on": "emphasis"}`.

Fonts: `node scripts/fonts.mjs Inter --weights 800`

```json
{
  "version": 1,
  "name": "boxed-lower",
  "canvas": {"width": 1080, "height": 1920, "fps": 30, "safe": {"top": 200, "bottom": 350, "left": 60, "right": 120}},
  "captions": {
    "enabled": true, "font": {"family": "Inter", "weight": 800, "file": "media/fonts/inter-800.woff2"},
    "size": 56, "case": "lower", "color": "#ffffff", "stroke": null,
    "box": {"color": "#000000", "opacity": 0.7, "radius": 16, "padding": 16}, "shadow": null,
    "position": {"x": 0.5, "y": 0.76}, "maxWords": 4, "maxChars": 24,
    "active": {"mode": "box", "color": "#2f6bff", "scale": 1.0}, "enter": {"kind": "fade", "seconds": 0.1}
  },
  "camera": {"punchIn": null, "push": null, "shake": null},
  "overlays": [],
  "grade": {"contrast": 1.08, "saturation": 1.15, "temperature": 0, "vignette": 0.25}
}
```
