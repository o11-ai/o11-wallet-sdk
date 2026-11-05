import { z } from 'zod';

const startSchema = z.union([
  z.object({ sent: z.literal(true), email_hint: z.string(), expires_in: z.number().positive(), resend_after: z.number().nonnegative() }),
  z.object({ sent: z.literal(false), browser_required: z.literal(true), provider: z.literal('google'), verification_uri_complete: z.url() }),
]);
const handoffSchema = z.object({ verified: z.literal(true), request_id: z.string().min(1), handoff_token: z.string().min(1),
  handoff_url: z.url(), expires_in: z.number().positive().max(60) });
export type EmailHandoff = z.infer<typeof handoffSchema>;
export type EmailDevice = { origin: string; deviceCode: string; resource: string; requestId: string; signal: AbortSignal };

export class EmailLoginError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code === 'invalid_otp' ? 'That code did not match. Try the code in your email again.'
      : status === 429 ? 'Email sign-in is rate limited. Wait before trying again, or use login --auth browser.'
      : `Email sign-in failed (HTTP ${status}). Run login --auth browser to continue in your browser.`);
  }
}

async function post(device: EmailDevice, path: string, input: Record<string, string>) {
  const response = await fetch(`${device.origin}${path}`, { method: 'POST', redirect: 'error',
    signal: AbortSignal.any([device.signal, AbortSignal.timeout(20000)]), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'o11-wallet-cli', device_code: device.deviceCode, resource: device.resource, ...input }) });
  if (!response.ok) {
    const body = z.object({ error: z.string() }).safeParse(await response.json().catch(() => null));
    throw new EmailLoginError(response.status, body.success ? body.data.error : 'unavailable');
  }
  return response.json();
}
export async function startEmailLogin(device: EmailDevice, email: string) {
  return startSchema.parse(await post(device, '/oauth/device/email/start', { email: z.email().parse(email) }));
}
export async function verifyEmailLogin(device: EmailDevice, email: string, otp: string) {
  if (!/^[0-9]{6}$/.test(otp)) throw new Error('Enter the six-digit code from your email.');
  const handoff = handoffSchema.parse(await post(device, '/oauth/device/email/verify', { email, otp }));
  const url = new URL(handoff.handoff_url);
  if (url.origin !== device.origin || url.pathname !== '/oauth/device/browser' || url.search || url.hash || handoff.request_id !== device.requestId)
    throw new Error('The wallet returned an unexpected browser handoff. Run login --auth browser.');
  return handoff;
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
/** The secret travels in a POST body, never in a browser address or CLI output. */
export function createEmailHandoff(handoff: EmailHandoff) {
  const path = `/${crypto.randomUUID()}`;
  const nonce = crypto.randomUUID();
  let served = false;
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.host !== server.url.host || url.pathname !== path || served)
      return new Response('This sign-in link is unavailable. Return to your terminal.', { status: 404 });
    served = true;
    return new Response(`<!doctype html><meta charset="utf-8"><title>Continue to o11</title><form method="post" action="${escapeHtml(handoff.handoff_url)}"><input type="hidden" name="handoff_token" value="${escapeHtml(handoff.handoff_token)}"><input type="hidden" name="request_id" value="${escapeHtml(handoff.request_id)}"><button type="submit">Continue to o11</button></form><script nonce="${nonce}">document.forms[0].submit()</script>`, {
      // Preserve the loopback Origin for CSRF checks without sending the nonce path.
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'origin',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; form-action ${handoff.handoff_url}; base-uri 'none'; frame-ancestors 'none'`,
        'X-Content-Type-Options': 'nosniff' },
    });
  } });
  const timer = setTimeout(() => server.stop(true), handoff.expires_in * 1000);
  timer.unref();
  return { url: new URL(path, server.url).href, close() { clearTimeout(timer); server.stop(true); } };
}
