import { readFile, stat } from 'node:fs/promises';
import { proxyFingerprint } from './sandbox-login-proxy.js';
import { approvalDirectory, detachedApproval, markerScript, plainOutput, tokenPattern, type LocalLogin, type LoginAgentDefinition } from './sandbox-login-agent.js';

/**
 * Claude Code. A one-year token (`claude setup-token`: --claude-token-file or CLAUDE_CODE_OAUTH_TOKEN) or an API key
 * (ANTHROPIC_API_KEY) is copied. The person's live sign-in (~/.claude/.credentials.json) is never copied: its tokens
 * rotate and belong to this machine. Neither is a CLAUDE_CODE_OAUTH_TOKEN an SDK host (the Claude app, the Agent SDK)
 * passes down: that is the host's live, refreshing sign-in. Otherwise the sandbox runs `claude setup-token` itself and
 * the person approves it once in their own browser, which gives the sandbox its own one-year token. With a login
 * stored by `o11 login claude`, the sandbox goes through o11's proxy instead (`proxy`); a later copy removes that.
 */
const file = 'claude-settings.json';
const settings = (env: Record<string, string>) => `${JSON.stringify({ env })}\n`;
/** An SDK host marks the sign-in it hands down with these. */
const hostSignIn = (env: Record<string, string | undefined>) => Boolean(env.CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH || env.CLAUDE_CODE_OAUTH_SCOPES);

async function read({ env, claudeTokenFile }: Parameters<LoginAgentDefinition['read']>[0]): Promise<LocalLogin> {
  let token = '', source = '';
  const fromHost = Boolean(env.CLAUDE_CODE_OAUTH_TOKEN) && hostSignIn(env);
  if (claudeTokenFile) {
    if ((await stat(claudeTokenFile)).size > 8192) throw new Error('The Claude token file must be at most 8 KiB');
    token = (await readFile(claudeTokenFile, 'utf8')).trim(); source = 'token-file';
  } else if (env.CLAUDE_CODE_OAUTH_TOKEN && !fromHost) {
    token = env.CLAUDE_CODE_OAUTH_TOKEN.trim(); source = 'CLAUDE_CODE_OAUTH_TOKEN';
  } else if (env.ANTHROPIC_API_KEY && tokenPattern.test(env.ANTHROPIC_API_KEY.trim())) {
    const key = env.ANTHROPIC_API_KEY.trim();
    return { agent: 'claude', source: 'ANTHROPIC_API_KEY', longLived: true, file, content: settings({ ANTHROPIC_API_KEY: key }), secrets: [key] };
  }
  const instead = 'Pass a `claude setup-token` token with --claude-token-file, or let the sandbox sign in itself with --approve.';
  if (!token && fromHost) throw new Error(`Not copying CLAUDE_CODE_OAUTH_TOKEN: it is the live sign-in of the app running this command, not a one-year token. ${instead}`);
  // The live sign-in in ~/.claude/.credentials.json is never copied: its tokens belong to this machine's session.
  if (!token) throw new Error(`No Claude Code token to copy from here. ${instead}`);
  if (!tokenPattern.test(token)) throw new Error('The Claude Code token has an unexpected format');
  return { agent: 'claude', source, longLived: true, file, content: settings({ CLAUDE_CODE_OAUTH_TOKEN: token }), secrets: [token] };
}

// Merges the staged env into settings.json for the person's own Claude (~/.claude) and o11's agent wrapper.
const install = [
  'for d in "$HOME/.claude" "$HOME/.local/share/o11/agents/claude"; do',
  '  if [ -s "$d/settings.json" ]; then',
  '    command -v python3 >/dev/null 2>&1 || { printf \'%s\\n\' "o11_login_settings_merge_unavailable:$d" >&2; exit 81; }',
  '    python3 -I -c \'import json,sys;t=json.load(open(sys.argv[1]));c=json.load(open(sys.argv[2]));e=c.setdefault("env",{});[e.pop(k,None) for k in ("CLAUDE_CODE_OAUTH_TOKEN","ANTHROPIC_API_KEY")];"/v1/ai-proxy/" in e.get("ANTHROPIC_BASE_URL","") and e.pop("ANTHROPIC_BASE_URL");e.update(t["env"]);open(sys.argv[3],"w").write(json.dumps(c))\' "$1" "$d/settings.json" "$1.merged"',
  '    place "$1.merged" "$d/settings.json"; rm -f -- "$1.merged"',
  '  else place "$1" "$d/settings.json"; fi',
  'done'].join('\n');

const binary = 'c=$HOME/.local/bin/claude; [ -x $c ] || c=claude';
const start = [detachedApproval('claude', `${binary}; BROWSER=true exec $c setup-token`, 9),
  'for i in $(seq 1 40); do grep -q "oauth/authorize" "$d/out" 2>/dev/null && break; [ -f "$d/exit" ] && break; sleep 1; done',
  `${plainOutput} "$d/out" | python3 -I -c 'import json,re,sys;t=sys.stdin.read();m=re.search(r"https://\\S+/oauth/authorize\\?\\S+",t);l=[x.strip() for x in t.splitlines() if x.strip()];print(json.dumps({"url":m.group(0)} if m else {"state":"failed","detail":(l[-1] if l else "claude setup-token did not start")[:200]}))'`,
].join('\n');

