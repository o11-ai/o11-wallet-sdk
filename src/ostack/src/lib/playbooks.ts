import { contentFolders, readContent } from "./content.js";
import { OstackError } from "./errors.js";
import { isRecord, parseFrontmatter } from "./paths.js";
import { parseSchedule, type ScheduleSpec } from "./schedule.js";

/**
 * A playbook is one family of workflows (gtm is the first). Each lives in content/playbooks/<id>/ with its own
 * skills, step defaults, setup questions and presets, so adding one never moves anything that already exists.
 * `per_audience` workflows run once for each audience folder; the others cover every audience in one run.
 */
export type Workflow = {
  id: string; ref: string; playbook: string; skill: string; summary: string; schedule: ScheduleSpec | null; perAudience: boolean;
};

/** `dir` is the playbook's folder inside the shipped content, such as "playbooks/gtm". */
export type Playbook = { id: string; name: string; summary: string; dir: string; workflows: Workflow[] };

export function loadPlaybooks(): Playbook[] {
  const playbooks: Playbook[] = [];
  for (const folder of contentFolders("playbooks")) {
    const dir = `playbooks/${folder}`;
    const manifest = readContent(`${dir}/playbook.md`);
    if (!manifest) continue;
    const { data } = parseFrontmatter(manifest);
    const id = typeof data.id === "string" ? data.id : folder;
    const workflows = (Array.isArray(data.workflows) ? data.workflows : []).filter(isRecord).map((item) => ({
      id: String(item.id),
      ref: `${id}/${String(item.id)}`,
      playbook: id,
      skill: String(item.skill),
      summary: typeof item.summary === "string" ? item.summary : "",
      schedule: isRecord(item.schedule) ? parseSchedule(item.schedule) : null,
      perAudience: item.per_audience === true,
    }));
    playbooks.push({ id, name: typeof data.name === "string" ? data.name : id, summary: typeof data.summary === "string" ? data.summary : "", dir, workflows });
  }
  return playbooks;
}

export function getPlaybook(id: string): Playbook {
  const playbook = loadPlaybooks().find((item) => item.id === id);
  if (!playbook) throw new OstackError("unknown_playbook", `No playbook named "${id}".`, { playbooks: loadPlaybooks().map((item) => item.id) });
  return playbook;
}

/** Finds a workflow by "gtm/outbound", or by "outbound" when only one enabled playbook has it. */
export function findWorkflow(ref: string, enabled: string[]): Workflow {
  const all = loadPlaybooks().filter((playbook) => enabled.includes(playbook.id)).flatMap((playbook) => playbook.workflows);
  const matches = ref.includes("/") ? all.filter((workflow) => workflow.ref === ref) : all.filter((workflow) => workflow.id === ref);
  if (matches.length === 1) return matches[0]!;
  throw new OstackError(matches.length === 0 ? "unknown_workflow" : "ambiguous_workflow", `No single workflow named "${ref}".`, {
    workflows: all.map((workflow) => workflow.ref),
  });
}
