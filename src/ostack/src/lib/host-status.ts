import { NEEDS_FILE, parseNeeds, type RunNeed } from "./needs.js";
import { isRecord } from "./paths.js";
import type { RemoteSetup } from "./remote.js";

/**
 * What the person's own agent (the one they talk to) has to ask them on behalf of their hosted computer. The hosted
 * computer never asks anyone: its pending setup questions and what its unattended runs recorded come back here, the
 * agent asks the person, and saves the answers with the normal ostack setup commands on its own side. The hosted
 * computer reads them from o11 on its next run.
 */

/**
 * Runs on the hosted computer with the o11 CLI it has installed, which may be older than this one, so it only reads:
 * doctor, setup status, the needs file runs wrote, and the end of each scheduled run's log.
 */
export const VM_STATUS_SCRIPT = [
  'cd "$HOME/ostack" 2>/dev/null || exit 0',
  'echo "@@ostack doctor"; o11 ostack doctor 2>/dev/null',
  'echo; echo "@@ostack setup"; o11 ostack setup status 2>/dev/null',
  `echo; echo "@@ostack needs"; cat ${NEEDS_FILE} 2>/dev/null`,
  'echo; echo "@@ostack logs"; for f in .ostack/logs/*.log; do [ -f "$f" ] || continue; echo; echo "@@log $(basename "$f") $(date -u -r "$f" +%Y-%m-%dT%H:%M:%SZ)"; tail -n 4 "$f" | cut -c1-300; done',
  "true",
].join("\n");

const json = (text: string | undefined): unknown => {
  try { return text ? JSON.parse(text) : null; } catch { return null; }
};

export type RunLog = { file: string; modified: string; tail: string };
export type VmStatus = { doctor: unknown; setup: unknown; needs: RunNeed[]; logs: RunLog[] };

export function parseVmStatus(stdout: string): VmStatus {
  const sections: Record<string, string> = {};
  for (const part of stdout.split(/^@@ostack /m).slice(1)) {
    const newline = part.indexOf("\n");
    sections[(newline < 0 ? part : part.slice(0, newline)).trim()] = newline < 0 ? "" : part.slice(newline + 1).trim();
  }
  const logs = (sections.logs ?? "").split(/^@@log /m).slice(1).map((entry) => {
    const [heading = "", ...rest] = entry.split("\n");
    const [file = "", modified = ""] = heading.trim().split(" ");
    return { file, modified, tail: rest.join("\n").trim() };
  });
  return { doctor: json(sections.doctor) ?? sections.doctor ?? null, setup: json(sections.setup), needs: parseNeeds(json(sections.needs)), logs };
}

type PendingQuestion = { id: string; playbook: string | null; scope: string; text: string };

function pendingQuestions(setup: unknown): { pending: PendingQuestion[]; teamPending: string[] } {
  if (!isRecord(setup)) return { pending: [], teamPending: [] };
  const pending = (Array.isArray(setup.pending_questions) ? setup.pending_questions : []).flatMap((item): PendingQuestion[] =>
    isRecord(item) && typeof item.id === "string"
      ? [{ id: item.id, playbook: typeof item.playbook === "string" ? item.playbook : null, scope: String(item.scope ?? "team"), text: String(item.text ?? "") }]
      : []);
  const teamPending = (Array.isArray(setup.team_pending) ? setup.team_pending : []).filter((id): id is string => typeof id === "string");
  return { pending, teamPending };
}

const playbookOf = (ref: string) => (ref.includes("/") ? ref.split("/")[0]! : null);

/** Agent sign-ins that ran out show up in a scheduled run's log before the agent can record anything itself. */
const SIGNED_OUT = /not logged in|please run \/login|invalid api key|oauth token has expired|authentication_error|not signed in/i;

export type AskPerson = ReturnType<typeof askPerson>;

/**
 * Setup questions count only for playbooks the person is using (one with an active schedule, an answered question or
 * a run that recorded something): setup goes one playbook at a time, and the rest are not theirs to answer yet.
 */
