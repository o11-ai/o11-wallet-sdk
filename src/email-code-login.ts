import { chmod, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { ToolClient } from './client.js';
import { credentialDirectory, saveConfig, type ToolConfig } from './config.js';
import { tokenRequest, walletServer } from './access-tokens.js';
import { withLoginLock } from './login-lock.js';
import { startEmailLogin, verifyEmailApproval, EmailLoginError, type EmailDevice } from './email-login.js';
import { LoginFailedError } from './login-errors.js';
import { telemetryHeaders } from './cli-telemetry-context.js';
import { cliVersionHeader } from './contracts/cli-version.js';
import { version as sdkVersion } from '../package.json';

/**
 * Email sign-in an agent can drive in two commands, with no terminal and no browser:
 *   login --server URL --email EMAIL [--task TEXT]   sends the code and saves the pending request (step 1)
 *   login --server URL --code-stdin                  reads the code from stdin, lets the wallet approve, saves access
 * Both use the profile the commands name, or the default. The code is never a command-line argument. The pending
 * request (its device code is a secret) is a 0600 file in that profile's directory, read and removed under its login lock.
 */
const requestFlags = ['--client', '--card', '--name', '--task'] as const;
const pendingSchema = z.object({ origin: z.url(), resource: z.url(), deviceCode: z.string().min(40), requestId: z.string(),
  email: z.email(), expiresAt: z.number().int(), codeExpiresAt: z.number().int(), codeSeconds: z.number().int().positive(),
  interval: z.number().int().min(5).max(60), flags: z.partialRecord(z.enum(requestFlags), z.string()) });
type Pending = z.infer<typeof pendingSchema>;
const deviceSchema = z.object({ device_code: z.string().min(40), user_code: z.string(), verification_uri_complete: z.url(),
  expires_in: z.number().int().min(1).max(1800), interval: z.number().int().min(5).max(60) });

/** Starts a device request; browser and email sign-in share it. */
export async function requestDeviceCode(origin: string, resource: string, flags: Record<string, string>, signal: AbortSignal) {
  const response = await fetch(`${origin}/oauth/device/code`, { method: "POST", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    headers: { "Content-Type": "application/json", [cliVersionHeader]: sdkVersion, ...telemetryHeaders() }, body: JSON.stringify({ client_id: "o11-wallet-cli", resource,
      client_name: flags["--client"], card_id: flags["--card"], task: flags["--task"] }),
  });
  if (!response.ok) throw new LoginFailedError(response.status === 429 ? 'rate_limited' : 'network', response.status === 429
    ? "Sign-in is rate limited. Wait before starting another login."
    : `Could not start sign-in (HTTP ${response.status}). Check the wallet URL and agent routes.`);
  const request = deviceSchema.parse(await response.json());
  const url = new URL(request.verification_uri_complete);
  if (url.origin !== origin || url.pathname !== "/connect") throw new LoginFailedError('unexpected_address', "The wallet returned an unexpected approval address");
  return { ...request, url, requestId: url.searchParams.get('request') ?? '' };
}

const pendingPath = (home: string | undefined) => join(credentialDirectory(home), 'email-login.json');
const cli = (home: string | undefined) => `o11${home ? ` --profile ${home}` : ''}`;
const quote = (value: string) => /^[\w@.:/=+-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\\''") + "'";
const flagText = (flags: Pending['flags']) => requestFlags.map(name => flags[name] ? ` ${name} ${quote(flags[name])}` : '').join('');
// Every hint repeats the first command's card, client, name and task, so following it never widens access.
const restart = (pending: Pick<Pending, 'origin' | 'email' | 'flags'>, home: string | undefined) =>
  `${cli(home)} login --server ${pending.origin} --email ${quote(pending.email)}${flagText(pending.flags)}`;
const browserStep = (origin: string, flags: Pending['flags'], home: string | undefined) =>
  `${cli(home)} login --server ${origin} --auth browser --no-browser${flagText(flags)}`;
const nextStep = (origin: string, home: string | undefined) => `${cli(home)} login --server ${origin} --code-stdin`;
const minutes = (seconds: number) => { const value = Math.max(1, Math.round(seconds / 60)); return `${value} minute${value === 1 ? '' : 's'}`; };

/** Step 1: send the code. Runs inside the caller's login lock on `home`, after its saved-access check. */
export async function startEmailCode(input: { origin: string; resource: string; flags: Record<string, string>; email: string;
  home: string | undefined; signal: AbortSignal }) {
  const { origin, resource, email, home, signal } = input;
  const flags: Pending['flags'] = Object.fromEntries(requestFlags.flatMap(name => input.flags[name] ? [[name, input.flags[name]]] : []));
  const request = await requestDeviceCode(origin, resource, input.flags, signal);
  const device: EmailDevice = { origin, resource, deviceCode: request.device_code, requestId: request.requestId, signal };
  const started = await startEmailLogin(device, email);
  // Nothing would collect access from that request's Google link, so the browser sign-in command is the next step.
  if (!started.sent) throw new LoginFailedError('browser_required', `This account signs in with Google, so it needs a browser. `
    + `Run ${browserStep(origin, flags, home)}: it prints a link to open and waits for approval.`);
  const now = Date.now();
  const pending: Pending = { origin, resource, deviceCode: request.device_code, requestId: request.requestId, email,
    expiresAt: now + request.expires_in * 1000, codeExpiresAt: now + Math.min(started.expires_in, request.expires_in) * 1000,
    codeSeconds: Math.round(started.expires_in), interval: request.interval, flags };
  const path = pendingPath(home), temporary = `${path}.${process.pid}`;
  await writeFile(temporary, JSON.stringify(pending), { mode: 0o600 });
  if (process.platform !== 'win32') await chmod(temporary, 0o600);
  await rename(temporary, path);
  return { code_sent: true as const, email_hint: started.email_hint, expires_in: Math.round(started.expires_in), next: nextStep(origin, home) };
}

async function readPending(home: string | undefined) {
  const text = await readFile(pendingPath(home), 'utf8').catch(() => undefined);
  if (text === undefined) return undefined;
  try { return pendingSchema.safeParse(JSON.parse(text)).data; } catch { return undefined; }
}
/** One line from stdin: prompted when it is a terminal, given up when the code's lifetime ends. */
async function readCode(timeoutMs: number, expiredMessage: string) {
  if (process.stdin.isTTY) process.stderr.write('Enter the six-digit code: ');
  const reader = createInterface({ input: process.stdin, terminal: false });
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new LoginFailedError('expired', expiredMessage)), timeoutMs);
      reader.once('line', line => { clearTimeout(timer); resolve(line.trim()); });
      reader.once('close', () => { clearTimeout(timer); resolve(''); });
    });
  } finally { reader.close(); process.stdin.destroy(); }
}

