import { readFile, stat } from 'node:fs/promises';
import { sandboxRequestSchema, type SandboxInput } from './contracts/sandboxes.js';
import { sandboxPreviewArguments } from './cli-sandbox-preview.js';
import { sandboxUsage } from './cli-sandbox-usage.js';

export { sandboxUsage };

export const modelKeyStorageMessage = "o11 doesn't store model keys for sandboxes. Use --login claude,codex or --claude-key-file/--codex-key-file.";
const aliases: Record<string, string> = { new: 'create', get: 'info', rm: 'delete', run: 'exec', ps: 'processes', sh: 'shell' };
const withoutId = new Set(['create', 'get-or-create', 'list', 'limits', 'help', 'operation', 'billing', 'pricing', 'capabilities', 'saved-snapshots', 'account', 'templates', 'template-get', 'providers', 'sizes',
  'ai-login-status', 'ai-login-save', 'ai-login-delete']);
const booleanFlags = new Set(['detach', 'detached', 'sudo', 'no-env', 'no-snapshots', 'no-monitoring', 'fail-fast',
  'no-auto-stop', 'persistent', 'ephemeral', 'public', 'force', 'yes', 'follow', 'delete-orphan-snapshots', 'delete-snapshots', 'no-wait', 'stdin', 'close', 'resume', 'rotate',
  'matrix', 'auto-pause', 'auto-resume', 'no-internet', 'recursive', 'keep-running', 'approve', 'renew', 'no-prepare', 'prepare', 'all', 'keep', 'localhost', 'overwrite', 'fast', 'new', 'in-place', 'strict', 'background', 'non-persistent']);
/** IDs, names and paths stay text even when they look like numbers (--command-id 5815). */
const textFlags = new Set(['connection', 'cursor', 'from-sandbox', 'name', 'username', 'groupname', 'path', 'cwd', 'workdir', 'share-code', 'snapshot', 'template', 'mask-request-host',
  // File text and command input stay as typed: --content 123 writes the three characters 123.
  'content', 'input', 'source', 'destination', 'command',
  // Octal modes (--mode 600) and file paths stay text too.
  'mode', 'browser-profile', 'profile', 'out', 'to', 'mount']);
