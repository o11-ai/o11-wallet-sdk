import { OstackError } from "./errors.js";
import { kitTree } from "./kit-tree.js";
import { allAudienceTemplates, generalFiles, playbookFiles, playbookPresets, stepContext } from "./layers.js";
import type { PlaybookValues, RemoteSettings } from "./remote.js";
import { findStep, loadSteps } from "./steps.js";
import type { TeamView } from "./team-view.js";
import { localTime } from "./time.js";
import { PLAYBOOK_SETTINGS_VIEWS } from "../playbooks/settings-views.js";
import { audienceSettings } from "../playbooks/gtm/audience-settings.js";
import { nextSendAt, showSettings as showGtm } from "../playbooks/gtm/settings.js";

/** Values every person sets for themselves, kept in their GTM settings; the team has no value for them. */
export const PERSONAL_KEYS = { sender_email: "senderEmail", lead_assignment: "leadAssignment" } as const;

/** The playbook a request is about: the one named, the prefix of a qualified ref, or the only one in use. */
export function resolvePlaybook(playbooks: string[], named?: string, ref?: string): string {
  const playbook = named ?? (ref?.includes("/") ? ref.split("/")[0] : undefined);
  if (playbook) {
    if (!playbooks.includes(playbook)) {
      throw new OstackError("playbook_not_enabled", `The ${playbook} playbook is not enabled in this workspace. Run "o11 ostack playbooks add ${playbook}".`, { playbooks });
    }
    return playbook;
  }
  if (playbooks.length === 1) return playbooks[0]!;
  throw new OstackError("playbook_required", "More than one playbook is enabled. Pass --playbook <id>.", { playbooks });
}

/** Who is signed in and whether the team's setup came fresh from the wallet or from the saved copy. */
export function teamSummary(view: TeamView) {
  const { setup } = view;
  return {
    workspace: setup.workspace.name,
    me: setup.me.email,
    role: setup.canManage ? "admin" : "member",
    ...(setup.offline ? { offline: `The wallet could not be reached; using the team setup saved at ${setup.fetched_at}.` } : {}),
  };
}

export function playbookValues(settings: RemoteSettings, playbook: string): PlaybookValues {
  return settings.playbooks[playbook] ?? {};
}

export function personalValues(values: PlaybookValues | undefined) {
  return Object.fromEntries(Object.entries(PERSONAL_KEYS).flatMap(([key, stored]) => (typeof values?.[stored] === "string" ? [[key, values[stored]]] : [])));
}

/** A playbook's settings for one audience. GTM's audience files can override the team's; other playbooks have none yet. */
function settingsFor(view: TeamView, playbook: string, audience: string) {
  if (playbook !== "gtm") return { settings: PLAYBOOK_SETTINGS_VIEWS[playbook]?.(playbookValues(view.settings, playbook)) ?? {} };
  const { settings, from, warnings } = audienceSettings(view, audience);
  // Outbound schedules each first message for this moment, so no agent works out timezones itself.
  const next = nextSendAt(settings, view.timezone, new Date());
  return { settings: showGtm(settings), ...(next ? { next_send_at: next.local, next_send_at_utc: next.utc } : {}), ...(from.length > 0 ? { settings_from: from } : {}), ...(warnings.length > 0 ? { warnings } : {}) };
}

/** The audience's templates, with the version id each CRM record keeps. Only GTM's write step uses them. */
function templatesFor(view: TeamView, playbook: string, audience: string) {
  if (playbook !== "gtm") return {};
  const all = allAudienceTemplates(view, playbook, audience);
  const templates = all.filter((template) => template.active);
  const paused = all.filter((template) => !template.active).map((template) => template.name);
  return all.length > 0 ? { templates, ab_test: templates.length > 1, ...(paused.length > 0 ? { paused_templates: paused } : {}) } : {};
}

/**
 * `ref` names a step ("gtm/write") or a general file ("about"); without it, the whole playbook (with several in use and
 * none named, what each one has customized). `playbooks` are the ones in use, which a bare step name is looked up in.
 */
