import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { productionWalletOrigin, walletOrigin } from "./access-tokens.js";
import { compiledCli } from "./cli-update.js";
import { credentialDirectory } from "./config.js";

/**
 * Install counts and usage telemetry. A random install ID (shared with install.sh and install.ps1), the o11 version, OS
 * and processor are sent once per version; sign-in links the ID to the account. Each command also records what ran
 * (cli-telemetry.ts): the command and subcommand, flag names (never their values), exit code, duration, the class of any
 * error with the wallet's status, error code and request IDs, how the CLI was signed in, and whether it ran in CI, a
 * terminal or a coding agent. Never arguments, tool inputs or results, files, keys or email addresses.
 * DO_NOT_TRACK=1 or O11_TELEMETRY=0 turns all of it off: no install ID header, no spool file, no events.
 */
export function installTrackingEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV === "test") return false;
  if (env.DO_NOT_TRACK && env.DO_NOT_TRACK !== "0") return false;
  return !["0", "false", "off"].includes((env.O11_TELEMETRY ?? "").toLowerCase());
}

export const telemetryRoot = () => process.env.O11_TOOLS_CONFIG_DIR ?? join(homedir(), ".config", "o11-wallet");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let cachedId: string | undefined;
async function readText(file: string) {
  return (await readFile(file, "utf8").catch(() => "")).trim();
}
/**
 * The installer may have written the ID already, so its download and this program's report share one install.
 * Read synchronously once per process (a 37-byte file), so the install report, request header and events share one ID
 * and no pending file read holds the process open after its command.
 */
export function installIdSync() {
  if (cachedId) return cachedId;
  const file = join(telemetryRoot(), "install-id");
  const saved = (() => { try { return readFileSync(file, "utf8").trim(); } catch { return ""; } })();
  if (uuid.test(saved)) return cachedId = saved.toLowerCase();
  const created = crypto.randomUUID();
  mkdirSync(telemetryRoot(), { recursive: true, mode: 0o700 });
  writeFileSync(file, created + "\n", { mode: 0o600 });
  return cachedId = created;
}
export async function installId() { return installIdSync(); }

/**
 * The setup code from a copied o11.ai prompt: O11_SETUP_CODE, or the one the installer saved. Attribution only, sent with
 * the install report and the sign-in link so the wallet can follow that copy to this account. Same rule as
 * @o11/tool-contracts/setup-code (not imported: the published CLI bundles a fixed list of contracts).
 */
async function setupCode() {
  const read = (value: string | undefined) => {
    const code = value?.trim().toLowerCase() ?? "";
    return /^[a-z2-7]{6}$/.test(code) ? code : undefined;
  };
  const fromEnv = read(process.env.O11_SETUP_CODE);
  if (fromEnv) return { code: fromEnv, saved: false };
  const fromFile = read(await readText(join(telemetryRoot(), "setup-code")));
  return fromFile ? { code: fromFile, saved: true } : undefined;
}
export function reportOrigin() {
  try { return walletOrigin(process.env.O11_TOOLS_URL || productionWalletOrigin); } catch { return undefined; }
}
const platform = () => ["darwin", "linux", "win32"].includes(process.platform) && ["arm64", "x64"].includes(process.arch)
  ? { os: process.platform, arch: process.arch } : undefined;

/** Reports this version once. Resolves within three seconds and never throws or prints. */
export async function reportInstall(version: string) {
  try {
    const target = platform(), origin = reportOrigin();
    if (!installTrackingEnabled() || !target || !origin) return;
    const versionFile = join(telemetryRoot(), "install-version"), previous = await readText(versionFile);
    if (previous === version) return;
    const [id, setup] = await Promise.all([installId(), setupCode()]);
    const response = await fetch(`${origin}/v1/cli/installs`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installId: id, version, ...(/^\d+\.\d+\.\d+$/.test(previous) ? { previousVersion: previous } : {}),
        ...target, standalone: compiledCli, ...(setup ? { setupCode: setup.code } : {}) }) });
    await response.body?.cancel();
    if (response.ok) await writeFile(versionFile, version + "\n", { mode: 0o600 });
  } catch { /* Install counts never affect a command. */ }
}

/**
 * After sign-in, joins this install's earlier events to the account. Never throws or prints. A reused login links only
 * when this profile has not linked this install before (the marker file), so it adds no request after the first.
 */
export async function linkInstall(baseUrl: string, apiKey: string, options: { profile?: string; reused?: boolean } = {}) {
  try {
    if (!installTrackingEnabled()) return;
    const [id, setup] = await Promise.all([installId(), setupCode()]);
    const marker = join(credentialDirectory(options.profile), "install-link");
    // A setup code still to send links again, even for an install linked before.
    if (options.reused && !setup) {
      // The marker holds the install ID once linked, or `ID attempt EPOCH_MS` while a link is unanswered. A reused login
      // retries an unanswered link at most once a day, so a failing endpoint slows at most one `o11 login` per day.
      const [linked, attempt, at] = (await readText(marker)).split(" ");
      if (linked === id && (!attempt || attempt === "attempt" && Date.now() - Number(at) < 86_400_000)) return;
      await writeFile(marker, `${id} attempt ${Date.now()}\n`, { mode: 0o600 });
    }
    const response = await fetch(`${walletOrigin(baseUrl)}/v1/cli/installs/link`, { method: "POST", redirect: "error",
      signal: AbortSignal.timeout(options.reused ? 1500 : 3000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ installId: id, ...(setup ? { setupCode: setup.code } : {}) }) });
    await response.body?.cancel();
    // A 4xx will not succeed on retry either; only a server failure leaves the link for a later sign-in.
    if (response.status < 500) {
      await writeFile(marker, id + "\n", { mode: 0o600 });
      // The installer's saved code has done its job once it reaches an account.
      if (setup?.saved) await rm(join(telemetryRoot(), "setup-code"), { force: true });
    }
  } catch { /* Install counts never affect sign-in. */ }
}
