import { optional, required, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import { allAudienceTemplates, generalFiles, playbookFiles, playbookPresets, stepContext } from "../lib/layers.js";
import { print } from "../lib/output.js";
import { remote, requireManager, requireOnline, type PlaybookValues, type RemoteSettings, type SettingsPatch } from "../lib/remote.js";
import { findStep, loadSteps } from "../lib/steps.js";
import { checkTimeZone, localTime } from "../lib/time.js";
import { checkName, DEFAULT_AUDIENCE, enabledPlaybooks, loadWorkspace, requirePlaybook, type Workspace } from "../lib/workspace.js";
import { PLAYBOOK_CODE } from "../playbooks/index.js";
import { audienceSettings } from "../playbooks/gtm/audience-settings.js";
import { nextSendAt, showSettings as showGtm } from "../playbooks/gtm/settings.js";

export function audienceOf(args: Args): string {
  return checkName(optional(args, "audience") ?? DEFAULT_AUDIENCE, "audience");
}

/** The playbook a command is about: --playbook, the prefix of a qualified ref, or the only enabled one. */
export function playbookOf(workspace: Workspace, args: Args, ref?: string): string {
  const named = optional(args, "playbook") ?? (ref?.includes("/") ? ref.split("/")[0] : undefined);
  if (named) {
    requirePlaybook(workspace, named);
    return named;
  }
  const enabled = enabledPlaybooks(workspace);
  if (enabled.length === 1) return enabled[0]!;
  throw new OstackError("playbook_required", "More than one playbook is enabled. Pass --playbook <id>.", { playbooks: enabled });
}

/** Who is signed in and whether the team's setup came fresh from the wallet or from the saved copy. */
export function teamSummary(workspace: Workspace) {
  const { setup } = workspace;
  return {
    workspace: setup.workspace.name,
    me: setup.me.email,
    role: setup.canManage ? "admin" : "member",
    ...(setup.offline ? { offline: `The wallet could not be reached; using the team setup saved at ${setup.fetched_at}.` } : {}),
  };
}

/** A playbook's settings for one audience. GTM's audience files can override the team's; other playbooks have none yet. */
function settingsFor(workspace: Workspace, playbook: string, audience: string) {
  if (playbook !== "gtm") return { settings: PLAYBOOK_CODE[playbook]?.settings?.show(playbookValues(workspace.settings, playbook)) ?? {} };
  const { settings, from, warnings } = audienceSettings(workspace, audience);
  // Outbound schedules each first message for this moment, so no agent works out timezones itself.
  const next = nextSendAt(settings, workspace.timezone, new Date());
  return { settings: showGtm(settings), ...(next ? { next_send_at: next.local, next_send_at_utc: next.utc } : {}), ...(from.length > 0 ? { settings_from: from } : {}), ...(warnings.length > 0 ? { warnings } : {}) };
}

/** The audience's templates, with the version id each CRM record keeps. Only GTM's write step uses them. */
function templatesFor(workspace: Workspace, playbook: string, audience: string) {
  if (playbook !== "gtm") return {};
  const all = allAudienceTemplates(workspace, playbook, audience);
  const templates = all.filter((template) => template.active);
  const paused = all.filter((template) => !template.active).map((template) => template.name);
  return all.length > 0 ? { templates, ab_test: templates.length > 1, ...(paused.length > 0 ? { paused_templates: paused } : {}) } : {};
}

/**
 * `o11 ostack context` returns everything the agent should know before a run of a playbook's audience: files,
 * settings, templates, steps. `o11 ostack context <step>` returns that step's default plus every customization of it.
 */
export async function contextCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const audience = audienceOf(args);
  const ref = args.positionals[1];
  if (ref) {
    const step = findStep(ref, optional(args, "playbook") ? [playbookOf(workspace, args)] : enabledPlaybooks(workspace));
    if (step) {
      const context = await stepContext(workspace, audience, step, loadSteps(step.playbook));
      const extra = step.id === "write" ? templatesFor(workspace, step.playbook, audience)
        : step.id === "follow-up" || step.id === "send" ? settingsFor(workspace, step.playbook, audience) : {};
      return print({ audience, ...context, ...extra });
    }
    // A general file, such as `o11 ostack context about`, in every layer that has one.
    const playbook = playbookOf(workspace, args, ref);
    const name = ref.split("/").pop();
    const named = (await generalFiles(workspace, playbook, audience, loadSteps(playbook))).filter((file) => file.file === `${name}.md`);
    if (named.length > 0) return print({ playbook, audience, file: name, files: named });
    throw new OstackError("unknown_step", `No step or general file named "${ref}".`, {
      steps: enabledPlaybooks(workspace).flatMap(loadSteps).map((step) => step.ref),
    });
  }
  const playbook = playbookOf(workspace, args);
  const steps = loadSteps(playbook);
  const files = await playbookFiles(workspace, playbook, audience, steps);
  const customized = new Set(files.flatMap(({ target }) => ("step" in target ? [target.step] : [])));
  print({
    playbook,
    audience,
    team: teamSummary(workspace),
    timezone: workspace.timezone,
    local_time: localTime(new Date(), workspace.timezone).text,
    ...settingsFor(workspace, playbook, audience),
    ...personalValues(workspace.settings.playbooks[playbook]),
    presets: playbookPresets(workspace, playbook),
    files: files
      .filter(({ target }) => target.kind === "general")
      .map(({ file }) => (args.flags.files === true ? { layer: file.layer, source: file.source, file: file.file, path: file.path } : file)),
    ...templatesFor(workspace, playbook, audience),
    steps: steps.map((step) => ({ id: step.ref, summary: step.summary, used_by: step.used_by, customized: customized.has(step.id) })),
  });
}

