import type { LocalLogin, LoginAgentDefinition } from './sandbox-login-agent.js';
import { envFile, envLines, envValuePattern, npmCli, replyOk, type LoginAgentWithCli } from './sandbox-login-agent-cli.js';

/**
 * Amp. `amp login` keeps an OAuth session in ~/.local/share/amp (secrets.json and a saved-accounts store) that Amp
 * itself calls short-lived; its format is not documented, so it is not copied. AMP_API_KEY, an access token from
 * ampcode.com/settings, lasts and overrides stored logins, so that is what the sandbox gets: AMP_API_KEY from this
 * process or --amp-key-file, in an env file the o11 `amp` wrapper in ~/.local/bin loads.
 */
const file = 'amp.env';
function keyLogin(key: string, source: string): LocalLogin {
  if (!envValuePattern.test(key)) throw new Error('The Amp access token has an unexpected format');
  return { agent: 'amp', source, longLived: true, file, content: envLines({ AMP_API_KEY: key }), secrets: [key] };
}

async function read({ env }: Parameters<LoginAgentDefinition['read']>[0]): Promise<LocalLogin> {
  const key = env.AMP_API_KEY?.trim();
  if (key) return keyLogin(key, 'AMP_API_KEY');
  throw new Error('No Amp access token to copy. Create one at ampcode.com/settings and pass it with --amp-key-file (or set AMP_API_KEY).');
}

export const ampLoginAgent: LoginAgentWithCli = {
  name: 'amp',
  // Amp's tool environment carries the current thread ID (name read from the Amp CLI binary; Amp does not document it).
  detect: env => Boolean(env.AMP_CURRENT_THREAD_ID),
  file,
  read,
  fromKey: key => keyLogin(key, 'key-file'),
  install: `place "$1" "${envFile('amp')}"`,
  cli: {
    ...npmCli('amp', 'amp', '@sourcegraph/amp@0.0.1795017641-g2e763e'),
    verifyScript: 'cd "$HOME" && amp -x "Reply with the single word ok" 2>/dev/null',
    verifyOk: replyOk,
  },
};
