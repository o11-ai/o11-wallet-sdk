---
id: launch-videos
name: Launch videos
summary: Launch and product videos made from your real footage or your real product, with voice, music and sound from your o11 wallet.
workflows:
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
Three formats share one renderer and one set of rules. **irl** edits real filmed clips into a launch film: people talking
to camera, headlines timed to their words, frameless glass components on the open side of the frame, a glass end card.
**reel** cuts one selfie clip into a vertical short (Reels, TikTok, Shorts): a hook from the first frame, headlines and big
glass cards in the open space above the head, light cuts that never clip a word, and a link at the end. **product-demo**
films the real product: its screens captured from the running app, a camera that glides between the parts that matter,
a cursor, and generated narration. All three pass the same audits, so nothing ever shakes.

Each video is a folder on the user's computer (`o11 ostack launch-videos new <name> --format irl|reel|product-demo`), made from
the renderer kit. Clips, narration, renders and the user's sign-in stay in that folder. In the o11 workspace live the team's
short text files (brand, voice and rules) and every video's page: its brief, its template (a film from the o11 library), and every
finished cut the agent uploads as a version, which the team watches and downloads on the Launch videos page. Voice, transcription, music and sound come from wallet tools, quoted
before anything paid runs. Workflows run on request; they have no schedule.
