import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { listContent, readContent } from "./content.js";
import { getPlaybook } from "./playbooks.js";
import { parseFrontmatter } from "./paths.js";
import type { RemoteFile } from "./remote.js";
import type { Step } from "./steps.js";
import { audienceFolder, DEFAULT_AUDIENCE, LOCAL_DIR, type Workspace } from "./workspace.js";

/**
 * Customizations are plain-language markdown files stacked over a playbook's baseline, lowest priority first:
 * the playbook's presets, the team's files (shared, then the playbook's, then the audience's), the person's own
 * files in the wallet (the same order), then their files on this computer in custom.local/. A later layer refines
 * the ones before it.
 */
export type FileSource = "preset" | "team" | "me" | "local";
export type SetupFile = { layer: string; source: FileSource; file: string; path: string; text: string; version?: number; versionId?: string };
type Layer = { name: string; scope: "shared" | "playbook"; files: SetupFile[] };

/** Files in a preset that describe it rather than customize anything. */
const META_FILES = new Set(["preset.md", "readme.md"]);

/** Before playbooks, gtm's step files sat at the top level, and 0.7 kept audiences (then campaigns) in campaigns/. They keep applying to gtm. */
const LEGACY_OWNER = "gtm";
const LEGACY_CAMPAIGNS = "campaigns";
/** 0.7 called the default audience main. */
const LEGACY_DEFAULT = "main";

/** template.md, template-a.md, template-short-intro.md: one email template each. Several in an audience is an A/B test. */
const TEMPLATE = /^template(?:-[a-z0-9][a-z0-9_-]*)?$/;

export function presetFiles(playbook: string, name: string): { path: string; text: string }[] | null {
  const dir = `${getPlaybook(playbook).dir}/presets/${name}`;
  const files = listContent(dir).filter(({ path }) => !path.includes("/") && path.endsWith(".md"));
  return files.length > 0 ? files.map(({ path, text }) => ({ path: `${dir}/${path}`, text })) : null;
}

/** Presets one playbook has on, from the team's settings ("gtm/gmail"). */
export function playbookPresets(workspace: Workspace, playbook: string): string[] {
  return (workspace.settings.presets ?? []).filter((ref) => ref.startsWith(`${playbook}/`)).map((ref) => ref.slice(playbook.length + 1));
}

/** Files directly inside `folder` (null is the top level), as one layer. */
function remoteLayer(name: string, source: "team" | "me", files: RemoteFile[], folder: string | null, scope: Layer["scope"]): Layer {
  const picked = files.filter((file) => {
    const parts = file.path.split("/");
    return folder === null ? parts.length === 1 : file.path.startsWith(`${folder}/`) && parts.length === folder.split("/").length + 1;
  });
  return {
    name,
    scope,
    files: picked
      .map((file) => ({ layer: name, source, file: file.path.split("/").pop()!, path: file.path, text: file.content.trim(), version: file.version, versionId: file.versionId }))
      .sort((a, b) => a.file.localeCompare(b.file)),
  };
}

async function localLayer(name: string, dir: string, scope: Layer["scope"]): Promise<Layer> {
  if (!existsSync(dir)) return { name, scope, files: [] };
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
  const files = await Promise.all(names.map(async (file) => {
    const path = join(dir, file);
    return { layer: name, source: "local" as const, file, path, text: (await Bun.file(path).text()).trim() };
  }));
  return { name, scope, files };
}

/** The folders an audience's files come from, lowest priority first. Default also reads gtm/audiences/default/ and, for gtm, 0.7's campaigns/<name>/ from 0.7. */
function audienceFolders(playbook: string, audience: string): string[] {
  const legacy = audience === DEFAULT_AUDIENCE ? LEGACY_DEFAULT : audience;
  return [...(playbook === LEGACY_OWNER ? [`${LEGACY_CAMPAIGNS}/${legacy}`] : []), audienceFolder(playbook, audience)];
}

