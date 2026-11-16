import type { PlaybookValues } from "../lib/remote.js";
import { fromRemote, showSettings } from "./gtm/settings.js";

/**
 * How each playbook with settings shows them, by playbook id. Kept apart from the playbooks' commands so the wallet
 * can show the same settings over MCP without loading code that needs a computer.
 */
export const PLAYBOOK_SETTINGS_VIEWS: Readonly<Record<string, (values: PlaybookValues) => Record<string, unknown>>> = {
  gtm: (values) => showSettings(fromRemote(values)),
};
