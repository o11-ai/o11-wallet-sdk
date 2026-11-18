# Core setup questions

These apply to the whole workspace, whatever playbooks it uses. Each playbook adds its own in its questions file, with ids `<playbook>/<id>` (`o11 ostack setup status` prints each question's full text). Each `## <id>` section is one topic. `Since` is the release that added it, so after an update only new topics are asked. Releases may add sections, but never rename or remove an id. Questions without a `Scope` line are the team's, answered once by an owner or admin; `Scope: personal` ones are answered by every teammate. `Order: last` asks a question after every other one. `Infer` says where the agent finds the answer itself before asking anyone; "Use the default" means never ask, and list it as an assumption in the setup preview. `Ask` is for when nothing can be inferred, or when the user wants to change the answer later.

## timezone
Since: 0.4.0
Ask: Don't ask. Use this computer's timezone, which `o11 ostack settings show` reports until one is set; schedules and sending hours use it. Mention it in one line with the rest of setup (for example "Times use America/New_York; say if that's wrong"), then record the question as answered. Change it only when the user says the team works elsewhere.
Infer: This computer's timezone.
Default: This computer's timezone.
Writes: `o11 ostack settings set timezone <IANA name>` with this computer's zone, such as America/New_York. Later changes use the same command; a teammate elsewhere sets their own with `--me`.
Check: `o11 ostack settings show` shows the zone and a `local_time` that matches this computer's clock.

## schedule
Since: 0.9.1
Scope: personal
Order: last
Ask: Should your workflows run on their own? Show `o11 ostack schedule list`: each workflow with its suggested schedule (gtm's outbound at 8:00 on weekdays, sending first messages as it writes them, follow-ups from 6am to midnight, every 30 minutes on weekdays and hourly on weekends). Which should run, and when? Which app should run them: Claude Desktop, Codex, or neither (cron)?
Infer: Turn on each workflow's suggested schedule in the app you are running in (Claude Desktop or Codex) when the user says go. Ask only where runs should happen when this app cannot create scheduled tasks.
Default: The suggested schedules, turned on when the user says go to the setup preview.
Writes: `o11 ostack schedule set <workflow> --at HH:MM` or `--every <minutes> --from HH:MM --to HH:MM`, or `o11 ostack schedule on <workflow>` to keep the suggestion. Add `--audience <name>` for each audience's outbound. Then create each task as described in SKILL.md ("Scheduling").
Check: `o11 ostack schedule list` shows every chosen workflow as installed, each task's instructions start with `/goal`, and one test run (Run now) kept going to `o11 ostack run end` without stalling on a permission prompt. A task created before 0.9.1 has no `/goal`: recreate it from `o11 ostack schedule spec <workflow> --host <host>`.
