import { optional, required, type Args } from "../lib/args.js";
import { OstackError } from "../lib/errors.js";
import { print } from "../lib/output.js";
import { remote, requireManager, requireOnline, type PlaybookValues, type SettingsPatch } from "../lib/remote.js";
import { loadSteps } from "../lib/steps.js";
import { PERSONAL_KEYS, personalValues, playbookValues, resolvePlaybook, teamContext, teamSummary } from "../lib/team-context.js";
import { checkTimeZone, localTime } from "../lib/time.js";
import { checkName, DEFAULT_AUDIENCE, enabledPlaybooks, loadWorkspace, requirePlaybook, type Workspace } from "../lib/workspace.js";
import { PLAYBOOK_CODE } from "../playbooks/index.js";

export function audienceOf(args: Args): string {
  return checkName(optional(args, "audience") ?? DEFAULT_AUDIENCE, "audience");
}

/** The playbook a command is about: --playbook, the prefix of a qualified ref, or the only enabled one. */
export function playbookOf(workspace: Workspace, args: Args, ref?: string): string {
  return resolvePlaybook(enabledPlaybooks(workspace), optional(args, "playbook"), ref);
}

/**
 * `o11 ostack context` returns everything the agent should know before a run of a playbook's audience: files,
 * settings, templates, steps. `o11 ostack context <step>` returns that step's default plus every customization of it.
 * The wallet's kit_read tool returns the same thing over MCP.
 */
export async function contextCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  print(await teamContext(workspace, {
    playbooks: enabledPlaybooks(workspace),
    audience: audienceOf(args),
    playbook: optional(args, "playbook"),
    ref: args.positionals[1],
    filesOnly: args.flags.files === true,
  }));
}

export async function stepsCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const playbooks = optional(args, "playbook") ? [playbookOf(workspace, args)] : enabledPlaybooks(workspace);
  print(playbooks.flatMap(loadSteps).map(({ ref, summary, used_by, changed, renamed_from }) => ({ id: ref, summary, used_by, changed, renamed_from })));
}

/** Names from 0.7 and older. */
const PERSONAL_ALIASES: Record<string, keyof typeof PERSONAL_KEYS> = { mailbox: "sender_email", split: "lead_assignment" };
const PERSONAL_PLAYBOOK = "gtm";

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
  const sub = args.positionals[1] ?? "show";
  const workspace = await loadWorkspace();
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
