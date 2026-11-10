import { optional, required, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import { generalNotes, modulePacks, moduleNotes, stepContext } from "../lib/layers.js";
import { print } from "../lib/output.js";
import { remote, requireManager, requireOnline, type ModuleValues, type RemoteSettings, type SettingsPatch } from "../lib/remote.js";
import { findStep, loadSteps } from "../lib/steps.js";
import { checkTimeZone, localTime } from "../lib/time.js";
import { checkName, DEFAULT_CAMPAIGN, enabledModules, loadWorkspace, requireModule, type Workspace } from "../lib/workspace.js";
import { MODULE_CODE } from "../modules/index.js";

function campaignOf(args: Args): string {
  return checkName(optional(args, "campaign") ?? DEFAULT_CAMPAIGN, "campaign");
}

/** The module a command is about: --module, the prefix of a qualified ref, or the only enabled one. */
export function moduleOf(workspace: Workspace, args: Args, ref?: string): string {
  const named = optional(args, "module") ?? (ref?.includes("/") ? ref.split("/")[0] : undefined);
  if (named) {
    requireModule(workspace, named);
    return named;
  }
  const enabled = enabledModules(workspace);
  if (enabled.length === 1) return enabled[0]!;
  throw new OstackError("module_required", "More than one module is enabled. Pass --module <id>.", { modules: enabled });
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

/**
 * `o11 ostack context` returns everything the agent should know before a run of a module: notes, settings, steps.
 * `o11 ostack context <step>` returns that step's default plus every customization of it, in priority order.
 */
export async function contextCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const campaign = campaignOf(args);
  const ref = args.positionals[1];
  if (ref) {
    const step = findStep(ref, optional(args, "module") ? [moduleOf(workspace, args)] : enabledModules(workspace));
    if (step) return print({ campaign, ...(await stepContext(workspace, campaign, step, loadSteps(step.module))) });
    // A general note, such as `o11 ostack context about`, in every layer that has one.
    const module = moduleOf(workspace, args, ref);
    const name = ref.split("/").pop();
    const named = (await generalNotes(workspace, module, campaign, loadSteps(module))).filter((note) => note.file === `${name}.md`);
    if (named.length > 0) return print({ module, campaign, note: name, notes: named });
    throw new OstackError("unknown_step", `No step or general note named "${ref}".`, {
      steps: enabledModules(workspace).flatMap(loadSteps).map((step) => step.ref),
    });
  }
  const module = moduleOf(workspace, args);
  const steps = loadSteps(module);
  const notes = await moduleNotes(workspace, module, campaign, steps);
  const customized = new Set(notes.flatMap(({ target }) => ("step" in target ? [target.step] : [])));
  print({
    module,
    campaign,
    team: teamSummary(workspace),
    timezone: workspace.timezone,
    local_time: localTime(new Date(), workspace.timezone).text,
    settings: MODULE_CODE[module]?.settings?.show(moduleValues(workspace.settings, module)) ?? {},
    ...personalValues(workspace.settings.modules[module]),
    packs: modulePacks(workspace, module),
    notes: notes
      .filter(({ target }) => target.kind === "general")
      .map(({ note }) => (args.flags.files === true ? { layer: note.layer, source: note.source, file: note.file, path: note.path } : note)),
    steps: steps.map((step) => ({ id: step.ref, summary: step.summary, used_by: step.used_by, customized: customized.has(step.id) })),
  });
}

export async function stepsCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const modules = optional(args, "module") ? [moduleOf(workspace, args)] : enabledModules(workspace);
  print(modules.flatMap(loadSteps).map(({ ref, summary, used_by, changed, renamed_from }) => ({ id: ref, summary, used_by, changed, renamed_from })));
}

/** Values every person sets for themselves, kept in their gtm settings; the team has no value for them. */
const PERSONAL_KEYS = ["mailbox", "split"] as const;
const PERSONAL_MODULE = "gtm";

function moduleValues(settings: RemoteSettings, module: string): ModuleValues {
  return settings.modules[module] ?? {};
}

function personalValues(values: ModuleValues | undefined) {
  return Object.fromEntries(PERSONAL_KEYS.flatMap((key) => (typeof values?.[key] === "string" ? [[key, values[key]]] : [])));
}

