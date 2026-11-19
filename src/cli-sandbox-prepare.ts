import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';

/**
 * `o11 sandbox create` and `get-or-create` prepare each sandbox (sandbox-prepare.ts) unless --no-prepare is given.
 * A prepared E2B sandbox starts from E2B's desktop template when no template or source is named, so it has a
 * desktop and Chrome like a Boat sandbox; --template base (or --no-prepare) keeps the bare image.
 */
type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
const notRunning = new Set(['stopped', 'failed', 'deleted', 'paused', 'archived']);

export function prepareArguments(args: string[]) {
  const end = args.includes('--') ? args.indexOf('--') : args.length;
  const own = args.slice(0, end);
  return {
    prepare: !own.includes('--no-prepare'),
    args: [...own.filter(word => word !== '--no-prepare' && word !== '--prepare'), ...args.slice(end)],
    defaults(input: SandboxInput) {
      // A connection without --provider may be another provider's account; only an explicit or default E2B create changes.
      const e2b = input.provider === 'e2b' || !input.provider && !input.connectionId;
      if (e2b && input.params.template === undefined && input.params.from === undefined) input.params.template = 'desktop';
    },
  };
}

/** Prepares the sandbox a create just returned, when it is up and the caller waited for it. */
export async function prepareCreated(client: SandboxClient, input: SandboxInput, output: SandboxResult, origin: string) {
  const sandbox = output.sandbox;
  if (!sandbox || output.status === 'failed' || input.params.detached === true || input.params.allowInternetAccess === false || notRunning.has(sandbox.state)) return undefined;
  return (await import('./sandbox-prepare.js')).prepareSandbox(client, sandbox.id, origin);
}
