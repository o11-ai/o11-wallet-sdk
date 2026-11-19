import type { SandboxInput } from './contracts/sandboxes.js';

/** Terminal, browser terminal and private preview links for o11 sandbox (cli.ts). */
type TerminalConnection = { baseUrl: string; token: string; cardId?: string };
function sandboxTerminalEndpoint(options: TerminalConnection, path: string, id: string) {
  if (!options.token.startsWith("o11_") || /[\r\n]/.test(options.token)) throw new Error("Connect to o11 to open a sandbox terminal");
  const endpoint = new URL(path, options.baseUrl);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)))
    throw new Error("Use an HTTPS o11 origin");
  if (endpoint.username || endpoint.password || !id || id.length > 128) throw new Error("Supply an o11 sandbox name or ID");
  return endpoint;
}

/** Vercel connect options (--workdir, --env, --sudo) as the terminal start message and the browser ticket take them. */
export function terminalStartOptions(start: { workdir?: unknown; env?: unknown; sudo?: unknown }) {
  if (start.workdir !== undefined && (typeof start.workdir !== "string" || !start.workdir.startsWith("/"))) throw new Error("Use --workdir /ABSOLUTE/PATH");
  return { ...(start.workdir === undefined ? {} : { cwd: start.workdir }), ...(start.env === undefined ? {} : { env: start.env }),
    ...(start.sudo === true ? { sudo: true } : {}) };
}

export async function sandboxBrowserTerminal(options: TerminalConnection, id: string, start: { workdir?: unknown; env?: unknown; sudo?: unknown } = {}) {
  const startOptions = terminalStartOptions(start);
  const endpoint = sandboxTerminalEndpoint(options, "/v1/sandbox-terminal/ticket", id);
  const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json",
      ...(options.cardId ? { "x-o11-card-id": options.cardId } : {}) }, body: JSON.stringify({ id, ...(Object.keys(startOptions).length ? { options: startOptions } : {}) }) });
  if (!response.ok) {
    const reason = await response.json().then(body => typeof body?.message === "string" ? body.message : undefined, () => undefined);
    throw new Error(`Could not open an o11 browser terminal (HTTP ${response.status})${reason ? `: ${reason}` : ""}`);
  }
  const data = await response.json() as { url: string; expiresAt: string };
  const url = new URL(data.url);
  if (url.origin !== endpoint.origin || url.pathname !== "/sandbox/terminal" || url.search || !/^#ticket=[A-Za-z0-9_-]{43}$/.test(url.hash))
    throw new Error("o11 returned an invalid terminal link");
  return { url: url.href, expiresAt: data.expiresAt, requiresSameBrowserAccount: true };
}

