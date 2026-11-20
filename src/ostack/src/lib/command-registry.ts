/**
 * Every `o11 ostack` command and how an agent without the CLI reaches it, so the CLI and the o11 MCP connector never
 * drift apart. Each command has exactly one route:
 * - mcp: an action of one of the ostack MCP tools (ostack_read, ostack_write, ostack_run), served by the wallet.
 * - sandbox: it needs a computer (local files, skills, cron, a browser), so it runs on the person's o11 sandbox, where
 *   o11 installed and signed in the CLI: the connector's `sandbox` tool sends `exec` with sandboxCommand(...).
 * The parity test (apps/o11-wallet-backend/test/ostack-command-parity.test.ts) checks this list against the CLI's
 * dispatch tables and the MCP tools' schemas.
 */
import { CORE_COMMAND_ROUTES } from "./command-registry-core.js";
import { PLAYBOOK_COMMAND_ROUTES } from "./command-registry-playbooks.js";
import { PATHS, SANDBOX_WORKSPACE, shellQuote } from "./sandbox-setup.js";

export type OstackMcpTool = "ostack_read" | "ostack_write" | "ostack_run";

export type CommandRoute =
  /** `call` is the action field and value, such as { read: "context" }. */
  | { via: "mcp"; tool: OstackMcpTool; call: { read: string } | { write: string } | { run: string } }
  | { via: "sandbox" };

export type CommandEntry = {
  /** The command as typed after `o11 ostack`, such as "files write" or "gtm tam". */
  cli: string;
  summary: string;
  route: CommandRoute;
};

/** The `sandbox` tool request that runs one `o11 ostack` command on the person's o11 sandbox. */
export function sandboxCommand(sandboxId: string, argv: readonly string[]) {
  const command = [
    PATHS,
    `cd "${SANDBOX_WORKSPACE}" && o11 ostack ${argv.map(shellQuote).join(" ")}`,
  ].join("\n");
  return { action: "exec", id: sandboxId, params: { command } } as const;
}

/** Every command: the core ones, then each playbook's (prefixed with the playbook id). */
export const OSTACK_COMMANDS: readonly CommandEntry[] = [...CORE_COMMAND_ROUTES, ...PLAYBOOK_COMMAND_ROUTES];

/** The top-level word the CLI dispatches on: "files" for "files write", "gtm" for "gtm tam". */
export const dispatchWord = (entry: CommandEntry) => entry.cli.split(" ")[0]!;
