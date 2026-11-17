# Generation, the runner and receipts

The default routes are in [talking-clip.md](talking-clip.md), [character-image.md](character-image.md), [voice.md](voice.md) and [recreate.md](recreate.md). This file covers the runner that pays for them and what to do when the defaults do not fit.

## Confirm the route before paying

Run `o11 inspect '<route>' --detailed` before the first call to a route in a project. Check the input fields and their exact spelling, the reference limits, the duration and resolution choices, the price, and `effect`. The contract wins over this skill when they differ.

No route publishes a reviewed output contract, so the result fields named in this skill come from the runs of 13-14 November 2026. Read the first receipt of a route before building on its fields.

When a default does not fit, search for one capability at a time with `o11 discover "<capability>"`: image generation, reference video, image-to-video, audio-driven video, speech with timestamps, transcription, forced alignment or media upload. Use a provider filter when the user chose one. A catalog entry that `o11 inspect` cannot resolve is not an option.

Choose on input fit first: the route must accept the references the shot needs and return the output it needs. Then compare the cost of a whole usable shot and how much editing freedom the result leaves. Do not silently replace a model or account the user named. A cheaper video without the required voice or reference role is not an equivalent offer.

Use the installed CLI's help for current flags. The chain is discover, inspect, quote with the exact input, bounded call, receipt and status, verified local download. Save the quote and request before invoking.

## Runner commands

From the video folder:

```bash
node scripts/ugc.mjs status .
node scripts/ugc.mjs budget . --approved-micros <approved-total>
node scripts/ugc.mjs generate . --stage hook --tool '<route>' --input <provider-input.json> --quote-max-micros <maximum>
node scripts/ugc.mjs generate . --stage hook --tool '<route>' --input <provider-input.json> --approve-max-micros <maximum>
node scripts/ugc.mjs resume . --stage hook
node scripts/ugc.mjs attach . --stage imported-take --invocation <existing-id>
```

Money is whole USD micros: $1.00 is 1000000. Quote route IDs in the shell, because `#` starts a comment.

The runner passes the input file to the wallet as the request's `input`, which is an envelope: `{"body": { ...provider fields... }}`. The request shapes in this skill show the provider fields only, so wrap them for the runner:

```json
{ "body": { "prompt": "<prompt>", "media": [{ "type": "first_frame", "url": "<signed URL>" }], "resolution": "720p", "duration": 5 } }
```

`o11 call --input` takes the same fields unwrapped. Both forms are proven on different calls: the wrapped form on the one clip generated through the runner, the unwrapped form on the calls made with the CLI directly.

Pin the selected wallet card with `init --card <id>`, or adopt an existing invocation with `attach`, before paid submission. `--quote-max-micros` bounds a quote without authorizing submission; some variable-price tools require this bound. Without an approval maximum, `generate` quotes and stops. The approved call spends only within that maximum and the remaining project budget. Reuse the user's existing budget authorization; work they already approved needs no second prompt. A stage ID names one logical operation, such as `hook` or `hook-words`. `plan` is read-only and creates no paid stage.

`--depends-on <id,id>` records which assets or stages a stage consumes, so changing one marks its dependents stale.

For a provider account the user selected, add `--credential-mode customer --connection <selected-id>` to `generate`. The runner pins that account in the quote, the saved invocation and the request identity; later calls on that stage keep the saved account unless a change is requested. It never falls back to a platform account. A zero o11 charge in customer mode can still consume the provider account's credits, so keep the user's supplier budget as well as the o11 run ceiling.

For a response that is data, not media, add `--result-kind data`. The runner then saves the structured result under the stage's `dataPath` and does not try to download it. A transcript is recognized and saved as data without the flag. To recover a data response first collected as media, use `attach . --stage <same-stage> --invocation <saved-id> --result-kind data`; this reads the existing receipt and makes no paid call. An invocation can be tracked under only one stage. Resume an adopted stage; use a new stage ID for a deliberate replacement generation. Omitted account and dependency flags keep a generated stage's saved selection and dependency graph. Media stages require a downloadable asset; a response with no supported media link remains a collection error.

## Durable job protocol

1. Choose a stable stage ID for the logical shot and keep its exact provider input. The runner records the project run, request identity and provider receipt.
2. Let the runner save the request and quote before calling. Do not patch pending state by hand.
3. A submit returns an invocation ID before the result is ready. In the one clip generated through the runner in these checks, the submit returned in 2 seconds and the result arrived five minutes later, on the third `resume`. Follow a submit with `resume`, or with `o11 status <id> --wait` outside the runner. Submitting again is not polling.
4. The request hash covers every byte of the input, signed links included. Running `generate` on a submitted or succeeded stage with a refreshed link is a new request and a new charge. Use `resume` to follow or re-collect. Refresh a link only for a stage that has not been submitted.
5. If transport fails without an ID, reconcile run history or retry the unchanged request with the same saved idempotency key; `resume` does this. A confirmed provider failure, a changed request or a deliberate new variation is a new attempt.
6. On success, download and verify the asset. On failure, keep the receipt, the settled cost and the reason. A charged but unusable output stays charged in the project ledger until a refund is recorded.

The local ledger counts tracked invocations. A shared o11 run may carry other charges, and the server enforces its full ceiling. Before each new attempt, work out the remaining approved spending after settled costs and active holds. Re-quote changed inputs. Never raise the project ceiling to recover a failure. A timeout may leave a billable job running; reconcile it before trying another route.

## Voices across shots

Voice design, sampled speech and speech-to-speech are different jobs. Voice design starts from a description. Sampled speech imitates a supplied recording for one call. Speech-to-speech turns a performance into an existing target voice. None of them leaves a reusable saved voice on the public catalog today ([voice.md](voice.md)).

For any voice made from a recording, record the source audio's hash and the permission basis in the local project. If a saved-voice route becomes public, its resource key is workspace, provider, account and voice ID; check that the voice is ready before generating speech, and never pass one provider's voice ID to another provider.

Keep one voice, one pronunciation and the same synthesis settings across shots. Prefer word timestamps returned with the audio, or align the accepted audio to the exact script. Changing text invalidates its audio and timings. Changing caption styling does not.

## Reference storage

Host references through the workspace file store as [spend.md](spend.md) describes. Check the returned link's file type, size and expiry. Record who can read the file and the shortest lifetime the pending job needs. Keep a local byte-identical copy of every source and output.

Resolve a fresh signed link shortly before the stage's first submit, never after. Keep provider IDs separate from o11 IDs in the project.

A file-page link is not a fetchable media URL. A provider that receives HTML where it expected image, audio or video bytes may fail after submission. Fetch and probe the link before paid generation when unsure.

Do not change the account selection, start a new storage subscription, widen sharing or publish reference media to an unrelated host to make a generation go through.