function showSettings(workspace: Workspace) {
  const { team, mine } = workspace.setup.settings;
  // Values where this person's own setting replaces the team's.
  const own = [
    ...(mine.timezone ? ["timezone"] : []),
    ...Object.entries(mine.modules).flatMap(([module, values]) => Object.keys(values).filter((key) => !(PERSONAL_KEYS as readonly string[]).includes(key)).map((key) => `${module}.${key}`)),
  ];
  return {
    timezone: workspace.timezone,
    local_time: localTime(new Date(), workspace.timezone).text,
    modules: Object.fromEntries(enabledModules(workspace).map((module) => [module, {
      ...(MODULE_CODE[module]?.settings?.show(moduleValues(workspace.settings, module)) ?? {}),
      ...personalValues(mine.modules[module]),
    }])),
    my_overrides: own,
    team_timezone: team.timezone,
  };
}

/** Only the keys the change actually alters, so a personal change never pins the rest of the team's values. */
function changed(base: ModuleValues, next: ModuleValues): ModuleValues {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(base[key] ?? null) !== JSON.stringify(value ?? null)));
}

/**
 * `settings set <key> <value>` changes the team's value (owners and admins); with --me it changes only yours.
 * `settings unset <key> --me` goes back to the team's value. `timezone` is core; `mailbox` and `split` are always yours;
 * everything else belongs to a module, such as gtm.mode.
 */
export async function settingsCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const sub = args.positionals[1] ?? "show";
  if (sub === "show") return print({ team: teamSummary(workspace), ...showSettings(workspace) });
  if (sub !== "set" && sub !== "unset") throw new OstackError("unknown_command", "Use: o11 ostack settings show | set <key> <value> [--me] | unset <key> --me.");
  requireOnline(workspace.setup, "changing settings");
  const key = args.positionals[2] ?? required(args, "key");
  const bare = key.replace(/^gtm\./, "");
  const personalKey = (PERSONAL_KEYS as readonly string[]).includes(bare);
  const personal = args.flags.me === true || personalKey;
  if (!personal) requireManager(workspace.setup, "change the team's settings");
  const base = personal ? workspace.settings : workspace.setup.settings.team;
  let patch: SettingsPatch;
  if (sub === "unset") {
    if (!personal) throw new OstackError("invalid_flag", "Only your own values can be unset. Pass --me.");
    if (key === "timezone") patch = { timezone: null };
    else if (personalKey) patch = { modules: { [PERSONAL_MODULE]: { [bare]: null } } };
    else {
      const [module, setting] = moduleSetting(workspace, key);
      patch = { modules: { [module]: Object.fromEntries(storedKeys(setting).map((field) => [field, null])) } };
    }
  } else {
    const value = args.positionals[3] ?? required(args, "value");
    if (key === "timezone") patch = { timezone: checkTimeZone(value) };
    else if (personalKey) patch = { modules: { [PERSONAL_MODULE]: { [bare]: value.trim() || null } } };
    else {
      const [module, setting] = moduleSetting(workspace, key);
      const current = moduleValues(base, module);
      patch = { modules: { [module]: changed(current, MODULE_CODE[module]!.settings!.apply(current, setting, value)) } };
    }
  }
  const empty = patch.modules && Object.values(patch.modules).every((values) => Object.keys(values).length === 0);
  if (!empty) await remote().saveSettings({ scope: personal ? "me" : "team", values: patch });
  const after = await loadWorkspace();
  print({ set: key, scope: personal ? "me" : "team", ...showSettings(after) });
}

/** The stored keys behind a gtm setting name, for `unset`. */
function storedKeys(setting: string): string[] {
  if (setting === "mode") return ["mode"];
  if (setting === "follow_up_days") return ["followUpDays", "limits"];
  if (setting === "send_window") return ["sendWindow"];
  return ["limits", "followUpDays"];
}

function moduleSetting(workspace: Workspace, key: string): [string, string] {
  const [module, setting] = key.includes(".") ? (key.split(".", 2) as [string, string]) : [settingOwner(workspace, key), key];
  requireModule(workspace, module);
  if (!MODULE_CODE[module]?.settings) throw new OstackError("unknown_setting", `The ${module} module has no settings.`);
  return [module, setting];
}

function settingOwner(workspace: Workspace, key: string): string {
  const owners = enabledModules(workspace).filter((module) => MODULE_CODE[module]?.settings?.keys.includes(key));
  if (owners.length === 1) return owners[0]!;
  throw new OstackError("unknown_setting", owners.length === 0 ? `Unknown setting "${key}".` : `Several modules have "${key}"; use <module>.${key}.`, {
    settings: ["timezone", ...PERSONAL_KEYS, ...enabledModules(workspace).flatMap((module) => (MODULE_CODE[module]?.settings?.keys ?? []).map((item) => `${module}.${item}`))],
  });
}
