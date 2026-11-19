import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { credentialDirectory } from './config.js';
import { jwtExpiry, record, text } from './sandbox-login-agent.js';

/**
 * The sign-in behind `o11 login claude|codex`. A detached helper (this CLI with --serve) runs the agent's own login in
 * a pseudo-terminal with its own config folder (CLAUDE_CONFIG_DIR, CODEX_HOME), so the person's sign-in on this
 * computer is never read or changed. The login made there is sent to o11 (ai-login-save), and the folder is deleted.
 * Tokens never reach stdout or a command line. The helper writes its link (and Codex's code) to a 0600 file for the
 * command that started it, which waits for the result or hands it a pasted code.
 */
export type AiProvider = 'claude' | 'codex';
export type Credentials = { accessToken: string; refreshToken: string; expiresAt: string; accountId?: string; scopes?: string[] };
export type Save = (provider: AiProvider, credentials: Credentials) => Promise<void>;
export type Sources = { profile?: string; env?: Record<string, string | undefined> };
export type State = { state: 'done' | 'failed' | 'expired' | 'waiting'; detail?: string };
export type Started = { url: string; code?: string; browserOpened: boolean };

const MINUTES = 30;
const codePattern = /^[A-Za-z0-9._~#-]{8,512}$/;
const tokenText = /sk-ant-[A-Za-z0-9_-]+/g;
const folder = (provider: AiProvider, sources: Sources) => join(credentialDirectory(sources.profile), 'ai-login', provider);
const message = (error: unknown) => (error instanceof Error ? error.message : 'failed').replace(tokenText, '[redacted]').slice(0, 200);

/** Terminal output as plain text: cursor moves become spaces, other escapes go. */
export function plainTerminalText(raw: string) {
  return raw.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[(\d*)C/g, (_m, count: string) => ' '.repeat(Number(count) || 1))
    .replace(/\x1b\[[0-9;?<>]*[A-Za-z]/g, '');
}

/** The login's environment: never the sign-in of an app (Claude Code, Codex) that runs this command, and its own folder. */
export function loginEnvironment(provider: AiProvider, env: Record<string, string | undefined>, home: string, opener?: string) {
  const clean: Record<string, string> = {};
  const skip = provider === 'claude' ? (key: string) => key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_') || key.startsWith('ANTHROPIC_') || key === 'CLAUDE_CONFIG_DIR'
    : (key: string) => key.startsWith('CODEX_') || key === 'OPENAI_API_KEY';
  for (const [key, value] of Object.entries(env)) if (value !== undefined && !skip(key)) clean[key] = value;
  return provider === 'claude' ? { ...clean, CLAUDE_CONFIG_DIR: home, BROWSER: opener ?? 'true' } : { ...clean, CODEX_HOME: home };
}

export function loginCommand(provider: AiProvider) {
  if (provider === 'codex') return ['codex', '-c', 'cli_auth_credentials_store=file', 'login', '--device-auth'];
  return ['claude', 'auth', 'login', '--claudeai'];
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
/** Opens the page with the person's own browser setting (or the system's) and records that it opened. */
export function openerScript(dir: string, browser: string | undefined) {
  const system = browser && browser !== 'true' ? browser : process.platform === 'darwin' ? 'open' : 'xdg-open';
  return `#!/bin/sh\n${system} "$1" >/dev/null 2>&1 && : >${quote(join(dir, 'browser-opened'))}\nexit 0\n`;
}

/** The link to show: Claude's paste-code page (any browser), or Codex's device page and its code. */
export function loginLink(provider: AiProvider, output: string): Omit<Started, 'browserOpened'> | undefined {
  const plain = plainTerminalText(output);
  if (provider === 'claude') { const url = /https:\/\/\S+\/oauth\/authorize\?\S+/.exec(plain)?.[0]; return url ? { url } : undefined; }
  const url = /https:\/\/auth\.openai\.com\/\S+/.exec(plain)?.[0], code = /\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/.exec(plain)?.[0];
  return url && code ? { url, code } : undefined;
}

async function json(path: string) {
  try { if ((await stat(path)).size < 1024 * 1024) return record(JSON.parse(await readFile(path, 'utf8'))); } catch { /* Not there yet. */ }
  return undefined;
}

/** macOS keeps Claude Code's login in the keychain, under a name with a hash of CLAUDE_CONFIG_DIR. Read, then removed. */
function keychainCredentials(home: string) {
  if (process.platform !== 'darwin') return undefined;
  const service = `Claude Code-credentials-${createHash('sha256').update(home).digest('hex').slice(0, 8)}`;
  const found = Bun.spawnSync(['security', 'find-generic-password', '-s', service, '-w'], { stdout: 'pipe', stderr: 'ignore' });
  if (found.exitCode !== 0) return undefined;
  Bun.spawnSync(['security', 'delete-generic-password', '-s', service], { stdout: 'ignore', stderr: 'ignore' });
  try { return record(JSON.parse(found.stdout.toString())); } catch { return undefined; }
}

/** The login the agent saved in its own folder, once it has one. */
export async function readCredentials(provider: AiProvider, home: string): Promise<Credentials | undefined> {
  if (provider === 'codex') {
    const tokens = record((await json(join(home, 'auth.json')))?.tokens);
    const accessToken = text(tokens.access_token), refreshToken = text(tokens.refresh_token), accountId = text(tokens.account_id);
    if (!accessToken || !refreshToken) return undefined;
    const expiresAt = jwtExpiry(accessToken);
    return expiresAt ? { accessToken, refreshToken, expiresAt, ...(accountId ? { accountId } : {}) } : undefined;
  }
  const saved = await json(join(home, '.credentials.json')) ?? keychainCredentials(home);
  const oauth = record(saved?.claudeAiOauth);
  const accessToken = text(oauth.accessToken), refreshToken = text(oauth.refreshToken);
  if (!accessToken || !refreshToken || typeof oauth.expiresAt !== 'number') return undefined;
  const accountId = text(record((await json(join(home, '.claude.json')))?.oauthAccount).accountUuid);
  // The refresh asks for the granted scopes again, so they go to o11 with the login.
  const scopes = Array.isArray(oauth.scopes) ? oauth.scopes.filter((scope): scope is string => typeof scope === 'string') : [];
  return { accessToken, refreshToken, expiresAt: new Date(oauth.expiresAt).toISOString(), ...(accountId ? { accountId } : {}), ...(scopes.length ? { scopes } : {}) };
}

async function alive(dir: string) {
  const pid = Number(await readFile(join(dir, 'pid'), 'utf8').catch(() => ''));
  if (!pid) return false;
  try { process.kill(pid, 0); } catch { return false; }
  return Date.now() - (await stat(join(dir, 'pid'))).mtimeMs < MINUTES * 60_000;
}
async function readState(dir: string): Promise<State | undefined> {
  try { return JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')) as State; } catch { return undefined; }
}
const writeState = (dir: string, state: State) => writeFile(join(dir, 'state.json'), JSON.stringify(state), { mode: 0o600 });
async function started(dir: string): Promise<Started | undefined> {
  const link = await json(join(dir, 'link.json'));
  return link && typeof link.url === 'string'
    ? { url: link.url, ...(typeof link.code === 'string' ? { code: link.code } : {}), browserOpened: existsSync(join(dir, 'browser-opened')) } : undefined;
}

/** Starts a sign-in, or reuses one still waiting so a link or code the person already has keeps working. */
export async function startLogin(provider: AiProvider, sources: Sources, options: { browser?: boolean; spawnHelper: () => void }): Promise<Started | State> {
  const dir = folder(provider, sources);
  if (await alive(dir)) { const running = await started(dir); if (running) return running; }
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await chmod(dir, 0o700);
  const browser = provider === 'claude' && options.browser !== false;
  if (browser) await writeFile(join(dir, 'open-browser'), openerScript(dir, (sources.env ?? process.env).BROWSER), { mode: 0o700 });
  options.spawnHelper();
  for (let waited = 0; waited < 120; waited++) {
    const running = await started(dir);
    // The opener runs as the link appears; give it a moment so browserOpened is right.
    if (running) { for (let wait = 0; wait < 6 && browser && !running.browserOpened; wait++) { await Bun.sleep(500); running.browserOpened = existsSync(join(dir, 'browser-opened')); } return running; }
    const state = await readState(dir);
    if (state) return state;
    await Bun.sleep(500);
  }
  return { state: 'failed', detail: `${loginCommand(provider)[0]} did not show a link within a minute` };
}

/** Waits up to `seconds` for the sign-in to finish (Authorize clicked, the code entered, or a pasted code went through). */
export async function waitLogin(provider: AiProvider, sources: Sources, seconds = 300): Promise<State> {
  const dir = folder(provider, sources);
  for (let waited = 0; waited <= seconds; waited++) {
    const state = await readState(dir);
    if (state && state.state !== 'waiting') { await rm(dir, { recursive: true, force: true }); return state; }
    if (!await alive(dir)) { await rm(dir, { recursive: true, force: true }); return { state: 'expired', detail: `That sign-in had expired. Run o11 login ${provider} for a new link.` }; }
    if (waited < seconds) await Bun.sleep(1000);
  }
  return { state: 'waiting' };
}

/** Hands the code Claude's page showed to the waiting sign-in. The code travels as a 0600 file. */
export async function finishLogin(code: string, sources: Sources): Promise<State> {
  if (!codePattern.test(code.trim())) throw new Error('That code has an unexpected format. Copy the whole code the page shows.');
  const dir = folder('claude', sources);
  if (!await alive(dir) && !await readState(dir)) return { state: 'expired', detail: 'That sign-in had expired. Run o11 login claude for a new link.' };
  await writeFile(join(dir, 'code'), code.trim(), { mode: 0o600 });
  const result = await waitLogin('claude', sources, 90);
  return result.state === 'waiting' ? { state: 'failed', detail: 'Claude did not answer within 90 seconds' } : result;
}

export async function cancelLogin(provider: AiProvider, sources: Sources) {
  const dir = folder(provider, sources);
  const pid = Number(await readFile(join(dir, 'pid'), 'utf8').catch(() => ''));
  if (pid) try { process.kill(pid); } catch { /* Already gone. */ }
  await rm(dir, { recursive: true, force: true });
}

/** The helper itself (`o11 login claude|codex --serve`). Runs detached until done or MINUTES pass. */
export async function serveLogin(provider: AiProvider, sources: Sources, save: Save, options: { command?: string[] } = {}) {
  const dir = folder(provider, sources), home = join(dir, 'home');
  if (!existsSync(dir)) return;
  await writeFile(join(dir, 'pid'), String(process.pid), { mode: 0o600 });
  await mkdir(home, { recursive: true, mode: 0o700 });
  let raw = '';
  const decoder = new TextDecoder();
  const opener = existsSync(join(dir, 'open-browser')) ? join(dir, 'open-browser') : undefined;
  const child = Bun.spawn(options.command ?? loginCommand(provider), { cwd: home, env: loginEnvironment(provider, sources.env ?? process.env, home, opener),
    terminal: { cols: 1000, rows: 50, data(_terminal, data) { raw += decoder.decode(data, { stream: true }); } } });
  const deadline = Date.now() + MINUTES * 60_000;
  const lastLine = (from = 0) => plainTerminalText(raw.slice(from)).split('\n').map(line => line.trim()).filter(line => line && !line.includes('sk-ant')).at(-1)?.slice(0, 200);
  const result = () => readCredentials(provider, home);
  let state: State = { state: 'expired', detail: `The sign-in was not approved in time. Run o11 login ${provider} for a new link.` };
  try {
    let link = loginLink(provider, raw);
    while (!link && Date.now() < deadline && child.exitCode === null) { await Bun.sleep(300); link = loginLink(provider, raw); }
    if (!link) { state = { state: 'failed', detail: lastLine() ?? `${loginCommand(provider)[0]} did not start` }; return; }
    await writeFile(join(dir, 'link.json'), JSON.stringify(link), { mode: 0o600 });
    await writeState(dir, { state: 'waiting' });
    let credentials: Credentials | undefined, pasted: { at: number; until: number } | undefined;
    const noLogin = ` It gave no login o11 can refresh. Run o11 login ${provider} to try again.`;
    while (!credentials && Date.now() < deadline) {
      credentials = await result();
      if (credentials) break;
      if (child.exitCode !== null) { await Bun.sleep(500); credentials = await result(); if (!credentials) { state = { state: 'failed', detail: `${lastLine() ?? 'The sign-in ended'}.${noLogin}` }; return; } break; }
      // A wrong code leaves Claude asking again, so it fails here and the person starts over with a new link.
      if (pasted && (Date.now() > pasted.until || /error|invalid|failed/i.test(plainTerminalText(raw.slice(pasted.at))))) {
        await Bun.sleep(1000);
        if (!(credentials = await result())) { state = { state: 'failed', detail: `That code did not work (${lastLine(pasted.at) ?? 'no answer'}). Run o11 login claude for a new link.` }; return; }
        break;
      }
      const code = provider === 'claude' && !pasted ? await readFile(join(dir, 'code'), 'utf8').catch(() => '') : '';
      if (!code) { await Bun.sleep(500); continue; }
      await rm(join(dir, 'code'), { force: true });
      // Claude Code reads a burst of text as a paste, Enter included, so Enter goes on its own a moment later.
      child.terminal!.write(code.trim()); await Bun.sleep(1000); child.terminal!.write('\r');
      pasted = { at: raw.length, until: Date.now() + 60_000 };
    }
    if (!credentials) return;
    await save(provider, credentials);
    state = { state: 'done' };
  } catch (error) {
    state = { state: 'failed', detail: message(error) };
  } finally {
    child.kill();
    // The agent's own folder holds the login (and, with Codex, a refresh token): it goes as soon as o11 has it.
    await rm(home, { recursive: true, force: true });
    await rm(join(dir, 'code'), { force: true });
    await writeState(dir, state);
    await rm(join(dir, 'pid'), { force: true });
  }
}