const codeUsage = 'Use login [--server URL] --code-stdin, with the six-digit email code on stdin.';
/** Step 2: verify the code from stdin; the wallet approves the request itself and no browser opens. */
export async function finishEmailCode(args: string[], home: string | undefined) {
  let server: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--code-stdin') continue;
    if (args[index] !== '--server' || server || !args[index + 1] || args[index + 1]!.startsWith('--'))
      throw new Error(`${args[index]} is not used with --code-stdin: the email, card and task come from the first step. ${codeUsage}`);
    server = args[++index];
  }
  const none = () => new LoginFailedError('expired', `No email sign-in is waiting for a code. Run ${cli(home)} login --server ${server ? walletServer(server) : 'URL'} --email EMAIL first.`);
  const first = await readPending(home);
  if (!first) throw none();
  if (server && walletServer(server) !== first.origin)
    throw new LoginFailedError('expired', `The waiting email sign-in is for ${first.origin}. Run ${restart({ ...first, origin: walletServer(server) }, home)} to start one for ${walletServer(server)}.`);
  const expiredText = (pending: Pending) => `This sign-in code expired: codes last ${minutes(pending.codeSeconds)}. `
    + `Run ${restart(pending, home)} for a new code, then ${nextStep(pending.origin, home)}.`;
  const remaining = first.codeExpiresAt - Date.now();
  const code = remaining > 0 ? await readCode(remaining, expiredText(first)) : undefined;
  if (code !== undefined && !/^[0-9]{6}$/.test(code)) throw new Error(`Send only the six-digit code from the email on stdin. ${codeUsage}`);
  return withLoginLock(home, async signal => {
    // Read again under the lock: another login may have finished or replaced this request meanwhile.
    const pending = await readPending(home);
    if (!pending) throw none();
    const forget = () => rm(pendingPath(home), { force: true });
    const poll = () => tokenRequest(pending.origin, { grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: "o11-wallet-cli", device_code: pending.deviceCode }, pending.resource, signal);
    const unfinished = (result: Awaited<ReturnType<typeof poll>>) =>
      result.error === "authorization_pending" || result.error === "slow_down" || result.ambiguous === true;
    const finish = async (tokens: NonNullable<Awaited<ReturnType<typeof poll>>['tokens']>) => {
      const config: ToolConfig = { baseUrl: pending.origin, resource: pending.resource, apiKey: tokens.access_token,
        refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
      await saveConfig(config, home);
      await forget();
      try { await new ToolClient(config).cards(); }
      catch { throw new LoginFailedError('check_failed', `Access saved. The connection check failed; run ${cli(home)} doctor to retry without signing in again.`); }
      return { connected: true as const, server: pending.origin, ...(home ? { profile: home, usage: `${cli(home)} <command>` } : {}),
        ...(tokens.task ? { task: tokens.task } : {}) };
    };
    const startOver = async (why: string) => { await forget(); return new LoginFailedError('expired', `${why} Run ${restart(pending, home)} to start again.`); };
    // A step 2 that died after the wallet approved left the request approved: one poll collects that access.
    const earlier = await poll();
    if (earlier.tokens) return finish(earlier.tokens);
    if (!unfinished(earlier)) throw await startOver(earlier.error === "expired_token" ? 'This sign-in expired.' : 'This sign-in can no longer finish.');
    if (code === undefined || Date.now() >= pending.codeExpiresAt) { await forget(); throw new LoginFailedError('expired', expiredText(pending)); }
    const device: EmailDevice = { origin: pending.origin, resource: pending.resource, deviceCode: pending.deviceCode, requestId: pending.requestId,
      signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, pending.expiresAt - Date.now()))]) };
    let verified;
    try { verified = await verifyEmailApproval(device, pending.email, code); }
    catch (error) {
      // A wrong code keeps the request: the same command with the right code continues it.
      if (error instanceof EmailLoginError && error.code === 'invalid_otp')
        throw new EmailLoginError(error.status, error.code, `That code did not match. Run ${nextStep(pending.origin, home)} again with the code from the latest email.`);
      if (error instanceof EmailLoginError && error.code === 'expired_token') { await forget(); throw new LoginFailedError('expired', expiredText(pending)); }
      if (error instanceof EmailLoginError && error.status !== 429) throw await startOver(`Email sign-in could not finish (${error.code}).`);
      throw error;
    }
    if (!verified.approved) {
      await forget();
      throw new LoginFailedError('browser_required', `This wallet cannot finish email sign-in without a browser yet. Run ${browserStep(pending.origin, pending.flags, home)}: it prints a link to open and waits for approval.`);
    }
    // The wallet counts the poll interval from the poll before the code check, so wait one interval first,
    // and add 5 seconds after each slow_down as the device flow requires (RFC 8628 section 3.5).
    let interval = pending.interval;
    for (;;) {
      if (Date.now() + interval * 1000 >= pending.expiresAt) throw await startOver('This sign-in expired.');
      await delay(interval * 1000, undefined, { signal });
      const next = await poll();
      if (next.tokens) return finish(next.tokens);
      if (!unfinished(next)) throw await startOver(`The wallet did not grant access (${next.error}).`);
      if (next.error === "slow_down") interval = Math.min(60, interval + 5);
    }
  });
}
