---
summary: Making each planned video with the launch-videos skill and uploading it to o11.
used_by: [calendar]
changed: 0.9.3
change: First release.
---
Make each video with the ostack-launch-videos skill, in its calendar mode (the "Runs from the content calendar" section
of that skill): the row is the brief and the go-ahead, nobody answers questions mid-render, and every cut still passes
every audit.

For each video in the plan:
1. Create it in o11 with the reference: `o11 ostack launch-videos create --title "<short name>" --format <format>
   --template <film link or slug>`. A reference that is one of the team's own o11 videos is not a template: create the
   video blank, then `o11 ostack launch-videos download <that link> --dir <video folder>/media/reference` and follow
   it the way a template recipe says to.
2. Fill its brief from the row: `o11 ostack launch-videos update <id> --goal ... --audience ... --material ...
   --notes "From the content calendar: <date>, <row name>"`.
3. Get the material: the clips from the Material link (download them into the video's folder), or the product URL in a
   browser where the team is signed in. Missing, unreadable or signed out: stop this video and mark the row needs help
   with exactly what to add.
4. Make it, audit it, and upload it with every shape the plan needs in one version:
   `o11 ostack launch-videos upload <id> <main cut> <other shapes...> --note "Calendar draft for <date>"`.
5. Keep its link (the `url` upload prints) for the row.

Paid calls (narration, music, sound) stay inside the nightly cap in `social/videos.md`, counted across every row in
the run. When the next quote would pass it, finish the video without that call where the format allows (camera audio,
no music), else mark the row needs help with the cost.

A row that asks for something the skill cannot make (photos, carousels, animation from nothing) gets its captions
anyway, and needs help for the rest.
