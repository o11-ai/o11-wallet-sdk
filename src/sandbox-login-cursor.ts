import { join } from 'node:path';
import { approvalDirectory, detachedApproval, jwtExpiry, plainOutput, text, tokenPattern, type LocalLogin, type LoginAgentDefinition } from './sandbox-login-agent.js';
import { minimumLifetimeMs, readJsonObject, secretReader, sessionCopyAllowed, sessionCopyRefused, type LoginAgentWithCli } from './sandbox-login-agent-cli.js';

/**
 * Cursor CLI (cursor-agent, also `agent`). The login is $XDG_CONFIG_HOME/cursor/auth.json on Linux
 * ({ accessToken, refreshToken, apiKey? }); on macOS ~/.cursor/auth.json or the keychain (cursor-access-token,
 * cursor-refresh-token, cursor-api-key; account cursor-user). A browser login is one session JWT the CLI never
 * exchanges (it renews only through an API key). Cursor does not document using one session on two machines, so it is
 * copied only with O11_LOGIN_COPY_SESSIONS=cursor. Otherwise:
 * - an API key (CURSOR_API_KEY, a stored apiKey, or --cursor-key-file) is copied; the sandbox signs in with it once and
 *   mints its own sessions after that;
 * - or, with --approve, the sandbox runs its own `cursor-agent login` and the person approves the link once.
 */
const file = 'cursor-auth.json';
const auth = '"$HOME/.config/cursor/auth.json"';
const apiKeyLogin = (key: string, source: string): LocalLogin =>
  ({ agent: 'cursor', source, longLived: true, file, content: `${JSON.stringify({ apiKey: key })}\n`, secrets: [key] });

async function read({ home, env }: Parameters<LoginAgentDefinition['read']>[0]): Promise<LocalLogin> {
  const fromEnv = env.CURSOR_API_KEY?.trim();
  if (fromEnv) {
    if (!tokenPattern.test(fromEnv)) throw new Error('CURSOR_API_KEY has an unexpected format');
    return apiKeyLogin(fromEnv, 'CURSOR_API_KEY');
  }
  const mac = process.platform === 'darwin';
  const saved = await readJsonObject(mac ? join(home, '.cursor', 'auth.json') : join(env.XDG_CONFIG_HOME || join(home, '.config'), 'cursor', 'auth.json')) ?? {};
  let access = text(saved.accessToken), refresh = text(saved.refreshToken), apiKey = text(saved.apiKey);
  if (!access && mac) {
    [access, refresh, apiKey] = await Promise.all(['access-token', 'refresh-token', 'api-key']
      .map(async name => await secretReader.read(`cursor-${name}`, 'cursor-user') ?? ''));
  }
  if (tokenPattern.test(apiKey)) return apiKeyLogin(apiKey, 'stored-api-key');
  if (!tokenPattern.test(access) || !tokenPattern.test(refresh)) throw new Error('No Cursor login to copy. Pass an API key with --cursor-key-file, or use --approve to sign the sandbox in itself.');
  if (!sessionCopyAllowed(env, 'cursor')) throw sessionCopyRefused('cursor', 'browser session', 'Pass an API key with --cursor-key-file, or use --approve to sign the sandbox in itself.');
  const expiresAt = jwtExpiry(access);
  if (expiresAt && Date.parse(expiresAt) < Date.now() + minimumLifetimeMs) throw new Error('The Cursor session expires within 10 minutes. Run `cursor-agent login` here, then retry.');
  return { agent: 'cursor', source: 'session-token', longLived: false, ...(expiresAt ? { expiresAt } : {}), file,
    content: `${JSON.stringify({ accessToken: access, refreshToken: refresh })}\n`, secrets: [access, refresh] };
}

// An API-key-only auth.json is not signed in yet: one status call with the key saves { accessToken, refreshToken, apiKey }.
const bootstrap = [`if command -v cursor-agent >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then`,
  `  k="$(python3 -I -c 'import json,sys;a=json.load(open(sys.argv[1]));print("" if a.get("accessToken") else a.get("apiKey",""))' ${auth})"`,
  '  if [ -n "$k" ]; then CURSOR_API_KEY="$k" cursor-agent status --format json >/dev/null 2>&1 || true; fi', 'fi'].join('\n');

const install = [`place "$1" ${auth}`, 'export PATH="$HOME/.local/bin:$PATH"', bootstrap].join('\n');

// The sandbox's own login lasts when it holds an API key, or a session of its own (from the approval below).
const check = `python3 -I -c 'import json,os,sys;a=json.load(open(os.path.expanduser("~/.config/cursor/auth.json")));o=os.path.expanduser("~/.local/share/o11/logins/cursor.json");m=json.load(open(o)) if os.path.exists(o) else {};sys.exit(0 if a.get("apiKey") or (m.get("source")=="sandbox-login" and a.get("accessToken")) else 1)' 2>/dev/null && echo long-lived || true`;

