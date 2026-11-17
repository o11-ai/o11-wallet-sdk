# The arithmetic

Every number in a report comes from this script's output. Save the block below as `teardown_math.py` in the teardown folder and run it with Python 3.9 or later. It uses the standard library only.

It has two commands. `rank` sorts each channel's posts and marks the top quarter and the bottom half. `moves` finds the inflection in the traffic series and lines dated moves up against growth.

## Files you write first

Routes return different shapes, so copy what you pulled into these plain CSVs. Leave a cell empty when the source did not give the value. Never fill one with an estimate.

| File | Columns | Notes |
| --- | --- | --- |
| `posts.csv` | `channel,url,posted,engagement,kind,title` | `posted` is `YYYY-MM-DD`. `engagement` is the channel's one number from [channels.md](channels.md). Rows from every channel go in one file. |
| `traffic.csv` | `month,visits` | `month` is `YYYY-MM`. One row per month, oldest first, no gaps. |
| `moves.csv` | `date,channel,kind,label,url,reach` | A row for each move that has a date: a launch, a funding round, a post, a video by a creator, the first day of an ad, the first sighting of a loop anchor, the start of a new format. `reach` may be empty. |
| `brand.csv` (optional) | `month,searches` | Brand keyword searches summed per month, as a second demand signal. |

## Commands

```sh
python3 teardown_math.py rank posts.csv --as-of 2026-11-14 --out ranked.csv
python3 teardown_math.py moves traffic.csv moves.csv --posts posts.csv --as-of 2026-11-14 --out moves-vs-growth.csv
```

Add `--brand brand.csv` only when that file exists; a path that does not exist is skipped with a note. `--as-of` is the date the posts were pulled. Both commands print JSON and write the CSV named by `--out`.

## What it computes

**rank.** Posts younger than 7 days on the pull date are left out, since their numbers are still moving. Within each channel, posts sort by engagement. The top quarter is the first `n // 4` posts and the bottom half is the last `n // 2`. A channel with fewer than 20 settled posts gets tier `none` on every row and `"pattern": false`: report the posts and call no pattern. The summary also gives posts per week and the median gap in days between posts.

**moves.**

- Growth is the month-over-month change in visits, in percent. Acceleration is this month's growth minus last month's.
- The inflection is the month with the largest step up that held. For each month the script divides the mean of that month and the next two by the mean of the three months before. A step counts only when each of those three months is above every one of the three before and the ratio is at least 1.25. With no such month, `inflection` is null and the report says the series shows no sustained step.
- Moves less than 31 days apart join one cluster. Lift belongs to the cluster. Never credit one move inside it. A cluster longer than 92 days is marked `dense`: the moves are too close together to separate, so report it as a period.
- Lift is mean growth in the cluster's first month and the two after, minus mean growth in the two months before. It is given for traffic and, when `brand.csv` exists, for brand searches. A cluster too close to either end of the series has an empty lift.
- Spread speed is engagement divided by days since posting, ranked inside the channel. The top quarter are fast spreaders. Channels under 20 posts get none.
- Per channel, the script counts moves per month and correlates the counts with growth in the same month, one month later and two months later (Spearman, ties averaged). With fewer than 12 months of growth or fewer than 5 moves on the channel, `correlation` is null: list the moves and call no correlation.

Lift and correlation are observed numbers. That a move caused the growth is inferred: the data is monthly, moves overlap, and growth has other causes. Say so next to every lift you report.

## The script

