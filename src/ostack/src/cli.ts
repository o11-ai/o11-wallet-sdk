import { resolve } from "node:path";
import { optional, parseArgs, type Args } from "./lib/args.js";
import { OstackError } from "./lib/errors.js";
import { printError, printText } from "./lib/output.js";
import { useRemote, type OstackRemote } from "./lib/remote.js";
import { VERSION } from "./lib/version.js";
import { contextCommand, settingsCommand, stepsCommand } from "./commands/customize.js";
import { doctorCommand } from "./commands/doctor.js";
import { notesCommand } from "./commands/notes.js";
import { runCommand } from "./commands/run.js";
import { scheduleCommand } from "./commands/schedule.js";
import { setupCommand } from "./commands/setup.js";
import { refreshInstalledSkills, skillsCommand } from "./commands/skills.js";
import { initCommand, modulesCommand, packsCommand, promptCommand } from "./commands/workspace.js";
import { MODULE_CODE } from "./modules/index.js";

const HELP = `o11 ostack: outbound workflows your coding agent sets up by talking to you

Your team's notes and settings live in your o11 workspace; sign in with "o11 login".
Owners and admins change the team's; --me changes only yours.

Install and workspace
  skills install [--host claude|codex|cursor|gemini|auto] | skills status | skills uninstall
                                               copy the ostack skills into your coding agents (kept current by o11 update)
  init [--dir <path>] [--modules gtm]          create a folder on this computer for schedules and personal notes
  modules list | add <id> | remove <id>        which modules (families of workflows) this folder runs
  doctor                                       check sign-in, skills, folder, setup and schedules

Customization
  context [<step>|<note>] [--module <id>] [--campaign <name>] [--files]   what to know before a run (--files: note names only),
                                               or one step's default plus every customization of it
  steps [--module <id>]                        the named steps customizations attach to, such as gtm/write
  notes list | show <path> [--me] | export [--dir <folder>]
  notes write <path> [--me] --text <text>|--text-file <path|-> [--base-version <n>]
  notes delete <path> [--me] --base-version <n>
                                               paths like about.md, gtm/write.md, campaigns/<name>/write.md; a change to an
                                               existing note names the version you read, so nobody's edit is overwritten
  settings show | settings set <key> <value> [--me] | settings unset <key> --me
                                               timezone, mailbox, split, or a module's own, such as gtm.mode (see "o11 ostack gtm help")
  setup status | answer <question> [--skip] | reviewed | reset [--question <id>] | import [--dry-run]
                                               import copies a folder's setup from before teams (custom/, campaigns/) to the team
  packs list | add <name> | remove <name> | show <name>   shared starting points, such as gtm/gmail

Schedules (in the team's timezone, or yours with settings set timezone --me)
  schedule list                                every workflow, its schedule and where it is installed
  schedule set <workflow> --at HH:MM | --every <minutes> [--from HH:MM] [--to HH:MM] [--offset <minutes>] [--days weekdays]
  schedule on|off <workflow>
  schedule spec <workflow> --host claude|codex|cron   exactly what to create in that scheduler
  schedule installed|uninstalled <workflow> --host claude|codex|cron [--name <task name>]
  schedule cron show|install|remove [--agent claude|codex]   for agents without a scheduler
  prompt <workflow> [--campaign <name>]        the instruction a scheduled run follows
  run start <workflow> [--scheduled] | run end <workflow> [--summary <text>] [--counts <name=n,...>]
                                               one run at a time; --scheduled also stops a run that fired outside its schedule.
                                               Runs show up for the team on the wallet's Ostack page (account menu), Activity tab

Module commands: o11 ostack <module> <command>. "o11 ostack gtm help" lists gtm's.

Global: --workspace <path> (or OSTACK_WORKSPACE). All commands print JSON.`;

const COMMANDS: Record<string, (args: Args) => Promise<void>> = {
  init: initCommand,
  modules: modulesCommand,
  context: contextCommand,
  steps: stepsCommand,
  notes: notesCommand,
  settings: settingsCommand,
  setup: setupCommand,
  packs: packsCommand,
  skills: skillsCommand,
  doctor: doctorCommand,
  schedule: scheduleCommand,
  prompt: promptCommand,
  run: runCommand,
};

/** Before modules, gtm's commands sat at the top level (`ostack due`). They keep working. */
const LEGACY_MODULE = "gtm";

/** Runs one `o11 ostack ...` command. Prints JSON (or text for help and prompt) and returns the exit code. */
export async function runOstack(argv: string[], client: OstackRemote): Promise<number> {
  useRemote(client);
  try {
    await dispatch(argv);
  } catch (error) {
    printError(error);
  }
  return typeof process.exitCode === "number" ? process.exitCode : 0;
}

async function dispatch(argv: string[]): Promise<void> {
  let args = parseArgs(argv);
  const workspace = optional(args, "workspace");
  if (workspace) process.env.OSTACK_WORKSPACE = resolve(workspace);
  let command = args.positionals[0];
  if (command === "version" || args.flags.version === true) return printText(VERSION);
  if (!command || command === "help") return printText(HELP);
  if (command !== "skills") refreshInstalledSkills();
  if (command === "upgrade") throw new OstackError("removed_command", 'ostack now updates with the o11 CLI. Run "o11 update".');
  let help = HELP;
  let prefix = "";
  const legacy = MODULE_CODE[LEGACY_MODULE];
  const module = MODULE_CODE[command] ? command : (legacy?.commands[command] || legacy?.removed?.[command]) && !COMMANDS[command] ? LEGACY_MODULE : null;
  if (module) {
    if (command === module) args = { ...args, positionals: args.positionals.slice(1) };
    command = args.positionals[0];
    help = MODULE_CODE[module]!.help;
    prefix = `${module} `;
    if (!command || command === "help") return printText(`o11 ostack ${module} commands\n\n${help}`);
  }
  const removed = module ? MODULE_CODE[module]!.removed?.[command!] : undefined;
  if (removed) throw new OstackError("removed_command", `o11 ostack ${prefix}${command} was removed. ${removed}`);
  if (args.flags.help === true || args.positionals.slice(1).includes("help")) return printText(helpFor(help, command!));
  const handler = module ? MODULE_CODE[module]!.commands[command!] : COMMANDS[command!];
  if (!handler) throw new OstackError("unknown_command", `Unknown command "${prefix}${command}". Run "o11 ostack ${prefix}help".`);
  checkFlags(help, `${prefix}${command}`, command!, args);
  await handler(args);
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
