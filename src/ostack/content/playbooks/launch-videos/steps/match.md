---
summary: Score a remake against its reference, fix the largest gap, and have a second agent score it before reporting.
used_by: [ugc]
changed: 0.11.0
---
Follow the UGC skill's match-loop reference. Run `node scripts/match.mjs compare` against the reference at every round, starting with the first frame as a still before any clip is bought. Change one thing per round and fix the heaviest line first: camera, then framing and action. Use the reference's own sound when it has no speech, and give the user the sound's link for posting. Before telling the user a score, have a fresh agent fill the rubric from the two videos alone and report that number. Stop at 85, when two rounds gain under 3 points, or at the approved budget, and say what still differs.
