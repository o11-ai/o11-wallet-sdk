import { integer, required, type Args } from "../../lib/args.js";
import { parseCsv, toCsv } from "../../lib/csv.js";
import { OstackError } from "../../lib/errors.js";
import { print } from "../../lib/output.js";
import { fetchHome, label, websiteDomain } from "./homepage-check.js";

/**
 * `o11 ostack gtm tam check <in.csv> <out.csv>`: a free first pass over a TAM list. Fetches each homepage and adds
 * check (b2b | consumer | services | unsure | parked | dead | no_domain), check_title and check_signals to every row.
 * Rows with no usable domain (blank, malformed, or a free mailbox such as gmail.com) are never fetched and get no_domain.
 * Labels are a cheap hint, not a verdict: only clear misses should become `skip`.
 */
export async function tamCommand(args: Args): Promise<void> {
  if (args.positionals[1] !== "check") throw new OstackError("unknown_command", "Use: o11 ostack gtm tam check <in.csv> <out.csv> [--concurrency 48].");
  const input = args.positionals[2] ?? required(args, "in");
  const output = args.positionals[3] ?? required(args, "out");
  const concurrency = Math.min(integer(args, "concurrency", 48), 128);
  const file = Bun.file(input);
  if (!(await file.exists())) throw new OstackError("file_not_found", `No file at ${input}.`);
  const rows = parseCsv(await file.text());
  if (rows.length > 0 && !("domain" in rows[0]!)) throw new OstackError("invalid_input", "The CSV needs a domain column.");
  let next = 0;
  const counts: Record<string, number> = {};
  async function worker(): Promise<void> {
    while (next < rows.length) {
      const row = rows[next++]!;
      const domain = websiteDomain(row.domain);
      const result = domain ? label(await fetchHome(domain)) : { check: "no_domain", title: "", signals: "" };
      Object.assign(row, { check: result.check, check_title: result.title, check_signals: result.signals });
      counts[result.check] = (counts[result.check] ?? 0) + 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  await Bun.write(output, toCsv(rows));
  print({ rows: rows.length, written: output, ...counts });
}
