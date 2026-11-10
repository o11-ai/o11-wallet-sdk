import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { listContent, readContent } from "./content.js";
import { getModule } from "./modules.js";
import { parseFrontmatter } from "./paths.js";
import type { RemoteNote } from "./remote.js";
import type { Step } from "./steps.js";
import { LOCAL_DIR, type Workspace } from "./workspace.js";

/**
 * Customizations are plain-language notes stacked over a module's baseline, lowest priority first:
 * the module's packs, the team's notes (shared, then the module's, then the campaign's), the person's own notes
 * in the wallet, then their notes on this computer in custom.local/. A later layer refines the ones before it.
 */
export type NoteSource = "pack" | "team" | "me" | "local";
export type Note = { layer: string; source: NoteSource; file: string; path: string; text: string; version?: number };
type Layer = { name: string; scope: "shared" | "module"; notes: Note[] };

/** Files in a pack that describe it rather than customize anything. */
const META_FILES = new Set(["pack.md", "readme.md"]);

/** Before modules, gtm's step notes sat at the top level. They keep applying to gtm. */
const LEGACY_OWNER = "gtm";

export function packFiles(module: string, name: string): { path: string; text: string }[] | null {
  const dir = `${getModule(module).dir}/packs/${name}`;
  const files = listContent(dir).filter(({ path }) => !path.includes("/") && path.endsWith(".md"));
  return files.length > 0 ? files.map(({ path, text }) => ({ path: `${dir}/${path}`, text })) : null;
}

/** Installed packs of one module, from the team's settings ("gtm/gmail"). */
export function modulePacks(workspace: Workspace, module: string): string[] {
  return (workspace.settings.packs ?? []).filter((ref) => ref.startsWith(`${module}/`)).map((ref) => ref.slice(module.length + 1));
}

function remoteLayer(name: string, source: "team" | "me", notes: RemoteNote[], folder: string | null, scope: Layer["scope"]): Layer {
  const picked = notes.filter((note) => {
    const parts = note.path.split("/");
    return folder === null ? parts.length === 1 : note.path.startsWith(`${folder}/`) && parts.length === folder.split("/").length + 1;
  });
  return {
    name,
    scope,
    notes: picked
      .map((note) => ({ layer: name, source, file: note.path.split("/").pop()!, path: note.path, text: note.body.trim(), version: note.version }))
      .sort((a, b) => a.file.localeCompare(b.file)),
  };
}

async function localLayer(name: string, dir: string, scope: Layer["scope"]): Promise<Layer> {
  if (!existsSync(dir)) return { name, scope, notes: [] };
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
  const notes = await Promise.all(files.map(async (file) => {
    const path = join(dir, file);
    return { layer: name, source: "local" as const, file, path, text: (await Bun.file(path).text()).trim() };
  }));
  return { name, scope, notes };
}

async function layersFor(workspace: Workspace, module: string, campaign: string): Promise<Layer[]> {
  const layers: Layer[] = [];
  for (const pack of modulePacks(workspace, module)) {
    const files = packFiles(module, pack) ?? [];
    layers.push({
      name: `pack:${pack}`,
      scope: "module",
      notes: files
        .filter(({ path }) => !META_FILES.has(path.split("/").pop()!.toLowerCase()))
        .map(({ path, text }) => ({ layer: `pack:${pack}`, source: "pack" as const, file: path.split("/").pop()!, path, text: text.trim() })),
    });
  }
  const { team, mine } = workspace.setup.notes;
  layers.push(remoteLayer("team", "team", team, null, "shared"));
  layers.push(remoteLayer(`team/${module}`, "team", team, module, "module"));
  if (module === LEGACY_OWNER) layers.push(remoteLayer(`campaign:${campaign}`, "team", team, `campaigns/${campaign}`, "module"));
  layers.push(remoteLayer("me", "me", mine, null, "shared"));
  layers.push(remoteLayer(`me/${module}`, "me", mine, module, "module"));
  layers.push(await localLayer("local", join(workspace.root, LOCAL_DIR), "shared"));
  layers.push(await localLayer(`local/${module}`, join(workspace.root, LOCAL_DIR, module), "module"));
  return layers.filter((layer) => layer.notes.length > 0);
}

export type NoteTarget = { kind: "step" | "before" | "after"; step: string } | { kind: "general" };

/**
 * `write.md` changes the write step, `before-send.md` and `after-record.md` run around one, anything else is general context.
 * `aliases` maps old step names to current ones, so notes keep applying after a step is renamed.
 */
export function classify(file: string, stepIds: Set<string>, aliases: Map<string, string> = new Map()): NoteTarget {
  const name = file.slice(0, -3);
  if (stepIds.has(name)) return { kind: "step", step: name };
  const renamed = aliases.get(name);
  if (renamed) return { kind: "step", step: renamed };
  const around = name.match(/^(before|after)-(.+)$/);
  if (around) return { kind: around[1] as "before" | "after", step: aliases.get(around[2]!) ?? around[2]! };
  return { kind: "general" };
}

export function stepAliases(steps: Step[]): Map<string, string> {
  return new Map(steps.flatMap((step) => step.renamed_from.map((old): [string, string] => [old, step.id])));
}

export type ClassifiedNote = { note: Note; target: NoteTarget; scope: Layer["scope"]; legacy: boolean };

/**
 * Every note that applies to a module, with what it customizes. In shared layers only general notes count,
 * except gtm's step notes from before modules (marked `legacy`).
 */
export async function moduleNotes(workspace: Workspace, module: string, campaign: string, steps: Step[]): Promise<ClassifiedNote[]> {
  const ids = new Set(steps.map((step) => step.id));
  const aliases = stepAliases(steps);
  const result: ClassifiedNote[] = [];
  for (const layer of await layersFor(workspace, module, campaign)) {
    for (const note of layer.notes) {
      const target = classify(note.file, ids, aliases);
      if (layer.scope === "shared" && target.kind !== "general") {
        const known = "step" in target && ids.has(target.step);
        if (module === LEGACY_OWNER && known) result.push({ note, target, scope: layer.scope, legacy: true });
        else if (!known) result.push({ note, target: { kind: "general" }, scope: layer.scope, legacy: false });
        continue;
      }
      result.push({ note, target, scope: layer.scope, legacy: false });
    }
  }
  return result;
}

export type StepContext = { step: string; summary: string; default: string; before: Note[]; notes: Note[]; after: Note[] };

export async function stepContext(workspace: Workspace, campaign: string, step: Step, steps: Step[]): Promise<StepContext> {
  const context: StepContext = { step: step.ref, summary: step.summary, default: step.body, before: [], notes: [], after: [] };
  for (const { note, target } of await moduleNotes(workspace, step.module, campaign, steps)) {
    if (target.kind === "general" || target.step !== step.id) continue;
    context[target.kind === "step" ? "notes" : target.kind].push(note);
  }
  return context;
}

export async function generalNotes(workspace: Workspace, module: string, campaign: string, steps: Step[]): Promise<Note[]> {
  return (await moduleNotes(workspace, module, campaign, steps)).filter(({ target }) => target.kind === "general").map(({ note }) => note);
}

export type PackInfo = { name: string; module: string; description: string; kind: string };

export function describePack(module: string, name: string): PackInfo {
  const meta = readContent(`${getModule(module).dir}/packs/${name}/pack.md`);
  const { data } = meta ? parseFrontmatter(meta) : { data: {} as Record<string, unknown> };
  return {
    name,
    module,
    description: typeof data.description === "string" ? data.description : "",
    kind: typeof data.kind === "string" ? data.kind : "other",
  };
}
