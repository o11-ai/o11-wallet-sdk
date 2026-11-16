import type { Workflow } from "./playbooks.js";
import type { RemoteSchedule } from "./remote.js";
import { parseSchedule, type ScheduleSpec } from "./schedule.js";

/**
 * Where a workflow's schedule came from: this person's own in the wallet ("custom"), one kept on this computer before
 * schedules moved to the wallet ("local", until `setup import` uploads it), or the playbook's default, unscheduled.
 */
export type EffectiveSchedule = { spec: ScheduleSpec | null; enabled: boolean; source: "custom" | "local" | "default" };

/** The audience a schedule or run is kept under: the audience for per-audience workflows, null for whole-playbook ones. */
export function scheduleAudience(workflow: Pick<Workflow, "perAudience">, audience: string): string | null {
  return workflow.perAudience ? audience : null;
}

/** This person's saved schedule for a workflow and audience, if they set one. */
export function savedSchedule(schedules: readonly RemoteSchedule[] | undefined, workflow: Pick<Workflow, "ref" | "perAudience">, audience: string) {
  const kept = scheduleAudience(workflow, audience);
  return schedules?.find((item) => item.workflow === workflow.ref && item.audience === kept);
}

/** The schedule a workflow runs on. Other audiences start unscheduled, since the playbook's default is for its first. */
export function effectiveSchedule(
  saved: RemoteSchedule | undefined,
  local: { spec?: ScheduleSpec; enabled?: boolean } | undefined,
  workflow: Pick<Workflow, "schedule">,
): EffectiveSchedule {
  if (saved) return { spec: parseSchedule(saved.rules), enabled: saved.status === "active", source: "custom" };
  if (local?.spec) return { spec: local.spec, enabled: local.enabled !== false, source: "local" };
  return { spec: workflow.schedule, enabled: false, source: "default" };
}
