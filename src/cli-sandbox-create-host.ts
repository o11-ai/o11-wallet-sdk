import { defaultSandboxProvider, type SandboxInput, type SandboxResult } from './contracts/sandboxes.js';

type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
type HostedPort = { port: number; public: boolean };

/**
 * create --host PORT[:public] on Boat: o11 only hosts ports through its owner-checked host command, so the CLI takes the
 * ports off the create request and hosts each one once the sandbox exists. Throws before create on other providers.
 */
export function takeCreateHostPorts(input: SandboxInput): HostedPort[] {
  const ports = input.params.hostedPorts;
  if (ports === undefined || !['create', 'get-or-create'].includes(input.action)) return [];
  if ((input.provider ?? defaultSandboxProvider) !== 'boat')
    throw new Error('--host is a Boat create option. On E2B run o11 sandbox host NAME --port PORT after create; on Vercel pass --ports [3000] to create.');
  delete input.params.hostedPorts;
  if (!Array.isArray(ports)) return [];
  return ports.flatMap(entry => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.port === 'number'
    ? [{ port: entry.port, public: entry.public === true }] : []);
}

/** Hosts each port on the new sandbox. A failed port is reported; the sandbox is kept either way. */
export async function hostCreatedPorts(client: SandboxClient, created: SandboxResult, ports: HostedPort[]) {
  const id = created.sandbox?.id;
  if (!ports.length || !id || created.status === 'failed') return { hosted: [], failed: false };
  const hosted: unknown[] = [];
  let failed = false;
  for (const port of ports) {
    try {
      const answer = await client.sandbox({ action: 'host', id, params: { port: port.port, ...(port.public ? { public: true } : {}) } });
      hosted.push(answer.data ?? { port: port.port, status: answer.status });
    } catch (error) {
      failed = true;
      hosted.push({ port: port.port, error: error instanceof Error ? error.message : 'Hosting failed', retry: `o11 sandbox host ${id} --port ${port.port}${port.public ? ' --public' : ''}` });
    }
  }
  return { hosted, failed };
}
