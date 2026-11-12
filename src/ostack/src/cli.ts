import { resolve } from "node:path";
import { optional, parseArgs, type Args } from "./lib/args.js";
import { OstackError } from "./lib/errors.js";
import { printError, printText } from "./lib/output.js";
import { useRemote, type PlaybookRemote } from "./lib/remote.js";
import { VERSION } from "./lib/version.js";
import { contextCommand, settingsCommand, stepsCommand } from "./commands/customize.js";
import { doctorCommand } from "./commands/doctor.js";
import { filesCommand } from "./commands/files.js";
import { runCommand } from "./commands/run.js";
import { scheduleCommand } from "./commands/schedule.js";
import { setupCommand } from "./commands/setup.js";
import { refreshInstalledSkills, skillsCommand } from "./commands/skills.js";
import { initCommand, playbooksCommand, presetsCommand, promptCommand } from "./commands/workspace.js";
import { PLAYBOOK_CODE } from "./playbooks/index.js";

const HELP = `o11 ostack: playbooks your coding agent sets up by talking to you, outbound (gtm) and launch videos (launch-videos)

Your team's playbook files and settings live in your o11 workspace; sign in with "o11 login".
Owners and admins change the team's; --me changes only yours.

Install and workspace
  skills install [--host claude|codex|cursor|gemini|auto] | skills status | skills uninstall
                                               copy the ostack skills into your coding agents (kept current by o11 update)
  init [--dir <path>] [--playbooks gtm,launch-videos]   create a folder on this computer for schedules and personal files
                                               (default: this folder; ~/ostack when run from your home folder)
  playbooks list | add <id> | remove <id>      which playbooks (families of workflows) this folder runs
  doctor                                       check sign-in, skills, folder, setup and schedules

Customization
  context [<step>|<file>] [--playbook <id>] [--audience <name>] [--files]   what to know before a run (--files: file names only),
                                               or one step's default plus every customization of it
  steps [--playbook <id>]                      the named steps customizations attach to, such as gtm/write
  files list | show <path> [--me] | show --version <id> | export [--dir <folder>]
  files write <path> [--me] --text <text>|--text-file <path|-> [--base-version <n>]
  files delete <path> [--me] --base-version <n>
                                               paths like about.md, gtm/write.md, gtm/audiences/<name>/template-a.md; a change
                                               to an existing file names the version you read, so nobody's edit is overwritten.
                                               Every save keeps a version id; CRM records store it as o11_template
  settings show | settings set <key> <value> [--me] | settings unset <key> --me
                                               timezone, sender_email, lead_assignment, or a playbook's own, such as gtm.send_mode
                                               (see "o11 ostack gtm help")
  setup status | answer <question> [--skip] | reviewed | reset [--question <id>] | import [--dry-run]
                                               import copies a folder's setup from before teams (custom/, campaigns/) to the team
  presets list | add <name> | remove <name> | show <name>   ready-made files a playbook ships, such as gtm/gmail

Schedules (in the team's timezone, or yours with settings set timezone --me)
  schedule list                                every workflow (and audience), its schedule and where it is installed
  schedule set <workflow> [--audience <name>] --at HH:MM | --every <minutes> [--from HH:MM] [--to HH:MM] [--offset <minutes>] [--days weekdays]
  schedule on|off <workflow> [--audience <name>]
  schedule spec <workflow> [--audience <name>] --host claude|codex|cron   exactly what to create in that scheduler
  schedule installed|uninstalled <workflow> [--audience <name>] --host claude|codex|cron [--name <task name>]
  schedule cron show|install|remove [--agent claude|codex]   for agents without a scheduler
  prompt <workflow> [--audience <name>]        the instruction a scheduled run follows
  run start <workflow> [--audience <name>] [--scheduled]
  run end <workflow> [--audience <name>] [--summary <text>] [--counts <name=n,...>] [--template-counts <json>]
                                               one run per workflow and audience at a time; --scheduled also stops a run that
                                               fired outside its schedule. Runs show up for the team on the wallet's Ostack page

Playbook commands: o11 ostack <playbook> <command>, such as "o11 ostack gtm help" or "o11 ostack launch-videos help".

Global: --workspace <path> (or OSTACK_WORKSPACE). All commands print JSON.`;

const COMMANDS: Record<string, (args: Args) => Promise<void>> = {
  init: initCommand,
  playbooks: playbooksCommand,
  context: contextCommand,
  steps: stepsCommand,
  files: filesCommand,
  settings: settingsCommand,
  setup: setupCommand,
  presets: presetsCommand,
  skills: skillsCommand,
  doctor: doctorCommand,
  schedule: scheduleCommand,
  prompt: promptCommand,
  run: runCommand,
};

