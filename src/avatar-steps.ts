import { z } from 'zod';
import { ToolCallError, ToolClientError, type ToolCallOptions, type ToolClient } from './client.js';

export const avatarProviders = ['heygen', 'runway', 'captions'] as const;
export type AvatarProvider = typeof avatarProviders[number];
/** The client calls the avatar flow makes. ToolClient satisfies it; tests pass a fake. */
export type AvatarClient = Pick<ToolClient, 'callTool' | 'getInvocation'>;
export type AvatarDeps = {
  client: AvatarClient;
  provider: AvatarProvider;
  /** That provider's connection. HeyGen and Runway stop after the recording without it. */
  connectionId?: string;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
  open: (url: string) => Promise<boolean>;
  notice: (line: string) => void;
  /** The command that picks this capture up again. A missing connection prints a CONNECTION_ID placeholder. */
  resume: (captureId: string, connectionId?: string) => string;
  /** An o11 command line with the profile and card of this run. */
  command: (args: string[]) => string;
  /** Headless runs: uploads the given files to a capture still awaiting its recording, and saves the take. */
  attach?: (capture: Capture) => Promise<void>;
  /** --retry: appended to the provider's create keys so a failed create can be sent again. */
  retrySuffix?: string;
};
export type CloneOptions = { captureId?: string; name?: string; script?: string; seconds: number; open: boolean; wait: boolean; personality?: string;
  collect?: string[]; photos?: number; retry?: boolean };
export type AvatarOutcome = { exitCode: 0 | 1 | 2; result: AvatarResult };
export type AvatarResult = {
  capture_id: string; provider: AvatarProvider; status: string; avatar_id: string | null; avatar_group_id: string | null; voice_id: string | null;
  consent_url: string | null; message?: string; resumeCommand?: string; nextCommand?: string; media?: Record<string, unknown>;
};

const text = z.string().nullish();
const providerAvatarSchema = z.looseObject({ status: z.enum(['training', 'ready', 'failed']), avatar_id: text, avatar_group_id: text,
  voice_id: text, consent_url: text, error: text });
export type ProviderAvatar = z.infer<typeof providerAvatarSchema>;
export const captureSchema = z.looseObject({
  capture_id: z.string().min(1), name: text, status: z.enum(['awaiting_recording', 'uploading', 'recorded', 'training', 'ready', 'failed', 'expired']),
  collect: z.array(z.string()).nullish(), url: text, expires_at: text, script: text, seconds: z.number().nullish(), media_id: text, source_url: text, content_type: text,
  size_bytes: z.number().nullish(), portrait_url: text, portrait_content_type: text, audio_url: text, audio_content_type: text,
  avatars: z.partialRecord(z.enum(avatarProviders), providerAvatarSchema).nullish(),
});
export type Capture = z.infer<typeof captureSchema>;
export const providerEntry = (capture: Capture, provider: AvatarProvider) => capture.avatars?.[provider];

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
// Results are the provider body; an envelope with only a body field is unwrapped.
const body = (value: unknown) => record(value) && !('data' in value) && !('capture_id' in value) && !('id' in value) && 'body' in value ? value.body : value;
type Step = { body?: ToolCallOptions['body']; path?: Record<string, string>; idempotencyKey?: string; customer?: boolean; write?: boolean; recurring?: boolean;
  /** How long the client holds the call for its result (default 2 minutes). */
  waitMs?: number; onReceipt?: (invocationId: string) => void };

/** The call finished as failed. The wallet replays that failure for the same key, so only a new key can try again. */
export class AvatarStepFailed extends Error {}
/** The call is still running; reading again later is safe. */
export class AvatarStepPending extends Error {
  constructor(message: string, readonly invocationId: string) { super(message); }
}
const sanitized = (value: string) => value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 300);
/** A dropped connection, timeout, 429 or 5xx on a read: the poll loops read again instead of stopping. */
const transient = (error: unknown) => error instanceof AvatarStepPending || error instanceof ToolCallError
  && (!(error.cause instanceof ToolClientError) || error.cause.status === 429 || error.cause.status >= 500);
const providerNames: Record<AvatarProvider, string> = { heygen: 'HeyGen', runway: 'Runway', captions: 'Captions' };
export const providerName = (provider: AvatarProvider) => providerNames[provider];

