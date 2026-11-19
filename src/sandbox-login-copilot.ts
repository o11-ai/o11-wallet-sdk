import type { LocalLogin, LoginAgentDefinition } from './sandbox-login-agent.js';
import { envFile, envLines, npmCli, replyOk, secretReader, sessionCopyAllowed, sessionCopyRefused, type LoginAgentWithCli } from './sandbox-login-agent-cli.js';

/**
 * GitHub Copilot CLI (`copilot`). It takes COPILOT_GITHUB_TOKEN, then GH_TOKEN, GITHUB_TOKEN, then its own OAuth token
 * in the system keychain (service `copilot-cli`; ~/.copilot/config.json in plain text when there is no keychain), then
 * `gh auth token`. Only Copilot's own login is copied: COPILOT_GITHUB_TOKEN or the keychain entry. GH_TOKEN,
 * GITHUB_TOKEN and gh's token are general GitHub credentials, so they are not sent unless passed with
 * --copilot-key-file. The plain-text config.json is not read: its key names are undocumented.
 * A gho_ OAuth token neither expires nor rotates, but GitHub does not document sharing it, so the keychain login is
 * copied only with O11_LOGIN_COPY_SESSIONS=copilot. A token the person set in COPILOT_GITHUB_TOKEN is copied.
 * The sandbox gets the token in an env file that the o11 `copilot` wrapper in ~/.local/bin loads.
 */
const file = 'copilot.env';
const tokenShape = /^(gho_|ghu_|github_pat_)[A-Za-z0-9_]{20,250}$/;

function tokenLogin(token: string, source: string): LocalLogin {
  if (token.startsWith('ghp_')) throw new Error('Copilot CLI does not accept classic ghp_ tokens. Use `copilot login`, or a fine-grained token with the Copilot Requests permission.');
  if (!tokenShape.test(token)) throw new Error('The Copilot token has an unexpected format');
  // ghu_ GitHub App user tokens expire after hours; gho_ never; a fine-grained PAT lasts until the date it was given.
  return { agent: 'copilot', source, longLived: !token.startsWith('ghu_'), file, content: envLines({ COPILOT_GITHUB_TOKEN: token }), secrets: [token] };
}

async function read({ env }: Parameters<LoginAgentDefinition['read']>[0]): Promise<LocalLogin> {
  const fromEnv = env.COPILOT_GITHUB_TOKEN?.trim();
  if (fromEnv) return tokenLogin(fromEnv, 'COPILOT_GITHUB_TOKEN');
  const stored = await secretReader.read('copilot-cli');
  if (stored && sessionCopyAllowed(env, 'copilot')) return tokenLogin(stored, 'keychain');
  if (stored) throw sessionCopyRefused('copilot', '`copilot login` token', 'Set COPILOT_GITHUB_TOKEN or pass a fine-grained token with --copilot-key-file.');
  const general = ['GH_TOKEN', 'GITHUB_TOKEN'].filter(name => env[name]);
  throw new Error(`No Copilot CLI login to copy. Run \`copilot login\` here${general.length ? `; ${general.join(' and ')} ${general.length > 1 ? 'are' : 'is'} set but not sent, as a general GitHub credential (pass one with --copilot-key-file to use it)` : ''}.`);
}

export const copilotLoginAgent: LoginAgentWithCli = {
  name: 'copilot',
  // The Copilot CLI binary sets COPILOT_CLI_BINARY_VERSION in its own environment, which its shell commands inherit.
  detect: env => Boolean(env.COPILOT_CLI_BINARY_VERSION) || /^github-copilot/.test(env.AI_AGENT ?? ''),
  file,
  read,
  fromKey: key => tokenLogin(key, 'key-file'),
  install: `place "$1" "${envFile('copilot')}"`,
  cli: {
    ...npmCli('copilot', 'copilot', '@github/copilot@1.0.114'),
    // Copilot CLI has no status command; one short prompt is the cheapest signed-in check.
    verifyScript: 'cd "$HOME" && copilot -p "Reply with the single word ok" 2>/dev/null',
    verifyOk: replyOk,
  },
};
