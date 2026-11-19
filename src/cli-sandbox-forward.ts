import { createServer, type Socket } from 'node:net';
import { forwardRefusal } from './cli-sandbox-forward-refusal.js';

type Connection = { baseUrl: string; token: string; cardId?: string };
const usage = 'Use o11 sandbox forward NAME --remote PORT [--local PORT] [--bind ADDR]';

/** `o11 sandbox forward NAME --remote PORT [--local PORT] [--bind ADDR]`, Boat's flags. --port is an alias of --remote. */
export function sandboxForwardArguments(values: string[]) {
  const words = values[0] === 'forward' ? values.slice(1) : [...values];
  let id: string | undefined, remote: number | undefined, local: number | undefined, bind = '127.0.0.1';
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!, [flag, inline] = word.startsWith('--') && word.includes('=') ? [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)] : [word, undefined];
    const value = () => inline ?? words[++index];
    if (flag === '--reverse') throw new Error('o11 sandbox forward --reverse is not built yet. o11 forwards sandbox ports to your computer only.');
    if (flag === '--remote' || flag === '--port') remote = Number(value());
    else if (flag === '--local') local = Number(value());
    else if (flag === '--bind') bind = value() ?? '';
    else if (!flag.startsWith('-') && !id) id = flag;
    else throw new Error(usage);
  }
  const port = (value: number | undefined) => value !== undefined && Number.isInteger(value) && value >= 1 && value <= 65_535;
  if (!id || id.length > 128 || !port(remote) || local !== undefined && !port(local) || !bind || bind.length > 255) throw new Error(usage);
  return { id, remote: remote!, local: local ?? remote!, bind };
}

function endpoint(options: Connection, id: string, remote: number) {
  if (!options.token.startsWith('o11_') || /[\r\n]/.test(options.token)) throw new Error('Connect to o11 to forward a sandbox port');
  const url = new URL('/v1/sandbox-forward', options.baseUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Use an HTTPS o11 origin');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('id', id); url.searchParams.set('port', String(remote));
  return url;
}

/** One authenticated o11 socket per local TCP connection. Opens run one at a time: each holds the sandbox briefly while o11 admits it. */
export async function sandboxForward(options: Connection, values: string[], log: (line: string) => void = line => process.stderr.write(line + '\n')) {
  const { id, remote, local, bind } = sandboxForwardArguments(values);
  const url = endpoint(options, id, remote);
  const headers = { Authorization: `Bearer ${options.token}`, ...(options.cardId ? { 'x-o11-card-id': options.cardId } : {}) };
  const connect = WebSocket as unknown as new (target: URL, init: { headers: Record<string, string> }) => WebSocket;
  let opening = Promise.resolve(), count = 0, opened = 0;
  // Explain a refused upgrade once, not on every local connection.
  let explained: Promise<void> | undefined;
  const explain = (code: number) => explained ??= forwardRefusal(url, headers).then(reason =>
    log(reason ? `o11: the forward to port ${remote} was refused: ${reason}` : `o11: the forward to port ${remote} closed (code ${code})`));
  const open = (client: Socket, attempt = 0): Promise<void> => new Promise(done => {
    const socket = new connect(url, { headers }); socket.binaryType = 'arraybuffer';
    let ready = false, finished = false, retry = false, refused = false;
    const finish = () => { if (!finished) { finished = true; done(); } };
    socket.onmessage = event => {
      if (event.data instanceof ArrayBuffer) { client.write(Buffer.from(event.data)); return; }
      let frame: { type?: string; code?: string; message?: string } = {};
      try { frame = JSON.parse(String(event.data)); } catch { socket.close(); return; }
      if (frame.type === 'ready') {
        ready = true; opened++; finish();
        client.on('data', data => { socket.send(data); if (socket.bufferedAmount > 1024 * 1024) { client.pause(); const wait = setInterval(() => { if (socket.bufferedAmount < 256 * 1024) { clearInterval(wait); client.resume(); } }, 20); } });
        client.on('end', () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'eof' })); });
        client.resume();
      } else if (frame.type === 'eof') client.end();
      else if (frame.type === 'error') {
        retry = frame.code === 'CONFLICT' && attempt < 3 && !/listening/.test(frame.message ?? '');
        refused = true;
        if (!retry) log(`o11: ${frame.message ?? 'The forward failed'}`);
      }
    };
    socket.onclose = event => {
      finish();
      if (retry && !client.destroyed) { setTimeout(() => { opening = opening.then(() => open(client, attempt + 1)); }, 500 * (attempt + 1)); return; }
      // 1002 and 1006 before any frame: o11 refused the upgrade itself (auth, ownership, or no route on this server).
      if (!ready && !refused && [1002, 1006].includes(event.code)) void explain(event.code).finally(() => client.destroy());
      else {
        if (!ready && event.code !== 1000 && !client.destroyed) log(`o11: the forward to port ${remote} closed (code ${event.code})`);
        client.destroy();
      }
    };
    socket.onerror = () => finish();
    client.on('close', () => { if (socket.readyState <= WebSocket.OPEN) socket.close(); });
    client.on('error', () => socket.close());
  });
  const clients = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true, pauseOnConnect: true }, client => {
    count++; clients.add(client); client.on('close', () => clients.delete(client));
    opening = opening.then(() => open(client));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => reject(error.code === 'EADDRINUSE'
      ? new Error(`Port ${local} on ${bind} is already in use on this computer. Pick a free one with --local PORT.`)
      : error));
    server.listen(local, bind, () => resolve());
  });
  const address = server.address();
  const shown = typeof address === 'object' && address ? `${address.address}:${address.port}` : `${bind}:${local}`;
  log(`Forwarding ${shown} to port ${remote} in ${id}. Press Ctrl+C to stop.`);
  // opened counts connections that reached the sandbox port; connections without any opened means every one was refused.
  return new Promise<{ forwarded: true; local: string; remote: number; connections: number; opened: number }>(resolve => {
    const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); server.close(); for (const client of clients) client.destroy(); resolve({ forwarded: true, local: shown, remote, connections: count, opened }); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  });
}