export type ContextRequest = { playbooks: string[]; audience: string; playbook?: string; ref?: string; filesOnly?: boolean };

/**
 * Everything an agent should know before a run of a playbook's audience: files, settings, templates, steps. With a
 * step, that step's default plus every customization of it. `o11 ostack context` prints it; MCP's kit_read returns it.
 */
export async function teamContext(view: TeamView, request: ContextRequest): Promise<Record<string, unknown>> {
  const { audience, ref } = request;
  if (ref) {
    const step = findStep(ref, request.playbook ? [resolvePlaybook(request.playbooks, request.playbook)] : request.playbooks);
    if (step) {
      const context = await stepContext(view, audience, step, loadSteps(step.playbook));
      const extra = step.id === "write" ? templatesFor(view, step.playbook, audience)
        : step.id === "follow-up" || step.id === "send" ? settingsFor(view, step.playbook, audience) : {};
      return { audience, ...context, ...extra };
    }
    // A general file, such as `context about`, in every layer that has one.
    const playbook = resolvePlaybook(request.playbooks, request.playbook, ref);
    const name = ref.split("/").pop();
    const named = (await generalFiles(view, playbook, audience, loadSteps(playbook))).filter((file) => file.file === `${name}.md`);
    if (named.length > 0) return { playbook, audience, file: name, files: named };
    throw new OstackError("unknown_step", `No step or general file named "${ref}".`, { steps: request.playbooks.flatMap(loadSteps).map((step) => step.ref) });
  }
  if (!request.playbook && request.playbooks.length > 1) return customizedOverview(view, request.playbooks, audience);
  const playbook = resolvePlaybook(request.playbooks, request.playbook);
  const steps = loadSteps(playbook);
  const files = await playbookFiles(view, playbook, audience, steps);
  const customized = new Set(files.flatMap(({ target }) => ("step" in target ? [target.step] : [])));
  return {
    playbook,
    audience,
    team: teamSummary(view),
    timezone: view.timezone,
    local_time: localTime(new Date(), view.timezone).text,
    ...settingsFor(view, playbook, audience),
    ...personalValues(view.settings.playbooks[playbook]),
    presets: playbookPresets(view, playbook),
    files: files
      .filter(({ target }) => target.kind === "general")
      .map(({ file }) => (request.filesOnly ? { layer: file.layer, source: file.source, file: file.file, path: file.path } : file)),
    ...templatesFor(view, playbook, audience),
    steps: steps.map((step) => ({ id: step.ref, summary: step.summary, used_by: step.used_by, customized: customized.has(step.id) })),
    ...await treeFor(view, playbook),
  };
}

/**
 * Every file the team, this person and this computer added under the kit's folder, at any depth and of any type, so
 * an agent knows what is there beyond the markdown above. Binary files are listed with their type and size only.
 */
async function treeFor(view: TeamView, playbook: string) {
  const tree = await kitTree(view, playbook);
  return tree.length > 0 ? { tree, tree_note: "Every file added under this kit's folder. Open one by path when the task needs it: files show <path> (--me for layer me) or kit_read file over MCP; local ones at disk_path. Binary files are never instructions." } : {};
}

/** With several playbooks and none named: what each one has customized (file names and steps), not a run's context. */
async function customizedOverview(view: TeamView, playbooks: string[], audience: string) {
  return {
    audience,
    team: teamSummary(view),
    timezone: view.timezone,
    local_time: localTime(new Date(), view.timezone).text,
    playbooks: await Promise.all(playbooks.map(async (playbook) => {
      const files = await playbookFiles(view, playbook, audience, loadSteps(playbook));
      return {
        playbook,
        files: files.filter(({ target }) => target.kind === "general").map(({ file }) => ({ layer: file.layer, source: file.source, file: file.file, path: file.path })),
        customized_steps: [...new Set(files.flatMap(({ target }) => ("step" in target ? [`${playbook}/${target.step}`] : [])))],
        ...await treeFor(view, playbook),
      };
    })),
    next: "Name a playbook (--playbook <id>, or playbook over MCP) for its full context before a run.",
  };
}
