import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Args } from "../lib/args.js";
import { classify } from "../lib/layers.js";
import { print } from "../lib/output.js";
import { isRecord } from "../lib/paths.js";
import { remote, requireManager, requireOnline, type Answer, type SettingsPatch } from "../lib/remote.js";
import { PREVIOUS_STATE_FILE } from "../lib/state.js";
import { loadQuestions, loadSteps } from "../lib/steps.js";
import { checkTimeZone } from "../lib/time.js";
import { LEGACY_CAMPAIGNS_DIR, LEGACY_CUSTOM_DIR, loadWorkspace } from "../lib/workspace.js";
import { readSettings, toPatch } from "../playbooks/gtm/settings.js";

type LegacyFile = { file: string; path: string };

async function markdown(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
}

async function folders(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name)).map((entry) => entry.name).sort();
}

/** Team files a 0.6 or older folder kept in custom/ and campaigns/, with the path each gets in the wallet. */
export async function legacyFiles(root: string): Promise<LegacyFile[]> {
  const custom = join(root, LEGACY_CUSTOM_DIR);
  const gtmSteps = new Set(loadSteps("gtm").map((step) => step.id));
  const files: LegacyFile[] = [];
  for (const name of await markdown(custom)) {
    // Step files from before playbooks belong to gtm.
    files.push({ file: join(custom, name), path: classify(name, gtmSteps).kind === "general" ? name : `gtm/${name}` });
  }
  for (const playbook of await folders(custom)) {
    for (const name of await markdown(join(custom, playbook))) files.push({ file: join(custom, playbook, name), path: `${playbook}/${name}` });
  }
  const audiences = join(root, LEGACY_CAMPAIGNS_DIR);
  for (const audience of await folders(audiences)) {
    for (const name of await markdown(join(audiences, audience))) files.push({ file: join(audiences, audience, name), path: `gtm/audiences/${audience === "main" ? "default" : audience}/${name}` });
  }
  return files.filter((item) => /^(?:[a-z0-9][a-z0-9-]*\/){0,3}[a-z0-9][a-z0-9_-]*\.md$/.test(item.path));
}

/** Settings and answers a 0.6 or older ostack.json held, read from the backup kept at upgrade. */
async function legacySettings(root: string): Promise<{ values: SettingsPatch; answered: Record<string, Answer> }> {
  const path = join(root, PREVIOUS_STATE_FILE);
  if (!existsSync(path)) return { values: {}, answered: {} };
  const raw: unknown = await Bun.file(path).json().catch(() => null);
  if (!isRecord(raw)) return { values: {}, answered: {} };
  const flat = raw.format === undefined;
  const gtm = !flat && isRecord(raw.modules) && isRecord(raw.modules.gtm) ? raw.modules.gtm : raw;
  const settings = flat ? { mode: raw.mode, limits: raw.limits, follow_up_days: raw.follow_up_days, send_window: null } : isRecord(gtm.settings) ? gtm.settings : {};
  const presets = Array.isArray(gtm.packs) ? gtm.packs.filter((item): item is string => typeof item === "string").map((name) => (name.includes("/") ? name : `gtm/${name}`)) : [];
  const values: SettingsPatch = { playbooks: { gtm: toPatch(readSettings(settings)) }, ...(presets.length > 0 ? { presets } : {}) };
  try {
    if (typeof raw.timezone === "string") values.timezone = checkTimeZone(raw.timezone);
  } catch {
    // An unknown zone is left for the setup interview to ask about.
  }
  const answered: Record<string, Answer> = {};
  if (isRecord(raw.answered)) {
    for (const [id, value] of Object.entries(raw.answered)) {
      if (!isRecord(value) || typeof value.version !== "string") continue;
      answered[flat && !["schedule", "timezone"].includes(id) ? `gtm/${id}` : id] = { version: value.version, skipped: value.skipped === true };
    }
  }
  return { values, answered };
}

/**
 * `o11 ostack setup import [--dry-run]`: copies a folder's pre-teams setup (custom/, campaigns/, settings and
 * answers) into the team's setup in the wallet. Never overwrites what the team already has. custom.local/ stays
 * on this computer and keeps applying for this person.
 */
export async function importCommand(args: Args): Promise<void> {
  const workspace = await loadWorkspace();
  const dryRun = args.flags["dry-run"] === true;
  const existing = new Set(workspace.setup.files.team.map((file) => file.path));
  const files = await legacyFiles(workspace.root);
  const { values, answered } = await legacySettings(workspace.root);
  const team = workspace.setup.settings.team;
  // Only values the team has not set yet; the team's choices win.
  const teamGtm = team.playbooks.gtm ?? {};
  const gtm = Object.fromEntries(Object.entries(values.playbooks?.gtm ?? {}).filter(([key]) => teamGtm[key] === undefined));
  const settings: SettingsPatch = {
    ...(values.timezone && !team.timezone ? { timezone: values.timezone } : {}),
    ...(values.presets && !team.presets ? { presets: values.presets } : {}),
    ...(Object.keys(gtm).length > 0 ? { playbooks: { gtm } } : {}),
  };
  const personal = new Set(loadQuestions(workspace.state.playbooks).filter((question) => question.scope === "personal").map((question) => question.id));
  const teamAnswers = Object.fromEntries(Object.entries(answered).filter(([id]) => !personal.has(id) && !team.setupAnswers[id]));
  const myAnswers = Object.fromEntries(Object.entries(answered).filter(([id]) => personal.has(id) && !workspace.setup.settings.mine.setupAnswers[id]));
  const plan = {
    files: files.filter((item) => !existing.has(item.path)).map((item) => ({ from: item.file, to: item.path })),
    kept: files.filter((item) => existing.has(item.path)).map((item) => ({ from: item.file, reason: `the team already has ${item.path}` })),
    settings: [...Object.keys(settings).filter((key) => key !== "playbooks"), ...Object.keys(settings.playbooks?.gtm ?? {}).map((key) => `gtm.${key}`)],
    answers: [...Object.keys(teamAnswers), ...Object.keys(myAnswers)],
  };
  if (dryRun) return print({ dry_run: true, ...plan });
  requireOnline(workspace.setup, "importing");
  requireManager(workspace.setup, "import a folder's setup into the team");
  const client = remote();
  for (const item of plan.files) {
    await client.saveFile({ scope: "team", path: item.to, content: await Bun.file(item.from).text(), baseVersion: null });
  }
  if (Object.keys(settings).length > 0 || Object.keys(teamAnswers).length > 0) {
    await client.saveSettings({ scope: "team", values: { ...settings, setupAnswers: teamAnswers } });
  }
  if (Object.keys(myAnswers).length > 0) await client.saveSettings({ scope: "me", values: { setupAnswers: myAnswers } });
  print({ dry_run: false, ...plan, next: "The files in custom/ and campaigns/ are no longer read. Delete them once the team setup looks right." });
}