```python
#!/usr/bin/env python3
"""Arithmetic for a growth teardown: rank posts, and line moves up against growth."""
import argparse, csv, json, os, statistics, sys
from datetime import date

def read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]

def write(path, rows, cols):
    with open(path, "w", newline="", encoding="utf-8") as f:
        out = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        out.writeheader()
        out.writerows(rows)

def num(text):
    try:
        return float(text)
    except ValueError:
        return None

def r2(value):
    return None if value is None else round(value, 2)

def month_index(month):
    return int(month[:4]) * 12 + int(month[5:7]) - 1

def ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    out, i = [0.0] * len(values), 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            out[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return out

def spearman(xs, ys):
    if len(xs) < 3:
        return None
    rx, ry = ranks(xs), ranks(ys)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    sx = sum((a - mx) ** 2 for a in rx) ** 0.5
    sy = sum((b - my) ** 2 for b in ry) ** 0.5
    if sx == 0 or sy == 0:
        return None
    return sum((a - mx) * (b - my) for a, b in zip(rx, ry)) / (sx * sy)

def settled(posts, as_of):
    """Posts with a date and a number, at least 7 days old, grouped by channel, best first."""
    groups = {}
    for post in posts:
        value = num(post.get("engagement", ""))
        try:
            age = (as_of - date.fromisoformat(post.get("posted", "")[:10])).days
        except ValueError:
            continue
        if value is None or age < 7:
            continue
        groups.setdefault(post["channel"], []).append({**post, "engagement": value, "age_days": age, "per_day": value / age})
    for rows in groups.values():
        rows.sort(key=lambda row: row["engagement"], reverse=True)
    return groups

def rank(args):
    as_of = date.fromisoformat(args.as_of)
    out, summary = [], {}
    for channel, rows in sorted(settled(read(args.posts), as_of).items()):
        n, enough = len(rows), len(rows) >= 20
        for i, row in enumerate(rows):
            row["rank"] = i + 1
            row["tier"] = "none" if not enough else "top" if i < n // 4 else "bottom" if i >= n - n // 2 else "middle"
        days = sorted(date.fromisoformat(row["posted"][:10]) for row in rows)
        gaps = [(b - a).days for a, b in zip(days, days[1:])]
        span = max((days[-1] - days[0]).days, 1)
        summary[channel] = {
            "settled_posts": n, "pattern": enough, "top": n // 4 if enough else 0, "bottom": n // 2 if enough else 0,
            "first": str(days[0]), "last": str(days[-1]),
            "posts_per_week": r2(n / (span / 7)), "median_gap_days": statistics.median(gaps) if gaps else None,
            "median_engagement": statistics.median(row["engagement"] for row in rows),
        }
        out += rows
    write(args.out, out, ["channel", "rank", "tier", "engagement", "per_day", "age_days", "posted", "kind", "title", "url"])
    print(json.dumps({"as_of": args.as_of, "channels": summary, "written": args.out}, indent=2))

def growth_series(rows, field):
    months = [row["month"][:7] for row in rows]
    values = [num(row[field]) for row in rows]
    steps = [month_index(b) - month_index(a) for a, b in zip(months, months[1:])]
    if any(step != 1 for step in steps) or any(value is None for value in values):
        sys.exit(f"{field}: months must be consecutive, oldest first, with a number in every row")
    growth = [None] + [None if a == 0 else (b - a) / a * 100 for a, b in zip(values, values[1:])]
    return months, values, growth

def find_inflection(months, values):
    best = None
    for i in range(3, len(values) - 2):
        before, after = values[i - 3:i], values[i:i + 3]
        if min(after) <= max(before) or statistics.mean(before) == 0:
            continue
        ratio = statistics.mean(after) / statistics.mean(before)
        if ratio < 1.25:
            continue
        if best is None or ratio > best["ratio"]:
            best = {"month": months[i], "ratio": r2(ratio), "before_mean": round(statistics.mean(before)), "after_mean": round(statistics.mean(after))}
    return best

def lift(months, growth, month):
    if month not in months:
        return None
    i = months.index(month)
    before, after = growth[max(i - 2, 0):i], growth[i:i + 3]
    if i < 3 or len(after) < 3 or None in before or None in after:
        return None
    return statistics.mean(after) - statistics.mean(before)

def moves(args):
    months, values, growth = growth_series(read(args.traffic), "visits")
    accel = [None if a is None or b is None else b - a for a, b in zip([None] + growth, growth)]
    brand = growth_series(read(args.brand), "searches") if args.brand and os.path.exists(args.brand) else None
    rows = sorted((row for row in read(args.moves) if row.get("date")), key=lambda row: row["date"])
    clusters = []
    for row in rows:
        day = date.fromisoformat(row["date"][:10])
        if clusters and (day - clusters[-1]["last"]).days < 31:
            clusters[-1]["rows"].append(row)
            clusters[-1]["last"] = day
        else:
            clusters.append({"first": day, "last": day, "rows": [row]})
    inflection = find_inflection(months, values)
    out, summary = [], []
    for n, cluster in enumerate(clusters, 1):
        month = cluster["first"].isoformat()[:7]
        traffic_lift = lift(months, growth, month)
        brand_lift = lift(brand[0], brand[2], month) if brand else None
        dense = (cluster["last"] - cluster["first"]).days > 92
        timing = "" if not inflection else "before" if month < inflection["month"] else "at" if month == inflection["month"] else "after"
        summary.append({"cluster": n, "first": str(cluster["first"]), "last": str(cluster["last"]), "moves": len(cluster["rows"]),
                        "channels": sorted({row["channel"] for row in cluster["rows"]}), "dense": dense,
                        "traffic_lift_pts": r2(traffic_lift), "brand_lift_pts": r2(brand_lift), "vs_inflection": timing})
        for row in cluster["rows"]:
            out.append({**row, "cluster": n, "cluster_moves": len(cluster["rows"]), "dense": dense,
                        "traffic_lift_pts": r2(traffic_lift), "brand_lift_pts": r2(brand_lift), "vs_inflection": timing})
    known = [(m, g) for m, g in zip(months, growth) if g is not None]
    channels = {}
    for channel in sorted({row["channel"] for row in rows}):
        mine = [row for row in rows if row["channel"] == channel]
        counts = {m: 0 for m in months}
        for row in mine:
            if row["date"][:7] in counts:
                counts[row["date"][:7]] += 1
        entry = {"moves": len(mine), "correlation": None}
        if len(known) >= 12 and len(mine) >= 5:
            entry["correlation"] = {}
            for lag in (0, 1, 2):
                pairs = [(counts[months[i - lag]], growth[i]) for i in range(lag, len(months)) if growth[i] is not None and growth[i - lag] is not None]
                entry["correlation"][f"lag_{lag}"] = {"rho": r2(spearman([p[0] for p in pairs], [p[1] for p in pairs])), "months": len(pairs)}
        channels[channel] = entry
    fast = {}
    if args.posts:
        for channel, posts in settled(read(args.posts), date.fromisoformat(args.as_of)).items():
            if len(posts) < 20:
                fast[channel] = None
                continue
            by_speed = sorted(posts, key=lambda post: post["per_day"], reverse=True)[:len(posts) // 4]
            fast[channel] = [{"url": post["url"], "posted": post["posted"], "per_day": r2(post["per_day"])} for post in by_speed]
    write(args.out, out, ["cluster", "cluster_moves", "dense", "date", "channel", "kind", "label", "url", "reach", "traffic_lift_pts", "brand_lift_pts", "vs_inflection"])
    ranked = sorted((c for c in summary if (c["traffic_lift_pts"] or 0) > 0), key=lambda c: c["traffic_lift_pts"], reverse=True)
    print(json.dumps({
        "months": len(months), "first": months[0], "last": months[-1], "inflection": inflection,
        "growth_pct": {m: r2(g) for m, g in zip(months, growth)}, "acceleration_pts": {m: r2(a) for m, a in zip(months, accel)},
        "clusters": summary, "largest_lift": [c["cluster"] for c in ranked[:3]], "channels": channels, "fast_spreaders": fast,
        "brand_used": brand is not None, "note": "Lift and correlation are observed. Cause is inferred.", "written": args.out,
    }, indent=2))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    a = sub.add_parser("rank")
    a.add_argument("posts"); a.add_argument("--as-of", required=True); a.add_argument("--out", default="ranked.csv")
    a.set_defaults(run=rank)
    b = sub.add_parser("moves")
    b.add_argument("traffic"); b.add_argument("moves"); b.add_argument("--brand"); b.add_argument("--posts")
    b.add_argument("--as-of", default=str(date.today())); b.add_argument("--out", default="moves-vs-growth.csv")
    b.set_defaults(run=moves)
    args = parser.parse_args()
    args.run(args)

if __name__ == "__main__":
    main()
```

## Reading the output

- `inflection.month` is the month the step began. `ratio` is the three-month mean after divided by the three-month mean before.
- `clusters[].traffic_lift_pts` is in percentage points of monthly growth. Report the clusters in `largest_lift` (up to three, positive lifts only), each with its moves, dates and links.
- `vs_inflection` says whether a cluster started before, at or after the inflection month. Moves that started before it carry more weight when you order plays.
- A channel leads growth when its `lag_1` or `lag_2` rho is clearly above its `lag_0`. Report rho with the number of months it rests on.
- A fast spreader whose cluster shows no lift is a post that travelled while growth stayed flat. List those too.
