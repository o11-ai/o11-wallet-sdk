import { OstackError } from "./errors.js";
import { loadPlaybooks, type Playbook } from "./playbooks.js";
import type { RemoteSetup } from "./remote.js";

/**
 * Beta playbooks reach only the people and workspaces o11 granted them from team.o11.ai. The wallet decides and
 * refuses runs and file saves without a grant; the CLI follows the same rule so it never offers, enables or installs
 * what the wallet would refuse. A playbook grant ("seo") covers its workflows; a workflow grant ("seo/audit") covers
 * that workflow and the playbook's files and skills. Mirrors featureAllowed in @o11/tool-contracts/ostack-access.
 */
export function canUse(granted: readonly string[], playbook: Pick<Playbook, "id" | "access">, workflow?: string): boolean {
  if (playbook.access !== "beta") return true;
  if (granted.includes(playbook.id)) return true;
  if (workflow) return granted.includes(`${playbook.id}/${workflow}`);
  return granted.some((item) => item.startsWith(`${playbook.id}/`));
}

/** The shipped playbooks this setup may use: every open one, and each beta one it was granted. */
export function usablePlaybooks(setup: Pick<RemoteSetup, "access">): Playbook[] {
  return loadPlaybooks().filter((playbook) => canUse(setup.access ?? [], playbook));
}

export function requireAccess(setup: Pick<RemoteSetup, "access">, playbook: Playbook, workflow?: string): void {
  if (canUse(setup.access ?? [], playbook, workflow)) return;
  throw new OstackError("feature_not_available", `${playbook.name} is in beta, and this workspace does not have access yet. Ask o11 to join the beta.`, {
    playbook: playbook.id,
  });
}
