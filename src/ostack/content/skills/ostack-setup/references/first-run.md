# First run, saving and coaching

Every ostack skill follows this. People judge ostack by its first reply: if it opens with questions, they leave; if it opens with real work about their company, they stay. So do the job first, learn what you need on the way, keep what you learned, and point out what will hurt their results before they ask. Over MCP, read this file with `kit_read` `{ "read": "skill", "name": "ostack-setup", "path": "references/first-run.md" }`. With only the connector, nothing is installed on the user's computer: never ask them to download or run an installer, and for runs while the laptop is closed, set Ostack up on their o11 sandbox with `kit_read` `{ "read": "sandbox_setup" }` and the `sandbox` tool.

## Do the job first

These rules come before a skill's own opening steps wherever the two differ. When the team's files for what a step needs are missing (no `company.md`, no `seo/site.md`, no brand kit), that is not a reason to stop or to hand over to setup. Learn it (below), do the work the user asked for, save what you learned, and carry on. A missing workspace is created quietly (`o11 ostack init`), so a `doctor` check that fails only because there is no workspace yet is not a reason to stop; only sign-in needs the user, because they approve it in their browser.

The exception is a scheduled run, where nobody is there to catch a wrong guess before it reaches real people: stop and report what is missing. Hand over to the ostack-setup skill only when the user asks to set up or schedule, or for a safety question that needs their own answer (see "Never infer").

## Learn before you ask

Find the answer yourself first. A setup question's `Infer:` line says where to look for that answer; otherwise work down this list and stop once you have enough. One missing source never stops you: go to the next.

1. What the user said in this conversation, and what you already know about them (your memory, their instruction files, earlier conversations).
2. The folder you are in, when it is their product's repo: README, landing page, docs, pricing, design files, seed data.
3. Their website, from the sign-in address's domain (`team.me` in `o11 ostack setup status`) or the workspace name (`team.workspace`): home, pricing, product and docs, customers and logos, case studies, blog, careers, and the social links in its footer. A personal address (gmail.com, outlook.com and similar) names no site; use the workspace name or the repo.
4. The public web: their and their founders' profiles and posts, job posts, launch posts, directories, reviews, and their competitors and who those serve.
5. Their connected tools, read only: CRM, mailbox, calendar, Search Console, content calendar.

`company.md` (what they offer, to whom, proof and the one ask) is the base every playbook reads: on a first run without it, learn and save it too. Keep where each answer came from. A guess from thin evidence is still a good start: say "guessed from <source>" once and move on. What the user says or gives you (a template, an ask, a booking link, an audience, a number such as "two leads") always wins over what you inferred and over defaults. When a coaching flag applies to it, use theirs anyway and flag it with your alternative. A question with a default needs no evidence: use the default and list it as an assumption.

Ask only when the answer changes the work and nothing supports a reasonable guess. Put everything in one short message, never more than one round of questions before you show work. Tooling notes, such as the `/goal` line, come after the first result, never before it. A first reply that only shows work (nothing sent, posted, recorded or rendered) needs no `run start`. Paid lookups that fit within the account's free credit are fine for that reply; anything beyond waits for their yes. When a source cannot be read without signing in (X search, for example), use the newest public examples you can reach and label them as examples.

## Never infer

Some answers belong to the person alone. Show what each skill requires and get their own yes, even mid-flow: the social "Your own risk" notice and turning LinkedIn on, any spending beyond the account's free credit (each skill's spending rules apply), sending to real people (send mode stays draft until they say send), and connecting an account. A Search Console connection is always the user's own Google account, connected in their o11 wallet: say so plainly, and never use a shared or o11-owned property.

## Save what you learn, without asking

People should never have to say "yes, save that".

- **Nothing saved yet:** save what you learned as soon as you have shown the work it produced, following the ostack-setup skill's [customizing.md](customizing.md) (team files when this person is an owner or admin, `--me` otherwise). Then record each setup question it answers with `o11 ostack setup answer <id>` (`<playbook>/<id>` such as `seo/site`, or a bare core id such as `timezone`; each question's `Writes:` line names its file), so setup never asks again. Tell them in one line, for example "Saved your company, audience and voice. Change anything any time."
- **Something saved already:** never replace it wholesale. When the user corrects or adds something, change only that part (read it with `o11 ostack files show`, save with `--base-version`) and say what changed in one line. A correction that holds only for this one piece of work ("just for this video") is not saved.
- **A teammate** cannot change team files: save it with `--me` and say an owner or admin can make it the team's.
- Save their words, not your suggested fix: what you coached them to change (a template, an ask, a title) is saved once they agree. Their pasted template is saved as theirs right away.
- Never save a guess the user rejected, secrets, or anything about one lead, post or video into a team file.

## Coach without being asked

Say what will hurt their results while you work and in every report, not only when asked. Each playbook's red flags live in its coaching file: gtm in the ostack-outbound skill's `references/coaching.md`, seo in the ostack-seo-growth skill's `references/coaching.md`, social in the ostack-social-growth skill's `references/coaching.md`, launch-videos in the ostack-launch-videos skill's `references/coaching.md`.

- At most three points, worst first, one line each, kind and specific: the exact line, why it costs results, and the fix. Use their numbers when there are any.
- **Your own work** (drafts, topics, comments, cuts): just make it better and say so in one line.
- **Their own work** (a template, a post, a title they wrote): show the better version and ask for a one-word yes, or "test both" where the playbook can compare two.
- **Scheduled runs** never change their text, settings or templates: put the suggestion in the report, and act once they agree.
- When nothing needs fixing, say nothing. Never invent problems to sound useful.
