import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { optional, type Args } from "../../lib/args.js";
import { toCsv } from "../../lib/csv.js";
import { OstackError } from "../../lib/errors.js";
import { print } from "../../lib/output.js";
import { loadLocalWorkspace } from "../../lib/workspace.js";

/**
 * `o11 ostack gtm ledger export`: writes the ledger ostack kept before 0.6.0 (.ostack/gtm.db or ledger.db) to CSV,
 * so the user's own tool can hold that history. Read-only: the database is left as it is.
 */
export async function ledgerCommand(args: Args): Promise<void> {
  if (args.positionals[1] !== "export") throw new OstackError("unknown_command", "Use: o11 ostack gtm ledger export [--out <folder>].");
  const workspace = await loadLocalWorkspace();
  const path = [join(workspace.root, ".ostack", "gtm.db"), join(workspace.root, ".ostack", "ledger.db")].find(existsSync);
  if (!path) return print({ exported: false, reason: "no ledger in this workspace" });
  const db = new Database(path, { readonly: true });
  const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  const all = (sql: string) =>
    db.query<Record<string, unknown>, []>(sql).all().map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, text(value)])));
  // One row per person: their record, how many messages went out, the last one, and what came back.
  const people = all(`
    SELECT l.id, l.audience, l.status, l.name, l.title, l.company, l.domain, l.email, l.linkedin_url, l.source,
           l.reason, l.evidence, l.research, l.fields, l.step AS touches_sent, l.next_due_at, l.defer_until, l.defer_reason,
           (SELECT COUNT(*) FROM attempts a WHERE a.lead_id = l.id AND a.status = 'sent') AS messages_sent,
           (SELECT MAX(a.completed_at) FROM attempts a WHERE a.lead_id = l.id AND a.status = 'sent') AS last_sent_at,
           (SELECT a.thread_id FROM attempts a WHERE a.lead_id = l.id AND a.thread_id IS NOT NULL ORDER BY a.reserved_at DESC LIMIT 1) AS thread_id,
           (SELECT a.status FROM attempts a WHERE a.lead_id = l.id AND a.status IN ('reserved', 'drafted', 'uncertain') LIMIT 1) AS open_message,
           (SELECT GROUP_CONCAT(e.type, '; ') FROM events e WHERE e.lead_id = l.id) AS events,
           l.created_at, l.updated_at
    FROM leads l ORDER BY l.created_at`);
  const messages = all(`
    SELECT a.lead_id, l.email, l.linkedin_url, a.kind, a.step, a.channel, a.status, a.subject, a.body, a.reserved_at, a.completed_at, a.external_id, a.thread_id
    FROM attempts a JOIN leads l ON l.id = a.lead_id ORDER BY a.reserved_at`);
  const optOuts = all("SELECT kind, value, reason, created_at FROM suppressions ORDER BY created_at");
  db.close();
  const out = resolve(optional(args, "out") ?? join(workspace.root, "ledger-export"));
  mkdirSync(out, { recursive: true });
  await Bun.write(join(out, "people.csv"), toCsv(people));
  await Bun.write(join(out, "messages.csv"), toCsv(messages));
  await Bun.write(join(out, "opt-outs.csv"), toCsv(optOuts));
  print({ exported: true, from: path, to: out, people: people.length, messages: messages.length, opt_outs: optOuts.length });
}
