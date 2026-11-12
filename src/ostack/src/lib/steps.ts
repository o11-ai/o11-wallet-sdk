import { listContent, readContent } from "./content.js";
import { OstackError } from "./errors.js";
import { getPlaybook, loadPlaybooks } from "./playbooks.js";
import { parseFrontmatter } from "./paths.js";

/**
 * A named point in a playbook's workflows that customizations attach to. Step ids are ostack's stable surface:
 * renaming one lists the old id in `renamed_from` so existing files can be found and moved.
 */
export type Step = {
  /** The id inside its playbook, such as "write". Files are named after it. */
  id: string;
  playbook: string;
  /** The qualified id, such as "gtm/write". */
  ref: string;
  summary: string;
  used_by: string[];
  /** The version whose release last changed this step's default. */
  changed: string;
  /** What that release changed, so a review can say what to check in the user's file. */
  change: string;
  renamed_from: string[];
  body: string;
};

export function loadSteps(playbook: string): Step[] {
  return listContent(`${getPlaybook(playbook).dir}/steps`)
    .filter(({ path }) => path.endsWith(".md") && !path.includes("/"))
    .map(({ path, text }) => {
      const { data, body } = parseFrontmatter(text);
      const id = path.slice(0, -3);
      return {
        id,
        playbook,
        ref: `${playbook}/${id}`,
        summary: typeof data.summary === "string" ? data.summary : "",
        used_by: strings(data.used_by),
        changed: typeof data.changed === "string" ? data.changed : "0.0.0",
        change: typeof data.change === "string" ? data.change : "",
        renamed_from: strings(data.renamed_from),
        body: body.trim(),
      };
    });
}

/** Finds a step by "gtm/write", or by "write" when only one enabled playbook has it. */
export function findStep(ref: string, playbooks: string[]): Step | null {
  const all = playbooks.flatMap(loadSteps);
  const matches = ref.includes("/") ? all.filter((step) => step.ref === ref) : all.filter((step) => step.id === ref);
  if (matches.length > 1) {
    throw new OstackError("ambiguous_step", `More than one playbook has a step named "${ref}".`, { steps: matches.map((step) => step.ref) });
  }
  return matches[0] ?? null;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * A setup question: `id` is bare for core questions ("timezone") and qualified for playbook ones ("gtm/about").
 * Team questions are answered once by an owner or admin; personal ones by every teammate for themselves.
 */
export type SetupQuestion = { id: string; playbook: string | null; since: string; scope: "team" | "personal"; text: string };

export const CORE_QUESTIONS_PATH = "skills/ostack-setup/references/questions.md";

/**
 * Core questions first, then each enabled playbook's. Each is a `## <id>` section with `Since:` and optional `Scope:` lines.
 * `Order: last` moves a question after all the others, for steps that need the rest answered first (scheduling).
 */
export function loadQuestions(playbooks: string[]): SetupQuestion[] {
  const files: { playbook: string | null; path: string }[] = [{ playbook: null, path: CORE_QUESTIONS_PATH }];
  for (const playbook of loadPlaybooks()) {
    if (playbooks.includes(playbook.id)) files.push({ playbook: playbook.id, path: `${playbook.dir}/questions.md` });
  }
  const questions: SetupQuestion[] = [];
  for (const file of files) {
    const text = readContent(file.path);
    if (!text) continue;
    for (const section of text.split(/^## /m).slice(1)) {
      const [heading = "", ...rest] = section.split("\n");
      const body = rest.join("\n").trim();
      const id = heading.trim();
      questions.push({
        id: file.playbook ? `${file.playbook}/${id}` : id,
        playbook: file.playbook,
        since: body.match(/^Since:\s*(\S+)/m)?.[1] ?? "0.0.0",
        scope: body.match(/^Scope:\s*personal\b/m) ? "personal" : "team",
        text: body,
      });
    }
  }
  const last = (question: SetupQuestion) => /^Order:\s*last\b/m.test(question.text);
  return [...questions.filter((question) => !last(question)), ...questions.filter(last)];
}
