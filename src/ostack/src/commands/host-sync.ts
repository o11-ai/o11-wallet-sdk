import { OstackError } from "../lib/errors.js";
import { askPerson, parseVmStatus, VM_STATUS_SCRIPT } from "../lib/host-status.js";
import { remote, type HostRemote, type RemoteSetup } from "../lib/remote.js";
import { HOSTED_CRON, writeState } from "../lib/state.js";
import { systemTimeZone } from "../lib/time.js";
import { VERSION } from "../lib/version.js";
import { effectiveSettings } from "../lib/team-view.js";
import { DEFAULT_AUDIENCE, enabledPlaybooks, loadWorkspace, type Workspace } from "../lib/workspace.js";
import { effective, scheduleEntries, scheduleKey } from "./schedule.js";
import { removeCronBlock } from "./schedule-cron.js";
import { localUploads } from "./setup-import.js";

/**
 * Keeps the hosted computer's ostack the same as this one's. Answers, files, settings and schedules already live in
 * o11; what each computer keeps for itself (which playbooks its folder runs, the timezone it falls back to, its
 * custom.local/ files) is synced or reported here, so the person only ever talks to this computer's agent.
 */

const PATHS = 'export PATH="$HOME/.local/bin:$HOME/.local/share/o11-wallet/bin:$PATH"';

/** This computer's workspace folder, when it has one (host setup runs before the interview creates it). */
async function localWorkspace(): Promise<Workspace | null> {
  try {
    return await loadWorkspace();
  } catch (error) {
    if (error instanceof OstackError && error.code === "no_workspace") return null;
    throw error;
  }
}

/** The hosted computer's status for the agent the person talks to: its doctor, and what to ask the person. */
export async function hostReport(host: HostRemote, id: string) {
  const [result, workspace] = await Promise.all([host.run(id, `${PATHS}\n${VM_STATUS_SCRIPT}`, 120_000), localWorkspace().catch(() => null)]);
  const wallet: RemoteSetup | null = workspace?.setup ?? await remote().setup().catch(() => null);
  const vm = parseVmStatus(result.stdout);
  const report = askPerson(vm, wallet);
  const uploads = workspace ? await localUploads(workspace) : null;
  const local = uploads ? uploads.files.length + uploads.schedules.length : 0;
  return {
    doctor: vm.doctor,
    ...report,
    orchestrator_actions: [
      ...report.orchestrator_actions,
      ...(local > 0 ? [`${local} personal file(s) or schedule(s) exist only on this computer, so the hosted computer cannot use them: run o11 ostack setup import here.`] : []),
    ],
  };
}

/**
 * Before installing the hosted computer's schedules: give the wallet a timezone when nobody set one (the hosted
 * computer's clock is UTC, this one's is the person's), match its playbooks to this folder's, and mark this release
 * reviewed there, since reviews happen here with the person.
 */
export async function prepareHostedSchedules(host: HostRemote, id: string) {
  const workspace = await localWorkspace();
  const setup = workspace?.setup ?? await remote().setup();
  let timezoneSaved: string | null = null;
  if (!effectiveSettings(setup).timezone) {
    timezoneSaved = systemTimeZone();
    await remote().saveSettings({ scope: "me", values: { timezone: timezoneSaved } });
  }
  const commands: string[] = [];
  if (workspace) {
    const stdout = (await host.run(id, 'cat "$HOME/ostack/ostack.json" 2>/dev/null')).stdout;
    let listed: unknown = [];
    try { listed = (JSON.parse(stdout) as { playbooks?: unknown }).playbooks; } catch { listed = []; }
    const there = Array.isArray(listed) ? listed.filter((item): item is string => typeof item === "string") : [];
    const here = enabledPlaybooks(workspace);
    commands.push(...here.filter((item) => !there.includes(item)).map((item) => `o11 ostack playbooks add ${item} >/dev/null`));
    commands.push(...there.filter((item) => !here.includes(item)).map((item) => `o11 ostack playbooks remove ${item} >/dev/null`));
    if (workspace.state.reviewed === VERSION) commands.push("o11 ostack setup reviewed >/dev/null");
  }
  // Best effort: a playbook the hosted computer's older ostack lacks must not stop its schedules being installed.
  const notSynced = commands.length === 0 ? [] : (await host.run(id, [PATHS, 'cd "$HOME/ostack" || exit 0', ...commands.map((command) => `${command} || echo "${command.replace(" >/dev/null", "")}"`)].join("\n")))
    .stdout.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("o11 ostack "));
  return { workspace, report: {
    playbooks: workspace ? enabledPlaybooks(workspace) : null,
    ...(timezoneSaved ? { timezone_saved: timezoneSaved } : {}),
    ...(notSynced.length > 0 ? { not_synced: notSynced } : {}),
  } };
}

/** Records on this computer that its schedules run on the hosted computer, so doctor here does not ask for them again. */
export async function recordHostedSchedules(workspace: Workspace | null, name: string, agent: string): Promise<void> {
  if (!workspace) return;
  const at = new Date().toISOString();
  for (const { workflow, audience } of scheduleEntries(workspace)) {
    if (!effective(workspace, workflow, audience).enabled) continue;
    const key = scheduleKey(workflow, audience);
    (workspace.state.schedules[key] ??= { installed: {} }).installed.cron = { name: `${HOSTED_CRON} ${name} (${agent})`, at };
  }
  await writeState(workspace.root, workspace.state);
}

/**
 * Stops this computer running what the hosted computer now runs: removes this workspace's crontab block, and returns
 * each Claude Desktop or Codex task still recorded here, for the agent to delete and then mark uninstalled.
 */
export function leaveLocalSchedules(workspace: Workspace | null) {
  if (!workspace) return { cron_removed: false, tasks: [] };
  const cronRemoved = removeCronBlock(workspace.root);
  const tasks = scheduleEntries(workspace).flatMap(({ workflow, audience }) => {
    const installed = workspace.state.schedules[scheduleKey(workflow, audience)]?.installed ?? {};
    const flag = audience === DEFAULT_AUDIENCE ? "" : ` --audience ${audience}`;
    return (["claude", "codex"] as const).filter((host) => installed[host]).map((host) => ({
      workflow: scheduleKey(workflow, audience), host, name: installed[host]!.name,
      then_run: `o11 ostack schedule uninstalled ${workflow.ref}${flag} --host ${host}`,
    }));
  });
  return { cron_removed: cronRemoved, tasks };
}