const textFlag = (flag: string) => flag.endsWith('-id') || textFlags.has(flag);
const keyName = (flag: string) => flag.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
function jsonValue(value: string): SandboxInput['params'][string] {
  try { return JSON.parse(value) as SandboxInput['params'][string]; }
  catch { return value; }
}
function put(target: Record<string, unknown>, key: string, value: unknown, repeated = false) {
  if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid parameter name');
  if (Object.hasOwn(target, key)) {
    if (!repeated) throw new Error(`Supply ${key} once`);
    const previous = target[key];
    target[key] = Array.isArray(previous) ? [...previous, value] : [previous, value];
  } else Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

/** Parse provider flags without invoking a supplier CLI or interpreting shell text. */
export function sandboxArguments(values: string[]) {
  const words = [...values];
  let action = words.shift();
  if (!action || action.startsWith('-')) throw new Error(sandboxUsage);
  action = aliases[action] ?? action;
  if (action === 'agents') action = 'agents-status';
  const accountOp = action === 'account' ? words.shift() : undefined;
  if (action === 'account' && (!accountOp || !/^[a-z][a-z0-9-]*$/.test(accountOp))) throw new Error('Use sandbox account OP --connection ID. List operations with sandbox capabilities --provider boat');
  if (action === 'preview') {
    const preview = sandboxPreviewArguments(words);
    return { request: { action, id: preview.id, params: { port: preview.port, ...(preview.open ? { open: true } : {}), ...(preview.localhost ? { localhost: true } : {}) } }, data: undefined, json: preview.json };
  }
  if (action === 'agent') {
    if (words.shift() !== 'exec') throw new Error('Use sandbox agent exec NAME --agent claude|codex -- ARGS...');
    action = 'agent-exec';
  }
  if (action === 'files') {
    const subcommand = words.shift();
    if (!['read', 'write', 'list', 'watch', 'watch-events', 'watch-stop', 'delete', 'stat', 'lstat', 'mkdir', 'move', 'search', 'unlink', 'rm', 'rmdir', 'rename', 'copy', 'access', 'exists', 'chmod', 'chown', 'symlink', 'readlink', 'realpath', 'truncate', 'mkdtemp',
      'find', 'replace', 'permissions', 'info', 'append'].includes(subcommand ?? ''))
      throw new Error('Use sandbox files read|write|list|info|delete|mkdir|move|search|find|replace|permissions NAME --path PATH');
    action = `files-${subcommand}`;
  }
  const request: Record<string, unknown> = { action };
  const params: Record<string, unknown> = accountOp ? { op: accountOp } : {};
  let data: string | undefined;
  let json = false;
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    if (word === '--') {
      if (action === 'agent-exec' && request.id && params.agent) { put(params, 'args', words.slice(index + 1)); break; }
      if (!['exec', 'user-exec'].includes(action) || !request.id || !words[index + 1]) throw new Error('Supply a sandbox name followed by -- COMMAND [ARG...]');
      put(params, 'cmd', words[index + 1]);
      put(params, 'args', words.slice(index + 2));
      break;
    }
    if (word === '--json' || word === '-j') { json = true; continue; }
    if (word === '--help' || word === '-h') throw new Error(sandboxUsage);
    if (!word.startsWith('--')) {
      if (action === 'operation' && !params.requestId) { put(params, 'requestId', word); continue; }
      if (!request.id && (!withoutId.has(action) || action === 'saved-snapshots')) { request.id = word; continue; }
      const textField = action === 'exec' ? 'command' : action === 'steer' ? 'message' : 'prompt';
      if (['exec', 'prompt', 'steer'].includes(action) && !Object.hasOwn(params, textField)) {
        put(params, textField, word); continue;
      }
      throw new Error('Unexpected argument. Use -- before executable arguments or quote the shell command.');
    }
    const equals = word.indexOf('=');
    const flag = word.slice(2, equals === -1 ? undefined : equals);
    if (!/^[a-z][a-z0-9-]*$/.test(flag)) throw new Error('Use --kebab-case parameter names');
    let value: unknown;
    const raw = action === 'command-stdin' && flag === 'input' || action === 'account' || textFlag(flag);
    if (equals !== -1) value = raw ? word.slice(equals + 1) : jsonValue(word.slice(equals + 1));
    else if (booleanFlags.has(flag) || action === 'private-preview' && ['provision', 'localhost'].includes(flag) ||
      ['desktop', 'browser'].includes(action) && ['browser-only', 'open'].includes(flag) ||
      ['terminal', 'connect', 'ssh', 'shell'].includes(action) && flag === 'browser') {
      // A following true or false is the flag's value: --persistent false works like --persistent=false.
      // Not for exec, prompt or steer, where a bare word can be the command or text (exec NAME --sudo true).
      const word = words[index + 1];
      if ((word === 'true' || word === 'false') && !['exec', 'prompt', 'steer'].includes(action)) { value = word === 'true'; index++; } else value = true;
    } else {
      const next = words[++index];
      if (next === undefined || next.startsWith('--')) throw new Error(`Supply a value after --${flag}`);
      value = raw ? next : jsonValue(next);
    }
    if (flag === 'data') {
      if (data !== undefined || typeof value !== 'string' && typeof value !== 'object') throw new Error('Supply --data once');
      data = typeof value === 'string' ? value : JSON.stringify(value);
    } else if (flag === 'param') {
      if (typeof value !== 'string') throw new Error('Use --param KEY=JSON');
      const split = value.indexOf('=');
      if (split < 1) throw new Error('Use --param KEY=JSON');
      put(params, value.slice(0, split), jsonValue(value.slice(split + 1)), true);
    } else if (action === 'prompt' && (flag === 'agent' || flag === 'provider' && !['e2b', 'boat', 'vercel'].includes(String(value)))
      || /^ai-(login-|access$)/.test(action) && flag === 'provider') {
      // Boat's prompt --provider names the agent (codex, claude, ...), never a sandbox provider; so does ai-login-* and ai-access's.
      put(params, 'provider', value);
    } else if (flag === 'hours') {
      // Boat's extend --hours N; every provider takes --ttl SECONDS, which o11 also bills and schedules by.
      if (typeof value !== 'number' || !(value > 0) || value > 24) throw new Error('Use --hours N, more than 0 and at most 24');
      put(params, 'ttl', Math.round(value * 3600));
    } else if (flag === 'browser-profile') {
      put(params, 'profile', value);
    } else if (['files-move', 'files-rename'].includes(action) && (flag === 'path' || flag === 'to')) {
      put(params, flag === 'path' ? 'source' : 'destination', value);
    } else if (['provider', 'connection', 'request-id', 'idempotency-key'].includes(flag)) {
      put(request, flag === 'connection' ? 'connectionId' : ['request-id', 'idempotency-key'].includes(flag) ? 'requestId' : flag, value);
    } else if (flag === 'env' || flag === 'tag' || flag === 'metadata') {
      if (typeof value !== 'string' || value.indexOf('=') < 1) throw new Error(`Use --${flag} KEY=VALUE`);
      const split = value.indexOf('=');
      const env = params[flag === 'tag' ? 'tags' : flag] ??= {};
      if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error(`Use an object for ${flag}`);
      put(env as Record<string, unknown>, value.slice(0, split), value.slice(split + 1));
    } else if (['allow-out', 'deny-out', 'allow-public-traffic', 'mask-request-host'].includes(flag)) {
      const network = params.network ??= {};
      if (!network || typeof network !== 'object' || Array.isArray(network)) throw new Error('Use an object for network');
      if (flag === 'allow-out' || flag === 'deny-out') {
        if (typeof value !== 'string' || !value) throw new Error(`Use --${flag} DOMAIN|CIDR`);
        const rules = Reflect.get(network, keyName(flag));
        Reflect.set(network, keyName(flag), [...(Array.isArray(rules) ? rules : []), value]);
      } else put(network as Record<string, unknown>, keyName(flag), value);
    } else if (flag === 'no-internet') {
      put(params, 'allowInternetAccess', value !== true);
    } else if (flag === 'delete-snapshots') {
      put(params, 'deleteOrphanSnapshots', value);
    } else if (flag === 'mount') {
      // Vercel's CLI form, --mount DRIVE:/path[:read-write|snapshot]; DRIVE is an o11 drive name or ID.
      const match = typeof value === 'string' ? /^([^:]+):(\/[^:]*)(?::(read-write|snapshot))?$/.exec(value) : null;
      if (!match) throw new Error('Use --mount DRIVE:/path[:read-write|snapshot]');
      const mounts = params.mounts ??= {};
      if (!mounts || typeof mounts !== 'object' || Array.isArray(mounts)) throw new Error('Use --mount or --param mounts, not both');
      put(mounts as Record<string, unknown>, match[2]!, { drive: match[1], mode: match[3] ?? 'read-write' });
    } else if (flag === 'non-persistent') {
      // Vercel's CLI spelling of persistent false.
      if (typeof value !== 'boolean') throw new Error('Use --non-persistent without a value');
      put(params, 'persistent', !value);
    } else if (flag === 'detach' || flag === 'no-wait' || flag === 'background') {
      // E2B's exec --background is o11's --detached.
      if (typeof value !== 'boolean') throw new Error(`Use a boolean for --${flag}`);
      // o11's resume already returns without waiting for the guest, so Boat's resume --no-wait needs nothing sent.
      if (!(flag === 'no-wait' && action === 'resume')) put(params, 'detached', value);
    } else if (flag === 'no-snapshots' || flag === 'no-monitoring') {
      if (typeof value !== 'boolean') throw new Error(`Use a boolean for --${flag}`);
      put(params, flag === 'no-snapshots' ? 'snapshots' : 'monitoring', !value);
    } else put(params, keyName(flag), value, ['file', 'host', 'port', 'allowed-domain', 'allowed-cidr', 'denied-cidr'].includes(flag));
  }
  // delete --all or delete with filters (no name) is E2B's kill --all: only your own sandboxes that match.
  if (action === 'delete' && !request.id && ['all', 'tags', 'state', 'template', 'namePrefix', 'startedAfter'].some(key => Object.hasOwn(params, key))) action = request.action = 'delete-many';
  if (!withoutId.has(action) && action !== 'delete-many' && !request.id) throw new Error(`Supply a sandbox name or ID for ${action}`);
  // E2B's network update takes its rules at the top level; create nests them under network.
  if (action === 'network-policy' && params.network && typeof params.network === 'object' && !Array.isArray(params.network)) {
    for (const [key, value] of Object.entries(params.network)) put(params, key, value);
    delete params.network;
  }
  if (action === 'get-or-create' && typeof params.name !== 'string') throw new Error('Use sandbox get-or-create --name NAME [--provider e2b|boat|vercel]');
  if (action === 'exec' && !Object.hasOwn(params, 'command') && !Object.hasOwn(params, 'cmd') && data === undefined)
    throw new Error('Supply a shell command or -- COMMAND [ARG...]');
  if (action === 'user-exec' && !Object.hasOwn(params, 'cmd') && data === undefined) throw new Error('Use sandbox user-exec NAME --username USER -- COMMAND [ARG...]');
  if (Object.hasOwn(params, 'command') && Object.hasOwn(params, 'cmd')) throw new Error('Choose a shell command or executable arguments');
  return { request: { ...request, params }, data, json };
}

