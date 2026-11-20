import { join } from 'node:path';
import { proxyFingerprint } from './sandbox-login-proxy.js';
import { approvalDirectory, detachedApproval, plainOutput, readJson, record, text, tokenPattern, type LocalLogin, type LoginAgentDefinition } from './sandbox-login-agent.js';

/**
 * Codex. An API key is copied and keeps working on its own. A ChatGPT login is never copied: OpenAI rotates refresh
 * tokens, says not to share auth.json between machines, and a session whose access token alone was copied was
 * invalidated. The sandbox runs `codex login --device-auth` instead and the person enters a code once.
 */
const file = 'codex-auth.json';
const apiKeyAuth = (key: string) => `${JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: key })}\n`;

async function read({ home, env }: Parameters<LoginAgentDefinition['read']>[0]): Promise<LocalLogin> {
  const saved = await readJson(join(env.CODEX_HOME || join(home, '.codex'), 'auth.json'), 'Codex login');
  const apiKey = text(saved.OPENAI_API_KEY);
  if (saved.auth_mode === 'apikey' || apiKey && !saved.tokens) {
    if (!tokenPattern.test(apiKey)) throw new Error('The Codex login has no usable API key');
    return { agent: 'codex', source: 'api-key', longLived: true, file, content: apiKeyAuth(apiKey), secrets: [apiKey] };
  }
  // A ChatGPT login is never copied, not even its access token. On 2026-11-18 copying only the access token was followed
  // by the whole session being invalidated, signing this machine out (either OpenAI reacting to the second machine, or
  // `codex login` revoking the copied token when it started there; not proven which). The sandbox signs in on its own.
  if (record(saved.tokens).access_token) throw new Error('Codex here uses a ChatGPT sign-in, which cannot be shared with another computer. The sandbox signs in on its own once the person enters a code (--approve).');
  throw new Error('The Codex login has no API key or ChatGPT sign-in. Run `codex login` first.');
}

// o11's proxy is the "o11" model provider in the user-level config.toml (a project config can't set providers). Its key
// comes from O11_AI_KEY in the agent env file, which login shells and cron runs load. Any other
// login takes the provider and the key out again. The merge keeps the rest of config.toml.
const proxyMerge = `python3 -I -c 'import json,re,sys
p=json.load(open(sys.argv[1])).get("o11_proxy") if sys.argv[1] else None
try: t=open(sys.argv[2]).read()
except FileNotFoundError: t=""
out=[];top=True;skip=False
for l in t.splitlines():
  s=l.strip()
  if s.startswith("["): top=False;skip=s=="[model_providers.o11]"
  if skip or top and re.match(r"model_provider\\s*=",s) and (p or re.search(r"=\\s*\\x22o11\\x22",s)): continue
  out.append(l)
b="\\n".join(out).strip("\\n")
if p: b="model_provider = \\"o11\\"\\n"+b+"\\n\\n[model_providers.o11]\\nname = \\"o11\\"\\nbase_url = "+json.dumps(p["base_url"])+"\\nwire_api = \\"responses\\"\\nenv_key = \\"O11_AI_KEY\\""
open(sys.argv[3],"w").write(b.strip("\\n")+"\\n")' "$1" "$d/config.toml" "$d/config.toml.o11-merge"`;
const env = '"$HOME/.config/o11/agent-env/codex.env"';
const envLoad = `if [ -r ${env} ]; then set -a; . ${env}; set +a; fi # o11-agent-env`;
const install = ['e=' + env, 'if grep -q \'"o11_proxy"\' "$1"; then',
  '  for d in "$HOME/.codex" "$HOME/.local/share/o11/agents/codex"; do mkdir -p -m 700 -- "$d"; ' + proxyMerge + '; place "$d/config.toml.o11-merge" "$d/config.toml"; rm -f -- "$d/config.toml.o11-merge"; done',
  '  mkdir -p -m 700 -- "$(dirname -- "$e")"',
  // A new sandbox has no env file yet, and one holding only the key has nothing else to keep: grep exits 2 or 1 there.
  '  { grep -v "^O11_AI_KEY=" "$e" 2>/dev/null || true; python3 -I -c \'import json,sys;print("O11_AI_KEY="+json.load(open(sys.argv[1]))["o11_proxy"]["token"])\' "$1"; } >"$e.o11-merge"',
  '  place "$e.o11-merge" "$e"; rm -f -- "$e.o11-merge"',
  `  for r in "$HOME/.profile" "$HOME/.bashrc"; do grep -qs "# o11-agent-env" "$r" || printf '%s\\n' '${envLoad}' >>"$r"; done`,
  'else',
  '  for d in "$HOME/.codex" "$HOME/.local/share/o11/agents/codex"; do',
  '    if grep -qs "model_providers.o11]" "$d/config.toml"; then set -- "" "$1"; ' + proxyMerge + '; set -- "$2"; mv -f -- "$d/config.toml.o11-merge" "$d/config.toml"; fi',
  '    place "$1" "$d/auth.json"', '  done',
  '  if grep -qs "^O11_AI_KEY=" "$e"; then grep -v "^O11_AI_KEY=" "$e" >"$e.o11-merge"; mv -f -- "$e.o11-merge" "$e"; fi',
  'fi'].join('\n');

