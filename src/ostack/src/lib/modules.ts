import { contentFolders, readContent } from "./content.js";
import { OstackError } from "./errors.js";
import { isRecord, parseFrontmatter } from "./paths.js";
import { parseSchedule, type ScheduleSpec } from "./schedule.js";

/**
 * A module is one family of workflows (gtm is the first). Each lives in content/modules/<id>/ with its own skills,
 * step defaults, setup questions and packs, so adding one never moves anything that already exists.
 */
export type Workflow = { id: string; ref: string; module: string; skill: string; summary: string; schedule: ScheduleSpec | null };

/** `dir` is the module's folder inside the shipped content, such as "modules/gtm". */
export type Module = { id: string; name: string; summary: string; dir: string; workflows: Workflow[] };

export function loadModules(): Module[] {
  const modules: Module[] = [];
  for (const folder of contentFolders("modules")) {
    const dir = `modules/${folder}`;
    const manifest = readContent(`${dir}/module.md`);
    if (!manifest) continue;
    const { data } = parseFrontmatter(manifest);
    const id = typeof data.id === "string" ? data.id : folder;
    const workflows = (Array.isArray(data.workflows) ? data.workflows : []).filter(isRecord).map((item) => ({
      id: String(item.id),
      ref: `${id}/${String(item.id)}`,
      module: id,
      skill: String(item.skill),
      summary: typeof item.summary === "string" ? item.summary : "",
      schedule: isRecord(item.schedule) ? parseSchedule(item.schedule) : null,
    }));
    modules.push({ id, name: typeof data.name === "string" ? data.name : id, summary: typeof data.summary === "string" ? data.summary : "", dir, workflows });
  }
  return modules;
}

export function getModule(id: string): Module {
  const module = loadModules().find((item) => item.id === id);
  if (!module) throw new OstackError("unknown_module", `No module named "${id}".`, { modules: loadModules().map((item) => item.id) });
  return module;
}

/** Finds a workflow by "gtm/outbound", or by "outbound" when only one enabled module has it. */
export function findWorkflow(ref: string, enabled: string[]): Workflow {
  const all = loadModules().filter((module) => enabled.includes(module.id)).flatMap((module) => module.workflows);
  const matches = ref.includes("/") ? all.filter((workflow) => workflow.ref === ref) : all.filter((workflow) => workflow.id === ref);
  if (matches.length === 1) return matches[0]!;
  throw new OstackError(matches.length === 0 ? "unknown_workflow" : "ambiguous_workflow", `No single workflow named "${ref}".`, {
    workflows: all.map((workflow) => workflow.ref),
  });
}