export async function stepsCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const playbooks = optional(args, "playbook") ? [playbookOf(workspace, args)] : enabledPlaybooks(workspace);
  print(playbooks.flatMap(loadSteps).map(({ ref, summary, used_by, changed, renamed_from }) => ({ id: ref, summary, used_by, changed, renamed_from })));
}

/** Values every person sets for themselves, kept in their GTM settings; the team has no value for them. */
const PERSONAL_KEYS = { sender_email: "senderEmail", lead_assignment: "leadAssignment" } as const;
/** Names from 0.7 and older. */
const PERSONAL_ALIASES: Record<string, keyof typeof PERSONAL_KEYS> = { mailbox: "sender_email", split: "lead_assignment" };
const PERSONAL_PLAYBOOK = "gtm";

function playbookValues(settings: RemoteSettings, playbook: string): PlaybookValues {
  return settings.playbooks[playbook] ?? {};
}

function personalValues(values: PlaybookValues | undefined) {
  return Object.fromEntries(Object.entries(PERSONAL_KEYS).flatMap(([key, stored]) => (typeof values?.[stored] === "string" ? [[key, values[stored]]] : [])));
}

function showSettings(workspace: Workspace) {
  const { team, mine } = workspace.setup.settings;
  const personalStored = new Set<string>(Object.values(PERSONAL_KEYS));
  // Values where this person's own setting replaces the team's.
  const own = [
    ...(mine.timezone ? ["timezone"] : []),
    ...Object.entries(mine.playbooks).flatMap(([playbook, values]) => Object.keys(values).filter((key) => !personalStored.has(key)).map((key) => `${playbook}.${key}`)),
  ];
  return {
    timezone: workspace.timezone,
    local_time: localTime(new Date(), workspace.timezone).text,
    playbooks: Object.fromEntries(enabledPlaybooks(workspace).map((playbook) => [playbook, {
      ...(PLAYBOOK_CODE[playbook]?.settings?.show(playbookValues(workspace.settings, playbook)) ?? {}),
      ...personalValues(mine.playbooks[playbook]),
    }])),
    my_overrides: own,
    team_timezone: team.timezone,
  };
}

/** Only the keys the change actually alters, so a personal change never pins the rest of the team's values. */
function changed(base: PlaybookValues, next: PlaybookValues): PlaybookValues {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(base[key] ?? null) !== JSON.stringify(value ?? null)));
}

