---
summary: Turning a row's prompt into the videos and captions to make.
used_by: [calendar]
changed: 0.9.3
change: First release.
---
Read the whole row, then decide, from the prompt first and `social/videos.md` and `social/captions.md` second:

- **Platforms:** the Platforms column, else what the prompt names, else the team's default platforms.
- **Videos:** none (a text post), one video for every platform, or separate videos (one per platform, or a long cut and
  a short one). Without a word on it, use the team's default in `social/videos.md` (default: one video, rendered in
  each shape the platforms need).
- **Shapes:** each platform's shape from `launch-videos/deliver.md`, else 9:16 for Instagram, TikTok and Shorts, 1:1 or
  16:9 for LinkedIn, 16:9 for X. One video in several shapes is one o11 video with every shape in the same version.
- **Format:** product-demo when the material is the product, reel for one selfie clip, irl for filmed clips.
- **Reference:** the Reference column, else a link in the prompt, else the team's default film in `social/videos.md`.
  With none of those, search the library for the closest film (`o11 ostack launch-videos templates --search <text>
  --format <format>`), use it, and say which in the note so the team can change it.
- **Captions and extras:** one caption per platform, plus any extra the prompt or the team's file asks for.

Print the plan in a few lines before making anything. If the prompt is too thin to know what the post is about, mark
the row needs help with the question to answer; do not guess a topic.
