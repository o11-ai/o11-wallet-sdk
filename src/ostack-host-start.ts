import type { HostProvider, HostedMachine } from './ostack/src/index.js';
import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';
import { OstackError } from './ostack/src/index.js';
import { ToolClientError } from './client-errors.js';
import { SandboxRequestError } from './client.js';
import { executeSandboxCommand } from './sandbox-execution.js';

/**
 * Finds, resumes or starts ostack's hosted computer through o11 sandbox operations. Names are unique per person
 * across providers, so a stopped or failed computer on another provider is cleared before this one starts.
 */
export type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };

/** E2B first: o11 keeps its desktop running (pausing and resuming it around E2B's 24-hour cap). Boat when E2B can't start one. */
const PROVIDERS = ['e2b', 'boat'] as const;
const ENDED = ['stopped', 'failed'];

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const ended = (state: unknown) => ENDED.includes(String(state));

/** The wallet's error code and message behind a refused sandbox request, when it gave one. */
export function walletRefusal(error: unknown): { code?: string; message: string } {
  const cause = error instanceof SandboxRequestError ? error.cause : error;
  if (cause instanceof ToolClientError) {
    const body = object(cause.response);
    return { ...(typeof body.error === 'string' ? { code: body.error } : {}), message: typeof body.message === 'string' ? body.message.slice(0, 300) : cause.message };
  }
  return { message: error instanceof Error ? error.message.slice(0, 300) : 'failed' };
}
/** Out of credits: no provider can start or resume one, and deleting the stopped computer would only lose it. */
const unpaid = (error: unknown) => walletRefusal(error).code === 'INSUFFICIENT_BALANCE';
const creditsNeeded = () => new OstackError('credits_needed', 'The o11 wallet cannot pay for the hosted computer. Ask the person to add o11 credits, then run "o11 ostack host setup" again. Nothing was deleted.');

function createParams(provider: HostProvider, name: string, size: string): Record<string, string | number | boolean> {
  // keepRunning: o11 renews from the wallet until the person stops it or the wallet can't pay.
  return provider === 'boat'
    ? { name, type: size, ttl: 86_400, keepRunning: true }
    : { name, template: 'desktop', ttl: 86_400, keepRunning: true };
}

/** Rows with this exact name on one provider. `all` includes failed creates, which list hides by default. */
async function rows(client: SandboxClient, name: string, provider: HostProvider, all: boolean): Promise<HostedMachine[]> {
  const listed = await client.sandbox({ action: 'list', provider, params: { namePrefix: name, ...(all ? { all: true } : {}) } });
  const items = object(listed.data).items;
  return (Array.isArray(items) ? items : []).map(object).filter(row => row.name === name && row.provider === provider)
    .map(row => ({ id: String(row.id), name, provider, state: String(row.state) }));
}

/** The running (or starting) computer of this name on one provider, or with `dead` a stopped or failed one. */
export async function findOn(client: SandboxClient, name: string, provider: HostProvider, dead = false): Promise<HostedMachine | null> {
  return (await rows(client, name, provider, dead)).find(row => ended(row.state) === dead) ?? null;
}

/** The live computer of this name, E2B first; else a stopped one, so the agent learns it stopped. */
export async function findHost(client: SandboxClient, name: string, provider?: HostProvider): Promise<HostedMachine | null> {
  const providers = provider ? [provider] : PROVIDERS;
  for (const each of providers) { const live = await findOn(client, name, each).catch(() => null); if (live) return live; }
  for (const each of providers) { const dead = await findOn(client, name, each, true).catch(() => null); if (dead) return dead; }
  return null;
}

/** Deletes what blocks the name: ended rows on other providers, and failed rows on this one (they can't resume). */
async function clearDead(client: SandboxClient, name: string, provider: HostProvider) {
  for (const each of PROVIDERS) {
    const dead = await rows(client, name, each, true).catch(() => []);
    for (const row of dead) {
      if (!ended(row.state) || (each === provider && row.state !== 'failed')) continue;
      await client.sandbox({ action: 'delete', id: row.id, params: {} }).catch(() => undefined);
    }
  }
}

export type HostStart = { result: SandboxResult; resumed: boolean; replaced: boolean; refusals: Record<string, unknown>[] };

/**
 * E2B first, Boat when E2B can't start one; both keep running while the wallet pays. A pinned provider is tried
 * alone; an existing computer's provider goes first. A stopped computer is resumed, keeping its files and sign-ins;
 * only when o11 refuses the resume is it deleted and replaced.
 */
export async function startHost(client: SandboxClient, input: { name: string; size: string; provider?: HostProvider }): Promise<HostStart | { refusals: Record<string, unknown>[] }> {
  const { name, size, provider } = input;
  const order: HostProvider[] = provider ? [provider] : [...PROVIDERS];
  if (!provider) {
    // A running or stopped (resumable) computer keeps its provider; a failed one doesn't.
    for (const each of PROVIDERS) {
      if (!(await rows(client, name, each, false).catch(() => [])).length) continue;
      order.sort((x, y) => (x === each ? -1 : y === each ? 1 : 0));
      break;
    }
  }
  const refusals: Record<string, unknown>[] = [];
  for (const each of order) {
    const create = (resume: boolean) => executeSandboxCommand(client, { action: 'get-or-create', provider: each,
      params: { ...createParams(each, name, size), ...(resume ? { resume: true } : {}) } }, { timeoutMs: 600_000 });
    const replace = async (id: string) => {
      await client.sandbox({ action: 'delete', id, params: {} });
      return create(false);
    };
    let result: SandboxResult, replaced = false;
    try {
      await clearDead(client, name, each);
      try {
        result = await create(true);
      } catch (error) {
        if (unpaid(error)) throw creditsNeeded();
        // Resume refused for another reason: replace the stopped computer. Its site sign-ins are lost.
        const stopped = await findOn(client, name, each, true).catch(() => null);
        if (!stopped) throw error;
        result = await replace(stopped.id); replaced = true;
      }
      if (result.sandbox?.state === 'failed') { result = await replace(result.sandbox.id); replaced = true; }
    } catch (error) {
      if (error instanceof OstackError || unpaid(error)) throw error instanceof OstackError ? error : creditsNeeded();
      refusals.push({ provider: each, ...walletRefusal(error) });
      continue;
    }
    if (result.status === 'failed' || !result.sandbox) { refusals.push({ provider: each, ...object(result.data) }); continue; }
    return { result, resumed: !replaced && object(result.data).resumed === true, replaced, refusals };
  }
  return { refusals };
}