async function layersFor(workspace: Workspace, playbook: string, audience: string): Promise<Layer[]> {
  const layers: Layer[] = [];
  for (const preset of playbookPresets(workspace, playbook)) {
    const files = presetFiles(playbook, preset) ?? [];
    layers.push({
      name: `preset:${preset}`,
      scope: "playbook",
      files: files
        .filter(({ path }) => !META_FILES.has(path.split("/").pop()!.toLowerCase()))
        .map(({ path, text }) => ({ layer: `preset:${preset}`, source: "preset" as const, file: path.split("/").pop()!, path, text: text.trim() })),
    });
  }
  const { team, mine } = workspace.setup.files;
  for (const [source, files] of [["team", team], ["me", mine]] as const) {
    layers.push(remoteLayer(source, source, files, null, "shared"));
    layers.push(remoteLayer(`${source}/${playbook}`, source, files, playbook, "playbook"));
    for (const folder of audienceFolders(playbook, audience)) layers.push(remoteLayer(`${source}/${folder}`, source, files, folder, "playbook"));
  }
  layers.push(await localLayer("local", join(workspace.root, LOCAL_DIR), "shared"));
  layers.push(await localLayer(`local/${playbook}`, join(workspace.root, LOCAL_DIR, playbook), "playbook"));
  return layers.filter((layer) => layer.files.length > 0);
}

export type FileTarget = { kind: "step" | "before" | "after"; step: string } | { kind: "template" } | { kind: "general" };

/**
 * `write.md` changes the write step, `before-send.md` and `after-record.md` run around one, `template-a.md` is an
 * email template, anything else is general context. `aliases` maps old step names to current ones, so files keep
 * applying after a step is renamed.
 */
export function classify(file: string, stepIds: Set<string>, aliases: Map<string, string> = new Map()): FileTarget {
  const name = file.slice(0, -3);
  if (stepIds.has(name)) return { kind: "step", step: name };
  const renamed = aliases.get(name);
  if (renamed) return { kind: "step", step: renamed };
  if (TEMPLATE.test(name)) return { kind: "template" };
  const around = name.match(/^(before|after)-(.+)$/);
  if (around) return { kind: around[1] as "before" | "after", step: aliases.get(around[2]!) ?? around[2]! };
  return { kind: "general" };
}

export function stepAliases(steps: Step[]): Map<string, string> {
  return new Map(steps.flatMap((step) => step.renamed_from.map((old): [string, string] => [old, step.id])));
}

export type ClassifiedFile = { file: SetupFile; target: FileTarget; scope: Layer["scope"]; legacy: boolean };

/**
 * Every file that applies to a playbook's audience, with what it customizes. In shared layers only general files
 * count, except gtm's step files from before playbooks (marked `legacy`). Templates are listed by audienceTemplates.
 */
export async function playbookFiles(workspace: Workspace, playbook: string, audience: string, steps: Step[]): Promise<ClassifiedFile[]> {
  const ids = new Set(steps.map((step) => step.id));
  const aliases = stepAliases(steps);
  const result: ClassifiedFile[] = [];
  for (const layer of await layersFor(workspace, playbook, audience)) {
    for (const file of layer.files) {
      const target = classify(file.file, ids, aliases);
      if (target.kind === "template") continue;
      if (layer.scope === "shared" && target.kind !== "general") {
        const known = "step" in target && ids.has(target.step);
        if (playbook === LEGACY_OWNER && known) result.push({ file, target, scope: layer.scope, legacy: true });
        else if (!known) result.push({ file, target: { kind: "general" }, scope: layer.scope, legacy: false });
        continue;
      }
      result.push({ file, target, scope: layer.scope, legacy: false });
    }
  }
  return result;
}

export type StepContext = { step: string; summary: string; default: string; before: SetupFile[]; files: SetupFile[]; after: SetupFile[] };

export async function stepContext(workspace: Workspace, audience: string, step: Step, steps: Step[]): Promise<StepContext> {
  const context: StepContext = { step: step.ref, summary: step.summary, default: step.body, before: [], files: [], after: [] };
  for (const { file, target } of await playbookFiles(workspace, step.playbook, audience, steps)) {
    if (!("step" in target) || target.step !== step.id) continue;
    context[target.kind === "step" ? "files" : target.kind].push(file);
  }
  return context;
}

