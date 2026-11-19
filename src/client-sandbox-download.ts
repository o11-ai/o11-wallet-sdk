import { z } from "zod";
import type { AccessTokenProvider } from "./token-provider.js";

type RelayConnection = { baseUrl: URL; runId: string; apiKey?: string; cardId?: string; fetch?: typeof fetch; tokenProvider?: AccessTokenProvider };

/** Streams a sandbox file only from the authenticated o11 relay; supplier URLs never reach the client. Retries once after a token refresh. */
export async function sandboxRelayDownload(connection: RelayConnection, id: string, path: string, signal: AbortSignal = AbortSignal.timeout(300_000)) {
  const url = new URL(`/v1/sandbox-relay/${encodeURIComponent(z.string().min(1).max(128).parse(id))}/download/`, connection.baseUrl);
  url.searchParams.set('path', z.string().min(1).max(4096).parse(path));
  let token = connection.tokenProvider ? await connection.tokenProvider.getAccessToken() : connection.apiKey!;
  const send = () => (connection.fetch ?? fetch)(url, { redirect: 'error', signal, headers: {
    Authorization: `Bearer ${token}`, 'x-o11-run-id': connection.runId,
    ...(connection.cardId ? { 'x-o11-card-id': connection.cardId } : {}),
  } });
  if (!token || /[\r\n]/.test(token)) throw new Error('Invalid wallet access token');
  let response = await send();
  if (response.status === 401 && connection.tokenProvider?.refreshAccessToken) {
    await response.body?.cancel(); token = await connection.tokenProvider.refreshAccessToken(token);
    if (!token || /[\r\n]/.test(token)) throw new Error('Invalid wallet access token');
    response = await send();
  }
  return response;
}
