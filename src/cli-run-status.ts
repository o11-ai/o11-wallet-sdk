import { maxInvocationHoldSeconds } from './contracts/invocation-lifecycle.js';

const usage = `Use o11 run-status [RUN_UUID] [--wait SECONDS]. It defaults to --run-id or O11_RUN_ID; --wait is 1 to ${maxInvocationHoldSeconds}`;

/** `o11 run-status [RUN_UUID] [--wait SECONDS]`: --wait holds the read on the server (get_run waitSeconds). */
export function runStatusArguments(args: readonly string[]): { runId?: string; waitSeconds?: number } {
  let runId: string | undefined, waitSeconds: number | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--wait') {
      const value = args[++index];
      if (waitSeconds !== undefined || value === undefined || !/^\d+$/.test(value)) throw new Error(usage);
      waitSeconds = Number(value);
      if (waitSeconds < 1 || waitSeconds > maxInvocationHoldSeconds) throw new Error(usage);
    } else if (arg.startsWith('-') || runId !== undefined) throw new Error(usage);
    else runId = arg;
  }
  return { ...(runId === undefined ? {} : { runId }), ...(waitSeconds === undefined ? {} : { waitSeconds }) };
}
