# launch-videos setup questions

Asked by the ostack-setup skill when the launch-videos playbook is enabled; their ids are `launch-videos/<id>`. Each `## <id>` section is one topic. `Since` is the release that added it. Releases may add sections, but never rename or remove an id.

These are the team's: an owner or admin answers them once, and their files are team files (`o11 ostack files write <path>`). "Writes" names the file path.

Together these files are the team's brand kit, and the brand kit holds only what is true for every video. Anything about one video (its audience, takeaway, story, screens, length or budget) belongs in that video's brief in o11, never in these files.

`Infer` says where the agent finds the answer itself before asking anyone (the ostack-setup skill's `references/first-run.md`); "Use the default" means never ask, and list it as an assumption. `Ask` is for when nothing can be inferred, or when someone wants to change the answer later.

## brand
Since: 0.8.0
Ask: What's the product called, and what should the last line of every video say (the one call to action, such as "Try it free at acme.com")? Where are your logo mark (SVG or PNG) and your font file? Is there a design.md or brand guide in your repo I should follow?
Infer: The name and call to action from `company.md` or the site's main button; logo, colors and fonts from the repo (a design.md, brand guide, theme file or logo files) or from the site's logo, favicon and styles.
Default: The name and offer from `company.md`; colors, fonts and style rules from a `design.md` (any case), brand guide or theme file in the repo when there is one; the system font when there's no font file.
Writes: `launch-videos/brand.md`: the name exactly as written, the call to action in their words, where the mark and font files are, and the design every video follows: colors, fonts and weights, and style rules (corners, motion, what to avoid), each with where it came from.
Check: Read the end card's two lines back to them. Confirm the mark and font files open.

## formats
Since: 0.8.0
Ask: Which videos do you want: launch films (people talking to camera), reels (one selfie clip, vertical), product demos (your app on screen), or a mix? Where will they be posted, and how long should they be?
Infer: What the request asks for; otherwise the default.
Default: Launch films at 1920×1080 for posts and sites, 30 to 90 seconds; reels at 1080×1920 for Reels, Shorts and TikTok, under 45 seconds.
Writes: `launch-videos/deliver.md`: for each format they make, its size, usual length and where it is posted, and where review cuts go (default: the user's Downloads). Defaults per format only; one video's length goes in its brief.

## story
Since: 0.8.0
Ask: Anything your videos must always or never say (claims, competitors, prices), and words you prefer for your product?
Infer: `company.md` and the site's headline and claims; never a claim the site does not back.
Default: From `company.md`: one idea per video, said in the founder's own words.
Writes: `launch-videos/script.md`: words to use and avoid, claims that need proof, and anything always or never said. Not one video's audience or takeaway: those go in its brief.
Check: Draft five headlines for a recent launch and ask which sound like them.

## product
Since: 0.8.0
Ask: For product demos: where can I open the product (a local dev server, staging, or the live app), and is there a demo account with demo data I can show?
Infer: The repo's dev server and seed data when you are in their product's repo; otherwise the live site's public pages. Never real customer data.
Default: A local dev server with seeded demo data. Never real customer data.
Writes: `launch-videos/capture.md`: the URL, which account to use (never its password: the user signs in themselves with `node scripts/capture.mjs --login <url>`), which screens show the product best, and anything that must not appear on screen.
Check: In a test video folder, capture one screen and show it. Look for real names, emails or numbers before going further.

## voice
Since: 0.8.0
Ask: For product demos: should the narration be your own recording, or a generated voice? If generated, describe the voice (or name one you like), and the language.
Infer: Use the default.
Default: A generated voice from the wallet, calm and plain, in English. Filmed videos always use the camera's own audio.
Writes: `launch-videos/narrate.md`: whose voice, the wallet tool and voice id once chosen, the language, and pronunciations (product and people's names).
Check: Quote one line with the chosen tool, then generate it once they agree, place it in a test video and measure its loudness.

## sound
Since: 0.8.0
Ask: Music under the videos: none, a track you give the agent, a generated track from the wallet, or the platform's own library at upload? How much may one video spend on generated voice, music and sound without asking you?
Infer: Use the default; paid sound waits for their spending yes.
Default: No music (the voice and soft whooshes only), and ask before any paid generation.
Writes: `launch-videos/sound.md`: the music choice and where the tracks live, the spending limit per video, and sounds to avoid.

## generated
Since: 0.11.0
Ask: For generated videos, do you want a new presenter, your existing character, or a remake of a reference video? Should it use a stock/generated voice, your recording, or an authorized saved clone? What may one video spend, and which reference files may the selected service receive?
Infer: Use the default; the budget is asked once, with a quote, when paid generation is first needed.
Default: Keep the user’s chosen assets and spending limits. Ask for a total budget before paid generation when none is already set. Keep recordings and rendered media local; upload only the selected references needed for the requested generation.
Writes: `launch-videos/generate.md`: preferred input and output constraints, permitted reference handling, saved character/voice labels and a per-video spending limit. Private recordings, access URLs and account-scoped voice records stay in the video project.
Check: Reuse the user’s current request as the example. Resolve a public tool and quote one representative shot before generating it. An unavailable voice or video route remains a stated blocker.

## presenter
Since: 0.11.0
Ask: For generated videos: do you have a presenter and a voice you always use, or should each video offer a few looks? Any image or video model you prefer, and anyone or anything a presenter must never look or sound like?
Infer: Use the default.
Default: No standing presenter. Each video offers five to eight looks described in words, taken from the trending pull's `trending/presenter-candidates.md` when it exists, and the user picks. The pick is made on two image models and shown side by side. Never a real person's face or voice.
Writes: `launch-videos/character.md`: the standing presenter's description and where their image is kept, the voice and how it was chosen, preferred models, and what to avoid. Not one video's hook or reference: those go in its brief.
Check: Generate one still of the presenter and read the description back.

