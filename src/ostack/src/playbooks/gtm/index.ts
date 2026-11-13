import type { PlaybookCode } from "../types.js";
import { audiencesCommand } from "./audiences-command.js";
import { ledgerCommand } from "./ledger-command.js";
import { tamCommand } from "./tam-command.js";
import { applySetting, fromRemote, SETTING_ALIASES, SETTING_KEYS, showSettings, toPatch } from "./settings.js";

const HELP = `  audiences [<name>]                           each audience: its files, templates (with version ids), follow-ups and settings
  tam check <in.csv> <out.csv> [--concurrency 48]   label each row's homepage (needs a domain column)
  ledger export [--out <folder>]               write the pre-0.6 ledger (.ostack/gtm.db) to CSV files

Leads, messages, replies and opt-outs live in the user's own tool (a CRM, Airtable, a Sheet, a CSV),
as the gtm/record step and its note describe. ostack keeps no lead data of its own.

Audiences are folders of files: gtm/ is the default audience, gtm/audiences/<name>/ any other. An audience's
template*.md files are its email templates (two or more is an A/B test, split by each file's weight:), and its
audience.md and follow-up.md front matter can set the settings below for that audience alone.

Settings (o11 ostack settings set gtm.<key> <value> [--me])
  send_mode draft|send, new_per_day, touches_per_day, per_company,
  follow_up_days (days after the previous message for each follow-up, e.g. 3,4,7, or off),
  send_window (when cold messages may go out, e.g. "weekdays 08:00-18:00", or any),
  send_at (when scheduled first messages land on the send window's days, e.g. 08:00, or off to send as the run goes;
  o11 ostack context shows the next one as next_send_at)`;

const MOVED = 'Since 0.6.0 ostack keeps no ledger: leads, messages, replies and opt-outs live in the user\'s own tool. Run "o11 ostack context gtm/record" for how.';

export const gtm: PlaybookCode = {
  help: HELP,
  commands: { audiences: audiencesCommand, campaigns: audiencesCommand, tam: tamCommand, ledger: ledgerCommand },
  removed: Object.fromEntries(
    ["due", "status", "check", "leads", "reserve", "receipt", "observe", "defer", "suppress"].map((command) => [command, MOVED]),
  ),
  settings: {
    keys: SETTING_KEYS,
    aliases: SETTING_ALIASES,
    show: (settings) => showSettings(fromRemote(settings)),
    apply: (settings, key, value) => toPatch(applySetting(fromRemote(settings), key, value)),
    stored: (key) => {
      const name = SETTING_ALIASES[key] ?? key;
      if (name === "send_mode") return ["sendMode"];
      if (name === "follow_up_days") return ["followUpDays", "limits"];
      if (name === "send_window") return ["sendWindow"];
      if (name === "send_at") return ["sendAt"];
      return ["limits", "followUpDays"];
    },
  },
};
