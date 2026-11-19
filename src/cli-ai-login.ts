import { cancelLogin, finishLogin, serveLogin, startLogin, waitLogin, type AiProvider, type Save, type Sources, type State } from './ai-login-capture.js';
import { aiLoginSaveParamsSchema } from './contracts/sandboxes.js';
import { storedLoginStatus, type StoredStatus } from './sandbox-login-proxy.js';
import type { SandboxClient } from './sandbox-login-transfer.js';

/**
 * `o11 login claude|codex` and `o11 logout claude|codex`: a Claude or ChatGPT login of its own, made on this computer in
 * a separate config folder and kept by o11, which alone refreshes it. Sandboxes and hosted computers use it through
 * o11's proxy with a stand-in key (sandbox-login-proxy.ts). The person's own sign-in here is never read or changed.
 */
export const aiLoginProviders = ['claude', 'codex'] as const;
const usage = {
  claude: 'Use o11 login claude [--status] [--no-browser] [--wait] [--code CODE]',
  codex: 'Use o11 login codex [--status] [--wait]',
};
const allowed = { claude: ['--status', '--no-browser', '--wait', '--code', '--serve'], codex: ['--status', '--wait', '--serve'] };
export type AiLoginDeps = { client: SandboxClient; sources: Sources; spawnHelper: (args: string[]) => void; interactive?: boolean };

export function aiLoginArguments(provider: AiProvider, args: string[]) {
  const flags: Record<string, string | true> = {};
  for (let index = 0; index < args.length; index++) {
    const word = args[index]!, [flag, inline] = word.includes('=') ? [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)] : [word, undefined];
    if (!allowed[provider].includes(flag) || flags[flag] !== undefined) throw new Error(usage[provider]);
    if (flag !== '--code') { if (inline !== undefined) throw new Error(usage[provider]); flags[flag] = true; continue; }
    const value = inline ?? args[++index];
    if (!value || value.startsWith('--')) throw new Error('Supply a value after --code');
    flags[flag] = value;
  }
  return flags;
}

const statusOf = async (client: SandboxClient, provider: AiProvider): Promise<{ provider: AiProvider } & StoredStatus> =>
  ({ provider, ...await storedLoginStatus(client, provider) });

async function finished(state: State, deps: AiLoginDeps, provider: AiProvider) {
  if (state.state !== 'done') return { provider, connected: false, ...state };
  return { ...await statusOf(deps.client, provider), ...(state.detail ? { note: state.detail } : {}),
    next: 'New sandboxes and hosted computers use it on their own. For a running one: o11 sandbox login NAME, or o11 ostack host signin.' };
}

/** Starts the login. In a terminal it waits here; for an agent it returns the one line to tell the person and what to run next. */
async function login(provider: AiProvider, flags: Record<string, string | true>, deps: AiLoginDeps) {
  const started = await startLogin(provider, deps.sources, { browser: flags['--no-browser'] !== true,
    spawnHelper: () => deps.spawnHelper([provider, '--serve']) });
  if (!('url' in started)) return { provider, connected: false, ...started };
  if (provider === 'codex') {
    if (deps.interactive) {
      process.stderr.write(`Open ${started.url} and enter this code: ${started.code}\nWaiting (the code lasts 15 minutes)...\n`);
      return finished(await waitLogin(provider, deps.sources, 900), deps, provider);
    }
    return { provider, connected: false, needs_person: { url: started.url, code: started.code },
      tell_person: `Enter this code: ${started.code} at ${started.url}`, then_run: 'o11 login codex --wait', expires_in_minutes: 15 };
  }
  if (deps.interactive) {
    process.stderr.write(started.browserOpened
      ? `Click Authorize in the tab that opened. Using another computer? Open this link and paste the code it shows:\n${started.url}\nCode (or just wait): `
      : `Open this link, approve it, then paste the code it shows:\n${started.url}\nCode: `);
    const pasted = new Promise<string>(resolve => process.stdin.once('data', data => resolve(String(data).trim())));
    const state = await Promise.race([waitLogin(provider, deps.sources, 1800), pasted.then(code => finishLogin(code, deps.sources))]);
    process.stdin.pause();
    return finished(state, deps, provider);
  }
  if (started.browserOpened) return { provider, connected: false, browser_opened: true, needs_person: { url: started.url, finish: 'click-authorize' },
    tell_person: 'Click Authorize in the tab that opened.', then_run: 'o11 login claude --wait',
    if_no_tab: `Send this link instead: ${started.url} and run o11 login claude --code <code> with the code the page shows.`, expires_in_minutes: 30 };
  return { provider, connected: false, browser_opened: false, needs_person: { url: started.url, finish: 'paste-code' },
    tell_person: `Open this link, approve it, and send me the code it shows: ${started.url}`, then_run: 'o11 login claude --code <code>', expires_in_minutes: 30 };
}

/** Runs `o11 login|logout claude|codex`. Returns undefined for the helper, which prints nothing. */
export async function aiLoginCommand(command: 'login' | 'logout', provider: AiProvider, args: string[], deps: AiLoginDeps, save: Save) {
  if (command === 'logout') {
    if (args.length) throw new Error(`Use o11 logout ${provider}`);
    await cancelLogin(provider, deps.sources);
    await deps.client.sandbox({ action: 'ai-login-delete', params: { provider } });
    return { provider, removed: true, note: 'Sandboxes and hosted computers stop using it. Run o11 login again to bring it back.' };
  }
  const flags = aiLoginArguments(provider, args);
  if (flags['--serve']) { await serveLogin(provider, deps.sources, save); return undefined; }
  if (flags['--status']) return statusOf(deps.client, provider);
  if (typeof flags['--code'] === 'string') return finished(await finishLogin(flags['--code'], deps.sources), deps, provider);
  if (flags['--wait']) return finished(await waitLogin(provider, deps.sources, 300), deps, provider);
  const current = await statusOf(deps.client, provider);
  if (current.connected && !current.needsSignIn)
    return { ...current, note: `Already signed in. To use another account, run o11 logout ${provider} first.` };
  return login(provider, flags, deps);
}

/** Sends a finished login to o11. Only the helper calls this; the tokens travel in the request body alone. */
export const saveToO11 = (client: SandboxClient): Save => async (provider, credentials) => {
  await client.sandbox({ action: 'ai-login-save', params: aiLoginSaveParamsSchema.parse({ provider, ...credentials }) });
};