/** Runs one tool call and returns its result, or throws with the step named and what to do next. */
export async function step(deps: AvatarDeps, tool: string, request: Step, captureId?: string): Promise<unknown> {
  const again = captureId ? ` Then run ${deps.resume(captureId, deps.connectionId)}` : '';
  let receipt;
  try {
    receipt = await deps.client.callTool({ tool, ...(request.body !== undefined ? { body: request.body } : {}),
      ...(request.path ? { path: request.path } : {}), ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
      ...(request.customer ? { credentialMode: 'customer' as const, connectionId: deps.connectionId } : {}),
      allowWrite: request.write === true, acceptRecurring: request.recurring === true }, { waitMs: request.waitMs ?? 120_000 });
  } catch (error) {
    const cause = error instanceof ToolCallError ? error.cause : undefined;
    const response = cause instanceof ToolClientError && record(cause.response) ? cause.response : undefined;
    const said = typeof response?.message === 'string' ? ` ${sanitized(response.message)}` : '';
    // Reissued file links change the request under the same key. The wallet names the original call; read it and go on.
    if (response?.reason === 'IDEMPOTENCY_KEY_REUSED' && typeof response.invocationId === 'string') {
      deps.notice(`${tool} was already sent for this capture. Reading that call.`);
      receipt = await deps.client.getInvocation(response.invocationId);
    } else if (response?.reason === 'IDEMPOTENCY_KEY_REUSED')
      throw new Error(`${tool} was already sent for this capture with different details, so it was not sent again. `
        + 'Check it with o11 history, or record again with o11 avatar clone --name NAME.');
    else if (response?.reason === 'CUSTOMER_ACCOUNT_REQUIRED' || response?.error === 'FORBIDDEN')
      throw new Error(`Your card refused ${tool}.${said} ${request.customer
        ? `In the wallet, let this card use your ${providerName(deps.provider)} connection, take actions and start recurring services.`
        : 'In the wallet, let this card take actions.'}${again}`);
    else throw error;
  }
  request.onReceipt?.(receipt.id);
  if (receipt.state === 'succeeded') return body(receipt.result);
  if (receipt.state === 'awaiting_approval')
    throw new Error(`${tool} is waiting for approval${receipt.approval ? ` at ${receipt.approval.url}` : ' in the wallet'}.${again}`);
  if (['queued', 'executing', 'waiting'].includes(receipt.state))
    throw new AvatarStepPending(`${tool} is still running (call ${receipt.id}).${again}`, receipt.id);
  const reason = `${tool} ${receipt.state}${receipt.error ? `: ${sanitized(receipt.error)}` : ''}.`;
  // An unknown outcome may have reached the provider, so the same key is the only safe retry.
  if (receipt.state === 'unknown') throw new Error(`${reason} Call ${receipt.id}${request.idempotencyKey ? `, key ${request.idempotencyKey}` : ''}: `
    + `check it with o11 status ${receipt.id}.${again}`);
  throw new AvatarStepFailed(reason);
}
/** Reads in a poll loop; a transient error is noticed once and read again on the next turn. */
export async function pollRead<T>(deps: AvatarDeps, read: () => Promise<T>, captureId: string, quiet: { noticed: boolean }): Promise<T | undefined> {
  try { const value = await read(); quiet.noticed = false; return value; }
  catch (error) {
    if (!transient(error)) throw error;
    if (!quiet.noticed) deps.notice(`Could not check just now. Trying again. To stop and pick up later: ${deps.resume(captureId, deps.connectionId)}`);
    quiet.noticed = true;
    return undefined;
  }
}

export const getCapture = async (deps: AvatarDeps, captureId: string) =>
  captureSchema.parse(await step(deps, 'o11.avatar.capture.get', { body: { capture_id: captureId } }));
type CaptureFields = { status?: 'training' | 'ready' | 'failed'; avatar_id?: string; avatar_group_id?: string; voice_id?: string;
  consent_url?: string | null; error?: string };
/** Saves this provider's progress. error is shown on the recording page, so it never names a provider. */
export async function updateCapture(deps: AvatarDeps, captureId: string, fields: CaptureFields) {
  const sent = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  return captureSchema.parse(await step(deps, 'o11.avatar.capture.update',
    { body: { capture_id: captureId, provider: deps.provider, ...sent }, write: true }, captureId));
}

/**
 * A failed create is replayed for its key, so a plain rerun cannot fix it. --retry is the way out for a fixable cause
 * (credits, access, a rate limit): it sends the create again under a time-based key. That may start a second
 * training if the first did in fact succeed, so it is never automatic; recording again is the other path.
 */
export const retryHint = (deps: AvatarDeps, captureId: string) => `If the cause can be fixed (credits, access, a rate limit), fix it and run ${
  deps.command(['avatar', 'clone', '--capture-id', captureId, '--provider', deps.provider, '--connection', deps.connectionId ?? 'CONNECTION_ID', '--retry'])}. `
  + `Otherwise record again with o11 avatar clone --name NAME --provider ${deps.provider}.`;
/** The key suffix for a --retry run: new each time, so the wallet sends the create again. */
export const retryKeySuffix = (deps: AvatarDeps) => `:retry-${deps.now()}`;

export function summary(capture: Capture, provider: AvatarProvider, extra: Partial<AvatarResult> = {}): AvatarResult {
  const entry = providerEntry(capture, provider);
  // The top-level status is the furthest any platform got; this provider's own state wins once it has one.
  const status = capture.status === 'expired' || !entry ? capture.status : entry.status;
  return { capture_id: capture.capture_id, provider, status, avatar_id: entry?.avatar_id ?? null, avatar_group_id: entry?.avatar_group_id ?? null,
    voice_id: entry?.voice_id ?? null, consent_url: entry?.consent_url ?? null, ...extra };
}
