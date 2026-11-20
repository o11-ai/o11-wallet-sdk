/**
 * The core `o11 ostack` commands (cli.ts COMMANDS) at subcommand level, and how an agent without the CLI reaches each.
 * An MCP route means the ostack MCP action changes or returns the same stored data; anything that reads or writes
 * the local workspace folder, skills or cron runs on the person's o11 sandbox.
 */
import type { CommandEntry } from "./command-registry.js";

const sandbox = { via: "sandbox" } as const;
const read = (action: string) => ({ via: "mcp", tool: "ostack_read", call: { read: action } }) as const;
const write = (action: string) => ({ via: "mcp", tool: "ostack_write", call: { write: action } }) as const;
const run = (action: string) => ({ via: "mcp", tool: "ostack_run", call: { run: action } }) as const;

export const CORE_COMMAND_ROUTES: readonly CommandEntry[] = [
  // Install and workspace
  { cli: "skills install", summary: "Copy the ostack skills into your coding agents", route: sandbox },
  { cli: "skills status", summary: "Which coding agents have the ostack skills, and their version", route: sandbox },
  { cli: "skills uninstall", summary: "Remove the ostack skills from your coding agents", route: sandbox },
  { cli: "init", summary: "Create a folder for schedules and personal files", route: sandbox },
  { cli: "playbooks list", summary: "Playbooks this folder runs, and the ones available", route: sandbox },
  { cli: "playbooks add", summary: "Turn a playbook on in this folder", route: sandbox },
  { cli: "playbooks remove", summary: "Turn a playbook off in this folder", route: sandbox },
  { cli: "doctor", summary: "Check sign-in, skills, folder, setup and schedules", route: sandbox },

  // Always on: the steps that set ostack up on the person's o11 sandbox
  { cli: "sandbox-setup", summary: "The steps that set ostack up on your o11 sandbox, in order", route: read("sandbox_setup") },

  // Customization
  { cli: "context", summary: "What to know before a run, or one step plus its customizations", route: read("context") },
  { cli: "steps", summary: "The named steps customizations attach to", route: read("steps") },
  { cli: "files list", summary: "The team's setup files and yours", route: read("files") },
  { cli: "files show", summary: "One setup file with its version", route: read("file") },
  { cli: "files write", summary: "Save a setup file, naming the version you read", route: write("file") },
  { cli: "files delete", summary: "Delete a setup file, naming the version you read", route: write("delete_file") },
  { cli: "files export", summary: "Copy every setup file and the settings into a local folder", route: sandbox },
  { cli: "settings show", summary: "The team's settings and your own", route: read("settings") },
  { cli: "settings set", summary: "Change a team setting, or only yours with --me", route: write("settings") },
  { cli: "settings unset", summary: "Go back to the team's value for one of your settings", route: write("settings") },
  { cli: "setup status", summary: "Setup questions answered and still open", route: read("setup") },
  { cli: "setup answer", summary: "Record a setup question as answered or skipped", route: write("answer") },
  { cli: "setup reviewed", summary: "Mark this release's setup changes as reviewed in this folder", route: sandbox },
  { cli: "setup reset", summary: "Clear setup answers so the questions are asked again", route: write("settings") },
  { cli: "setup import", summary: "Copy a folder's setup from before teams to the team", route: sandbox },
  { cli: "presets list", summary: "Presets the team has on, and the ones playbooks ship", route: sandbox },
  { cli: "presets add", summary: "Turn a shipped preset on for the team", route: sandbox },
  { cli: "presets remove", summary: "Turn a preset off for the team", route: sandbox },
  { cli: "presets show", summary: "The files a shipped preset contains", route: sandbox },

  // Schedules and runs
  { cli: "schedule list", summary: "Every workflow's schedule and where it is installed", route: read("schedules") },
  { cli: "schedule set", summary: "Set when a workflow runs", route: write("schedule") },
  { cli: "schedule on", summary: "Turn a workflow's schedule on", route: write("schedule") },
  { cli: "schedule off", summary: "Turn a workflow's schedule off, or drop some days", route: write("schedule") },
  { cli: "schedule spec", summary: "Exactly what to create in a scheduler for a workflow", route: sandbox },
  { cli: "schedule installed", summary: "Record that a scheduler task was created", route: sandbox },
  { cli: "schedule uninstalled", summary: "Record that a scheduler task was removed", route: sandbox },
  { cli: "schedule cron", summary: "Show, install or remove the cron schedule on a computer", route: sandbox },
  { cli: "prompt", summary: "The instruction a scheduled run follows", route: sandbox },
  { cli: "run start", summary: "Record the start of a workflow run", route: run("start") },
  { cli: "run end", summary: "Record the end of a workflow run with its counts", route: run("end") },
  { cli: "run need", summary: "Record what an unattended run needs from the person", route: sandbox },
];
