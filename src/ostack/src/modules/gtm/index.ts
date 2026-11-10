import type { ModuleCode } from "../types.js";
import { campaignsCommand } from "./campaigns-command.js";
import { ledgerCommand } from "./ledger-command.js";
import { tamCommand } from "./tam-command.js";
import { applySetting, fromRemote, SETTING_KEYS, showSettings, toPatch } from "./settings.js";

const HELP = `  campaigns                                    campaigns that have their own notes
  tam check <in.csv> <out.csv> [--concurrency 48]   label each row's homepage (needs a domain column)
  ledger export [--out <folder>]               write the pre-0.6 ledger (.ostack/gtm.db) to CSV files

Leads, messages, replies and opt-outs live in the user's own tool (a CRM, Airtable, a Sheet, a CSV),
as the gtm/record step and its note describe. ostack keeps no lead data of its own.

Settings (o11 ostack settings set gtm.<key> <value> [--me])
  mode draft|send, new_per_day, touches_per_day, per_company,
  follow_up_days (days after the previous touch for each follow-up, e.g. 3,4,7, or none),
  send_window (when cold messages may go out, e.g. "weekdays 08:00-18:00", or any)`;

const MOVED = 'Since 0.6.0 ostack keeps no ledger: leads, messages, replies and opt-outs live in the user\'s own tool. Run "o11 ostack context gtm/record" for how.';

export const gtm: ModuleCode = {
  help: HELP,
  commands: { campaigns: campaignsCommand, tam: tamCommand, ledger: ledgerCommand },
  removed: Object.fromEntries(
    ["due", "status", "check", "leads", "reserve", "receipt", "observe", "defer", "suppress"].map((command) => [command, MOVED]),
  ),
  settings: {
    keys: SETTING_KEYS,
    show: (settings) => showSettings(fromRemote(settings)),
    apply: (settings, key, value) => toPatch(applySetting(fromRemote(settings), key, value)),
  },
};
