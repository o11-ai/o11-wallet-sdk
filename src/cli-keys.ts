import { lstat, mkdir, readFile, readdir, rmdir, rename, rm, writeFile, open, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { z } from 'zod';
import { readConfig, saveConfig, clearConfig } from './config.js';
import { walletOrigin } from './access-tokens.js';

const labelSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const registrySchema = z.strictObject({ labels: z.array(labelSchema), active: labelSchema.nullable(), useDefault: z.boolean().optional() });
type Registry = z.infer<typeof registrySchema>;
const root = () => process.env.O11_TOOLS_CONFIG_DIR ?? join(homedir(), '.config', 'o11-wallet');
const registryPath = () => join(root(), 'keys.json');
async function registry(): Promise<Registry | undefined> {
  const stat = await lstat(registryPath()).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!stat) return undefined;
  if (!stat.isFile() || stat.isSymbolicLink() || process.platform !== 'win32' && (stat.mode & 0o077))
    throw new Error('The saved key selection must be an owner-only regular file');
  return registrySchema.parse(JSON.parse(await readFile(registryPath(), 'utf8')));
}
async function saveRegistry(value: Registry) {
  const temporary = join(root(), `.keys-${crypto.randomUUID()}.json`);
  try {
    await writeFile(temporary, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, registryPath());
  } finally { await rm(temporary, { force: true }); }
}
async function locked<T>(action: () => Promise<T>) {
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const stat = await lstat(root());
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The wallet configuration directory must not be a symlink');
  if (process.platform !== 'win32') await chmod(root(), 0o700);
  const profiles = await lstat(join(root(), 'profiles')).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (profiles && (!profiles.isDirectory() || profiles.isSymbolicLink())) throw new Error('The profiles directory must not be a symlink');
  const file = join(root(), '.keys.lock');
  const deadline = Date.now() + 10000;
  let handle;
  while (!handle) {
    try { handle = await open(file, 'wx', 0o600); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      if (Date.now() >= deadline) throw new Error('Key management is busy. Retry shortly; remove .keys.lock only if its owning process has ended.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  try { return await action(); } finally { await handle.close(); await rm(file, { force: true }); }
}
export async function activeKeyProfile() {
  const saved = await registry();
  if (!saved || saved.useDefault) return undefined;
  if (!saved.active) throw new Error('No active key. Use o11 keys activate -l LABEL or choose --profile PROFILE.');
  if (!saved.labels.includes(saved.active)) throw new Error('Saved key selection is invalid. Use keys activate.');
  return saved.active;
}
/** A successful unprofiled login selects its newly saved default without deleting keys. */
export async function selectDefaultCredentials() {
  return locked(async () => {
    const saved = await registry();
    if (saved) await saveRegistry({ ...saved, active: null, useDefault: true });
  });
}
/** Logout may target a saved key label explicitly or a profile that has changed type. */
export async function forgetKeyLabel(label: string) {
  return locked(async () => {
    const saved = await registry();
    if (!saved || !saved.labels.includes(label)) return;
    saved.labels = saved.labels.filter(item => item !== label);
    if (saved.active === label) saved.active = null;
    await saveRegistry(saved);
    await rmdir(join(root(), 'profiles', label)).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && ['ENOTEMPTY', 'ENOENT'].includes(String(error.code))) return;
      throw error;
    });
  });
}
async function keyConfig(label: string) {
  const access = join(root(), 'profiles', label, 'access.json');
  const stat = await lstat(access).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  return stat ? readConfig(label, { refresh: false }) : undefined;
}
export function keyArguments(args: string[]) {
  const [operation, ...flags] = args;
  if (!operation || !['add', 'list', 'remove', 'activate'].includes(operation)) throw new Error('Use keys add|list|remove|activate');
  const options: { label?: string; key?: string; server?: string; stdin?: boolean; force?: boolean } = {};
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;
    const names: Record<string, 'label' | 'key' | 'server' | 'stdin' | 'force'> = { '-l': 'label', '--label': 'label', '-k': 'key', '--key': 'key', '--server': 'server', '--key-stdin': 'stdin', '-f': 'force', '--force': 'force' };
    const name = Object.hasOwn(names, flag) ? names[flag] : undefined;
    if (!name || options[name] !== undefined) throw new Error('Unknown or repeated key option');
    if (name === 'force' || name === 'stdin') options[name] = true;
    else {
      const value = flags[++i];
      if (!value || value.startsWith('-')) throw new Error('Key option needs a value');
      options[name] = value;
    }
  }
  if (operation !== 'list') options.label = labelSchema.parse(options.label);
  if (operation === 'list' && flags.length || operation !== 'add' && (options.key || options.server || options.stdin) || operation !== 'remove' && options.force)
    throw new Error('Options do not apply to this keys command');
  if (operation === 'add' && Boolean(options.key) === Boolean(options.stdin)) throw new Error('Supply -k KEY or --key-stdin once');
  return { operation, ...options };
}
export async function manageKeys(args: string[]) {
  const options = keyArguments(args);
  // Confirm before taking the store lock; noninteractive clients must opt in with -f.
  if (options.operation === 'remove' && !options.force) {
    if (!process.stdin.isTTY) throw new Error('Use keys remove -l LABEL -f to confirm local removal');
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try { if (!/^y(es)?$/i.test(await prompt.question(`Remove saved key "${options.label}"? [y/N] `))) return { removed: false }; }
    finally { prompt.close(); }
  }
  return locked(async () => {
    const saved: Registry = await registry() ?? { labels: [], active: null };
    if (options.operation === 'list') {
      return { keys: await Promise.all(saved.labels.map(async label => {
        const config = await keyConfig(label);
        return { label, server: config ? new URL(config.baseUrl).origin : null, active: !saved.useDefault && label === saved.active,
          available: Boolean(config) && !config?.refreshToken, ...(config?.refreshToken ? { kind: 'browser_profile' } : {}) };
      })), defaultSelected: saved.useDefault ?? false, environmentOverride: Boolean(process.env.O11_API_KEY || process.env.O11_TOOLS_URL) };
    }
    const label = options.label!;
    if (options.operation === 'add') {
      const profiles: string[] = await readdir(join(root(), 'profiles')).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
        throw error;
      });
      if (saved.labels.includes(label) || profiles.includes(label)) throw new Error('That label already exists. Choose another label.');
      const key = options.stdin ? (await Bun.stdin.text()).trim() : options.key!;
      if (!/^o11_[A-Za-z0-9_-]+$/.test(key)) throw new Error('Expected an o11 API key');
      const server = options.server ?? process.env.O11_TOOLS_URL;
      if (!server) throw new Error('Supply --server URL (or O11_TOOLS_URL) for this key');
      const origin = walletOrigin(server);
      await saveConfig({ baseUrl: origin, apiKey: key }, label);
      saved.labels.push(label);
      if (saved.labels.length === 1) { saved.active = label; saved.useDefault = false; }
    } else {
      if (!saved.labels.includes(label)) throw new Error('No saved key with that label. Use keys list.');
      const config = await keyConfig(label);
      if (config?.refreshToken) throw new Error('This profile now contains browser access. Use logout --profile LABEL.');
      if (options.operation === 'activate') {
        if (!config) throw new Error('The saved key file is missing. Remove this label and add it again.');
        saved.active = label; saved.useDefault = false;
      }
      else {
        // Deselect first, so an interrupted removal cannot select another credential.
        saved.labels = saved.labels.filter(item => item !== label);
        if (saved.active === label) saved.active = null;
        await saveRegistry(saved);
        if (config) await clearConfig(label);
        await rmdir(join(root(), 'profiles', label)).catch((error: unknown) => {
          if (error instanceof Error && 'code' in error && ['ENOTEMPTY', 'ENOENT'].includes(String(error.code))) return;
          throw error;
        });
      }
    }
    await saveRegistry(saved);
    return { label, active: saved.active, ...(options.operation === 'remove' ? { removed: true, serverKeyRevoked: false } : { saved: true }),
      ...(process.env.O11_API_KEY || process.env.O11_TOOLS_URL ? { note: 'Environment credentials still override the active key for unprofiled commands.' } : {}) };
  });
}
