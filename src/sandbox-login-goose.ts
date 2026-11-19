import { join } from 'node:path';
import { record, type LocalLogin, type LoginAgentDefinition } from './sandbox-login-agent.js';
import { readSmall, replyOk, secretReader, type LoginAgentWithCli } from './sandbox-login-agent-cli.js';

/**
 * Goose. Settings are ~/.config/goose/config.yaml (GOOSE_PROVIDER, GOOSE_MODEL, ...). Secrets are one JSON blob in the
 * system keyring (service `goose`, user `secrets`), or ~/.config/goose/secrets.yaml when GOOSE_DISABLE_KEYRING is set;
 * environment variables override both. Goose's "login" is the configured provider's API key, which lasts.
 * Only that provider's entries (keys starting with its name, e.g. OPENAI_API_KEY for openai) are copied; extension
 * secrets in the same blob stay here. The sandbox has no keyring, so it gets secrets.yaml and GOOSE_DISABLE_KEYRING.
 * Providers that sign in through a browser (Databricks, GCP, Copilot via Goose) keep tokens elsewhere and are not copied.
 */
const file = 'goose-login.json';
const plainValue = /^[^\s'"\\]{1,8000}$/;
const settingValue = /^[A-Za-z0-9._:/@-]{1,200}$/;

const yamlScalar = (body: string | undefined, key: string) =>
  body?.match(new RegExp(`^${key}:\\s*["']?([^"'#\\s]+)`, 'm'))?.[1];

function parseSecrets(body: string | undefined): Record<string, unknown> {
  if (!body) return {};
  try { return record(JSON.parse(body)); } catch { /* secrets.yaml: flat KEY: value lines. */ }
  const out: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/);
    if (match) out[match[1]!] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return out;
}

async function read({ home, env }: Parameters<LoginAgentDefinition['read']>[0]): Promise<LocalLogin> {
  const dir = join(env.XDG_CONFIG_HOME || join(home, '.config'), 'goose');
  const config = await readSmall(join(dir, 'config.yaml'));
  const provider = env.GOOSE_PROVIDER || yamlScalar(config, 'GOOSE_PROVIDER');
  const model = env.GOOSE_MODEL || yamlScalar(config, 'GOOSE_MODEL');
  if (!provider || !settingValue.test(provider)) throw new Error('No Goose provider is configured. Run `goose configure` here.');
  const keyringOff = Boolean(env.GOOSE_DISABLE_KEYRING) || /^GOOSE_DISABLE_KEYRING:\s*(true|1|yes)/mi.test(config ?? '');
  const stored = parseSecrets(keyringOff ? await readSmall(join(dir, 'secrets.yaml')) : await secretReader.read('goose'));
  const prefix = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_`;
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(stored)) if (key.startsWith(prefix) && typeof value === 'string') secrets[key] = value;
  for (const [key, value] of Object.entries(env)) if (key.startsWith(prefix) && /_(API_KEY|TOKEN|KEY|HOST)$/.test(key) && value) secrets[key] = value;
  if (!Object.keys(secrets).some(key => /(KEY|TOKEN)$/.test(key))) throw new Error(`No ${provider} API key for Goose to copy. Run \`goose configure\` here, or set ${prefix}API_KEY.`);
  if (Object.values(secrets).some(value => !plainValue.test(value))) throw new Error('A Goose provider secret has an unexpected format');
  const settings = { GOOSE_PROVIDER: provider, ...(model && settingValue.test(model) ? { GOOSE_MODEL: model } : {}), GOOSE_DISABLE_KEYRING: true };
  return { agent: 'goose', source: keyringOff ? 'secrets-yaml' : 'keyring', longLived: true, file,
    content: `${JSON.stringify({ settings, secrets })}\n`, secrets: Object.entries(secrets).filter(([key]) => !key.endsWith('_HOST')).map(([, value]) => value) };
}

// JSON is valid YAML, so secrets.yaml is written as JSON. config.yaml keeps its other lines; ours replace theirs.
const install = [
  'command -v python3 >/dev/null 2>&1 || { printf \'%s\\n\' o11_login_python_unavailable:goose >&2; exit 81; }',
  'd="$HOME/.config/goose"; mkdir -p -m 700 -- "$d"',
  'python3 -I -c \'import json,os,sys;os.umask(0o77);b=json.load(open(sys.argv[1]));p=sys.argv[2];s={}',
  'try: s=json.load(open(p))',
  'except Exception: pass',
  's.update(b["secrets"]);open(sys.argv[3],"w").write(json.dumps(s))',
  'c=sys.argv[4];old=open(c).read().splitlines() if os.path.exists(c) else []',
  'keep=[x for x in old if x.split(":")[0].strip() not in b["settings"]]',
  'open(sys.argv[5],"w").write("\\n".join(keep+["%s: %s"%(k,json.dumps(v)) for k,v in b["settings"].items()])+"\\n")\' "$1" "$d/secrets.yaml" "$1.secrets" "$d/config.yaml" "$1.config"',
  'place "$1.secrets" "$d/secrets.yaml"; place "$1.config" "$d/config.yaml"; rm -f -- "$1.secrets" "$1.config"'].join('\n');

export const gooseLoginAgent: LoginAgentWithCli = {
  name: 'goose',
  // Goose sets AGENT=goose and GOOSE_TERMINAL=1 for the shell commands it runs.
  detect: env => env.GOOSE_TERMINAL === '1' || env.AGENT === 'goose',
  file,
  read,
  install,
  cli: {
    command: 'goose',
    present: 'command -v goose >/dev/null 2>&1',
    installScript: 'curl -fsSL --proto =https --tlsv1.2 https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | GOOSE_VERSION=v1.60.1 CONFIGURE=false bash >/dev/null 2>&1\ntest -x "$HOME/.local/bin/goose"',
    verifyScript: 'cd "$HOME" && goose run --no-session --quiet --text "Reply with the single word ok" 2>/dev/null',
    verifyOk: replyOk,
  },
};
