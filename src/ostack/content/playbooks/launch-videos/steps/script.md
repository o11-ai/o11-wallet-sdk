---
summary: What is said, and the short headlines on screen.
used_by: [irl, reel, product-demo]
changed: 0.8.0
---
Headlines are short paraphrases of what is said, never transcripts: two lines, a few words each, in the user's own words where they gave them. Each headline spans a whole spoken phrase and holds at least 2.2 seconds; merge short neighbours instead of flashing them.

**reel:** the first headline is the hook: the speaker's own words, at 96px, on screen from the first frame (start it a beat before the first kept second). A real credibility mark can sit before its first line (`{ logo: "media/brand/<file>" }`). The last headline holds to the end (`99`) over the call to action.

**irl:** the words are already filmed. After the transcribe step, read the transcript and write one headline per idea, timed to the phrase (`edit/speech.js`). Show the list with times and get a yes.

**product-demo:** write the narration first: one line per screen or action, plain and spoken, about 2.5 words per second. Say what the viewer gets, not which button to press. Name the product as written in `brand.md`. Then a headline per idea. Show both and get a yes before generating any voice.

Before finishing: every claim is in `brief.md`'s proof; nothing says something the user did not approve; nothing names a competitor unless `script.md` allows it.
