import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { OstackError } from "../lib/errors.js";
import { print } from "../lib/output.js";
import { VERSION } from "../lib/version.js";
import { enabledModules, loadWorkspace } from "../lib/workspace.js";
import { setupStatus } from "./setup.js";
import { SKILL_HOSTS } from "./skills.js";

type Check = { check: string; status: "ok" | "warn" | "fail"; detail: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Checks the sign-in, the installed skills, this folder, the team's setup and schedules. */
export async function doctorCommand(): Promise<void> {
  const checks: Check[] = [];
  const onPath = Bun.which("o11");
  checks.push({ check: "o11 on PATH", status: onPath ? "ok" : "warn", detail: onPath ?? "Not found. Scheduled runs call o11 by name; install it from docs.o11.ai." });

  const hosts = Object.entries(SKILL_HOSTS).flatMap(([host, dir]) => {
    const marker = join(homedir(), dir, "ostack-setup", ".o11-ostack");
    return existsSync(marker) ? [`${host} (${readFileSync(marker, "utf8").trim()})`] : [];
  });
  checks.push({
    check: "skills installed",
    status: hosts.length > 0 ? "ok" : "warn",
    detail: hosts.length > 0 ? hosts.join(", ") : "No agent has the skills. Run: o11 ostack skills install --host auto",
  });

  try {
    const workspace = await loadWorkspace();
    const { setup } = workspace;
    checks.push({
      check: "login",
      status: setup.offline ? "warn" : "ok",
      detail: setup.offline
        ? `The wallet could not be reached; using the team setup saved at ${setup.fetched_at}.`
        : `${setup.me.email} in ${setup.workspace.name} (${setup.canManage ? "owner or admin" : "member"}) at ${setup.origin}`,
    });
    checks.push({
      check: "card",
      status: setup.cards.some((card) => card.status === "active") ? "ok" : "warn",
      detail: setup.cards.length > 0 ? setup.cards.map((card) => `${card.name} (${card.status})`).join(", ") : "No card for this login. Paid lookups need one; create it in the wallet.",
    });
    checks.push({ check: "workspace", status: "ok", detail: `${workspace.root} (modules: ${enabledModules(workspace).join(", ") || "none"})` });
    const status = await setupStatus(workspace);
    const open = [
      status.pending_questions.length > 0 && `setup questions to ask: ${status.pending_questions.map((question) => question.id).join(", ")}`,
      status.team_pending.length > 0 && `an owner or admin still has to answer: ${status.team_pending.join(", ")}`,
      status.changed_defaults.length > 0 && `${status.changed_defaults.length} customized step(s) whose default changed`,
      status.unknown_steps.length > 0 && `${status.unknown_steps.length} note(s) for unknown steps`,
      status.local_setup_to_import > 0 && `${status.local_setup_to_import} note(s) from before teams to import (o11 ostack setup import)`,
    ].filter(Boolean);
    checks.push({
      check: "customizations",
      status: open.length > 0 ? "warn" : "ok",
      detail: open.length > 0 ? `${open.join("; ")}. Run the ostack-setup skill to review.` : `up to date with ${VERSION}`,
    });
    const uninstalled = Object.entries(workspace.state.schedules).filter(([, entry]) => entry.enabled && Object.keys(entry.installed).length === 0);
    checks.push({
      check: "schedules",
      status: uninstalled.length > 0 ? "warn" : "ok",
      detail:
        uninstalled.length > 0
          ? `${uninstalled.map(([ref]) => ref).join(", ")} scheduled but not created in Claude, Codex or cron yet. Run "o11 ostack schedule spec <workflow> --host <host>".`
          : `${Object.values(workspace.state.schedules).filter((entry) => entry.enabled).length} enabled (${workspace.timezone})`,
    });
  } catch (error) {
    const signedOut = error instanceof OstackError && ["not_signed_in", "forbidden", "offline"].includes(error.code);
    checks.push({ check: signedOut ? "login" : "workspace", status: signedOut ? "fail" : "warn", detail: message(error) });
  }

  print({ ok: checks.every((check) => check.status !== "fail"), version: VERSION, checks });
  if (checks.some((check) => check.status === "fail")) process.exitCode = 1;
}
