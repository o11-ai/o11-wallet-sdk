/**
 * How an agent with only the o11 MCP server (a cloud chat, or no o11 CLI) follows the ostack skills. The skills are
 * written for `o11 ostack ...` commands; this maps each one to the three MCP tools, so one set of skills serves both.
 * ostack_read returns it first, and again whenever an agent asks for the guide.
 */
import { PATHS, SANDBOX_WORKSPACE } from "./sandbox-setup.js";

/** The sandbox request that runs one `o11 ostack` command, as sandboxCommand() in command-registry.ts builds it. */
const SANDBOX_EXEC = JSON.stringify({ action: "exec", id: "<sandbox>", params: { command: `${PATHS}\ncd "${SANDBOX_WORKSPACE}" && o11 ostack <command>` } });

export const MCP_GUIDE = `# Ostack over MCP

Ostack's skills are written for the o11 CLI. Without the CLI, use these o11 MCP tools in place of each command.
Everything reads and writes the same team setup in o11, so it matches what teammates using the CLI see.

| Skill says | Call |
|---|---|
| o11 ostack context [<step>] [--playbook <id>] [--audience <name>] | ostack_read { "read": "context", "ref"?, "playbook"?, "audience"? } |
| o11 ostack setup status [--playbook <id>] | ostack_read { "read": "setup", "playbook"? } |
| o11 ostack settings show | ostack_read { "read": "settings" } |
| o11 ostack steps / files list / files show <path> [--me] | ostack_read { "read": "steps" } / { "read": "files" } / { "read": "file", "path", "scope"? } |
| o11 ostack schedule list | ostack_read { "read": "schedules" } |
| read a skill or one of its files | ostack_read { "read": "skill", "name", "path"? } |
| o11 ostack files write <path> [--me] --text ... [--base-version n] | ostack_write { "write": "file", "path", "scope", "content", "base_version" } |
| o11 ostack files delete <path> [--me] --base-version n | ostack_write { "write": "delete_file", "path", "scope", "base_version" } |
| o11 ostack settings set|unset <key> [<value>] [--me] | ostack_write { "write": "settings", "scope", "values" } with values as in ostack_read settings |
| o11 ostack setup answer <question> [--skip] | ostack_write { "write": "answer", "question", "skipped"? } |
| o11 ostack schedule set|on|off <workflow> [--audience <name>] | ostack_write { "write": "schedule", "workflow", "audience"?, "rules", "status" } |
| o11 ostack run start|end <workflow> ... | ostack_run { "run": "start"|"end", "workflow", "audience"?, ... } |
| o11 ostack sandbox-setup [--agent claude|codex] | ostack_read { "read": "sandbox_setup", "agent"? } |
| any other o11 ostack command | the sandbox tool on their o11 sandbox, once sandbox_setup has run: ${SANDBOX_EXEC}, with each argument single-quoted |

Running when the laptop is closed:
- When the person wants Ostack running when their laptop is closed, or any playbook on a schedule, set Ostack up on
  their o11 sandbox, which is always on and paid from their o11 credits. Call ostack_read { "read": "sandbox_setup" } with "agent" claude or codex
  for the steps in order, run each through the sandbox tool, and turn the saved schedules on there. Nobody needs the CLI.
- When the person comes back, first run sandbox_setup's when_the_person_returns requests: its info request first,
  then its exec request, which lists what scheduled runs need from them.
- Never ask the person to install or download anything (the o11 CLI, install.sh, install.ps1) from here. A setup
  prompt's OK to install the CLI covers only a computer where you run it yourself.
- Their o11 card is issued automatically. Never tell them the connector has no card.

These need the CLI, so run them on their o11 sandbox through the sandbox tool, as in the last table row:
- custom.local/ files, skills install, init, doctor, playbooks add, presets, files export, schedule cron and prompt.
  sandbox_setup already runs skills install, init and doctor there. Nothing needs installing to use Ostack here.
- Playbook commands (such as gtm ledger export, gtm tam check and launch-videos). Keep lists in the team's CRM,
  Airtable, Sheet or CSV through their own tools, as the skills say.
- Setup questions are answered with ostack_write answer once setup covered them, as with the CLI.

Everything else in the skills works as written: read the context before each run, ask before sending, record runs.`;
