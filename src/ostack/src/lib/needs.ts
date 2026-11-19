import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OstackError } from "./errors.js";
import { isRecord } from "./paths.js";

/**
 * What an unattended run could not do without the person: a site sign-in, a tool to connect or reconnect (mail, CRM,
 * calendar), an answer the setup lacks, a choice only they can make. The run records it here and carries on; the
 * person's own agent reads this file (`o11 ostack host status` on a hosted computer), asks them and saves the answer
 * in o11. Each workflow's next run replaces its entries,
 * so nothing stays blocked: a need that was dealt with disappears on the next run, and one that was not comes back.
 */
export const NEEDS_FILE = join(".ostack", "needs.json");
export const NEED_KINDS = ["sign_in", "connect", "question", "choice"] as const;
export type NeedKind = (typeof NEED_KINDS)[number];
export type RunNeed = {
  workflow: string;
  audience: string | null;
  kind: NeedKind;
  /** What to ask or tell the person, in plain words. */
  ask: string;
  /** For a sign-in: the https page to open on the hosted computer. For a connect: the page the person opens in their own browser. */
  url?: string;
  /** For a missing setup answer: the question id, such as gtm/signature. */
  question?: string;
  recorded_at: string;
};

export function parseNeeds(value: unknown): RunNeed[] {
  const list = isRecord(value) && Array.isArray(value.needs) ? value.needs : [];
  return list.flatMap((item): RunNeed[] => {
    if (!isRecord(item) || typeof item.workflow !== "string" || typeof item.ask !== "string") return [];
    const kind = (NEED_KINDS as readonly unknown[]).includes(item.kind) ? (item.kind as NeedKind) : "choice";
    return [{
      workflow: item.workflow,
      audience: typeof item.audience === "string" ? item.audience : null,
      kind,
      ask: item.ask,
      ...(typeof item.url === "string" ? { url: item.url } : {}),
      ...(typeof item.question === "string" ? { question: item.question } : {}),
      recorded_at: typeof item.recorded_at === "string" ? item.recorded_at : "",
    }];
  });
}

export function readNeeds(root: string): RunNeed[] {
  const path = join(root, NEEDS_FILE);
  if (!existsSync(path)) return [];
  try {
    return parseNeeds(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return [];
  }
}

function writeNeeds(root: string, needs: RunNeed[]): void {
  mkdirSync(join(root, ".ostack"), { recursive: true });
  writeFileSync(join(root, NEEDS_FILE), `${JSON.stringify({ needs }, null, 2)}\n`);
}

const sameRun = (need: RunNeed, workflow: string, audience: string | null) => need.workflow === workflow && need.audience === audience;

/** A run starting: what this workflow's last run recorded is replaced by what this one finds. */
export function clearNeeds(root: string, workflow: string, audience: string | null): void {
  const needs = readNeeds(root);
  if (needs.some((need) => sameRun(need, workflow, audience))) writeNeeds(root, needs.filter((need) => !sameRun(need, workflow, audience)));
}

export function addNeed(root: string, need: Omit<RunNeed, "recorded_at">): RunNeed {
  if (!need.ask.trim()) throw new OstackError("missing_flag", "--ask is required: what to ask or tell the person.");
  if (need.url && !/^https:\/\/[^\s'"]+$/.test(need.url)) throw new OstackError("invalid_flag", "--url must be an https:// address.");
  const saved: RunNeed = { ...need, ask: need.ask.trim().slice(0, 1000), recorded_at: new Date().toISOString() };
  // The same need twice in one run is kept once.
  const others = readNeeds(root).filter((item) => !(sameRun(item, need.workflow, need.audience) && item.kind === need.kind && item.ask === saved.ask));
  writeNeeds(root, [...others, saved]);
  return saved;
}