/**
 * `settings set <key> <value>` changes the team's value (owners and admins); with --me it changes only yours.
 * `settings unset <key> --me` goes back to the team's value. `timezone` is core; `sender_email` and
 * `lead_assignment` are always yours; everything else belongs to a playbook, such as gtm.send_mode. An audience's
 * own values go in its audience.md and follow-up.md instead.
 */
export async function settingsCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const sub = args.positionals[1] ?? "show";
  if (sub === "show") return print({ team: teamSummary(workspace), ...showSettings(workspace) });
  if (sub !== "set" && sub !== "unset") throw new OstackError("unknown_command", "Use: o11 ostack settings show | set <key> <value> [--me] | unset <key> --me.");
  requireOnline(workspace.setup, "changing settings");
  const key = args.positionals[2] ?? required(args, "key");
  const bare = key.replace(/^gtm\./, "");
  const personalKey = PERSONAL_ALIASES[bare] ?? (bare in PERSONAL_KEYS ? bare as keyof typeof PERSONAL_KEYS : undefined);
  const personal = args.flags.me === true || personalKey !== undefined;
  if (!personal) requireManager(workspace.setup, "change the team's settings");
  const base = personal ? workspace.settings : workspace.setup.settings.team;
  let patch: SettingsPatch;
  if (sub === "unset") {
    if (!personal) throw new OstackError("invalid_flag", "Only your own values can be unset. Pass --me.");
    if (key === "timezone") patch = { timezone: null };
    else if (personalKey) patch = { playbooks: { [PERSONAL_PLAYBOOK]: { [PERSONAL_KEYS[personalKey]]: null } } };
    else {
      const [playbook, setting] = playbookSetting(workspace, key);
      patch = { playbooks: { [playbook]: Object.fromEntries(PLAYBOOK_CODE[playbook]!.settings!.stored(setting).map((field) => [field, null])) } };
    }
  } else {
    const value = args.positionals[3] ?? required(args, "value");
    if (key === "timezone") patch = { timezone: checkTimeZone(value) };
    else if (personalKey) patch = { playbooks: { [PERSONAL_PLAYBOOK]: { [PERSONAL_KEYS[personalKey]]: value.trim() || null } } };
    else {
      const [playbook, setting] = playbookSetting(workspace, key);
      const current = playbookValues(base, playbook);
      patch = { playbooks: { [playbook]: changed(current, PLAYBOOK_CODE[playbook]!.settings!.apply(current, setting, value)) } };
    }
  }
  const empty = patch.playbooks && Object.values(patch.playbooks).every((values) => Object.keys(values).length === 0);
  if (!empty) await remote().saveSettings({ scope: personal ? "me" : "team", values: patch });
  const after = await loadWorkspace();
  print({ set: key, scope: personal ? "me" : "team", ...showSettings(after) });
}

function playbookSetting(workspace: Workspace, key: string): [string, string] {
  const [playbook, setting] = key.includes(".") ? (key.split(".", 2) as [string, string]) : [settingOwner(workspace, key), key];
  requirePlaybook(workspace, playbook);
  if (!PLAYBOOK_CODE[playbook]?.settings) throw new OstackError("unknown_setting", `The ${playbook} playbook has no settings.`);
  return [playbook, setting];
}

function settingOwner(workspace: Workspace, key: string): string {
  const owners = enabledPlaybooks(workspace).filter((playbook) => {
    const settings = PLAYBOOK_CODE[playbook]?.settings;
    return settings && (settings.keys.includes(key) || key in (settings.aliases ?? {}));
  });
  if (owners.length === 1) return owners[0]!;
  throw new OstackError("unknown_setting", owners.length === 0 ? `Unknown setting "${key}".` : `Several playbooks have "${key}"; use <playbook>.${key}.`, {
    settings: ["timezone", ...Object.keys(PERSONAL_KEYS), ...enabledPlaybooks(workspace).flatMap((playbook) => (PLAYBOOK_CODE[playbook]?.settings?.keys ?? []).map((item) => `${playbook}.${item}`))],
  });
}
