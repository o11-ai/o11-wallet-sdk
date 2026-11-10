---
summary: Build and grow the list of every company that might fit, so find always has fresh companies to work.
used_by: [outbound]
changed: 0.6.0
change: The list lives in the user's own tool next to the people, with an owner per company.
---
The TAM is a list of companies, not people. It is where companies come from, not a verdict on them. Every company still goes through qualify before anyone there gets a message, so a few wrong rows are fine. Never loosen qualify to make up for a noisy list.

The list lives in the user's own tool, next to the people (a companies object, table or tab in the tool the record step names), unless the tam note (`gtm/tam.md`) names another place. With neither, use `tam.csv` in the workspace and say so. The tam note also holds the source, the budget and how far the last pull got.

Before pulling, read the outbound skill's `references/tam-sources.md` for the source you pick. It has the filters that work and the traps found in real builds.

## The list
One row per company. Fields: `id, domain, name, location, source, source_id, size, pulled_at, status, owner, note`. Use the tool's own company fields where they exist.
- `id` is the registry ID when the source has one (FDIC cert, USDOT, NPI, permit number). Otherwise it is the bare domain, lowercase, with no `www.`.
- `source` names every source that returned the row, joined with `+`. Overlap between sources is useful evidence.
- `status` is blank until find takes the company, then `taken`, with the teammate who took it as `owner`. It is `skip` when the user, the homepage check or qualify ruled the company out, with the reason in `note`.
- Append only new IDs and never delete rows. The list is also the record of what was already pulled.


## Pick the source
Use the first of these that fits the ICP, and combine sources when one covers only part of it:
1. **A public registry**, when the ICP is licensed or regulated (banks, carriers, pharmacies, plants, breweries, advisers, nonprofits, contractors). Read the field definitions before filtering.
2. **A public directory** that lists the segment (accelerator portfolios, marketplaces, associations, exhibitor lists).
3. **Maps search by ZIP code** for local businesses (o11 wallet).
4. **A company database** for firm types such as startups, SaaS, agencies and PE firms (o11 wallet; Hunter's discover is free). Its tags are often wrong, so treat every row as a candidate only.
5. **Semantic web search** for descriptive niches (o11 wallet). Stop when a new query adds under 5% new domains.

When using the o11 wallet: discover for current tool IDs, quote, then invoke with a `maxCostMicros` ceiling. Prefer free sources. Before a pull, tell the user the expected size and cost, and stay within the note's budget.

## Check the pull before saving it
- **Wrong filter:** show the user the total and 10 random rows, and ask whether they look right. Most bad lists come from a wrong filter or a bad source. In a scheduled run, save and flag it in the report.
- **Fit:** for non-registry sources, run `o11 ostack gtm tam check <in.csv> <out.csv>` over new rows. Mark only clear misses (dead, parked, and labels that contradict the ICP) as `skip`, and keep anything unsure. Deep checks belong to qualify, one company at a time.
- **Coverage:** before calling a list full, check how many of a known set of real fits it contains (a directory, a registry or the user's customers). If it's under about 70%, find which filter drops them and add a second, independent pull.

## Grow it
- **Full TAM:** pull the whole source once. Then re-pull about monthly for new IDs, new areas or new queries, and retry rows skipped as dead.
- **Just in time:** pull only enough for about two weeks of find, and continue next time.

Either way, write where the pull stopped in the tam note under `## Progress` (offset, last state or ZIP, queries used), so the next run continues instead of repeating.

Finish with one line: rows added, total rows, untaken rows left, coverage if measured, cost.