const extract = `python3 -I -c 'import json,os,re,sys
t=sys.stdin.read();m=re.search(r"sk-ant-oat01-[A-Za-z0-9_-]{60,}",t)
if m:
  os.umask(0o77);open(sys.argv[1],"w").write(json.dumps({"env":{"CLAUDE_CODE_OAUTH_TOKEN":m.group(0)}}));print("ok")
else:
  l=[x.strip() for x in t.splitlines() if x.strip() and "sk-ant" not in x];print(json.dumps({"state":"failed","detail":(l[-1] if l else "no token")[:200]}))' "$ap/settings.json"`;
const yearFromNow = () => new Date(Date.now() + 365 * 86_400_000).toISOString();

// Installs the token in "$ap/settings.json" with every step checked. Only then is the sign-in recorded and the token
// removed; on failure it stays (0600, in the approval folder) and the next finish retries the install.
const installToken = () => ['( set -e; set -- "$ap/settings.json"', `  ${install.replaceAll('\n', '\n  ')}`, ') >/dev/null 2>"$ap/install.err"',
  'if [ "$?" = 0 ]; then',
  `  ${markerScript('claude', { source: 'sandbox-setup-token', longLived: true, expiresAt: yearFromNow() })}`,
  '  rm -rf -- "$ap"; echo \'{"state":"done"}\'',
  'else',
  `  python3 -I -c 'import json,sys;l=[x.strip() for x in open(sys.argv[1],errors="replace").read().splitlines() if x.strip() and "sk-ant" not in x];print(json.dumps({"state":"failed","kept":True,"detail":(l[-1] if l else "settings.json could not be updated")[:160]}))' "$ap/install.err"`,
  'fi'].join('\n');

const finish = () => [`ap=${approvalDirectory('claude')}`, '# install and place reuse $d, so the approval folder is $ap.',
  // Without python3 the token could not be read back, so the code is not typed in and stays usable.
  'command -v python3 >/dev/null 2>&1 || { rm -f -- "$1"; echo \'{"state":"failed","fatal":true,"detail":"python3 is not installed in the sandbox"}\'; exit 0; }',
  // A token an earlier run received but could not install.
  'if [ -s "$ap/settings.json" ]; then rm -f -- "$1"', installToken(), 'exit 0; fi',
  'if ! { [ -f "$ap/pid" ] && kill -0 "$(cat "$ap/pid")" 2>/dev/null; }; then rm -f -- "$1"; echo \'{"state":"expired"}\'; exit 0; fi',
  'code="$(tr -d \'\\r\\n \' <"$1" 2>/dev/null)"; rm -f -- "$1"',
  '[ -n "$code" ] || { echo \'{"state":"waiting"}\'; exit 0; }',
  // Claude Code reads a burst of text as a paste, Enter included, so Enter goes on its own a moment later.
  'printf \'%s\' "$code" >"$ap/in"; sleep 1; printf \'\\r\' >"$ap/in"',
  'for i in $(seq 1 60); do grep -q "sk-ant-oat01-" "$ap/out" 2>/dev/null && break; grep -qiE "error|retry|invalid" "$ap/out" 2>/dev/null && break; [ -f "$ap/exit" ] && break; sleep 1; done; sleep 1',
  `r="$(${plainOutput} "$ap/out" | ${extract})"`,
  'kill -- "-$(cat "$ap/pid")" 2>/dev/null || true',
  '[ "$r" = ok ] || { rm -rf -- "$ap"; printf \'%s\\n\' "$r"; exit 0; }',
  // The token is in hand: the approval's own files go, the token stays until it is installed.
  'rm -f -- "$ap/pid" "$ap/in" "$ap/out" "$ap/exit"',
  installToken()].join('\n');

export const claudeLoginAgent: LoginAgentDefinition = {
  name: 'claude',
  detect: env => env.CLAUDECODE === '1' || Boolean(env.CLAUDE_CODE_ENTRYPOINT),
  file,
  read,
  fromKey: key => ({ agent: 'claude', source: 'key-file', longLived: true, file, content: settings({ ANTHROPIC_API_KEY: key }), secrets: [key] }),
  // The stand-in key goes where a subscription token goes, so Claude Code keeps its subscription behaviour (models,
  // OAuth headers); it sends it to ANTHROPIC_BASE_URL, where the proxy swaps in the login.
  proxy: access => ({ agent: 'claude', source: 'o11-proxy', longLived: true, fingerprint: proxyFingerprint(access), file,
    content: settings({ ANTHROPIC_BASE_URL: access.baseUrl, CLAUDE_CODE_OAUTH_TOKEN: access.placeholder }), secrets: [access.placeholder] }),
  install,
  get approval() { return { start, finish: finish(), needsCode: true }; },
};
