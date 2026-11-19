import { createHash } from 'node:crypto';
import { lstat, mkdir, open, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { SandboxInput } from './contracts/sandboxes.js';
import { excludeArguments, linksToSkip, removeEscapingLinks } from './cli-sandbox-tar-safety.js';

type Client = { sandbox(input: SandboxInput): Promise<unknown> };
type Chunk = { generation: number; chunkIndex: number; sha256: string | null; url: string };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

async function run(argv: string[]) {
  const child = Bun.spawn(argv, { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' });
  const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`${argv[0]} failed: ${stderr.trim().slice(0, 300)}`);
}

/**
 * `o11 sandbox snapshot-download NAME --snapshot-id ID [--out DIR]`, Boat's `snapshot pull`.
 * Without --out it prints Boat's signed links. With --out it downloads every chunk, checks its sha256, and unpacks
 * each generation in order with tar and zstd. The links are never written to disk.
 */
export async function sandboxSnapshotDownload(client: Client, input: SandboxInput, log: (line: string) => void = line => process.stderr.write(line + '\n')) {
  const { out, ...params } = input.params;
  if (out !== undefined && (typeof out !== 'string' || !out)) throw new Error('Use --out DIR');
  const result = object(await client.sandbox({ ...input, action: 'snapshot-download', params }));
  if (out === undefined) return result;
  const data = object(result.data);
  const chunks = (Array.isArray(data.chunks) ? data.chunks : []).map(row => object(row) as unknown as Chunk)
    .sort((left, right) => left.generation - right.generation || left.chunkIndex - right.chunkIndex);
  if (!chunks.length) throw new Error('Boat returned no snapshot chunks');
  const directory = resolve(out);
  await mkdir(directory, { recursive: true });
  const generations = [...new Set(chunks.map(chunk => chunk.generation))];
  let bytes = 0, skipped = 0;
  const archives = new Map<number, { path: string; skip: string[] }>();
  try {
    // Every generation is downloaded and checked before anything is unpacked.
    for (const generation of generations) {
      const archive = join(directory, `.o11-snapshot-${generation}.tar.zst`);
      archives.set(generation, { path: archive, skip: [] });
      const file = await open(archive, 'w', 0o600);
      try {
        for (const chunk of chunks.filter(row => row.generation === generation)) {
          const response = await fetch(chunk.url, { redirect: 'follow', signal: AbortSignal.timeout(600_000) });
          if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(`Chunk ${generation}/${chunk.chunkIndex} download failed (HTTP ${response.status})`); }
          const hash = createHash('sha256');
          for await (const part of response.body) { hash.update(part); await file.write(part); bytes += part.byteLength; }
          if (chunk.sha256 && hash.digest('hex') !== chunk.sha256) throw new Error(`Chunk ${generation}/${chunk.chunkIndex} failed its sha256 check`);
        }
      } finally { await file.close(); }
      archives.get(generation)!.skip = await linksToSkip(archive, ['zstd', '-dc']);
    }
    for (const generation of generations) {
      const { path, skip } = archives.get(generation)!;
      log(`Unpacking generation ${generation}`);
      await run(['tar', '--zstd', '--no-same-owner', '-xf', path, '-C', directory, ...await excludeArguments(path, skip)]);
      // Links that point outside the folder are removed before the next generation can write through them.
      for (const name of skip) {
        const target = join(directory, name), stat = await lstat(target).catch(() => undefined);
        if (stat && !stat.isDirectory()) await rm(target, { force: true });
      }
      skipped += skip.length;
      // A link can also escape through another link (a -> b/.., b -> ../..), or arrive as a hardlink to a symlink.
      // Check every link in the folder, not only the ones the archive listed, before the next generation can write through one.
      skipped += await removeEscapingLinks(directory);
      await rm(path, { force: true });
    }
  } finally { for (const { path } of archives.values()) await Promise.all([rm(path, { force: true }), rm(path + '.skip', { force: true })]); }
  if (skipped) log(`Skipped ${skipped} link${skipped === 1 ? '' : 's'} that point outside ${directory}`);
  return { snapshotId: data.snapshotId, out: directory, generations: generations.length, chunks: chunks.length, bytes, skippedLinks: skipped,
    note: "The files of the sandbox user's home folder, unpacked with tar and zstd." };
}
