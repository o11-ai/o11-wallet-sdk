import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { assertPublicText } from './public-artifacts';

export const packageName = '@o11/sdk';
export const reviewedFiles = ['client.js', 'cli.js', 'package.json', 'LICENSE', 'README.md', 'CHANGELOG.md',
  ...['client', 'cli', 'config', 'browser-login', 'access-tokens'].map(name => `src/${name}.ts`),
  ...['index', 'receipts', 'resource-plan', 'public-api', 'card-access'].map(name => `src/contracts/${name}.ts`)];
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export const integrity = (value: Uint8Array) => `sha512-${createHash('sha512').update(value).digest('base64')}`;
export function inspectArchive(bytes: Uint8Array, version: string) {
  const tar = gunzipSync(bytes, { maxOutputLength: 16 * 1024 * 1024 });
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (!tar.subarray(offset).every(byte => byte === 0)) throw new Error('Unexpected archive tail.');
      break;
    }
    const field = (start: number, end: number) => header.subarray(start, end).toString().replace(/\0.*$/, '');
    const path = field(0, 100), rawSize = field(124, 136).trim();
    const size = /^[0-7]+$/.test(rawSize) ? parseInt(rawSize, 8) : NaN;
    if (field(345, 500) || !Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length
      || ![0, 48].includes(header[156] ?? -1) || !path.startsWith('package/')) throw new Error('Unsafe wallet package entry.');
    const relative = path.slice(8);
    if (!reviewedFiles.includes(relative) || files.has(relative)) throw new Error(`Unreviewed wallet file: ${relative}`);
    const content = tar.subarray(offset + 512, offset + 512 + size);
    assertPublicText(content.toString('utf8'), relative);
    files.set(relative, content);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (reviewedFiles.some(path => !files.has(path))) throw new Error('Incomplete wallet archive.');
  const manifest = JSON.parse(files.get('package.json')!.toString()) as {
    name?: string; version?: string; private?: boolean; bin?: Record<string, string>; dependencies?: Record<string, string>;
  };
  if (manifest.name !== packageName || manifest.version !== version || manifest.private === true
    || manifest.bin?.o11 !== './cli.js' || manifest.dependencies?.zod !== '4.6.5'
    || Object.values(manifest.dependencies).some(value => value.startsWith('workspace:'))) throw new Error('Wallet package identity mismatch.');
  return { files, digest: sha256(JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => [path, sha256(content)]))) };
}
