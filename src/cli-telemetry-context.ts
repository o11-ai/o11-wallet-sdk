/**
 * What the o11 CLI adds to its wallet requests when usage telemetry is on (cli-telemetry.ts). The SDK client reads it;
 * nothing here touches the file system, so a program that uses `@o11/sdk` as a library sends no install ID and records
 * nothing unless it is the CLI and telemetry is enabled.
 */
export const installIdHeader = "x-o11-install-id";

let enabled = false, installId: string | undefined;
/** The last wallet answer this process saw: cli_command reports its status and IDs, never its body. */
export const lastWalletResponse: { status?: number; requestId?: string; callId?: string } = {};

/** Called once by the CLI when telemetry is on, with its install ID (undefined when the ID file cannot be written). */
export function useInstallId(id: string | undefined) {
  enabled = true;
  installId = id;
}

/** `x-o11-install-id` for a wallet request, or nothing when telemetry is off. */
export function telemetryHeaders(): Record<string, string> {
  return installId ? { [installIdHeader]: installId } : {};
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Notes a wallet response's status, X-Request-Id and the client's call ID. Does nothing when telemetry is off. */
export function noteWalletResponse(status: number, requestId: string | null, callId?: string) {
  if (!enabled) return;
  lastWalletResponse.status = status;
  lastWalletResponse.requestId = requestId && uuid.test(requestId) ? requestId.toLowerCase() : undefined;
  lastWalletResponse.callId = callId;
}
