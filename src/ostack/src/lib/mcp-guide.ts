/**
 * How an agent with only the o11 MCP server (a cloud chat, or no o11 CLI) follows the ostack skills. The skills are
 * written for `o11 ostack ...` commands; this maps each one to the three MCP tools, so one set of skills serves both.
 * ostack_read returns it first, and again whenever an agent asks for the guide.
 */
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

What needs a computer, and how to handle it here:
- Scheduled tasks (Claude Desktop, Codex, cron) and custom.local/ files live on a computer. Save schedules with
  ostack_write so they are ready; say a scheduled task needs the o11 CLI on a computer, which runs them.
- skills install, init, doctor and playbooks add are CLI only. Nothing needs installing to use Ostack here.
- Playbook commands that keep local files (such as gtm ledger and tam) are CLI only. Keep lists in the team's CRM,
  Airtable, Sheet or CSV through their own tools, as the skills say.
- Setup questions are answered with ostack_write answer once the interview covered them, as with the CLI.

Everything else in the skills works as written: read the context before each run, ask before sending, record runs.`;