export function askPerson(vm: VmStatus, wallet: Pick<RemoteSetup, "settings" | "schedules"> | null) {
  const { pending, teamPending } = pendingQuestions(vm.setup);
  const answered = wallet ? [...Object.keys(wallet.settings.team.setupAnswers), ...Object.keys(wallet.settings.mine.setupAnswers)] : [];
  const inUse = new Set([
    ...(wallet?.schedules ?? []).filter((schedule) => schedule.status === "active").map((schedule) => playbookOf(schedule.workflow)),
    ...answered.map(playbookOf),
    ...vm.needs.map((need) => playbookOf(need.workflow)),
  ].filter((id): id is string => id !== null));
  const questions = inUse.size === 0 ? [] : pending.filter((question) => question.playbook === null || inUse.has(question.playbook));
  const known = new Set([...pending.map((question) => question.id), ...answered]);
  const items = [
    ...questions.map((question) => ({
      kind: "setup_question" as const, id: question.id, scope: question.scope, text: question.text,
      save_with: `Write what its Writes line says, then o11 ostack setup answer ${question.id}`,
    })),
    // A run's need about a setup question is covered above while it is pending, and gone once it is answered.
    ...vm.needs.filter((need) => !(need.question && known.has(need.question))).map((need) => ({
      ...need,
      ...(need.kind === "sign_in" ? { do: `o11 ostack host open ${need.url ?? "<https page>"} and send the person its link in one line. When they say done, check it in the browser scheduled runs use: o11 ostack host run --command "claude -p 'Use the browser MCP: open ${need.url ?? "the page"} in a new page and say whether it shows you signed in'" (codex exec for Codex). The need clears on that workflow's next run.` } : {}),
      // A tool the person connects themselves, in their own browser: never through the hosted computer's screen.
      ...(need.kind === "connect" ? {
        do: "First check the tool can work on the hosted computer at all (ostack-setup, On go step 3). A claude.ai connector, or an MCP that signs in through the browser, never can: keep ostack on their own computer instead of sending this. Otherwise send tell_person, and run then_run when they say done.",
        tell_person: need.url ? `${need.ask} Open ${need.url} in your browser, then tell me when it's done.` : need.ask,
        then_run: `o11 ostack host check --prompt "<the check of the setup question for this tool>"`,
      } : {}),
    })),
  ];
  const signedOut = vm.logs.filter((log) => SIGNED_OUT.test(log.tail)).map((log) => log.file);
  // An unreadable hosted computer is never reported as all clear.
  const unreadable = vm.setup === null || (isRecord(vm.doctor) && vm.doctor.ok === false);
  const failing = isRecord(vm.doctor) && Array.isArray(vm.doctor.checks)
    ? vm.doctor.checks.filter((check) => isRecord(check) && check.status === "fail").map((check) => (isRecord(check) ? `${String(check.check)}: ${String(check.detail)}` : ""))
    : [];
  const actions = [
    ...(signedOut.length > 0 ? [`Scheduled runs failed to sign in (${signedOut.join(", ")}): run o11 ostack host signin.`] : []),
    ...(unreadable ? [`The hosted computer's ostack could not be read${failing.length > 0 ? ` (${failing.join("; ")})` : ""}: run o11 ostack host setup (safe to repeat), then host status again.`] : []),
  ];
  return {
    ask_person: items,
    // Team questions only an owner or admin can answer; this person cannot save them.
    team_pending: inUse.size === 0 ? [] : teamPending.filter((id) => playbookOf(id) === null || inUse.has(playbookOf(id)!)),
    orchestrator_actions: actions,
    recent_runs: vm.logs,
    say: items.length > 0
      ? "Ask the person these yourself, together in one short message, after answering what you can from what you know or a question's Default. Save each answer here with the normal ostack commands (files write, settings set, setup answer); the hosted computer reads them from o11 on its next run. Never ask the person to type on the hosted computer."
      : unreadable ? "Unknown until the hosted computer can be read; see orchestrator_actions." : "Nothing needs the person.",
  };
}
