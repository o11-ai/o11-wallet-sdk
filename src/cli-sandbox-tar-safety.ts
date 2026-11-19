import { lstat, readdir, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { posix } from 'node:path';

export type TarEntry = { name: string; type: string; linkname: string };

const utf8 = new TextDecoder('utf-8', { fatal: true });
function text(bytes: Uint8Array) {
  try { return utf8.decode(bytes.subarray(0, bytes.indexOf(0) === -1 ? bytes.length : bytes.indexOf(0))); }
  catch { throw new Error('The archive has a file name that is not UTF-8; nothing was unpacked'); }
}
function octal(bytes: Uint8Array) {
  // GNU base-256 for sizes of 8 GiB and more.
  if (bytes[0]! & 0x80) return Number(bytes.subarray(1).reduce((total, byte) => total * 256n + BigInt(byte), BigInt(bytes[0]! & 0x7f)));
  const value = text(bytes).trim();
  if (!/^[0-7]*$/.test(value)) throw new Error('The archive has a malformed entry size');
  return value ? parseInt(value, 8) : 0;
}
function pax(bytes: Uint8Array) {
  const fields: Record<string, string> = {}, body = text(bytes);
  for (let at = 0; at < body.length;) {
    const space = body.indexOf(' ', at), length = Number(body.slice(at, space));
    if (space < 0 || !Number.isSafeInteger(length) || length <= 0) break;
    const record = body.slice(space + 1, at + length - 1), equals = record.indexOf('=');
    if (equals > 0) fields[record.slice(0, equals)] = record.slice(equals + 1);
    at += length;
  }
  return fields;
}

/** Reads only the headers of an uncompressed tar stream (ustar, GNU long names and pax), skipping file contents. */
export async function tarEntries(stream: ReadableStream<Uint8Array>) {
  const entries: TarEntry[] = [];
  let buffer = new Uint8Array(0), skip = 0, pending: { want: number; kind: 'pax' | 'L' | 'K'; pad: number } | undefined;
  let next: { path?: string; linkpath?: string; size?: number } = {};
  const take = (count: number) => { const head = buffer.subarray(0, count); buffer = buffer.subarray(count); return head; };
  for await (const chunk of stream) {
    const merged = new Uint8Array(buffer.length + chunk.length); merged.set(buffer); merged.set(chunk, buffer.length); buffer = merged;
    for (;;) {
      if (skip) { const drop = Math.min(skip, buffer.length); take(drop); skip -= drop; if (skip) break; }
      if (pending) {
        if (buffer.length < pending.want + pending.pad) break;
        const data = take(pending.want); take(pending.pad);
        if (pending.kind === 'pax') { const fields = pax(data); next = { ...next, ...(fields.path ? { path: fields.path } : {}), ...(fields.linkpath ? { linkpath: fields.linkpath } : {}),
          ...(fields.size && /^[0-9]+$/.test(fields.size) ? { size: Number(fields.size) } : {}) }; }
        else if (pending.kind === 'L') next.path = text(data);
        else next.linkpath = text(data);
        pending = undefined; continue;
      }
      if (buffer.length < 512) break;
      const header = take(512);
      if (header.every(byte => byte === 0)) continue;
      const size = next.size ?? octal(header.subarray(124, 136)), type = String.fromCharCode(header[156] || 48), padded = Math.ceil(size / 512) * 512;
      if (['x', 'L', 'K'].includes(type)) { pending = { want: size, kind: type === 'x' ? 'pax' : type as 'L' | 'K', pad: padded - size }; continue; }
      if (type === 'g') { skip = padded; continue; }
      const prefix = new TextDecoder().decode(header.subarray(257, 262)) === 'ustar' ? text(header.subarray(345, 500)) : '';
      const name = next.path ?? (prefix ? `${prefix}/${text(header.subarray(0, 100))}` : text(header.subarray(0, 100)));
      entries.push({ name, type, linkname: next.linkpath ?? text(header.subarray(157, 257)) });
      next = {}; skip = ['1', '2', '5'].includes(type) ? 0 : padded;
    }
  }
  return entries;
}

const escapes = (path: string) => path === '..' || path.startsWith('../');
/** Throws for an entry path that is absolute or contains `..`. Returns true for a symlink or hardlink that points outside
 * the unpacked tree (an absolute target, or one that climbs out), which the caller skips like `boat snapshot pull` does. */
export function unsafeLink(entry: TarEntry) {
  if (!entry.name || entry.name.startsWith('/') || entry.name.split('/').includes('..') || entry.name.includes('\0'))
    throw new Error(`The archive has an unsafe path (${JSON.stringify(entry.name.slice(0, 200))}); nothing more was unpacked`);
  if (entry.type !== '1' && entry.type !== '2') return false;
  if (!entry.linkname || entry.linkname.startsWith('/')) return true;
  return escapes(posix.normalize(entry.type === '2' ? posix.join(posix.dirname(entry.name), entry.linkname) : entry.linkname));
}

/** Names of links to leave out when unpacking. Throws, before anything is unpacked, on an absolute path or one with `..`. */
export async function linksToSkip(archive: string, decompress: string[]) {
  const child = Bun.spawn([...decompress, archive], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [entries, stderr, code] = await Promise.all([tarEntries(child.stdout), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`${decompress[0]} failed: ${stderr.trim().slice(0, 300)}`);
  const last = new Map<string, boolean>();
  for (const entry of entries) last.set(entry.name.replace(/\/+$/, ''), unsafeLink(entry));
  return [...last].filter(([, unsafe]) => unsafe).map(([name]) => name);
}

/** tar arguments that leave the skipped links out. GNU tar matches the names literally; bsdtar reads them as patterns. */
export async function excludeArguments(archive: string, skip: string[]) {
  if (!skip.length) return [];
  if (skip.some(name => /[\n\r]/.test(name))) throw new Error('The archive has a link name tar cannot skip safely; nothing more was unpacked');
  const gnu = (await new Response(Bun.spawn(['tar', '--version'], { stdout: 'pipe', stderr: 'ignore' }).stdout).text()).includes('GNU tar');
  if (!gnu && skip.some(name => /[*?[\\]/.test(name))) throw new Error('The archive has a link name bsdtar cannot skip safely; nothing more was unpacked');
  const list = archive + '.skip';
  await writeFile(list, skip.map(name => name + '\n').join(''), { mode: 0o600 });
  return gnu ? ['--anchored', '--no-wildcards', '--exclude-from', list] : ['-X', list];
}

/** Resolves a symlink one component at a time, as the kernel would. True if any step leaves root, even past a missing component. */
async function linkEscapes(root: string, link: string) {
  const inside = (path: string) => path === root || path.startsWith(root + '/');
  let hops = 0;
  const follow = async (base: string, target: string): Promise<string | undefined> => {
    let current = target.startsWith('/') ? '/' : base, missing = false;
    for (const part of target.split('/')) {
      if (!part || part === '.') continue;
      current = part === '..' ? posix.dirname(current) : posix.join(current, part);
      if (!inside(current)) return undefined;
      if (missing || part === '..') continue;
      const info = await lstat(current).catch(() => undefined);
      if (!info) { missing = true; continue; }
      if (!info.isSymbolicLink()) continue;
      if (++hops > 40) return undefined;
      const next = await follow(posix.dirname(current), await readlink(current));
      if (next === undefined) return undefined;
      current = next;
    }
    return current;
  };
  return await follow(posix.dirname(link), await readlink(link)) === undefined;
}

/**
 * Walks the whole folder with lstat, never following a link, and removes every symlink whose target leaves the folder
 * (a missing target too) and every symlink with more than one hard link. Returns how many it removed.
 */
export async function removeEscapingLinks(directory: string) {
  const root = await realpath(directory);
  let removed = 0;
  const visit = async (folder: string) => {
    for (const name of await readdir(folder)) {
      const path = posix.join(folder, name), info = await lstat(path);
      if (info.isSymbolicLink()) { if (info.nlink > 1 || await linkEscapes(root, path)) { await rm(path, { force: true }); removed++; } }
      else if (info.isDirectory()) await visit(path);
    }
  };
  await visit(root);
  return removed;
}
