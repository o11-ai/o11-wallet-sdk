import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { posix } from 'node:path';
import { assertPublicText } from './public-artifacts';
import { CONTENT } from '../../packages/ostack/content/index.ts';

export const packageName = '@o11/sdk';
export const contractFiles = ['index', 'money', 'accounts', 'receipts', 'resource-plan', 'public-api', 'cli-version', 'card-access', 'agent-permissions',
  'execution-account', 'provider-authorization', 'supplier-capacity', 'supplier-price-reference', 'published-tariff', 'published-input', 'purchases', 'product-search', 'agent-guidance', 'reports', 'report-values',
  'invocation-lifecycle', 'invocation-run', 'result-outcome', 'record-output-contracts', 'email-confidence', 'health', 'decision-evidence', 'onboarding', 'playbooks'] as const;
export const sdkSourceFiles = ['client', 'cli', 'cli-help', 'cli-inspect', 'cli-call', 'cli-wallet', 'cli-topup', 'topup-wait', 'cli-keys', 'cli-execution', 'cli-result-file', 'cli-report', 'cli-resources', 'cli-search', 'invocation-wait', 'call-stream', 'call-streamed', 'client-errors', 'config', 'browser-login', 'access-tokens', 'token-provider', 'mcp', 'login-lock', 'login-terminal', 'email-login', 'setup', 'cli-update', 'cli-auto-update', 'cli-ostack', 'cli-batch', 'cli-batch-rows', 'cli-install'] as const;
/** ostack ships inside the CLI. Its sources and bundled markdown are mirrored under src/ostack/ at their package paths. */
export const ostackSourceFiles = [
  'src/cli', 'src/commands/customize', 'src/commands/doctor', 'src/commands/files', 'src/commands/run',
  'src/commands/schedule', 'src/commands/setup', 'src/commands/setup-import', 'src/commands/skills',
  'src/commands/workspace', 'src/index', 'src/lib/args', 'src/lib/content', 'src/lib/csv', 'src/lib/errors',
  'src/lib/layers', 'src/lib/o11-path', 'src/lib/output', 'src/lib/paths', 'src/lib/playbooks', 'src/lib/remote',
  'src/lib/schedule', 'src/lib/state', 'src/lib/steps', 'src/lib/time', 'src/lib/version', 'src/lib/workspace',
  'src/playbooks/gtm/audience-settings', 'src/playbooks/gtm/audiences-command', 'src/playbooks/gtm/homepage-check',
  'src/playbooks/gtm/index', 'src/playbooks/gtm/ledger-command', 'src/playbooks/gtm/settings',
  'src/playbooks/gtm/tam-command', 'src/playbooks/index', 'src/playbooks/launch-videos/index',
  'src/playbooks/launch-videos/kit', 'src/playbooks/types', 'content/index', 'content/kits', 'content/markdown.d'
] as const;
/** Every markdown file bundled into the CLI, read from the generated packages/ostack/content/index.ts. */
export const ostackContentFiles = Object.keys(CONTENT).sort().map(path => `content/${path}`);
export const ostackFiles = [...ostackSourceFiles.map(name => `src/ostack/${name}.ts`), ...ostackContentFiles.map(path => `src/ostack/${path}`)];
export const reviewedFiles = ['client.js', 'cli.js', 'wallet-cli.js', 'package.json', 'LICENSE', 'README.md', 'CHANGELOG.md',
  ...sdkSourceFiles.map(name => `src/${name}.ts`),
  ...contractFiles.map(name => `src/contracts/${name}.ts`),
  ...ostackFiles];
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export const integrity = (value: Uint8Array) => `sha512-${createHash('sha512').update(value).digest('base64')}`;
export function standaloneSource(source: string) {
  return source
    .replace(/(["'])@o11\/tool-contracts(?:\/([a-z-]+))?\1/g, (_match: string, quote: string, contract: string | undefined) => `${quote}./contracts/${contract ?? 'index'}${quote}`)
    .replace(/(["'])@o11\/ostack\1/g, (_match: string, quote: string) => `${quote}./ostack/src/index${quote}`)
    .replace(/((?:from\s*|import\s*\(\s*|import\s*)["'])(\.\.?\/[^"']+)(["'])/g, (_match: string, prefix: string, specifier: string, suffix: string) => {
      const extension = posix.extname(specifier);
      return `${prefix}${extension === '.ts' ? specifier.slice(0, -3) + '.js' : extension ? specifier : specifier + '.js'}${suffix}`;
    });
}
export function inspectSourceImports(files: Map<string, Uint8Array>) {
  for (const [path, content] of files) {
    if (!path.startsWith('src/') || !path.endsWith('.ts')) continue;
    const source = Buffer.from(content).toString('utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g)) {
      const specifier = match[1]!;
      if (specifier.startsWith('@o11/') || specifier.startsWith('workspace:')) throw new Error(`Unresolved wallet workspace import: ${path}: ${specifier}`);
      if (!specifier.startsWith('.')) continue;
      if (!posix.extname(specifier)) throw new Error(`Wallet source requires an explicit module extension: ${path}: ${specifier}`);
      const target = posix.normalize(posix.join(posix.dirname(path), specifier));
      const candidates = target.endsWith('.js') ? [target, target.slice(0, -3) + '.ts'] : [target];
      if (!candidates.some(candidate => files.has(candidate)))
        throw new Error(`Missing wallet source dependency: ${path}: ${specifier}`);
    }
  }
}
export function inspectArchive(bytes: Uint8Array, version: string, expectedFiles: readonly string[] = reviewedFiles) {
  const tar = gunzipSync(bytes, { maxOutputLength: 16 * 1024 * 1024 });
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (!tar.subarray(offset).every(byte => byte === 0)) throw new Error('Unexpected archive tail.');
      break;
    }
    const field = (start: number, end: number) => header.subarray(start, end).toString().replace(/\0.*$/, '');
    // Paths over 100 bytes keep their leading directories in the ustar prefix field.
    const prefix = field(345, 500), name = field(0, 100), rawSize = field(124, 136).trim();
    const path = prefix ? `${prefix}/${name}` : name;
    const size = /^[0-7]+$/.test(rawSize) ? parseInt(rawSize, 8) : NaN;
    if ((prefix && field(257, 263) !== 'ustar') || !Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length
      || ![0, 48].includes(header[156] ?? -1) || !path.startsWith('package/')) throw new Error('Unsafe wallet package entry.');
    const relative = path.slice(8);
    if (!expectedFiles.includes(relative) || files.has(relative)) throw new Error(`Unreviewed wallet file: ${relative}`);
    const content = tar.subarray(offset + 512, offset + 512 + size);
    assertPublicText(content.toString('utf8'), relative);
    files.set(relative, content);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (expectedFiles.some(path => !files.has(path))) throw new Error('Incomplete wallet archive.');
  inspectSourceImports(files);
  const manifest = JSON.parse(files.get('package.json')!.toString()) as {
    name?: string; version?: string; private?: boolean; bin?: Record<string, string>; dependencies?: Record<string, string>;
  };
  if (manifest.name !== packageName || manifest.version !== version || manifest.private === true
    || manifest.bin?.o11 !== './cli.js' || Object.keys(manifest.bin ?? {}).length !== 1 || manifest.dependencies?.zod !== '4.6.5'
    || Object.values(manifest.dependencies).some(value => value.startsWith('workspace:'))) throw new Error('Wallet package identity mismatch.');
  return { files, digest: sha256(JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => [path, sha256(content)]))) };
}
