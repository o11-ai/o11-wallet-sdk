import { chmod, lstat, mkdir, readFile, rename, rm, writeFile, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { tokenRequest, walletOrigin } from "./access-tokens.js";
import { serializedTokenProvider, type AccessTokenProvider } from "./token-provider.js";

const schema = z.object({ baseUrl: z.url(), apiKey: z.string().startsWith("o11_"), resource: z.url().optional(), refreshToken: z.string().min(40).optional(), expiresAt: z.number().int().positive().optional(), refreshState: z.enum(["uncertain", "ended"]).optional() });
export type ToolConfig = z.infer<typeof schema>;
export function credentialDirectory(profile?: string) {
  const root = process.env.O11_TOOLS_CONFIG_DIR ?? join(homedir(), ".config", "o11-wallet");
  const selected = profile ?? process.env.O11_TOOLS_PROFILE;
  if (!selected) return root;
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(selected)) throw new Error("Use a profile of 1–64 lowercase letters, numbers, hyphens or underscores");
  return join(root, "profiles", selected);
}
const path = (profile?: string) => join(credentialDirectory(profile), "access.json");

async function regularFile(file: string) {
  const stat = await lstat(file).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  });
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error("The wallet credential path must be a regular file");
  return stat;
}
export async function readConfig(profile?: string, options: { refresh?: boolean } = {}): Promise<ToolConfig> {
  const selected = profile ?? process.env.O11_TOOLS_PROFILE;
  if (!selected && process.env.O11_TOOLS_URL && process.env.O11_API_KEY)
    return schema.parse({ baseUrl: process.env.O11_TOOLS_URL, apiKey: process.env.O11_API_KEY });
  const file = path(profile);
  const stat = await regularFile(file);
  if (!stat) throw new Error("Run o11 login --server URL, or set O11_TOOLS_URL and O11_API_KEY");
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
    throw new Error("The saved wallet key must be owner-only. Set access.json permissions to 600 before continuing");
  const saved = schema.parse(JSON.parse(await readFile(file, "utf8")));
  // Credentials and their destination must come from the same source.
  if (!selected && (process.env.O11_TOOLS_URL || process.env.O11_API_KEY))
    throw new Error("Set both O11_TOOLS_URL and O11_API_KEY, or unset both to use saved access");
  if (options.refresh === false) return saved;
  assertRefreshState(saved);
  if (saved.refreshToken && saved.expiresAt && saved.expiresAt < Date.now() + 60000) return renewConfig(profile);
  return saved;
}
function assertRefreshState(config: ToolConfig) {
  if (config.refreshState) throw new Error(config.refreshState === "uncertain"
    ? "The last refresh result is unknown. Run o11 login --server URL --reauth to reconnect; retrying the old refresh token could revoke this connection."
    : "Agent access ended. Run o11 login --server URL --reauth to reconnect.");
}
export function renewConfig(profile?: string, rejectedToken?: string): Promise<ToolConfig> {
  return withConfigLock(profile, async () => {
    // Environment API keys are deliberately not exchanged or written into a saved profile.
    if (!(profile ?? process.env.O11_TOOLS_PROFILE) && (process.env.O11_API_KEY || process.env.O11_TOOLS_URL))
      throw new Error("An environment API key cannot refresh. Check its server and permissions.");
    const file = path(profile), stat = await regularFile(file);
    if (!stat || process.platform !== "win32" && (stat.mode & 0o077) !== 0) throw new Error("The saved wallet key must be an owner-only regular file");
    const current = schema.parse(JSON.parse(await readFile(file, "utf8")));
    assertRefreshState(current);
    if (rejectedToken && current.apiKey !== rejectedToken) return current;
    if (!rejectedToken && (!current.expiresAt || current.expiresAt >= Date.now() + 60000)) return current;
    if (!current.refreshToken) throw new Error("This saved API key cannot refresh. Check access or sign in again.");
    const result = await tokenRequest(current.baseUrl, { grant_type: "refresh_token", client_id: "o11-wallet-cli", refresh_token: current.refreshToken }, current.resource);
    if (!result.tokens) {
      if (result.ambiguous || result.error === "invalid_grant")
        await writeConfig({ ...current, refreshState: result.ambiguous ? "uncertain" : "ended" }, profile);
      throw new Error(result.ambiguous ? "The refresh result is unknown. Run o11 login --server URL --reauth to reconnect." : "Could not renew agent access. Run o11 login --server URL --reauth to reconnect.");
    }
    const renewed = { ...current, apiKey: result.tokens.access_token, refreshToken: result.tokens.refresh_token, expiresAt: Date.now() + result.tokens.expires_in * 1000 };
    await writeConfig(renewed, profile);
    return renewed;
  });
}
export function profileTokenProvider(profile?: string, expected?: Pick<ToolConfig, "baseUrl" | "resource">): AccessTokenProvider {
  let bound = expected;
  const checked = (config: ToolConfig) => {
    bound ??= config;
    if (walletOrigin(config.baseUrl) !== walletOrigin(bound.baseUrl) || (config.resource ?? `${walletOrigin(config.baseUrl)}/mcp`) !== (bound.resource ?? `${walletOrigin(bound.baseUrl)}/mcp`))
      throw new Error("The profile destination changed. Start the command again with its new server and resource.");
    return config.apiKey;
  };
  return serializedTokenProvider({ getAccessToken: async () => checked(await readConfig(profile)),
    refreshAccessToken: async rejected => {
      checked(await readConfig(profile));
      return checked(await renewConfig(profile, rejected));
    } });
}
async function ensureDirectory(profile?: string) {
  const directory = credentialDirectory(profile);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("The wallet configuration directory must not be a symlink");
  if (process.platform !== "win32") await chmod(directory, 0o700);
}
async function withConfigLock<T>(profile: string | undefined, run: () => Promise<T>) {
  await ensureDirectory(profile);
  const lock = join(credentialDirectory(profile), ".access.lock");
  const deadline = Date.now() + 10000;
  while (true) {
    try {
      const handle = await open(lock, "wx", 0o600);
      try { return await run(); } finally { await handle.close(); await rm(lock, { force: true }); }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      const stat = await regularFile(lock);
      if (stat && stat.mtimeMs < Date.now() - 60000) { await rm(lock, { force: true }); continue; }
      if (Date.now() >= deadline) throw new Error("Another wallet sign-in is running. Try again shortly.");
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}
async function writeConfig(config: ToolConfig, profile?: string) {
  await regularFile(path(profile));
  const temporary = join(credentialDirectory(profile), `.access-${crypto.randomUUID()}.json`);
  try {
    await writeFile(temporary, JSON.stringify(schema.parse(config)) + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, path(profile));
    if (process.platform !== "win32") await chmod(path(profile), 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function saveConfig(config: ToolConfig, profile?: string) {
  await withConfigLock(profile, () => writeConfig(config, profile));
}
export async function clearConfig(profile?: string) {
  await withConfigLock(profile, async () => {
    const stat = await regularFile(path(profile));
    if (stat) {
      const saved = schema.parse(JSON.parse(await readFile(path(profile), "utf8")));
      if (saved.refreshToken) {
        const response = await fetch(`${walletOrigin(saved.baseUrl)}/oauth/revoke`, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: "o11-wallet-cli", token: saved.refreshToken }),
        });
        if (!response.ok) throw new Error("Could not end agent access. Try logout again when the wallet is available.");
      }
    }
    await rm(path(profile), { force: true });
  });
}
