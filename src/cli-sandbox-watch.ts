import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';

type Client = { sandbox(input: SandboxInput): Promise<SandboxResult> };
type WatchEvent = { type: string; name: string };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** files watch NAME --path DIR [--recursive] [--seconds N]: o11 starts an E2B watcher, polls its events, and removes it on exit. */
export function sandboxWatchArguments(args: string[]) {
  const [, , id, ...rest] = args;
  let path: string | undefined, recursive = false, seconds: number | undefined, json = false;
  for (let index = 0; index < rest.length; index++) {
    const word = rest[index]!;
    if (word === '--path') path = rest[++index];
    else if (word.startsWith('--path=')) path = word.slice(7);
    else if (word === '--recursive') recursive = true;
    else if (word === '--json' || word === '-j') json = true;
    else if (word === '--seconds') seconds = Number(rest[++index]);
    else if (word.startsWith('--seconds=')) seconds = Number(word.slice(10));
    else throw new Error('Use o11 sandbox files watch NAME --path DIR [--recursive] [--seconds N]');
  }
  if (!id || id.startsWith('-') || !path) throw new Error('Use o11 sandbox files watch NAME --path DIR [--recursive] [--seconds N]');
  if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)) throw new Error('Use --seconds 1 to 3600');
  return { id, path, recursive, seconds, json };
}

/** Prints each change as it is seen (or returns them all with --json). Ctrl-C or --seconds ends it. */
export async function sandboxWatch(client: Client, args: string[], write = (line: string) => process.stdout.write(`${line}\n`), pollMs = 1000) {
  const options = sandboxWatchArguments(args);
  const started = await client.sandbox({ action: 'files-watch', id: options.id, params: { path: options.path, ...(options.recursive ? { recursive: true } : {}) } });
  const watcherId = object(started.data).watcherId;
  if (typeof watcherId !== 'string') return { result: started, printed: false };
  const events: WatchEvent[] = [];
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGINT', stop);
  const end = options.seconds === undefined ? Infinity : Date.now() + options.seconds * 1000;
  if (!options.json) process.stderr.write(`Watching ${options.path}${options.seconds ? ` for ${options.seconds} s` : ''}. Ctrl-C stops.\n`);
  try {
    while (!stopped && Date.now() < end) {
      const read = await client.sandbox({ action: 'files-watch-events', id: options.id, params: { watcherId } });
      for (const row of Array.isArray(object(read.data).events) ? object(read.data).events as unknown[] : []) {
        const event = { type: String(object(row).type ?? 'change'), name: String(object(row).name ?? '') };
        events.push(event);
        if (!options.json) write(`${event.type}\t${event.name}`);
      }
      await Bun.sleep(pollMs);
    }
  } finally {
    process.off('SIGINT', stop);
    await client.sandbox({ action: 'files-watch-stop', id: options.id, params: { watcherId } }).catch(() => undefined);
  }
  return options.json ? { result: { watcherId, path: options.path, events }, printed: false } : { result: undefined, printed: true };
}