export async function generalFiles(workspace: Workspace, playbook: string, audience: string, steps: Step[]): Promise<SetupFile[]> {
  return (await playbookFiles(workspace, playbook, audience, steps)).filter(({ target }) => target.kind === "general").map(({ file }) => file);
}

/** `active` is false for a template the team paused (`active: false` at its top); paused ones are never sent. */
export type Template = { name: string; path: string; version_id: string; version: number; weight: number; active: boolean; text: string };

function templatesIn(files: RemoteFile[], folders: string[]): Template[] {
  return files
    .filter((file) => {
      const parts = file.path.split("/");
      const folder = parts.slice(0, -1).join("/");
      return folders.includes(folder) && TEMPLATE.test(parts.at(-1)!.slice(0, -3));
    })
    .map((file) => {
      const { data, body } = parseFrontmatter(file.content);
      const weight = typeof data.weight === "number" && data.weight > 0 ? data.weight : 1;
      const active = !(data.active === false || data.active === "false" || data.active === "off");
      return { name: file.path.split("/").pop()!.slice(0, -3), path: file.path, version_id: file.versionId, version: file.version, weight, active, text: body.trim() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every email template an audience has, in use or paused: template*.md files in its folder. An audience without any
 * of its own uses the default audience's (gtm/template*.md). Each carries the version id a CRM record keeps, so any
 * agent can open the exact text that was sent.
 */
export function allAudienceTemplates(workspace: Workspace, playbook: string, audience: string): Template[] {
  const team = workspace.setup.files.team;
  const defaults = templatesIn(team, [playbook, ...audienceFolders(playbook, DEFAULT_AUDIENCE)]);
  if (audience === DEFAULT_AUDIENCE) return defaults;
  const own = templatesIn(team, audienceFolders(playbook, audience));
  return own.length > 0 ? own : defaults;
}

/**
 * The templates an audience sends: those in use. Two or more is an A/B test, split evenly (or by an optional
 * `weight:`). Pausing every template sends first messages from the write step alone.
 */
export function audienceTemplates(workspace: Workspace, playbook: string, audience: string): Template[] {
  return allAudienceTemplates(workspace, playbook, audience).filter((template) => template.active);
}

/** Audiences that have files of their own, plus default. 0.7's campaigns/main/ is the default audience. */
export function listAudiences(workspace: Workspace, playbook: string): string[] {
  const prefixes = [`${playbook}/audiences/`, ...(playbook === LEGACY_OWNER ? [`${LEGACY_CAMPAIGNS}/`] : [])];
  const names = workspace.setup.files.team.flatMap((file) => {
    const prefix = prefixes.find((item) => file.path.startsWith(item));
    const name = prefix ? file.path.slice(prefix.length).split("/")[0] : undefined;
    if (!name || !file.path.slice(prefix!.length).includes("/")) return [];
    return [prefix === `${LEGACY_CAMPAIGNS}/` && name === LEGACY_DEFAULT ? DEFAULT_AUDIENCE : name];
  });
  return [DEFAULT_AUDIENCE, ...[...new Set(names)].filter((name) => name !== DEFAULT_AUDIENCE).sort()];
}

/**
 * An audience's own team file by name, such as audience.md or follow-up.md, lowest priority first. Main's files sit
 * in the playbook's folder (gtm/follow-up.md); other audiences' in their folder (gtm/audiences/customers/follow-up.md).
 */
export function audienceFile(workspace: Workspace, playbook: string, audience: string, name: string): RemoteFile[] {
  const folders = [...(audience === DEFAULT_AUDIENCE ? [playbook] : []), ...audienceFolders(playbook, audience)];
  return folders.flatMap((folder) => workspace.setup.files.team.filter((file) => file.path === `${folder}/${name}`));
}

export type PresetInfo = { name: string; playbook: string; description: string; kind: string };

export function describePreset(playbook: string, name: string): PresetInfo {
  const meta = readContent(`${getPlaybook(playbook).dir}/presets/${name}/preset.md`);
  const { data } = meta ? parseFrontmatter(meta) : { data: {} as Record<string, unknown> };
  return {
    name,
    playbook,
    description: typeof data.description === "string" ? data.description : "",
    kind: typeof data.kind === "string" ? data.kind : "other",
  };
}
