import { compiledCli } from './cli-update.js';
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from 'node:timers/promises';
import { z } from "zod";
import { cardAccessUrl } from "./contracts/card-access.js";
import { ToolClient, ToolClientError } from "./client.js";
import { credentialDirectory, readConfig, saveConfig, type ToolConfig } from "./config.js";
import { tokenRequest, walletOrigin, walletServer } from "./access-tokens.js";
import { withLoginLock } from './login-lock.js';
import { openLoginTerminal } from './login-terminal.js';
import { startEmailLogin, verifyEmailLogin, createEmailHandoff, EmailLoginError } from './email-login.js';

const loginUsage = "Use login [--server URL] [--client NAME] [--card ID] [--name NAME] [--profile PROFILE] [--email EMAIL] [--auth email|browser] [--no-browser] [--reauth]";
export function loginOptions(args: string[]) {
  const flags: Record<string, string> = {};
  let noBrowser = false, reauth = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index]!;
    if (name === "--reauth" && !reauth) { reauth = true; continue; }
    if (name === "--no-browser" && !noBrowser) { noBrowser = true; continue; }
    if (!["--server", "--client", "--card", "--name", "--task", "--email", "--auth"].includes(name) || flags[name] || !args[index + 1] || args[index + 1]!.startsWith("--"))
      throw new Error(loginUsage);
    flags[name] = args[++index]!;
  }
  if (flags["--auth"] && !["email", "browser"].includes(flags["--auth"])) throw new Error("Use --auth email or --auth browser");
  if (flags["--email"]) z.email().parse(flags["--email"]);
  if (flags["--auth"] === "browser" && flags["--email"]) throw new Error("Use --email with email sign-in, or --auth browser without --email");
  return { flags, noBrowser, reauth, origin: walletServer(flags["--server"]) };
}
export function keyStdinServer(args: string[]) {
  let server: string | undefined, stdin = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index]!;
    if (name === "--key-stdin") {
      if (stdin) throw new Error("Use login [--server URL] --key-stdin");
      stdin = true;
      continue;
    }
    if (name !== "--server" || server || !args[index + 1] || args[index + 1]!.startsWith("--"))
      throw new Error("Use login [--server URL] --key-stdin");
    server = args[++index]!;
  }
  if (!stdin) throw new Error("Use login [--server URL] --key-stdin");
  return walletServer(server);
}
export async function browserLogin(args: string[], profile?: string) {
  const { flags, noBrowser, reauth, origin } = loginOptions(args);
  const selectedProfile = profile ?? process.env.O11_TOOLS_PROFILE ?? (flags["--client"] || flags["--card"] || flags["--name"] ? `agent-${crypto.randomUUID()}` : undefined);
  credentialDirectory(selectedProfile);
  const usage = `o11${selectedProfile ? ` --profile ${selectedProfile}` : ""}`;
  const resource = cardAccessUrl(origin, flags["--card"], flags["--name"]);
  return withLoginLock(selectedProfile, async signal => {
    if (!reauth) {
      const saved = await lstat(join(credentialDirectory(selectedProfile), 'access.json')).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
      });
      if (saved) {
        const config = await readConfig(selectedProfile);
        if (walletOrigin(config.baseUrl) === origin && (config.resource ?? `${origin}/mcp`) === resource) {
          try {
            await new ToolClient(config).cards();
            return { connected: true, reused: true, server: origin, ...(selectedProfile ? { profile: selectedProfile } : {}) };
          } catch (error) {
            if (!(error instanceof ToolClientError && error.status === 401)) throw error;
          }
        }
      }
    }
    const manualBrowser = noBrowser || !!(process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.CI || process.env.CODESPACES || process.env.REMOTE_CONTAINERS)
      || (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY);
    const terminal = !manualBrowser && flags["--auth"] !== "browser" ? openLoginTerminal() : undefined;
    if (flags["--auth"] === "email" && !terminal) {
      const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
      const retry = [...(compiledCli ? [process.execPath] : [process.execPath, process.argv[1] ?? 'o11']), ...(selectedProfile ? ['--profile', selectedProfile] : []),
        'login', '--server', origin, ...['--client', '--card', '--name'].flatMap(name => flags[name] ? [name, flags[name]!] : []),
        '--auth', 'email', ...(reauth ? ['--reauth'] : [])].map(quote).join(' ');
      throw new Error(process.platform === 'win32'
        ? 'Terminal email login is unavailable on Windows. Use --auth browser to sign in and approve access in your browser.'
        : `Terminal email login needs your own interactive local terminal and a browser on the same machine. No approval request was created. Run this command there, enter the code privately, then return to your agent:\n${retry}\nUse --auth browser instead if you want browser sign-in.`);
    }
    const response = await fetch(`${origin}/oauth/device/code`, { method: "POST", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: "o11-wallet-cli", resource,
        client_name: flags["--client"], card_id: flags["--card"], task: flags["--task"] }),
    });
    if (!response.ok) throw new Error(response.status === 429
      ? "Browser sign-in is rate limited. Wait before starting another login."
      : `Could not start browser sign-in (HTTP ${response.status}). Check the wallet URL and agent routes.`);
    const request = z.object({ device_code: z.string().min(40), user_code: z.string(), verification_uri_complete: z.url(),
      expires_in: z.number().int().min(1).max(600), interval: z.number().int().min(5).max(60),
    }).parse(await response.json());
    const deadline = Date.now() + request.expires_in * 1000;
    const loginSignal = AbortSignal.any([signal, AbortSignal.timeout(request.expires_in * 1000)]);
    const url = new URL(request.verification_uri_complete);
    if (url.origin !== origin || url.pathname !== "/connect") throw new Error("The wallet returned an unexpected approval address");
    let approvalUrl = url.href;
    let handoff: ReturnType<typeof createEmailHandoff> | undefined;
    try {
      if (terminal) {
        try {
          const email = flags["--email"] ?? await terminal.email(loginSignal);
          const device = { origin, resource, deviceCode: request.device_code, requestId: url.searchParams.get('request') ?? '', signal: loginSignal };
          const started = await startEmailLogin(device, email);
          if (started.sent) {
            process.stderr.write(`Code sent to ${started.email_hint}. Enter it here, never in agent chat.\n`);
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                const verified = await verifyEmailLogin(device, email, await terminal.code(loginSignal));
                handoff = createEmailHandoff(verified);
                approvalUrl = handoff.url;
                break;
              } catch (error) {
                if (!(error instanceof EmailLoginError) || error.code !== 'invalid_otp' || attempt === 4) throw error;
                process.stderr.write(`${error.message}\n`);
              }
            }
          } else {
            const googleUrl = new URL(started.verification_uri_complete);
            const next = new URL(googleUrl.searchParams.get('next') ?? '', origin);
            if (googleUrl.origin !== origin || googleUrl.pathname !== '/' || googleUrl.searchParams.get('provider') !== 'google' || next.href !== url.href)
              throw new Error('The wallet returned an unexpected Google sign-in address.');
            approvalUrl = googleUrl.href;
            process.stderr.write('This account uses Google. Continue with Google in your browser.\n');
          }
        } finally { terminal.close(); }
      } else if (flags["--auth"] !== "browser") {
        process.stderr.write('Email codes need an interactive terminal and a browser on this machine. Continuing in your browser. To enter email here, run login --server ' + origin + ' in your own terminal.\n');
      }
      process.stderr.write(`${manualBrowser ? "Open this approval page" : "Opening approval page; use this link only if no page appeared"}: ${approvalUrl}\nConfirm code ${request.user_code} and approve your agent.\n`);
      process.stderr.write(`Verify saved access after approval: ${usage} doctor\n`);
      if (!manualBrowser) {
        const command = process.platform === "darwin" ? ["open", approvalUrl] : process.platform === "win32"
          ? ["rundll32", "url.dll,FileProtocolHandler", approvalUrl] : ["xdg-open", approvalUrl];
        try { void Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exited.catch(() => {}); }
        catch { /* The printed address works on headless machines too. */ }
      }
      let interval = request.interval * 1000;
      while (Date.now() < deadline) {
        await delay(interval, undefined, { signal });
        if (Date.now() >= deadline) break;
        const result = await tokenRequest(origin, { grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: "o11-wallet-cli", device_code: request.device_code }, resource, signal);
        if (result.error === "authorization_pending") continue;
        if (result.error === "slow_down") { interval += 5000; continue; }
        if (result.ambiguous) { interval = Math.min(60000, interval * 2); continue; }
        if (!result.tokens) throw new Error(result.error === "access_denied" ? "Connection declined. Run login again when ready." : "Connection expired or unavailable. Run login again.");
        const config: ToolConfig = { baseUrl: origin, resource, apiKey: result.tokens.access_token,
          refreshToken: result.tokens.refresh_token, expiresAt: Date.now() + result.tokens.expires_in * 1000 };
        const client = new ToolClient(config);
        await saveConfig(config, selectedProfile);
        try { await client.cards(); }
        catch { throw new Error(`Access saved. The connection check failed; run ${usage} doctor to retry without signing in again.`); }
        return { connected: true, server: origin, ...(selectedProfile ? { profile: selectedProfile, usage: `${usage} <command>` } : {}), ...(result.tokens.task ? { task: result.tokens.task } : {}) };
      }
      throw new Error("Connection timed out. Run login again to start a new request.");
    } finally { handoff?.close(); }
  });
}
