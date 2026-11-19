import { forwardRefusal } from './cli-sandbox-forward-refusal.js';

type Connection = { baseUrl: string; token: string; cardId?: string };
type Streams = { input: NodeJS.ReadableStream; output: NodeJS.WritableStream; log(line: string): void };
export type ProxyOutcome = { code: number; notListening?: boolean };

export function sandboxForwardUrl(options: Connection, id: string, port: number) {
  if (!options.token.startsWith('o11_') || /[\r\n]/.test(options.token)) throw new Error('Connect to o11 to reach the sandbox over SSH');
  const url = new URL('/v1/sandbox-forward', options.baseUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Use an HTTPS o11 origin');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('id', id); url.searchParams.set('port', String(port));
  return url;
}

/**
 * ssh's ProxyCommand: stdin and stdout become one TCP connection to 127.0.0.1:22 in the sandbox, through o11's
 * authenticated forward (the same route as `o11 sandbox forward`). stdout carries only tunnel bytes; messages go to stderr.
 * Input that arrives before o11 confirms the connection is held, then sent in order. When nothing answers on port 22
 * (a resumed sandbox whose sshd stopped), repair runs once and the connection is tried again.
 */
export function sandboxSshProxy(options: Connection, id: string, streams: Streams, repair?: () => Promise<void>, port = 22): Promise<ProxyOutcome> {
  const url = sandboxForwardUrl(options, id, port);
  const headers = { Authorization: `Bearer ${options.token}`, ...(options.cardId ? { 'x-o11-card-id': options.cardId } : {}) };
  const connect = WebSocket as unknown as new (target: URL, init: { headers: Record<string, string> }) => WebSocket;
  const held: Buffer[] = [];
  let socket: WebSocket | undefined, ready = false, inputEnded = false;
  streams.input.on('data', (chunk: Buffer) => {
    if (ready && socket?.readyState === WebSocket.OPEN) send(chunk); else held.push(Buffer.from(chunk));
  });
  streams.input.on('end', () => { inputEnded = true; if (ready && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'eof' })); });
  const send = (chunk: Buffer) => {
    socket!.send(new Uint8Array(chunk));
    if (socket!.bufferedAmount > 512 * 1024) {
      streams.input.pause();
      const wait = setInterval(() => { if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount < 128 * 1024) { clearInterval(wait); streams.input.resume(); } }, 10);
    }
  };
  return new Promise(resolve => {
    const open = (attempt: number) => {
      const current = new connect(url, { headers }); socket = current; current.binaryType = 'arraybuffer';
      let refused = false, retry = false, notListening = false;
      current.onmessage = event => {
        if (event.data instanceof ArrayBuffer) { streams.output.write(Buffer.from(event.data)); return; }
        let frame: { type?: string; code?: string; message?: string } = {};
        try { frame = JSON.parse(String(event.data)); } catch { current.close(); return; }
        if (frame.type === 'ready') {
          ready = true;
          for (const chunk of held.splice(0)) send(chunk);
          if (inputEnded) current.send(JSON.stringify({ type: 'eof' }));
        } else if (frame.type === 'eof') streams.output.end();
        else if (frame.type === 'error') {
          refused = true;
          notListening = frame.code === 'NOT_FOUND' && /listening/i.test(frame.message ?? '') || frame.code === 'CONFLICT' && /listening/i.test(frame.message ?? '');
          retry = frame.code === 'CONFLICT' && !notListening && attempt < 4;
          if (!retry && !notListening) streams.log(`o11: ${frame.message ?? 'the SSH connection failed'}`);
        }
      };
      current.onclose = event => {
        if (retry) { setTimeout(() => open(attempt + 1), 400 * (attempt + 1)); return; }
        if (ready) { resolve({ code: 0 }); return; }
        if (notListening && repair) {
          const fix = repair; repair = undefined;
          void fix().then(() => open(attempt + 1), (error: unknown) => { streams.log(`o11: ${error instanceof Error ? error.message : 'SSH setup failed'}`); resolve({ code: 1, notListening: true }); });
          return;
        }
        if (notListening) { streams.log('o11: nothing answers SSH on port 22 in the sandbox. Run o11 sandbox ssh-config NAME to set it up again.'); resolve({ code: 1, notListening: true }); return; }
        if (!refused && [1002, 1006].includes(event.code))
          void forwardRefusal(url, headers).then(reason => { streams.log(`o11: the SSH connection was refused${reason ? `: ${reason}` : ` (code ${event.code})`}`); resolve({ code: 1 }); });
        else { if (!refused) streams.log(`o11: the SSH connection closed (code ${event.code})`); resolve({ code: 1 }); }
      };
      current.onerror = () => undefined;
    };
    open(0);
  });
}
