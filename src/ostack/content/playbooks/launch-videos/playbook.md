---
id: launch-videos
name: Launch videos
summary: Launch films, product demos and generated UGC videos, with media tools from your o11 wallet.
workflows:
  - id: ugc
    skill: ostack-ugc
    summary: Generate an original presenter video or remake a reference video for your product, then edit and caption it locally.
  - id: irl
    skill: ostack-launch-videos
    summary: Edit filmed clips into a launch video with headlines, glass components and an end card.
  - id: reel
    skill: ostack-launch-videos
    summary: Cut one selfie clip into a vertical reel with a hook, big glass cards above the head and a link at the end.
  - id: product-demo
    skill: ostack-launch-videos
    summary: Turn your product's real screens into a narrated demo with a gliding camera, a cursor and an end card.
---
Four formats share one renderer. **ugc** makes generated presenter clips or remakes a reference video for the user's product, while keeping its script, source assets, jobs and receipts in the local video folder.  **irl** edits real filmed clips into a launch film: people talking
to camera, headlines timed to their words, frameless glass components on the open side of the frame, a glass end card.
**reel** cuts one selfie clip into a vertical short (Reels, TikTok, Shorts): a hook from the first frame, headlines and big
glass cards in the open space above the head, light cuts that never clip a word, and a link at the end. **product-demo**
films the real product: its screens captured from the running app, a camera that glides between the parts that matter,
a cursor, and generated narration. All four use the same renderer and applicable frame, layout, word and sound checks.

Each video has a local renderer folder (`o11 ostack launch-videos new <name> --format irl|reel|product-demo|ugc`). Clips, narration, renders and sign-in data stay there. The o11 workspace holds the team's text rules and each video's page: its brief, selected library template and finished cuts uploaded as versions with the user's authorization. Remote videos use `irl`, `reel` or `product-demo`; use `reel` for a new UGC video and `ugc` for its local renderer folder.

Authorized generation may send selected references to its chosen service through inspected storage or upload tools; raw references and credentials stay out of shared playbook files. Voice, transcription, music and sound come from wallet tools, quoted before paid work. Workflows run on request; they have no schedule.

To break a reference video down into a beat sheet and an edit style before remaking it or editing in its style, use the `ostack-video-teardown` skill. To find what is trending in a niche, save a link as a reference, read a video's comments or measure posts you published, use the `ostack-video-trending` skill.