// A login the sandbox refreshes itself must live in one file: o11's codex wrapper (CODEX_HOME=agents/codex) then
// shares ~/.codex, so a refresh by one never leaves the other holding a spent refresh token.
// `codex login` clears the login it replaces, so the sandbox's own login is made in a separate CODEX_HOME and moved
// into ~/.codex once the person approves it.
const pending = '"$HOME/.local/share/o11/login-approval/codex/codex-home/auth.json"';
const refreshable = (path: string) => `python3 -I -c 'import json,os,sys;a=json.load(open(os.path.expanduser(sys.argv[1])));t=a.get("tokens") or {};sys.exit(0 if t.get("refresh_token") or (a.get("auth_mode")=="apikey" and a.get("OPENAI_API_KEY")) else 1)' ${path} 2>/dev/null`;
const check = [
  `if [ -s ${pending} ] && ${refreshable(pending)}; then mkdir -p -m 700 "$HOME/.codex"; chmod 600 ${pending}; mv -f -- ${pending} "$HOME/.codex/auth.json"; fi`,
  `if ${refreshable('"$HOME/.codex/auth.json"')}; then`,
  '  a="$HOME/.local/share/o11/agents/codex"',
  '  if [ ! -L "$a" ]; then [ -e "$a" ] && mv -- "$a" "$a.o11-replaced-$(date +%s)"; mkdir -p -- "$(dirname -- "$a")"; ln -s -- "$HOME/.codex" "$a"; fi',
  '  echo long-lived', 'fi'].join('\n');

const start = [detachedApproval('codex', 'c=$HOME/.local/bin/codex; [ -x $c ] || c=codex; h=$HOME/.local/share/o11/login-approval/codex/codex-home; mkdir -p -m 700 $h; exec env -u CODEX_ACCESS_TOKEN -u OPENAI_API_KEY CODEX_HOME=$h $c login --device-auth', 14),
  'for i in $(seq 1 30); do grep -qE "[A-Z0-9]{4}-[A-Z0-9]{4,}" "$d/out" 2>/dev/null && break; [ -f "$d/exit" ] && break; sleep 1; done',
  `${plainOutput} "$d/out" | python3 -I -c 'import json,re,sys;t=sys.stdin.read();u=re.search(r"https://auth\\.openai\\.com/\\S+",t);c=re.search(r"\\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\\b",t);l=[x.strip() for x in t.splitlines() if x.strip()];print(json.dumps({"url":u.group(0),"code":c.group(0)} if u and c else {"state":"failed","detail":(l[-1] if l else "codex login did not start")[:200]}))'`,
].join('\n');

// Only an approval this sandbox started counts as done: its login waiting in CODEX_HOME, or its `codex login` having
// exited cleanly. With --renew, the login the sandbox already held is not a finished approval.
const finish = [`d=${approvalDirectory('codex')}`, 'rm -f -- "$1"',
  `[ -f "$d/pid" ] || [ -f "$d/out" ] || { echo '{"state":"expired"}'; exit 0; }`,
  `if { [ -s ${pending} ] || [ "$(cat "$d/exit" 2>/dev/null)" = 0 ]; } && [ "$(${check.replaceAll('\n', '\n  ')}\n)" = long-lived ]; then [ -f "$d/pid" ] && kill -- "-$(cat "$d/pid")" 2>/dev/null; rm -rf -- "$d"; echo '{"state":"done"}'; exit 0; fi`,
  'if [ -f "$d/pid" ] && kill -0 "$(cat "$d/pid")" 2>/dev/null; then echo \'{"state":"waiting"}\'; exit 0; fi',
  `[ -f "$d/out" ] || { echo '{"state":"expired"}'; exit 0; }`,
  `${plainOutput} "$d/out" | python3 -I -c 'import json,sys;l=[x.strip() for x in sys.stdin.read().splitlines() if x.strip()];print(json.dumps({"state":"failed","detail":(l[-1] if l else "codex login ended")[:200]}))'`,
  'rm -rf -- "$d"'].join('\n');

export const codexLoginAgent: LoginAgentDefinition = {
  name: 'codex',
  detect: env => Boolean(env.CODEX_THREAD_ID || env.CODEX_SESSION_ID),
  file,
  read,
  fromKey: key => ({ agent: 'codex', source: 'key-file', longLived: true, file, content: apiKeyAuth(key), secrets: [key] }),
  proxy: access => ({ agent: 'codex', source: 'o11-proxy', longLived: true, fingerprint: proxyFingerprint(access), file,
    content: `${JSON.stringify({ o11_proxy: { base_url: access.baseUrl, token: access.placeholder } })}\n`, secrets: [access.placeholder] }),
  install,
  check,
  approval: { start, finish, needsCode: false },
};
