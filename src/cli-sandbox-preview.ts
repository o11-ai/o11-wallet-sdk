import { openLink } from './avatar-arguments.js';

type PreviewConnection = { baseUrl: string; token: string; cardId?: string };

/** `o11 sandbox preview NAME --port PORT [--open]`: a one-use browser link on the o11 server's preview host. */
export function sandboxPreviewArguments(values: string[]) {
  const words = values[0] === 'preview' ? values.slice(1) : [...values];
  let id: string | undefined, port: number | undefined, open = false, json = false, localhost = false;
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    if (word === '--open') open = true;
    else if (word === '--localhost') localhost = true;
    else if (word === '--json' || word === '-j') json = true;
    else if (word === '--port' || word.startsWith('--port=')) {
      const value = word === '--port' ? words[++index] : word.slice('--port='.length);
      port = Number(value);
    } else if (!word.startsWith('-') && !id) id = word;
    else throw new Error('Use o11 sandbox preview NAME --port PORT [--open]');
  }
  if (!id || id.length > 128 || port === undefined || !Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error('Use o11 sandbox preview NAME --port PORT [--open]');
  return { id, port, open, json, localhost };
}

export async function sandboxPreviewLink(options: PreviewConnection, values: string[]) {
  const { id, port, open, localhost } = sandboxPreviewArguments(values);
  if (!options.token.startsWith('o11_') || /[\r\n]/.test(options.token)) throw new Error('Connect to o11 to open a sandbox preview');
  const endpoint = new URL('/v1/sandbox-preview/ticket', options.baseUrl);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)))
    throw new Error('Use an HTTPS o11 origin');
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json', ...(options.cardId ? { 'x-o11-card-id': options.cardId } : {}) },
    body: JSON.stringify({ id, port, ...(localhost ? { localhost } : {}) }) });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const body = await response.json() as { message?: unknown }; if (typeof body.message === 'string') message = body.message; } catch { /* Keep the status. */ }
    throw new Error(`Could not open the preview: ${message}`);
  }
  const data = await response.json() as { url: string; expiresAt: string };
  const url = new URL(data.url);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/__o11/enter' || url.search || !/^#ticket=[A-Za-z0-9_-]{43}$/.test(url.hash))
    throw new Error('o11 returned an invalid preview link');
  return { url: url.href, port, expiresAt: data.expiresAt, singleUse: true, opened: open ? await openLink(url.href) : false };
}
