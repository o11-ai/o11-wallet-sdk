import { join } from 'node:path';
import { record, text, tokenPattern, type LocalLogin, type LoginAgentDefinition } from './sandbox-login-agent.js';
import { envLines, envValuePattern, mergeJsonScript, npmGlobalCli, sessionCopyAllowed, sessionCopyRefused, readJsonObject, readSmall, replyOk, type LoginAgentWithCli } from './sandbox-login-agent-cli.js';

/**
 * Gemini CLI. "Sign in with Google" is ~/.gemini/oauth_creds.json (google-auth-library credentials: access_token,
 * refresh_token, expiry_date; scopes cloud-platform, userinfo.email, userinfo.profile). Google does not rotate this
 * refresh token, so a copy would refresh on its own, but it is a broad Google credential and Google does not document
 * sharing it between machines: it is copied only with O11_LOGIN_COPY_SESSIONS=gemini. With GEMINI_FORCE_ENCRYPTED_FILE_STORAGE=true
 * the login is in the keychain or an encrypted file instead and is not copied; use an API key then.
 * An API key (GEMINI_API_KEY, ~/.gemini/.env, --gemini-key-file) goes to the sandbox's ~/.gemini/.env, which Gemini loads
 * itself (in trusted folders; folder trust is off by default).
 * GEMINI_CLI_HOME replaces the home folder, as in the CLI.
 */
const file = 'gemini-login.json';
const kinds = { oauth: 'oauth-personal', key: 'gemini-api-key' } as const;
const keyLogin = (key: string, source: string): LocalLogin => {
  if (!envValuePattern.test(key)) throw new Error('The Gemini API key has an unexpected format');
  return { agent: 'gemini', source, longLived: true, file, content: `${JSON.stringify({ kind: 'key', env: envLines({ GEMINI_API_KEY: key }) })}\n`, secrets: [key] };
};

async function read({ home, env }: Parameters<LoginAgentDefinition['read']>[0]): Promise<LocalLogin> {
  if (env.GEMINI_API_KEY?.trim()) return keyLogin(env.GEMINI_API_KEY.trim(), 'GEMINI_API_KEY');
  const dir = join(env.GEMINI_CLI_HOME || home, '.gemini');
  const settings = await readJsonObject(join(dir, 'settings.json')) ?? {};
  const selected = text(record(record(settings.security).auth).selectedType) || text(settings.selectedAuthType);
  const creds = await readJsonObject(join(dir, 'oauth_creds.json'));
  if (selected !== kinds.key && creds && sessionCopyAllowed(env, 'gemini')) {
    const refresh = text(creds.refresh_token), access = text(creds.access_token);
    if (!tokenPattern.test(refresh)) throw new Error('The Gemini login has no refresh token. Run `gemini` and sign in with Google again.');
    const oauth = Object.fromEntries(['access_token', 'refresh_token', 'expiry_date', 'token_type', 'scope', 'id_token']
      .filter(key => creds[key] !== undefined).map(key => [key, creds[key]]));
    return { agent: 'gemini', source: 'google-oauth', longLived: true, file,
      content: `${JSON.stringify({ kind: 'oauth', oauth })}\n`, secrets: [refresh, access, text(creds.id_token)].filter(Boolean) };
  }
  const dotenv = (await readSmall(join(dir, '.env'), 64 * 1024))?.match(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*["']?([^"'\s#]+)/m)?.[1];
  if (dotenv) return keyLogin(dotenv, 'gemini-dotenv');
  if (creds) throw sessionCopyRefused('gemini', 'Google sign-in', 'Pass a Gemini API key with --gemini-key-file.');
  if (env.GEMINI_FORCE_ENCRYPTED_FILE_STORAGE === 'true') throw new Error('This Gemini login is in encrypted storage and cannot be copied. Pass an API key with --gemini-key-file.');
  throw new Error('No Gemini login to copy. Run `gemini` and sign in with Google, or pass an API key with --gemini-key-file.');
}

// The staged JSON says which kind it is; python3 writes the right file. The settings change holds no secret.
const install = [
  'command -v python3 >/dev/null 2>&1 || { printf \'%s\\n\' o11_login_python_unavailable:gemini >&2; exit 81; }',
  'kind="$(python3 -I -c \'import json,sys;print(json.load(open(sys.argv[1]))["kind"])\' "$1")"',
  'if [ "$kind" = oauth ]; then',
  '  python3 -I -c \'import json,os,sys;os.umask(0o77);open(sys.argv[2],"w").write(json.dumps(json.load(open(sys.argv[1]))["oauth"]))\' "$1" "$1.creds"',
  '  place "$1.creds" "$HOME/.gemini/oauth_creds.json"; rm -f -- "$1.creds"',
  `${mergeJsonScript('$HOME/.gemini/settings.json', { security: { auth: { selectedType: kinds.oauth } } })}`,
  'else',
  // ~/.gemini/.env is Gemini's own env file; other lines in it stay.
  '  f="$HOME/.gemini/.env"; mkdir -p -m 700 -- "$HOME/.gemini"; [ -f "$f" ] || : >"$f.o11-old"; [ -f "$f" ] && cp -- "$f" "$f.o11-old"',
  '  python3 -I -c \'import json,os,sys;os.umask(0o77);l=[x for x in open(sys.argv[2]).read().splitlines() if not x.lstrip().removeprefix("export ").startswith("GEMINI_API_KEY")];open(sys.argv[3],"w").write("\\n".join(l+[json.load(open(sys.argv[1]))["env"].strip()])+"\\n")\' "$1" "$f.o11-old" "$1.env"',
  '  rm -f -- "$f.o11-old"; place "$1.env" "$f"; rm -f -- "$1.env"',
  `${mergeJsonScript('$HOME/.gemini/settings.json', { security: { auth: { selectedType: kinds.key } } })}`,
  'fi'].join('\n');

export const geminiLoginAgent: LoginAgentWithCli = {
  name: 'gemini',
  // Gemini CLI sets GEMINI_CLI=1 for the shell commands it runs.
  detect: env => env.GEMINI_CLI === '1',
  file,
  read,
  fromKey: key => keyLogin(key, 'key-file'),
  install,
  cli: {
    ...npmGlobalCli('gemini', '@google/gemini-cli@0.68.0'),
    // There is no status command; one short prompt is the cheapest signed-in check.
    verifyScript: 'cd "$HOME" && gemini -p "Reply with the single word ok" 2>/dev/null',
    verifyOk: replyOk,
  },
};
