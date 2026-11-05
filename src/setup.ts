import { onboardingStarterPrompts, onboardingCompletionInstructions } from './contracts/onboarding.js';
import type { ToolClient } from './client.js';

export type BridgeCheck = { status: 'verified' | 'failed' | 'skipped'; message?: string };
/** Read-only checks. Host-session availability and successful provider execution need separate evidence. */
export async function setupStatus(client: Pick<ToolClient, 'doctor' | 'connectionPermissions'>, verifyBridge?: (cardId?: string) => Promise<BridgeCheck>) {
  const cli = await client.doctor();
  const permissions = await client.connectionPermissions();
  const mcpBridge: BridgeCheck = verifyBridge ? await verifyBridge('cardId' in cli ? cli.cardId : undefined) : { status: 'skipped' };
  const cliReady = 'ready' in cli && cli.ready === true && permissions.permissions.runTools;
  const blocked = !permissions.permissions.runTools || ('ready' in cli && cli.ready === false && (!('readinessKnown' in cli) || cli.readinessKnown !== false)) || 'chooseCard' in cli;
  const status = blocked ? 'action_required' : !cliReady ? 'verification_incomplete' : 'cli_ready';
  return {
    schemaVersion: 1 as const, status,
    checks: { cli, permissions, mcpBridge,
      currentAgentMcp: { status: 'unverified' as const, reason: 'host_session_check_required' as const,
        message: 'If using MCP, call a read-only wallet tool in the current agent session. CLI access is already checked separately.' },
      firstTask: { status: 'not_started' as const } },
    nextAction: !permissions.permissions.runTools ? 'review_connection_permissions' : blocked ? ('chooseCard' in cli ? 'choose_card' : 'review_wallet_controls')
      : !cliReady ? 'verify_cli_readiness' : 'choose_task',
    instructions: onboardingCompletionInstructions,
    ...(status === 'cli_ready' ? { starterPrompts: onboardingStarterPrompts } : {}),
  };
}
