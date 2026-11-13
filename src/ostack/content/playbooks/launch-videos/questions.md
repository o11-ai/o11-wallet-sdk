# launch-videos setup questions

Asked by the ostack-setup skill when the launch-videos playbook is enabled; their ids are `launch-videos/<id>`. Each `## <id>` section is one topic. `Since` is the release that added it. Releases may add sections, but never rename or remove an id.

These are the team's: an owner or admin answers them once, and their files are team files (`o11 ostack files write <path>`). "Writes" names the file path.

Together these files are the team's brand kit, and the brand kit holds only what is true for every video. Anything about one video (its audience, takeaway, story, screens, length or budget) belongs in that video's brief in o11, never in these files.

## brand
Since: 0.8.0
Ask: What's the product called, and what should the last line of every video say (the one call to action, such as "Try it free at acme.com")? Where are your logo mark (SVG or PNG) and your font file? Is there a design.md or brand guide in your repo I should follow?
Default: The name and offer from `company.md`; colors, fonts and style rules from a `design.md` (any case), brand guide or theme file in the repo when there is one; the system font when there's no font file.
Writes: `launch-videos/brand.md`: the name exactly as written, the call to action in their words, where the mark and font files are, and the design every video follows: colors, fonts and weights, and style rules (corners, motion, what to avoid), each with where it came from.
Check: Read the end card's two lines back to them. Confirm the mark and font files open.

## formats
Since: 0.8.0
Ask: Which videos do you want: launch films (people talking to camera), reels (one selfie clip, vertical), product demos (your app on screen), or a mix? Where will they be posted, and how long should they be?
Default: Launch films at 1920×1080 for posts and sites, 30 to 90 seconds; reels at 1080×1920 for Reels, Shorts and TikTok, under 45 seconds.
Writes: `launch-videos/deliver.md`: for each format they make, its size, usual length and where it is posted, and where review cuts go (default: the user's Downloads). Defaults per format only; one video's length goes in its brief.

## story
Since: 0.8.0
Ask: Anything your videos must always or never say (claims, competitors, prices), and words you prefer for your product?
Default: From `company.md`: one idea per video, said in the founder's own words.
Writes: `launch-videos/script.md`: words to use and avoid, claims that need proof, and anything always or never said. Not one video's audience or takeaway: those go in its brief.
Check: Draft five headlines for a recent launch and ask which sound like them.

## product
Since: 0.8.0
Ask: For product demos: where can I open the product (a local dev server, staging, or the live app), and is there a demo account with demo data I can show?
Default: A local dev server with seeded demo data. Never real customer data.
Writes: `launch-videos/capture.md`: the URL, which account to use (never its password: the user signs in themselves with `node scripts/capture.mjs --login <url>`), which screens show the product best, and anything that must not appear on screen.
Check: In a test video folder, capture one screen and show it. Look for real names, emails or numbers before going further.

## voice
Since: 0.8.0
Ask: For product demos: should the narration be your own recording, or a generated voice? If generated, describe the voice (or name one you like), and the language.
Default: A generated voice from the wallet, calm and plain, in English. Filmed videos always use the camera's own audio.
Writes: `launch-videos/narrate.md`: whose voice, the wallet tool and voice id once chosen, the language, and pronunciations (product and people's names).
Check: Quote one line with the chosen tool, then generate it once they agree, place it in a test video and measure its loudness.

## sound
Since: 0.8.0
Ask: Music under the videos: none, a track you have a license for, a generated track from the wallet, or the platform's own library at upload? How much may one video spend on generated voice, music and sound without asking you?
Default: No music (the voice and soft whooshes only), and ask before any paid generation.
Writes: `launch-videos/sound.md`: the music choice and where licensed tracks live, the spending limit per video, and sounds to avoid.
