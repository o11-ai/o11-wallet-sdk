# Variants

A variant is a copy of an accepted video with exactly one thing changed: the hook line, the character, the product clip or the language. Everything else is reused, so nothing is bought twice.

There is no batch command. Each variant is its own folder, its own runner calls and its own take checks, made one at a time. Ten variants are ten passes through this page. Say so when a user asks for "a hundred versions", and make one variant first.

## What each change costs

| Change | Generate again | Reuse |
| --- | --- | --- |
| Hook line | The one talking clip that speaks the hook. Make the hook its own shot of about 3 s so this is the only cost. In a text-over-footage format the hook is text, so nothing is generated | Character image, voice clip, every other clip, product footage, style, music |
| Character | Every talking clip, from a new character image | Script, voice clip if the voice still fits, product footage, style, music |
| Product clip | Nothing | Every generated clip. Register the new recording and render again |
| Language | Every talking clip, with a translated script and a voice clip in that language | Character image, product footage, style, music |

Speech in a language other than English is untested on both talking-clip routes. Make one clip and have a speaker of that language play it before the rest.

Change one thing per variant. A variant with a new hook and a new character cannot tell you which change moved the result.

## Make a variant

1. **Name it.** `<video>-<what>-<value>`: `bottle-hook-b`, `bottle-character-2`, `bottle-lang-es`. The name states the one change. A hook variant made in a round of the hook loop takes the ledger's hook ID: `bottle-hook-r1-h3` ([hooks.md](hooks.md)).
2. **Create the folder and project.** `o11 ostack launch-videos new <name> --format ugc`, then `node scripts/ugc.mjs init . --mode talking-head --budget-micros <approved total> --card <card>`. A new project has its own ID and its own ledger. Do not copy `ugc/project.json`, `ugc/journal.jsonl` or `ugc/receipts/` from the original: two folders sharing one project ID break the one-writer rule.
3. **Copy what you wrote.** `brief.md`, `shoot-plan.md`, `references/`, `edit/style.json`, `edit/plan.json` and the request files in `ugc/requests/`. At the top of the copied `shoot-plan.md`, record the original folder, the one change, and each reused asset with its invocation ID.
4. **Bring in every accepted asset.** Two ways, neither of which buys anything:

   - `attach` adopts an existing generation by its invocation ID. It reads the saved receipt and downloads the file again. Use the same stage ID as the original so asset IDs match. The invocation ID is in the original folder's `node scripts/ugc.mjs status .`.

     ```bash
     node scripts/ugc.mjs attach . --stage <same stage id> --invocation <invocation id>
     ```

   - `ingest` registers a local file. Use it for files the user supplied, and for a generated clip whose link has expired. Give it the asset ID the shot plan expects, which is the stage ID plus `-1`.

     ```bash
     node scripts/ugc.mjs ingest . --file <original folder>/media/clips/<file>.mp4 --role reference --id <stage id>-1
     ```

   Prefer `attach` while the link is alive: the variant then carries the receipt. A provider link lasts about 24 hours and a saved copy 7 days ([spend.md](spend.md)), so after that, `ingest` the local bytes. Never run `generate` to "restore" an accepted clip.
5. **Make the one change.** Edit `shoot-plan.md`, write the changed request files, and generate only the stages the table above lists. Give a changed shot a new stage ID, such as `hook-b`, so the original stays beside it.
6. **Check and assemble** as for any video: take checks on each new clip, `shots`, `captions`, render.

`attach` is proven: on 13 November 2026 it adopted an existing invocation into a project and downloaded its clip with no new charge. The `ingest` path ran in a local test: a clip registered as `presenter-1` in a fresh project was accepted by `shots`. Bringing a whole multi-shot video into a second folder has not been run.

An attached stage records the original charge, and the runner counts it as spent in the variant's ledger. Set the variant's budget to the reused charges plus the new work, and report new spending by invocation ID. Adding up folder totals counts reused clips twice.

## Compare variants

Keep one table in the original folder's `shoot-plan.md`:

| Variant | The one change | New stages | New spend | Take checks | User's verdict |
| --- | --- | --- | --- | --- | --- |
| `bottle-hook-b` | Hook: "..." | `hook-b` | $1.00 | 228 wpm, tail 0.2 s, no missing words | |

Put the same frame of each variant side by side in one strip, and give the user the files to play. Which one is better is their call, or the audience's once they are published. The checks only show that each variant is sound.
