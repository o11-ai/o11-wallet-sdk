import { createHash } from 'node:crypto';
import { z } from 'zod';
import { aiAccessResultSchema, aiLoginProviderSchema, aiLoginStatusSchema } from './contracts/sandboxes.js';
import type { LoginAgent } from './sandbox-login-agent.js';
import type { SandboxClient } from './sandbox-login-transfer.js';

/**
 * Coding agents signed in through o11's AI proxy. `o11 login claude|codex` stores a refreshable login with o11, and
 * only o11 refreshes it. A sandbox gets a stand-in key (`o11ai_…`) for the proxy, reissued on each start or resume,
 * never the login itself. Each agent's `proxy` (sandbox-login-<agent>.ts) turns the access into its own settings.
 */
export const proxyAgents = aiLoginProviderSchema.options;
export type ProxyAgent = typeof proxyAgents[number];
export type ProxyAccess = { baseUrl: string; placeholder: string };
export type StoredStatus = { connected: boolean; expiresAt?: string; needsSignIn: boolean };
export const isProxyAgent = (agent: LoginAgent): agent is ProxyAgent => proxyAgents.some(name => name === agent);

/** The login o11 stores for an agent. Throws when o11 can't answer (an older server), so callers fall back. */
export async function storedLoginStatus(client: SandboxClient, provider: ProxyAgent): Promise<StoredStatus> {
  const status = aiLoginStatusSchema.parse((await client.sandbox({ action: 'ai-login-status', params: { provider } })).data);
  return { connected: status.connected, ...(status.expiresAt ? { expiresAt: status.expiresAt } : {}), needsSignIn: status.needsSignIn };
}

/**
 * The proxy address and this sandbox's stand-in key. The key ends up in shell-sourced and JSON files, so only plain
 * characters are accepted.
 */
export async function proxyAccess(client: SandboxClient, id: string, provider: ProxyAgent): Promise<ProxyAccess> {
  const { baseUrl, placeholder } = aiAccessResultSchema.parse((await client.sandbox({ action: 'ai-access', id, params: { provider } })).data);
  if (!/^https?:\/\/[^\s'"\\]+$/.test(baseUrl) || !/^o11ai_[A-Za-z0-9._-]{8,500}$/.test(placeholder)) throw new Error('o11 returned no proxy access for this sandbox');
  return { baseUrl, placeholder };
}

/** Recorded in the sandbox's sign-in record, so a changed stand-in key can be found without reading the key back. */
export const proxyFingerprint = (access: ProxyAccess) => createHash('sha256').update(`${access.baseUrl}\n${access.placeholder}`).digest('hex').slice(0, 16);

/** Agents with a working stored login (one status call for both), ignoring a server that doesn't know the action yet. */
export async function connectedProxyAgents(client: SandboxClient): Promise<ProxyAgent[]> {
  try {
    const { logins } = z.object({ logins: z.array(aiLoginStatusSchema) }).parse((await client.sandbox({ action: 'ai-login-status', params: {} })).data);
    return proxyAgents.filter(agent => logins.some(login => login.provider === agent && login.connected && !login.needsSignIn));
  } catch { return []; }
}

/** The agents to sign in when none were named: the default ones plus each with a stored login. */
export async function withStoredLoginAgents(client: SandboxClient, agents: LoginAgent[]) {
  return [...new Set([...agents, ...await connectedProxyAgents(client)])];
}
