# Core setup questions

These apply to the whole workspace, whatever playbooks it uses. Each playbook adds its own in its questions file, with ids `<playbook>/<id>` (`o11 ostack setup status` prints each question's full text). Each `## <id>` section is one topic. `Since` is the release that added it, so after an update only new topics are asked. Releases may add sections, but never rename or remove an id. Questions without a `Scope` line are the team's, answered once by an owner or admin; `Scope: personal` ones are answered by every teammate. `Order: last` asks a question after every other one.

## timezone
Since: 0.4.0
Ask: Which timezone does the team work in? Schedules and sending hours use it.
Default: This computer's timezone, which `o11 ostack settings show` uses until one is set. Confirm it rather than asking cold.
Writes: `o11 ostack settings set timezone <IANA name>`, such as America/New_York. A teammate elsewhere sets their own with `--me`.
Check: Say the `local_time` from `o11 ostack settings show` and ask whether that is the time where they are.

## schedule
Since: 0.2.0
Scope: personal
Order: last
Ask: Should your workflows run on their own? Show `o11 ostack schedule list`: each workflow with its suggested schedule (gtm's outbound on weekday mornings, follow-ups every 30 minutes in working hours). Which should run, and when? Which app should run them: Claude Desktop, Codex, or neither (cron)?
Default: Nothing scheduled.
Writes: `o11 ostack schedule set <workflow> --at HH:MM` or `--every <minutes> --from HH:MM --to HH:MM`, or `o11 ostack schedule on <workflow>` to keep the suggestion. Add `--audience <name>` for each audience's outbound. Then create each task as described in SKILL.md ("Scheduling").
Check: `o11 ostack schedule list` shows every chosen workflow as installed, and one test run (Run now) finished without stalling on a permission prompt.