export async function sandboxPrivatePreview(options: TerminalConnection, input: SandboxInput) {
  const { port, path = "/", provision, localhost = true, title } = input.params;
  if (!input.id || typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("Use o11 sandbox private-preview NAME --port PORT");
  const setting = provision === true;
  const allowed = setting ? ["port", "provision", "localhost", "title"] : ["port", "path"];
  if (input.connectionId || input.provider || Object.keys(input.params).some(key => !allowed.includes(key)) ||
    typeof localhost !== "boolean" || title !== undefined && typeof title !== "string")
    throw new Error("Use --path to read a preview or --provision to configure a Boat port");
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > 4096 || /[\\#\r\n]/.test(path))
    throw new Error("Use an absolute guest path such as /index.html");
  const root = `/v1/sandbox-relay/${encodeURIComponent(input.id)}/private-preview/${port}/`;
  const endpoint = sandboxTerminalEndpoint(options, root + (setting ? "" : path.slice(1)), input.id);
  if (!endpoint.pathname.startsWith(root)) throw new Error("The path must stay inside the private preview");
  const headers = { Authorization: `Bearer ${options.token}`, ...(options.cardId ? { "x-o11-card-id": options.cardId } : {}),
    ...(input.requestId ? { "x-o11-request-id": input.requestId } : {}) };
  const response = await fetch(endpoint, { method: setting ? "POST" : "GET", headers: setting ? { ...headers, "Content-Type": "application/json" } : headers,
    redirect: "error", signal: AbortSignal.timeout(35_000), ...(setting ? { body: JSON.stringify({ localhost, title }) } : {}) });
  if (!response.ok) {
    const requestId = response.headers.get("x-o11-request-id");
    throw new Error(`${await relayErrorMessage(response) ?? `Private preview returned HTTP ${response.status}`}${requestId ? ` (o11 request ${requestId})` : ""}`);
  }
  if (setting) return response.json();
  process.stdout.write(Buffer.from(await response.arrayBuffer()));
}

/** o11's own refusal ({ error, message } JSON, such as "E2B doesn't support private preview ..."); a guest app's error page is not read. */
export async function relayErrorMessage(response: Response) {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) { await response.body?.cancel(); return undefined; }
  const body: unknown = await response.json().catch(() => undefined);
  const message = body && typeof body === "object" && "error" in body && "message" in body ? body.message : undefined;
  return typeof message === "string" && message.length ? message.slice(0, 500) : undefined;
}

/** The local CLI streams terminal bytes only to the authenticated o11 origin. */
export async function sandboxTerminal(options: TerminalConnection, id: string, start: { workdir?: unknown; env?: unknown; sudo?: unknown; pid?: unknown; keep?: unknown } = {}) {
  if (start.pid !== undefined && (typeof start.pid !== "number" || !Number.isInteger(start.pid) || start.pid < 1)) throw new Error("Use --pid PID from an earlier terminal --keep");
  const startOptions = { ...terminalStartOptions(start), ...(typeof start.pid === "number" ? { pid: start.pid } : {}), ...(start.keep === true ? { keep: true } : {}) };
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Open the sandbox terminal from an interactive terminal");
  const endpoint = sandboxTerminalEndpoint(options, "/v1/sandbox-terminal", id);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("id", id);
  const connect = WebSocket as unknown as new (url: URL, options: { headers: Record<string, string> }) => WebSocket;
  const socket = new connect(endpoint, { headers: { Authorization: `Bearer ${options.token}`, ...(options.cardId ? { "x-o11-card-id": options.cardId } : {}) } });
  socket.binaryType = "arraybuffer";
  function dimensions(type: "start" | "resize") {
    return JSON.stringify({ type, cols: Math.min(500, process.stdout.columns || 80), rows: Math.min(200, process.stdout.rows || 24), ...(type === "start" ? startOptions : {}) });
  }
  const resize = () => { if (socket.readyState === WebSocket.OPEN) socket.send(dimensions("resize")); };
  const input = (data: Buffer) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 128 * 1024) { socket.close(1000); return; }
    for (let offset = 0; offset < data.length; offset += 64 * 1024) socket.send(Uint8Array.from(data.subarray(offset, offset + 64 * 1024)));
  };
  const previousMode = process.stdin.isRaw;
  let ready = false, exitCode: number | undefined, serverError: string | undefined;
  try {
    return await new Promise<number>((resolve, reject) => {
      socket.onopen = () => socket.send(dimensions("start"));
      socket.onmessage = event => {
        if (event.data instanceof ArrayBuffer) { process.stdout.write(Buffer.from(event.data)); return; }
        if (typeof event.data !== "string") return;
        try {
          const data: unknown = JSON.parse(event.data);
          if (!data || typeof data !== "object") return;
          if (Reflect.get(data, "type") === "ready" && !ready) {
            ready = true;
            const pid = Reflect.get(data, "pid");
            if (typeof pid === "number" && (start.keep === true || start.pid !== undefined))
              process.stderr.write(`Shell pid ${pid} keeps running after you disconnect. Reattach: o11 sandbox terminal ${id} --pid ${pid}\r\n`);
            process.stdin.setRawMode(true);
            process.stdin.on("data", input);
            process.stdout.on("resize", resize);
            process.stdin.resume();
          } else if (Reflect.get(data, "type") === "exit") {
            const status = Reflect.get(data, "exitCode");
            if (typeof status === "number" && Number.isInteger(status) && status >= 0 && status <= 255) exitCode = status;
          } else if (Reflect.get(data, "type") === "error") {
            // The server sends why it refused or ended the terminal, then closes; report it once the socket closes.
            const message = Reflect.get(data, "message");
            if (typeof message === "string" && message) serverError = message.slice(0, 500);
          }
        } catch { socket.close(1000); }
      };
      socket.onerror = () => reject(new Error("The o11 sandbox terminal connection failed"));
      // Rejecting lets the finally block restore the terminal mode before the CLI prints the message and exits 1.
      socket.onclose = event => {
        if (exitCode === undefined && serverError) reject(new Error(serverError));
        else resolve(exitCode ?? (ready && event.code === 1000 ? 0 : 1));
      };
    });
  } finally {
    socket.close();
    process.stdout.off("resize", resize);
    process.stdin.off("data", input);
    process.stdin.setRawMode(previousMode);
    process.stdin.pause();
  }
}
