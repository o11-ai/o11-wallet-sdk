import type { Args } from "../lib/args.js";
import type { PlaybookValues } from "../lib/remote.js";

/** What a playbook with code adds to the CLI. Playbooks made only of skills and files need none. */
export type PlaybookCode = {
  /** Help lines for `ostack <playbook> <command>`, each command line starting with two spaces and its name. */
  help: string;
  commands: Record<string, (args: Args) => Promise<void>>;
  /** Commands a release removed, with what to do instead, so an agent with old instructions gets a clear answer. */
  removed?: Record<string, string>;
  /** The playbook's settings live in the wallet under its id; the playbook reads them and turns `settings set` into a change. */
  settings?: {
    keys: readonly string[];
    /** Names a release renamed, still accepted by `settings set`. */
    aliases?: Record<string, string>;
    show: (values: PlaybookValues) => unknown;
    /** The playbook's values after the change; core sends only the keys that differ. */
    apply: (values: PlaybookValues, key: string, value: string) => PlaybookValues;
    /** The stored keys behind a setting name, for `settings unset`. */
    stored: (key: string) => string[];
  };
};
