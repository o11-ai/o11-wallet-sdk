import { z } from "zod";
import { cardAccessUrl } from "./contracts/card-access";
import { ToolClient } from "./client";
import { credentialDirectory, saveConfig, type ToolConfig } from "./config";
import { tokenRequest, walletOrigin } from "./access-tokens";

export async function browserLogin(args: string[], profile?: string) {
  const flags: Record<string, string> = {};
  let noBrowser = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index]!;
    if (name === "--no-browser" && !noBrowser) { noBrowser = true; continue; }
    if (!["--server", "--client", "--card", "--name", "--task"].includes(name) || flags[name] || !args[index + 1] || args[index + 1]!.startsWith("--"))
      throw new Error("Use login --server URL [--client NAME] [--card ID] [--name NAME] [--profile PROFILE] [--no-browser]");
    flags[name] = args[++index]!;
  }
  if (!flags["--server"]) throw new Error("Supply --server with your wallet URL");
  const origin = walletOrigin(flags["--server"]);
  const selectedProfile = profile ?? process.env.O11_TOOLS_PROFILE ?? (flags["--client"] || flags["--card"] || flags["--name"] ? `agent-${crypto.randomUUID()}` : undefined);
  credentialDirectory(selectedProfile);
  const resource = cardAccessUrl(origin, flags["--card"], flags["--name"]);
  const response = await fetch(`${origin}/oauth/device/code`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: "o11-wallet-cli", resource,
      client_name: flags["--client"], card_id: flags["--card"], task: flags["--task"] }),
  });
  if (!response.ok) throw new Error("Could not start browser sign-in. Check the wallet URL and try again");
  const request = z.object({ device_code: z.string().min(40), user_code: z.string(), verification_uri_complete: z.url(),
    expires_in: z.number().int().min(1).max(600), interval: z.number().int().min(5).max(60),
  }).parse(await response.json());
  const url = new URL(request.verification_uri_complete);
  if (url.origin !== origin || url.pathname !== "/connect") throw new Error("The wallet returned an unexpected approval address");
  process.stderr.write(`Open ${url.href}\nConfirm code ${request.user_code} and approve your agent.\n`);
  if (!noBrowser) {
    const command = process.platform === "darwin" ? ["open", url.href] : process.platform === "win32"
      ? ["rundll32", "url.dll,FileProtocolHandler", url.href] : ["xdg-open", url.href];
    try { void Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exited.catch(() => {}); }
    catch { /* The printed address works on headless machines too. */ }
  }
  const deadline = Date.now() + request.expires_in * 1000;
  let interval = request.interval * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, interval));
    const result = await tokenRequest(origin, { grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: "o11-wallet-cli", device_code: request.device_code }, resource);
    if (result.error === "authorization_pending") continue;
    if (result.error === "slow_down") { interval += 5000; continue; }
    if (!result.tokens) throw new Error(result.error === "access_denied" ? "Connection declined. Run login again when ready." : "Connection expired or unavailable. Run login again.");
    const config: ToolConfig = { baseUrl: origin, resource, apiKey: result.tokens.access_token,
      refreshToken: result.tokens.refresh_token, expiresAt: Date.now() + result.tokens.expires_in * 1000 };
    const client = new ToolClient(config);
    await saveConfig(config, selectedProfile);
    try { await client.cards(); }
    catch { throw new Error("Access saved. The connection check failed; run o11 doctor to retry without signing in again."); }
    return { connected: true, server: origin, ...(selectedProfile ? { profile: selectedProfile, usage: `o11 --profile ${selectedProfile} <command>` } : {}), ...(result.tokens.task ? { task: result.tokens.task } : {}) };
  }
  throw new Error("Connection timed out. Run login again to start a new request.");
}