/** Names from 0.7 and older, so scheduled tasks and agents with old instructions keep working. */
const COMMAND_ALIASES: Record<string, string> = { notes: "files", packs: "presets", modules: "playbooks" };
const FLAG_ALIASES: Record<string, string> = { module: "playbook", modules: "playbooks", campaign: "audience" };

/** Before playbooks, gtm's commands sat at the top level (`ostack due`). They keep working. */
const LEGACY_PLAYBOOK = "gtm";

/** Runs one `o11 ostack ...` command. Prints JSON (or text for help and prompt) and returns the exit code. */
export async function runOstack(argv: string[], client: PlaybookRemote): Promise<number> {
  useRemote(client);
  try {
    await dispatch(argv);
  } catch (error) {
    printError(error);
  }
  return typeof process.exitCode === "number" ? process.exitCode : 0;
}

async function dispatch(argv: string[]): Promise<void> {
  let args = withAliases(parseArgs(argv));
  const workspace = optional(args, "workspace");
  if (workspace) process.env.OSTACK_WORKSPACE = resolve(workspace);
  let command = args.positionals[0];
  if (command === "version" || args.flags.version === true) return printText(VERSION);
  if (!command || command === "help") return printText(HELP);
  if (command !== "skills") refreshInstalledSkills();
  if (command === "upgrade") throw new OstackError("removed_command", 'ostack now updates with the o11 CLI. Run "o11 update".');
  let help = HELP;
  let prefix = "";
  const legacy = PLAYBOOK_CODE[LEGACY_PLAYBOOK];
  const playbook = PLAYBOOK_CODE[command] ? command : (legacy?.commands[command] || legacy?.removed?.[command]) && !COMMANDS[command] ? LEGACY_PLAYBOOK : null;
  if (playbook) {
    if (command === playbook) args = { ...args, positionals: args.positionals.slice(1) };
    command = args.positionals[0];
    help = PLAYBOOK_CODE[playbook]!.help;
    prefix = `${playbook} `;
    if (!command || command === "help") return printText(`o11 ostack ${playbook} commands\n\n${help}`);
  }
  const removed = playbook ? PLAYBOOK_CODE[playbook]!.removed?.[command!] : undefined;
  if (removed) throw new OstackError("removed_command", `o11 ostack ${prefix}${command} was removed. ${removed}`);
  if (args.flags.help === true || args.positionals.slice(1).includes("help")) return printText(helpFor(help, command!));
  const handler = playbook ? PLAYBOOK_CODE[playbook]!.commands[command!] : COMMANDS[command!];
  if (!handler) throw new OstackError("unknown_command", `Unknown command "${prefix}${command}". Run "o11 ostack ${prefix}help".`);
  checkFlags(help, `${prefix}${command}`, command!, args);
  await handler(args);
}

/** Old command and flag names map to the current ones before anything else reads them. */
function withAliases(args: Args): Args {
  const [first, ...rest] = args.positionals;
  const positionals = first && COMMAND_ALIASES[first] ? [COMMAND_ALIASES[first]!, ...rest] : args.positionals;
  const flags = Object.fromEntries(Object.entries(args.flags).map(([name, value]) => [FLAG_ALIASES[name] ?? name, value]));
  return { positionals, flags };
}

const GLOBAL_FLAGS = ["workspace", "help", "version"];

/** Rejects flags a command does not take, so a typo or an imagined flag (--dry-run) never runs the real thing. */
function checkFlags(help: string, name: string, command: string, args: Args): void {
  const usage = helpFor(help, command);
  const known = new Set([...GLOBAL_FLAGS, ...[...usage.matchAll(/--([a-z][a-z-]*)/g)].map((match) => match[1]!)]);
  const unknown = Object.keys(args.flags).filter((flag) => !known.has(flag));
  if (unknown.length > 0) {
    throw new OstackError("unknown_flag", `o11 ostack ${name} does not take ${unknown.map((flag) => `--${flag}`).join(", ")}. Nothing was changed.`, {
      usage: usage.split("\n").map((line) => line.trim()),
    });
  }
}

/** The help lines for one command, with their continuation lines. */
function helpFor(help: string, command: string): string {
  const lines = help.split("\n");
  const picked = lines.filter((line, index) => {
    const own = (text: string) => text.trimStart().split(/\s/)[0] === command;
    if (own(line)) return true;
    for (let back = index; back > 0 && /^\s{6,}/.test(lines[back]!); back--) if (own(lines[back - 1]!)) return true;
    return false;
  });
  return picked.length > 0 ? picked.join("\n") : help;
}
