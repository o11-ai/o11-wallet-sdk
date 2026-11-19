import { join } from 'node:path';
import { record, text, type LocalLogin, type LoginAgentDefinition } from './sandbox-login-agent.js';
import { minimumLifetimeMs, npmGlobalCli, readSmall, sessionCopyAllowed, type LoginAgentWithCli } from './sandbox-login-agent-cli.js';

/**
 * OpenCode. Logins are $XDG_DATA_HOME/opencode/auth.json (default ~/.local/share/opencode/auth.json), one entry per
 * provider: { type: 'api', key } | { type: 'oauth', refresh, access, expires } | { type: 'wellknown', key, token },
 * or the same JSON in OPENCODE_AUTH_CONTENT. Each entry is judged on its own:
 * - API keys and well-known tokens are copied and last.
 * - GitHub Copilot OAuth is copied whole: its refresh value is a GitHub OAuth token that GitHub neither expires nor
 *   rotates, and the short Copilot token is minted from it.
 * - Claude (anthropic) and ChatGPT (openai) OAuth are never copied, whatever the opt-in says: they are the person's
 *   live Claude and ChatGPT sessions, and copying one, even only its access token, signed a real Codex login out.
 * - Other OAuth logins rotate refresh tokens, so only the current access token is copied, with an empty refresh token,
 *   and only when it has 10 minutes left.
 * Other OAuth entries are copied only with O11_LOGIN_COPY_SESSIONS=opencode; by default only API keys and well-known tokens go.
 * OpenCode 1.x reads auth.json directly; the 2.x line imports it into its database once, on first run, which is why the
 * login is placed before the CLI is installed or run.
 */
const file = 'opencode-auth.json';
const lasting = new Set(['github-copilot', 'github-copilot-enterprise']);
/** The person's own Claude and ChatGPT sign-ins, never copied. */
const liveSession = /^(anthropic|openai)(-|$)/;

export function filterOpencodeAuth(all: Record<string, unknown>, now = Date.now(), copySessions = false) {
  const kept: Record<string, unknown> = {}, secrets: string[] = [], shortLived: string[] = [], skipped: string[] = [];
  let expiresAt: number | undefined;
  for (const [provider, raw] of Object.entries(all)) {
    const entry = record(raw);
    if (entry.type === 'api' && text(entry.key)) { kept[provider] = { type: 'api', key: entry.key, ...(entry.metadata ? { metadata: entry.metadata } : {}) }; secrets.push(text(entry.key)); }
    else if (entry.type === 'wellknown' && text(entry.token)) { kept[provider] = { type: 'wellknown', key: text(entry.key), token: entry.token }; secrets.push(text(entry.token)); }
    else if (entry.type === 'oauth' && copySessions && !liveSession.test(provider) && text(entry.access) && typeof entry.expires === 'number') {
      const extra = { ...(entry.accountId ? { accountId: entry.accountId } : {}), ...(entry.enterpriseUrl ? { enterpriseUrl: entry.enterpriseUrl } : {}) };
      if (lasting.has(provider) && text(entry.refresh)) {
        kept[provider] = { type: 'oauth', refresh: entry.refresh, access: entry.access, expires: entry.expires, ...extra };
        secrets.push(text(entry.refresh), text(entry.access));
      } else if (entry.expires > now + minimumLifetimeMs) {
        kept[provider] = { type: 'oauth', refresh: '', access: entry.access, expires: entry.expires, ...extra };
        secrets.push(text(entry.access)); shortLived.push(provider);
        expiresAt = Math.min(expiresAt ?? entry.expires, entry.expires);
      } else skipped.push(provider);
    } else skipped.push(provider);
  }
  return { kept, secrets, shortLived, skipped, expiresAt };
}

async function read({ home, env }: Parameters<LoginAgentDefinition['read']>[0]): Promise<LocalLogin> {
  const body = env.OPENCODE_AUTH_CONTENT || await readSmall(join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'opencode', 'auth.json'));
  let parsed: Record<string, unknown> = {};
  try { parsed = record(body ? JSON.parse(body) : {}); } catch { throw new Error('The OpenCode login file is not valid JSON'); }
  const { kept, secrets, shortLived, skipped, expiresAt } = filterOpencodeAuth(parsed, Date.now(), sessionCopyAllowed(env, 'opencode'));
  if (!Object.keys(kept).length)
    throw new Error(skipped.length ? `No OpenCode login can be copied: ${skipped.join(', ')} are browser sign-ins (Claude and ChatGPT ones are never copied; others only with O11_LOGIN_COPY_SESSIONS=opencode) or expire within 10 minutes. Add an API key with \`opencode auth login\`.` : 'No OpenCode login to copy. Run `opencode auth login` here.');
  // The login lasts only if nothing in it depends on a copied access token.
  return { agent: 'opencode', source: shortLived.length ? `auth-json (access token only: ${shortLived.join(', ')})` : 'auth-json',
    longLived: !shortLived.length, ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}), file,
    content: `${JSON.stringify(kept)}\n`, secrets: secrets.filter(Boolean) };
}

// Merge by provider into an existing auth.json, so providers signed in on the sandbox itself stay.
const install = [
  'f="$HOME/.local/share/opencode/auth.json"',
  'if [ -s "$f" ]; then',
  '  command -v python3 >/dev/null 2>&1 || { printf \'%s\\n\' o11_login_merge_unavailable:opencode >&2; exit 81; }',
  '  python3 -I -c \'import json,os,sys;os.umask(0o77);a=json.load(open(sys.argv[2]));a.update(json.load(open(sys.argv[1])));open(sys.argv[3],"w").write(json.dumps(a))\' "$1" "$f" "$1.merged"',
  '  place "$1.merged" "$f"; rm -f -- "$1.merged"',
  'else place "$1" "$f"; fi'].join('\n');

export const opencodeLoginAgent: LoginAgentWithCli = {
  name: 'opencode',
  // OpenCode sets OPENCODE=1 (and OPENCODE_PID) in its own environment, which its tools inherit.
  detect: env => env.OPENCODE === '1',
  file,
  read,
  install,
  cli: {
    ...npmGlobalCli('opencode', 'opencode-ai@1.19.6'),
    // Lists stored providers without a model call; a prompt would need the person's default model configured.
    verifyScript: 'opencode auth list 2>&1',
    verifyOk: stdout => /\b[1-9]\d*\s+credentials?\b/i.test(stdout),
  },
};
