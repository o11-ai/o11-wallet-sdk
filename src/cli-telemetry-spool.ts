import { appendFileSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cliVersionHeader } from "./contracts/cli-version.js";
import { telemetryRoot } from "./cli-install.js";
import { installIdHeader } from "./cli-telemetry-context.js";
import type { SpooledEvent } from "./cli-telemetry-events.js";

/**
 * A small local file of telemetry events. A command appends its events when they happen or at exit; a later command
 * claims the file and hands it to a detached background process that posts it to /v1/cli/events and exits.
 * No command waits on delivery: an in-flight request, even an aborted fetch, holds a Bun process open for about 8 ms
 * at exit (measured), while handing off costs one rename and one spawn (about 1 ms). A wallet answer or a failure
 * ends the claim; failed events are dropped.
 */
const limits = { fileBytes: 128 * 1024, eventBytes: 2048, batch: 50, ageMs: 7 * 24 * 3600_000, timeoutMs: 3000,
  /** Post when the spool has this much, or when the last post was this long ago, so busy agents spawn rarely. */
  flushBytes: 16 * 1024, flushEveryMs: 30_000 };
const spoolFile = () => join(telemetryRoot(), "telemetry.jsonl");
const lastFlushFile = () => join(telemetryRoot(), "telemetry.last-post");

/** Appends events synchronously, so it works inside an exit handler. Over the size limit, new events are dropped. */
export function appendSpoolSync(events: SpooledEvent[]) {
  try {
    const lines = events.map(event => JSON.stringify(event)).filter(line => line.length <= limits.eventBytes);
    if (!lines.length) return;
    mkdirSync(telemetryRoot(), { recursive: true, mode: 0o700 });
    const size = (() => { try { return statSync(spoolFile()).size; } catch { return 0; } })();
    const text = lines.join("\n") + "\n";
    if (size + text.length > limits.fileBytes) return;
    appendFileSync(spoolFile(), text, { mode: 0o600 });
  } catch { /* Telemetry never affects a command. */ }
}

/** The background sender. Reads only the claimed file named in its environment; never the CLI's credentials. */
const sender = `
const fs = require("node:fs");
const { O11_TELEMETRY_CLAIM: file, O11_TELEMETRY_ORIGIN: origin, O11_TELEMETRY_INSTALL: id, O11_TELEMETRY_VERSION: version } = process.env;
let lines = [];
try { lines = fs.readFileSync(file, "utf8").split("\\n").filter(Boolean); } catch {}
try { fs.rmSync(file, { force: true }); } catch {}
const now = Date.now();
// Claims left by a sender that died are swept after an hour.
try { for (const name of fs.readdirSync(process.cwd())) if (/^telemetry\.jsonl\..+\.sending$/.test(name)) {
  const path = process.cwd() + "/" + name; if (now - fs.statSync(path).mtimeMs > 3600000) fs.rmSync(path, { force: true }); } } catch {}
// Each event goes to the wallet its command used (an https origin, or http on localhost), without the origin field.
const byOrigin = new Map();
for (const line of lines) {
  try {
    const event = JSON.parse(line), age = now - Date.parse(event.timestamp);
    if (!(age >= -300000 && age <= ${limits.ageMs})) continue;
    let target = origin;
    if (typeof event.origin === "string") {
      const url = new URL(event.origin);
      if (url.origin === event.origin && (url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) target = url.origin;
    }
    delete event.origin;
    if (!byOrigin.has(target)) byOrigin.set(target, []);
    byOrigin.get(target).push(JSON.stringify(event));
  } catch {}
}
for (const [target, events] of byOrigin) {
  for (let index = 0; index < events.length; index += ${limits.batch}) {
    try {
      const response = await fetch(target + "/v1/cli/events", { method: "POST", redirect: "error", signal: AbortSignal.timeout(${limits.timeoutMs}),
        headers: { "Content-Type": "application/json", "${cliVersionHeader}": version, "${installIdHeader}": id },
        body: '{"installId":' + JSON.stringify(id) + ',"events":[' + events.slice(index, index + ${limits.batch}).join(",") + "]}" });
      await response.body?.cancel();
    } catch { break; }
  }
}
`;

export type FlushOptions = { origin: () => string | undefined; installId: string; version: string; now?: number };

/** Only what networking needs (proxies, certificates, system paths); never keys or other secrets. */
const networkVariables = ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "HTTPS_PROXY", "https_proxy",
  "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"];
const passThrough = () => Object.fromEntries(networkVariables.flatMap(name => process.env[name] ? [[name, process.env[name]!]] : []));
function spawnSender(claim: string, env: Record<string, string>) {
  // A standalone o11 program runs its embedded Bun with BUN_BE_BUN=1; under Bun this changes nothing.
  // Runs in the o11 config folder, so a project's bunfig.toml in the current folder is never loaded.
  Bun.spawn([process.execPath, "-e", sender], { cwd: telemetryRoot(), stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true, windowsHide: true,
    // O11_TELEMETRY=0: if the program ever ran as the CLI instead, that run would record and send nothing.
    env: { ...passThrough(), ...env, BUN_BE_BUN: "1", O11_TELEMETRY: "0", O11_TELEMETRY_CLAIM: claim } }).unref();
}

/**
 * Claims the spool by renaming it, so parallel commands never send the same events twice, and starts the sender.
 * Only when the spool is large enough or the last post is old enough. Synchronous and never throws.
 */
export function flushSpoolInBackground(options: FlushOptions) {
  try {
    const now = options.now ?? Date.now();
    const size = statSync(spoolFile()).size;
    const last = (() => { try { return statSync(lastFlushFile()).mtimeMs; } catch { return 0; } })();
    if (size < limits.flushBytes && now - last < limits.flushEveryMs) return false;
    const origin = options.origin();
    if (!origin) return false;
    const claim = `${spoolFile()}.${crypto.randomUUID()}.sending`;
    renameSync(spoolFile(), claim);
    writeFileSync(lastFlushFile(), "", { mode: 0o600 });
    spawnSender(claim, { O11_TELEMETRY_ORIGIN: origin, O11_TELEMETRY_INSTALL: options.installId,
      O11_TELEMETRY_VERSION: options.version });
    return true;
  } catch { return false; }
}
