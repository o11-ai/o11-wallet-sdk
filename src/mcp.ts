import { compiledCli } from './cli-update.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { cliVersionHeader } from './contracts/cli-version.js';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { parseCardAccessUrl } from './contracts/card-access.js';
import { readConfig, profileTokenProvider } from './config.js';
import { compactToolCallResult } from './cli-result-file.js';
import { z } from 'zod';
import { version } from '../package.json';

const cardsCheckSchema = z.object({ items: z.array(z.object({ id: z.uuid() })) });

/** Uses the CLI's credential store and refresh lock; never starts browser login. */
async function connectSavedMcp(profile?: string, signal?: AbortSignal) {
  const config = await readConfig(profile);
  const resource = parseCardAccessUrl(config.resource ?? `${config.baseUrl}/mcp`, config.baseUrl).resource;
  const tokens = profileTokenProvider(profile, config);
  const client = new Client({ name: 'o11-wallet-cli', version }, { versionNegotiation: { mode: 'legacy' } });
  // The transport invokes token() per request, including after CLI refreshes.
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { redirect: 'error', headers: { [cliVersionHeader]: version } },
    authProvider: { token: () => tokens.getAccessToken() },
  });
  try { await client.connect(transport, { signal }); }
  catch { await client.close(); throw new Error('MCP could not connect using saved access. Run doctor; no browser was opened.'); }
  return client;
}

export async function verifyMcpBridge(profile?: string, cardId?: string) {
  const client = new Client({ name: 'o11-wallet-setup', version }, { versionNegotiation: { mode: 'legacy' } });
  if (!compiledCli && !process.argv[1]) return { status: 'failed' as const, message: 'The CLI entry could not be located. Run setup through o11.' };
  const [command, ...entry] = compiledCli ? [process.execPath] : [process.execPath, process.argv[1]!];
  const transport = new StdioClientTransport({ command: command!,
    args: [...entry, ...(profile ? ['--profile', profile] : []), 'mcp'],
    env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    stderr: 'pipe',
  });
  const signal = AbortSignal.timeout(20000);
  try {
    await client.connect(transport, { signal });
    const listed = await client.listTools(undefined, { signal });
    if (!listed.tools.some(tool => tool.name === 'cards')) throw new Error('Cards tool is unavailable');
    const result = await client.callTool({ name: 'cards', arguments: cardId ? { cardId } : {} }, { signal });
    if (result.isError) throw new Error('Cards check failed');
    const structured = result.structuredContent;
    const text = result.content?.find(item => item.type === 'text');
    const payload: unknown = structured ?? (text?.type === 'text' ? JSON.parse(text.text) : undefined);
    const cards = cardsCheckSchema.parse(payload);
    if (!cards.items.length || cardId && !cards.items.some(card => card.id === cardId)) throw new Error('Selected card is unavailable');
    return { status: 'verified' as const };
  } catch {
    return { status: 'failed' as const, message: 'The saved MCP bridge could not read the selected card. Run doctor and retry setup --verify-mcp; no browser was opened.' };
  } finally { await client.close(); await transport.close(); }
}

export async function serveMcp(profile?: string) {
  const client = await connectSavedMcp(profile);
  const connection = serveStdio(() => {
    const server = new McpServer({ name: 'o11-wallet', version }, {
      capabilities: { tools: {} }, instructions: client.getInstructions(),
    });
    server.server.setRequestHandler('tools/list', async ({ params }) => {
      try { return await client.listTools(params); }
      catch { throw new Error('Wallet tools could not be listed. Run doctor; no browser was opened.'); }
    });
    server.server.setRequestHandler('tools/call', async ({ params }, context) => {
      try { return await compactToolCallResult(await client.callTool(params, { signal: context.mcpReq.signal }), params.name); }
      catch { throw new Error('Wallet request failed. Check saved access or the existing invocation before retrying.'); }
    });
    return server;
  });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await connection.close();
    await client.close();
  };
  process.stdin.once('end', () => void close());
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
}
