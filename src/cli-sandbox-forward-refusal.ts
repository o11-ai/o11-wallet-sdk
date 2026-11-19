import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * A WebSocket client sees a refused upgrade only as close code 1002 or 1006. This repeats the upgrade request once
 * over plain HTTP to read why o11 refused it: the JSON message, or a page that means the server has no forward route.
 */
export function forwardRefusal(target: URL, headers: Record<string, string>, timeoutMs = 10_000): Promise<string | undefined> {
  const url = new URL(target); url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise(resolve => {
    const request = send(url, { method: 'GET', timeout: timeoutMs, headers: { ...headers, Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64') } });
    request.on('upgrade', (_response, socket) => { socket.destroy(); resolve(undefined); });
    request.on('timeout', () => { request.destroy(); resolve(undefined); });
    request.on('error', () => resolve(undefined));
    request.on('response', response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= 8192) chunks.push(chunk); });
      response.on('end', () => {
        const status = response.statusCode ?? 0, text = Buffer.concat(chunks).toString('utf8');
        let message: unknown;
        try { message = (JSON.parse(text) as { message?: unknown }).message; } catch { /* Not JSON. */ }
        if (typeof message === 'string' && message) resolve(`${message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 300)} (HTTP ${status})`);
        else resolve(`${url.origin} doesn't serve sandbox forwards at ${url.pathname} (HTTP ${status} instead of a WebSocket upgrade). The server needs a newer o11 or a proxy route for that path.`);
      });
      response.on('error', () => resolve(undefined));
    });
    request.end();
  });
}
