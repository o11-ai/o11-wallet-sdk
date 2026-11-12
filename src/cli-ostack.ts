import { z } from 'zod';
import { OstackError, runOstack, type PlaybookRemote } from './ostack/src/index.js';
import {
  playbookFileSchema, playbookFileVersionSchema, playbookSettingsSchema, playbookSetupSchema, runEndedSchema, runStartedSchema, skillsInstalledSchema,
} from './contracts/playbooks.js';
import { profileTokenProvider, readConfig } from './config.js';
import { walletOrigin } from './access-tokens.js';
import { version } from '../package.json';

type Method = 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE';

/** Wallet failures become ostack's stable codes, which its skills branch on. Bodies are never echoed. */
function failure(status: number, body: unknown): OstackError {
  const code = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : '';
  const message = typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string' ? body.message.slice(0, 300) : '';
  if (status === 401) return new OstackError('not_signed_in', 'Your wallet sign-in expired or was revoked. Run "o11 login" and try again.');
  if (status === 409) return new OstackError('file_changed', message || 'Someone changed this since you read it. Read it again, merge, and retry.');
  if (status === 403) return new OstackError('forbidden', message || 'Your role in this workspace cannot make that change.');
  if (status === 404) return new OstackError('not_found', message || 'Not found in this workspace.');
  if (status === 400) return new OstackError('invalid_input', message || 'The wallet rejected the input.', code ? { wallet: code } : undefined);
  return new OstackError('offline', `The wallet answered HTTP ${status}. Try again shortly.`);
}

/**
 * The team's setup through the signed-in wallet key. Reads the saved login lazily, so commands that never touch the
 * team (help, init, skills) work before signing in. OAuth logins refresh once on a 401, like every wallet call.
 */
export function walletRemote(profile: string | undefined): PlaybookRemote {
  let config: Awaited<ReturnType<typeof readConfig>> | undefined;
  const load = async () => {
    if (config) return config;
    try {
      config = await readConfig(profile);
    } catch (error) {
      throw new OstackError('not_signed_in', `Sign in first: run "o11 login". (${error instanceof Error ? error.message : 'No saved login'})`);
    }
    return config;
  };
  const request = async (method: Method, path: string, body?: unknown): Promise<unknown> => {
    const saved = await load();
    const tokens = profileTokenProvider(profile, saved);
    let token = await tokens.getAccessToken();
    const send = () => fetch(new URL(path, walletOrigin(saved.baseUrl)), {
      method, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token}`, ...(saved.customer ? { 'X-Customer': saved.customer } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // Only an unreachable wallet counts as offline. A login that ended or was revoked never falls back to the saved copy.
    const reach = async () => {
      try { return await send(); } catch { throw new OstackError('offline', 'The wallet could not be reached.'); }
    };
    let response = await reach();
    if (response.status === 401 && tokens.refreshAccessToken) {
      await response.body?.cancel();
      try { token = await tokens.refreshAccessToken(token); } catch (error) {
        throw new OstackError('not_signed_in', `Your wallet sign-in ended. Run "o11 login" again. (${error instanceof Error ? error.message.slice(0, 200) : 'Refresh failed'})`);
      }
      response = await reach();
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (!response.ok) throw failure(response.status, parsed);
    return parsed;
  };
  return {
    cliVersion: version,
    get origin() {
      return config ? walletOrigin(config.baseUrl) : 'unknown';
    },
    async setup() {
      return playbookSetupSchema.parse(await request('GET', '/v1/ostack/setup'));
    },
    async saveFile(input) {
      return playbookFileSchema.parse(await request('PUT', '/v1/ostack/files', input));
    },
    async deleteFile(input) {
      await request('DELETE', '/v1/ostack/files', input);
    },
    async fileVersion(id) {
      return playbookFileVersionSchema.parse(await request('GET', `/v1/ostack/files/versions/${z.uuid().parse(id)}`));
    },
    async saveSettings(input) {
      return playbookSettingsSchema.parse(await request('PATCH', '/v1/ostack/settings', input));
    },
    async startRun(input) {
      return runStartedSchema.parse(await request('POST', '/v1/ostack/runs', input));
    },
    async endRun({ id, ...input }) {
      return runEndedSchema.parse(await request('POST', `/v1/ostack/runs/${z.uuid().parse(id)}/end`, input));
    },
    async reportInstall(input) {
      await request('POST', '/v1/ostack/installs', skillsInstalledSchema.parse(input));
    },
  };
}

/** `o11 ostack ...`: ostack's own commands, with the team's playbook setup read through this login. */
export async function ostackCommand(args: string[], profile: string | undefined): Promise<number> {
  return runOstack(args, walletRemote(profile));
}
