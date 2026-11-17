# Project state and revisions

Each local video folder keeps these responsibilities separate:

| File or folder | Responsibility |
| --- | --- |
| `ugc/project.json` | Schema version, project and run ID, mode, budget, revision, assets and generation stages |
| `ugc/journal.jsonl` | Durable stage and invocation events |
| `ugc/receipts/` | Retained provider inputs, quotes and o11 receipts |
| `brief.md`, `shoot-plan.md`, `hooks/ledger.json` | Agent-authored brief, the plan holding exactly what each model receives ([spend.md](spend.md)), and the hook patterns, scored hooks and measured results ([hooks.md](hooks.md)) |
| `references/<id>/reference.json`, `references/<id>/style.json` | What a reference video is and how it is edited, written by the `ostack-video-teardown` skill. `references/<id>/source.mp4` stays local and is never uploaded or committed |
| `reference.md` | Hand-written beat sheet, used only when no `reference.json` exists |
| `edit/style.json` | The style this video uses, owned by the `ostack-video-edit` skill |
| `edit/plan.json`, `edit/timeline.js` | The canonical shot plan and the renderer timeline compiled from it |
| `ugc/captions.json`, `edit/captions.js`, `media/words/` | Normalized word timings and visible caption groups |
| `media/` | Local reference, generated, narration, product and brand files |
| `output/` | Prepared footage, preview and final encodes, check and audit results |

Use the runner for project and journal updates. Do not edit invocation IDs, spending totals or pending state by hand. Keep files with sensitive references readable only by the current user.

Read stage states with `node scripts/ugc.mjs status .`. Editorial acceptance is separate from generation or download success, so keep the selected take in the shoot plan. A generation can succeed while its download still needs a retry.

Keep one writer per project while submitting paid work. On recovery, inspect active invocation IDs before another generation. The local run lock and activity summary do not deduplicate across machines and are not a team media library.

The runner hashes each request from its tool, input, wallet selection and the hashes of what it depends on. Declare dependencies with `--depends-on` so a changed character image or voice clip marks the stages that used it stale. A filename alone does not prove an asset is unchanged; the content hash does.

## What a change costs

| Change | Redo |
| --- | --- |
| Caption font, placement, call to action, music level, any `edit/style.json` field | Local render and mix only |
| One narration sentence | That audio, its word timings, and the timing and render segments that depend on it |
| One generated shot's prompt or script | That shot, then its word timings and the composition |
| Character image or voice clip | Only the stages that consume it and what follows from them |
| Export size | Nothing generated. Prepare and render again at the new size |

Save new takes beside accepted ones and make the selected take explicit. A failed retry must not erase the last accepted video. Preserve the original project when creating a variation.

End a handoff with local asset paths, active invocations, outstanding holds, settled spending and the next recoverable action. Signed URLs expire; the retained bytes and receipt IDs are the durable references.

## Assemble and caption

`node scripts/ugc.mjs shots . --file <plan.json>` accepts the canonical plan:

```json
{
  "width": 1080, "height": 1920, "fps": 24,
  "shots": [
    {"id":"presenter", "assetId":"presenter-1", "from":0, "to":6, "mute":true},
    {"id":"cta", "kind":"end", "len":2}
  ],
  "headlines": [],
  "narration": [["presenter",0,"voice"]],
  "music": {"file":"music.wav", "at":0, "from":0}
}
```

A generated stage's asset ID is the stage ID plus `-1`, so stage `presenter` yields asset `presenter-1`. A clip that carries its own speech omits `mute`.

Clip shots also support ordered `keep` ranges and `corner`. A footage-backed end card uses `kind:"end"` with an `assetId`; a plain end card needs `len`. Narration entries are `[shotId, sourceStartSeconds, audioBasename]`; the mixer reads `media/narration/<audioBasename>.wav`. Music files are relative to `media/`. Omitted soundtrack, headlines, dimensions and retained-shot settings inherit the preceding canonical plan; use `narration:[]` or `music:null` to remove them. Every shot named by the soundtrack or a headline must remain on the plan. Unsupported fields are rejected, not dropped. Existing scenes and brand files are preserved.

The runner records the hash of the timeline it writes. It refuses to overwrite manual changes or a timeline it did not write. To migrate manual edits, save a backup outside `edit/timeline.js`, move the supported settings into the canonical plan, then remove the old timeline and compile the plan. Keep a complex timeline manual if its fields are unsupported. Earlier projects without a timeline hash need the same explicit migration.

Removing a shot prunes only its caption group and records `captions_pruned` in the journal. Global output-clock groups remain. Remove a group directly with `node scripts/ugc.mjs captions-remove . --shot <id>`; use `--shot global` for the global group. The original word timing files stay available for reuse.

`node scripts/ugc.mjs captions . --file <words.json> [--asset <id>] [--shot <shot id>]` accepts `{words:[{text,start,end}]}` or Whisper-style `{words:[{word,start,end}]}`. With a shot ID, the timings are source-clock: measured on the accepted, uncut source file, before any timeline trim or cut. Mark those files with `"clock":"source"` and do not take them from prepared shot audio. With `--asset` and no shot ID, the timings belong to that narration audio: they are source-clock, saved as `media/words/<the asset's stored file name>.json` for the mix and its ducking, and add no visible captions. With neither, the timings are output-clock and become the global caption group. The runner keeps the other shots' groups, writes `edit/captions.js` for visible captions, and writes `media/words/<shot id>.json` when a shot was supplied. Run `node scripts/speech.mjs` for the phrase timings the mix uses. Import clip timings with `--shot` so trims and cuts map correctly.

Raw transcriber output can carry spacing entries and zero-length words, which the caption page rejects. The take check in [talking-clip.md](talking-clip.md) writes a cleaned file with real words only, each at least 0.04 s long, already marked `"clock":"source"`.
