import type { Args } from "../lib/args.js";
import type { ModuleValues } from "../lib/remote.js";

/** What a module with code adds to the CLI. Modules made only of skills and notes need none. */
export type ModuleCode = {
  /** Help lines for `ostack <module> <command>`, each command line starting with two spaces and its name. */
  help: string;
  commands: Record<string, (args: Args) => Promise<void>>;
  /** Commands a release removed, with what to do instead, so an agent with old instructions gets a clear answer. */
  removed?: Record<string, string>;
  /** The module's settings live in the wallet under its id; the module reads them and turns `settings set` into a change. */
  settings?: {
    keys: readonly string[];
    show: (values: ModuleValues) => unknown;
    /** The module's values after the change; core sends only the keys that differ. */
    apply: (values: ModuleValues, key: string, value: string) => ModuleValues;
  };
};