const binary = 'c=$HOME/.local/bin/cursor-agent; [ -x $c ] || c=cursor-agent';
const start = [detachedApproval('cursor', `${binary}; NO_OPEN_BROWSER=1 exec $c login`, 9),
  'for i in $(seq 1 40); do grep -q "loginDeepControl" "$d/out" 2>/dev/null && break; [ -f "$d/exit" ] && break; sleep 1; done',
  `${plainOutput} "$d/out" | python3 -I -c 'import json,re,sys;t=sys.stdin.read();m=re.search(r"https://\\S+/loginDeepControl\\?\\S+",t);l=[x.strip() for x in t.splitlines() if x.strip()];print(json.dumps({"url":m.group(0)} if m else {"state":"failed","detail":(l[-1] if l else "cursor-agent login did not start")[:200]}))'`,
].join('\n');

// cursor-agent login polls until the person approves, then saves auth.json itself and exits. Only a session saved by
// this approval counts: auth.json newer than the approval's start, and its login finished cleanly or still running.
// A copied session or an API key signed in some other way is never recorded as the sandbox's own. The record keeps its expiry.
const authenticated = 'cursor-agent status --format json 2>/dev/null | grep -q \'"isAuthenticated": *true\'';
const finish = [`d=${approvalDirectory('cursor')}`, 'rm -f -- "$1"', 'export PATH="$HOME/.local/bin:$PATH"', 'ok=""',
  'if [ -f "$d/pid" ] && kill -0 "$(cat "$d/pid")" 2>/dev/null; then',
  `  if [ ${auth} -nt "$d/pid" ] && ${authenticated}; then kill -- "-$(cat "$d/pid")" 2>/dev/null; ok=1; else echo '{"state":"waiting"}'; exit 0; fi`,
  `elif [ ! -f "$d/out" ]; then echo '{"state":"expired"}'; exit 0`,
  `elif [ "$(cat "$d/exit" 2>/dev/null)" = 0 ] && [ ${auth} -nt "$d/pid" ] && ${authenticated}; then ok=1; fi`,
  'if [ -n "$ok" ]; then',
  `  if python3 -I -c 'import base64,datetime,json,os;a=json.load(open(os.path.expanduser("~/.config/cursor/auth.json")));p=a["accessToken"].split(".")[1];e=json.loads(base64.urlsafe_b64decode(p+"=="))["exp"];o=os.path.expanduser("~/.local/share/o11/logins");os.makedirs(o,0o700,exist_ok=True);json.dump({"source":"sandbox-login","longLived":True,"expiresAt":datetime.datetime.fromtimestamp(e,datetime.timezone.utc).isoformat()},open(o+"/cursor.json","w"))' 2>/dev/null; then`,
  '    rm -rf -- "$d"; echo \'{"state":"done"}\'; exit 0', '  fi',
  '  rm -rf -- "$d"; echo \'{"state":"failed","detail":"cursor-agent saved a login without a session token"}\'; exit 0', 'fi',
  `${plainOutput} "$d/out" | python3 -I -c 'import json,sys;l=[x.strip() for x in sys.stdin.read().splitlines() if x.strip()];print(json.dumps({"state":"failed","detail":(l[-1] if l else "cursor-agent login ended")[:200]}))'`,
  'rm -rf -- "$d"'].join('\n');

export const cursorLoginAgent: LoginAgentWithCli = {
  name: 'cursor',
  // Cursor sets CURSOR_AGENT=1 for every shell command its agent runs, in the CLI and in the editor.
  detect: env => env.CURSOR_AGENT === '1',
  file,
  read,
  fromKey: key => apiKeyLogin(key, 'key-file'),
  install,
  check,
  approval: { start, finish, needsCode: false },
  cli: {
    command: 'cursor-agent',
    present: 'command -v cursor-agent >/dev/null 2>&1',
    // Cursor's installer fetches its current build (the version is baked into the script); Cursor publishes no checksum.
    installScript: 'curl -fsS --proto =https --tlsv1.2 https://cursor.com/install | bash >/dev/null 2>&1\ntest -x "$HOME/.local/bin/cursor-agent"',
    setupScript: bootstrap,
    verifyScript: 'cursor-agent status --format json',
    verifyOk(stdout) {
      try {
        const status: unknown = JSON.parse(stdout.slice(stdout.indexOf('{')));
        return !!status && typeof status === 'object' && Reflect.get(status, 'isAuthenticated') === true && !!Reflect.get(status, 'userInfo');
      } catch { return false; }
    },
  },
};
