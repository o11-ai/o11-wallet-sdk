# TAM sources

What each source is good for, the filters that work and the traps found in real builds. Read the section for the source you picked.

Contents: registries · maps · company databases · public directories · semantic search · checking coverage · checking fit · o11 wallet practicalities · what to expect

## Registries

Free, close to complete, and the ID makes dedupe exact. The risk is a wrong field, which ships the wrong list without any error.

| ICP | Source | Filter that worked | Trap |
| --- | --- | --- | --- |
| Community banks | FDIC BankFind API | active, assets under the cap, `CB=1` | Without `CB` you get trust companies and bankers' banks (about 2%). |
| Trucking carriers | FMCSA census (Socrata) | `classdef like '%AUTHORIZED FOR HIRE%'`, power units range, state | `carrier_operation='A'` means interstate, not for-hire. It pulls in private fleets and drops intrastate carriers. |
| Pharmacies, providers | NPI registry (NPPES) | taxonomy code, state | About 16% are LTC, home health or clinics, and 16% are under a legal or person name, so look up the trade name. |
| Water and wastewater plants | EPA ECHO | permit type and status | Name duplicates and territories. Dedupe by permit ID and drop territories if they're out of scope. |
| Breweries, distilleries | TTB permit lists | permit type, state | Open Brewery DB is stale: 17–38% of sampled sites were dead or hijacked. |
| Advisers, broker-dealers | SEC Form ADV, FINRA | | sec.gov blocks clients without a contact in the User-Agent. Ask the user before using their email. |
| Credit unions, schools, nonprofits, gov contractors | NCUA, NCES, IRS BMF, SAM.gov | | |

## Maps

For local businesses. One search returns at most about 100 places, so search by ZIP code, not city.
- Dedupe by place ID, then by street address with the suite removed, then by domain. A practice and each of its doctors get separate listings at one address.
- "Multi-location" means two or more distinct addresses on one domain. Before address dedupe, about two-thirds of claimed groups were really one office.
- Drop places with no website. Also drop facebook.com, directories (weence, *near me* domains) and domains attached to an unrelated business.

## Company databases

For firm types with no registry: startups, SaaS, agencies, PE firms, investment banks.

**Hunter discover** (o11 wallet, free):
- Returns 100 rows per page with domain and name only. `offset` stops at 10,000, so split bigger pulls by `headquarters_location.state`, `year_founded` or headcount.
- Tags are wrong often enough to matter. In a check against known YC startups, single filters kept only:

  | Filter | Kept |
  | --- | --- |
  | US | 67% |
  | 1–10 people | 49% |
  | founded 2020+ | 36% |
  | industry list | 61% |

  Stacked together, they kept 15%.
- For "startup", filter on `funding.series` (pre_seed to series_a, other), not `year_founded`. That kept 70% versus 36%, and the two pulls overlapped by only 5%.
- Use headcount one bucket wider than the ICP and let qualify check the real size.
- No field means "B2B". Use broad industries plus `keywords` (any of B2B, SaaS, API, platform, developer tools), then the homepage check.
- To find which filter drops known fits, query `organization.domain: [known fits]` and add one filter at a time.

**Coresignal** (o11 wallet): search is free but returns only IDs, and each record costs credits. Use it for counts, not for building a list.

## Public directories

Often the most accurate source for a segment. Use them both as rows and as the known list for checking coverage.
- **YC:** `https://yc-oss.github.io/api/companies/all.json`, about 6,400 companies. It has `status`, `team_size`, `industry`/`subindustry`, `all_locations` and `batch`. Of active YC B2B companies with 11 or fewer people, about 90% fit.
- Also accelerator portfolios, investor portfolio pages, marketplace and integration directories (an app store listing proves B2B), associations and member lists, and conference exhibitor lists.

## Semantic search

For descriptive niches with no taxonomy, e.g. Exa through the o11 wallet, about $0.01 per 100 results.
- Find the current tool ID with `discover`, because IDs change.
- Run many differently worded queries, and stop when a new query adds under 5% new domains.
- Expect 60% precision and worldwide results, so filter location in the homepage check or in qualify.

## Checking coverage

Before calling a list "full", measure it against a known list of real fits: a directory, a registry or the user's own customers.
- Coverage = known fits found ÷ known fits.
- Under about 70%, look for the filter that drops them (see Hunter above), then add a second, independent pull.
- Report coverage and the estimated full size (rows that fit ÷ coverage), never just the row count.
- In the B2B startup build, coverage of YC went from 15% to 43% after adding the funding-based pull.

## Checking fit

`o11 ostack gtm tam check` fetches every homepage for free and adds `check`, `check_title` and `check_signals`:

```
o11 ostack gtm tam check tam-new.csv tam-checked.csv
```

It runs at about 40,000 domains in 25 minutes. Mark `dead`, `parked`, `consumer` and `services` as `skip` when the ICP is B2B products, with the label as the note. Keep `b2b` and `unsure`. Calibrate on 20 rows before trusting it on a new ICP.

| Label | How often it fit, by hand |
| --- | --- |
| `b2b` | about 70%. The misses are small agencies and consultancies. |
| `unsure` | about 20% |
| `consumer`, `services` | right 9 times in 10 |
| `dead` | about 25% are alive over http or bot-blocked. The note says to retry next pull. |

Then hand-check about 10 rows from each label before showing the user. A model's own check of its work overstated precision by 10–15 points.

## o11 wallet practicalities

- With several cards, pass the card on every call. In the CLI, `--card <id>` goes after the command.
- Cache each call's result by a hash of its input, and reuse the hash as the idempotency key. A rerun then retries only failed pages and never pays twice.
- Check `balance` before paid pulls, and quote the expected size and cost to the user.

## What to expect

| ICP type | Source | Rows that fit | Coverage |
| --- | --- | --- | --- |
| Licensed or regulated | registry | 95–100% once the filter is right | complete |
| Local businesses | maps by ZIP | 35–80% before address dedupe | depends on ZIP coverage |
| Firm types (PE, banks, SaaS) | databases + search | 60–80% | unknown until checked |
| Early startups | databases + directories | about 30% overall, 70% for `b2b` rows | about 40–45% from Hunter + YC |
| Niche DTC brands | semantic search | about 60%, often non-US | saturates near a few hundred |
