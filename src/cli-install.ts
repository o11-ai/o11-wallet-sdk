import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { productionWalletOrigin, walletOrigin } from "./access-tokens.js";
import { compiledCli } from "./cli-update.js";

/**
 * Anonymous install counts. A random install ID (shared with install.sh and install.ps1), the o11 version, OS and
 * processor are sent once per version; sign-in links the ID to the account. Nothing about commands, tools or files.
 * DO_NOT_TRACK=1 or O11_TELEMETRY=0 turns it off.
 */
export function installTrackingEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV === "test") return false;
  if (env.DO_NOT_TRACK && env.DO_NOT_TRACK !== "0") return false;
  return !["0", "false", "off"].includes((env.O11_TELEMETRY ?? "").toLowerCase());
}

const root = () => process.env.O11_TOOLS_CONFIG_DIR ?? join(homedir(), ".config", "o11-wallet");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function readText(file: string) {
  return (await readFile(file, "utf8").catch(() => "")).trim();
}
/** The installer may have written the ID already, so its download and this program's report share one install. */
async function installId() {
  const file = join(root(), "install-id"), saved = await readText(file);
  if (uuid.test(saved)) return saved.toLowerCase();
  const created = crypto.randomUUID();
  await mkdir(root(), { recursive: true, mode: 0o700 });
  await writeFile(file, created + "\n", { mode: 0o600 });
  return created;
}
function reportOrigin() {
  try { return walletOrigin(process.env.O11_TOOLS_URL || productionWalletOrigin); } catch { return undefined; }
}
const platform = () => ["darwin", "linux", "win32"].includes(process.platform) && ["arm64", "x64"].includes(process.arch)
  ? { os: process.platform, arch: process.arch } : undefined;

/** Reports this version once. Resolves within three seconds and never throws or prints. */
export async function reportInstall(version: string) {
  try {
    const target = platform(), origin = reportOrigin();
    if (!installTrackingEnabled() || !target || !origin) return;
    const versionFile = join(root(), "install-version"), previous = await readText(versionFile);
    if (previous === version) return;
    const id = await installId();
    const response = await fetch(`${origin}/v1/cli/installs`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installId: id, version, ...(/^\d+\.\d+\.\d+$/.test(previous) ? { previousVersion: previous } : {}),
        ...target, standalone: compiledCli }) });
    await response.body?.cancel();
    if (response.ok) await writeFile(versionFile, version + "\n", { mode: 0o600 });
  } catch { /* Install counts never affect a command. */ }
}

/** After sign-in, joins this install's earlier events to the account. Never throws or prints. */
export async function linkInstall(baseUrl: string, apiKey: string) {
  try {
    if (!installTrackingEnabled()) return;
    const id = await installId();
    const response = await fetch(`${walletOrigin(baseUrl)}/v1/cli/installs/link`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ installId: id }) });
    await response.body?.cancel();
  } catch { /* Install counts never affect sign-in. */ }
}
