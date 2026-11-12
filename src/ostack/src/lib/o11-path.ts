/** Where a wallet install puts its stable `o11` launcher; the installer leaves PATH unchanged. */
export const WALLET_LAUNCHER_DIR = "~/.local/share/o11-wallet/bin";

/** The `o11` on PATH when it is the o11 wallet CLI, since another program can own that name. Null otherwise. */
export function walletOnPath(): { path: string | null; wallet: boolean } {
  const path = Bun.which("o11");
  if (!path) return { path: null, wallet: false };
  try {
    const result = Bun.spawnSync([path, "--version"], { stdout: "pipe", stderr: "pipe", timeout: 10_000 });
    const parsed: unknown = JSON.parse(result.stdout.toString());
    const wallet = typeof parsed === "object" && parsed !== null && "product" in parsed && parsed.product === "wallet";
    return { path, wallet };
  } catch {
    return { path, wallet: false };
  }
}