export async function sandboxRequest(values: string[]) {
  const parsed = sandboxArguments(values);
  const params: Record<string, unknown> = {};
  if (parsed.data !== undefined) {
    const value = parsed.data;
    const text = value === '@-' ? await Bun.stdin.text() : value.startsWith('@') ? await readFile(value.slice(1), 'utf8') : value;
    let native: unknown;
    try { native = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw new Error('Sandbox data must contain valid JSON'); }
    if (!native || typeof native !== 'object' || Array.isArray(native)) throw new Error('Sandbox data must be a JSON object');
    for (const [key, value] of Object.entries(native)) put(params, key, value);
  }
  for (const [key, value] of Object.entries(parsed.request.params)) put(params, key, value);
  if (['claudeAuthConnection', 'codexAuthConnection'].some(key => Object.hasOwn(params, key))) throw new Error(modelKeyStorageMessage);
  // Key files are read and copied into the sandbox by the login transfer; they never reach the o11 request.
  if (['claudeKeyFile', 'codexKeyFile'].some(key => Object.hasOwn(params, key))) throw new Error('Use --claude-key-file or --codex-key-file with create, login or agent exec');
  if (params.agents && typeof params.agents === 'object' && Object.values(params.agents).some(entry => entry && typeof entry === 'object' && 'auth' in entry))
    throw new Error(modelKeyStorageMessage);
  const agentFlags = ['claudeVersion', 'codexVersion'];
  if (typeof params.agents === 'string' || agentFlags.some(key => Object.hasOwn(params, key))) {
    let configured: Record<string, unknown>;
    if (typeof params.agents === 'string') {
      const names = params.agents === 'none' ? [] : params.agents.split(',');
      if (names.some(name => !['claude', 'codex'].includes(name))) throw new Error('Use --agents claude,codex or --agents none');
      configured = { claude: { enabled: names.includes('claude') }, codex: { enabled: names.includes('codex') } };
    } else if (params.agents && typeof params.agents === 'object' && !Array.isArray(params.agents)) configured = params.agents as Record<string, unknown>;
    else configured = { claude: { enabled: true }, codex: { enabled: true } };
    for (const name of ['claude', 'codex']) {
      const entry = configured[name];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Supply agents.${name}.enabled`);
      const fields = entry as Record<string, unknown>;
      const version = params[`${name}Version`];
      if (version !== undefined) { if (fields.version !== undefined) throw new Error(`Supply ${name} version once`); fields.version = version; }
    }
    params.agents = configured;
    for (const key of agentFlags) delete params[key];
  }
  if (params.setupFile !== undefined) {
    if (typeof params.setupFile !== 'string') throw new Error('Use --setup-file LOCAL_FILE');
    const path = params.setupFile;
    if ((await stat(path)).size > 65536) throw new Error('Setup scripts must be at most 64 KiB');
    put(params, 'setupScript', await readFile(path, 'utf8'));
    delete params.setupFile;
  }
  if (params.file !== undefined) {
    const specs = Array.isArray(params.file) ? params.file : [params.file];
    if (specs.length > 32) throw new Error('Supply at most 32 files');
    const files = [];
    let total = 0;
    for (const spec of specs) {
      if (typeof spec !== 'string' || spec.indexOf('=') < 1) throw new Error('Use --file REMOTE_PATH=LOCAL_FILE');
      const split = spec.indexOf('='), local = spec.slice(split + 1);
      total += (await stat(local)).size;
      if (total > 16 * 1024 * 1024) throw new Error('Creation files must total at most 16 MiB');
      files.push({ path: spec.slice(0, split), content: (await readFile(local)).toString('base64'), encoding: 'base64' });
    }
    put(params, 'files', files); delete params.file;
  }
  if (params.host !== undefined) {
    const specs = Array.isArray(params.host) ? params.host : [params.host];
    const ports = specs.map(spec => {
      const match = /^(\d+)(:public)?$/.exec(String(spec));
      if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) throw new Error('Use --host PORT[:public]');
      return { port: Number(match[1]), public: Boolean(match[2]) };
    });
    put(params, 'hostedPorts', ports); delete params.host;
  }
  return sandboxRequestSchema.parse({ ...parsed.request, params });
}

export function sandboxExitCode(result: { status?: string; data: unknown }) {
  if (['unknown', 'pending', 'failed', 'attention'].includes(result.status ?? '')) return 2;
  if (result.data && typeof result.data === 'object' && 'exitCode' in result.data) {
    const code = result.data.exitCode;
    if (typeof code === 'number' && Number.isInteger(code)) return code >= 0 && code <= 255 ? code : 1;
  }
  return 0;
}
