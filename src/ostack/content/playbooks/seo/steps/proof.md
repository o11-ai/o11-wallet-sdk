---
summary: Keep the team's facts and first-hand proof in one place, and update every page when a fact changes.
used_by: [growth]
changed: 0.13.1
change: First release. A sourced brand facts file, proof cards and a page-to-proof index; route-fact updates every page that uses a fact; a check of new commits for stale facts; [NEEDS PROOF] markers and founder questions instead of invented numbers.
---
Pages that rank and get cited by AI answers carry facts a competitor cannot copy: the team's own tests, customer
results, screenshots and numbers. Keep each fact once, with its source, and build pages from it. Never invent a number,
customer, quote or result to fill a gap.

The proof lives beside the content plan (default `seo-proof/`), in the team's repo or docs:
- **`facts.md`:** what the product does and how (mechanics, not adjectives), plans and prices, limits, supported tools,
  and what it does not do. Each line names its source (a file in their repo, a URL, or who confirmed it) and the date
  checked. Anything not confirmed is marked `[UNVERIFIED]` and never goes on a page.
- **Proof cards** (`cards/<id>.md`), one fact or test per file: an id, its category, the date, the topics it supports,
  its source, and one sentence a page can reuse. A rerun of a test gets a new dated id that says which card it
  supersedes; the old card stays, marked superseded, so the history is still citable.
- **`pages.md`:** every published or planned page with its URL, its search, the fact and card ids it uses, and how many
  of the five categories it covers. route-fact reads this to find which pages a fact touches.

The five categories of proof:
1. Tests and benchmarks the team ran, with the method.
2. Customer outcomes, with a before and after the customer agreed to share.
3. Real screenshots or short videos of the product doing the job.
4. The team's own aggregate numbers (across their customers or usage), with the period.
5. Practitioner notes: a failure, edge case or setting that only someone who did the work would know.

**Before writing.** List the cards that fit the piece. A long page (1,200 words or more) aims for 4 of the 5
categories; one kind of claim repeated five times still reads as thin. Open with the sharpest fact when it answers the
search. Add the page to `pages.md` with its card ids before it ships.

**Gaps.** When a fact is missing, write `[NEEDS PROOF: <question>]` in the draft where it belongs and ask the founder
3 to 5 short questions, each answerable with one number, one customer result or one edge case. Save the questions to
`seo-proof/open-questions.md` and the answers as new cards. A draft with an open marker goes out only as a draft or a
pull request that says it is waiting on proof, never live. In a scheduled run, leave the questions in the report.

**route-fact: when a fact changes.** A new price or plan, a changed limit, a rerun test or a new customer result:
1. Update `facts.md` or add the new card (superseding the old one).
2. Find every page that depends on it: the rows in `pages.md`, plus a plain text search of the site's content for the
   old value and the old card id (pages outside the index still quote it). Open each hit and confirm it is the same
   fact; the same number can measure something else. Note skipped hits in `pages.md` so the next run skips them too.
3. Rewrite each match for its page; never paste one sentence into several pages. Change a page's updated date only
   when a fact on it changed.
4. Publish every touched page in one change (one pull request or one set of drafts) and update `pages.md`.

**Stale fact check, every growth run.** Read the site repo's commits since the last run (the date is in the content
plan) for changes to pricing, plans, limits, features or integrations, and compare `facts.md` with the live pricing
page. When a fact changed, run route-fact for it before writing anything new, and list each stale fact in the report
with the pages it touched. Without access to the repo, compare with the live pages only and say so.
