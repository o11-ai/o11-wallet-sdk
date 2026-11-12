---
summary: How first messages are written.
used_by: [outbound]
changed: 0.8.0
change: Templates are template-*.md files in each audience. The ones in use split new people evenly (an A/B test), paused ones are skipped, and the record keeps the version id each person got.
---
Write each first message for one person, from their research notes, in the user's voice (`voice.md`). Read the outbound skill's `references/writing.md` first: every message has to look like a person spent real time on this one recipient.

Templates: `o11 ostack context gtm/write` (with `--audience` for an audience other than default) lists the audience's `templates` in use, each with its `version_id` and `weight` (1 unless its file sets `weight:`), and any `paused_templates`, which are never sent. With one in use, use it. With two or more (`ab_test: true`), give each person one at random in proportion to the weights (an even split by default), so the split stays fair across runs and teammates; never pick by who seems a better fit. Record the chosen `version_id` as the person's `o11_template` (the record step). Follow the template you picked, filling every open part from real research. A template written in this step's file (the way 0.7 kept them) works the same way, without an id. With no template in use, use the default shape.

Default shape when there is no template:
1. **Opening:** one or two sentences built on an observed fact, tied to a task or decision the reader has.
2. **Offer:** one sentence from `company.md`, in the reader's terms: the outcome, not the internals.
3. **Ask:** exactly one, the ask from `company.md`.
4. **Signature:** exactly as the user gave it.

Emails get a short, specific subject a colleague might write. Never fake `re:` or `fwd:`. LinkedIn notes and messages are one or two lines with no signature.

Before sending, check:
- Every fact comes from a source you read. Unknown pain is asked about, never asserted.
- Swap test: if the message would still work sent to anyone else, it is too generic. Research more or defer the lead.
- Reply test: read it as the recipient. If you would not reply, rewrite it or defer the lead.
- No unfilled placeholders: no brackets, `{{ }}` or `TODO` left in the text. If the template needs something research could not find (a first name, a recent event), defer the lead with the reason rather than guess.
- Without a template, vary openings across a batch; never rotate one shape with noun swaps. With the user's template, keep its fixed words exactly and make what you fill in specific to each person.

For previews and examples, show the company and URL, two sentences on what they do, why they qualify (or what is unconfirmed), then the full message. Previews never send or change any record.
