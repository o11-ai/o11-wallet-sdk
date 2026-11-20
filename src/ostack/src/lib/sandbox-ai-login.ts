/**
 * The Claude or ChatGPT login o11 keeps for the person (the one `o11 login claude|codex` makes), made on their o11
 * sandbox instead of their computer, so a cloud chat with only the o11 `sandbox` tool can make it too. `start` runs the
 * agent's own login (`claude auth login --claudeai`, `codex login --device-auth`) detached in a pseudo-terminal, with
 * its own config folder at a fixed path, and prints the link; `finish` types Claude's pasted code (Codex needs none)
 * and waits for the login file. Then ai-login-save { provider, fromSandbox } has o11 read that file, keep the login
 * and delete the folder. Ported from the CLI's capture (tool-sdk ai-login-capture.ts) and the sandbox approval
 * (tool-sdk sandbox-login-agent.ts detachedApproval). Pure: no node: or Bun imports.
 */
export type AiLoginAgent = "claude" | "codex";

/** Where each login is made on the sandbox. o11 reads the login file from here, so it is a fixed absolute path. */
export const aiLoginDirectory = (agent: AiLoginAgent) => `/tmp/o11-ai-login/${agent}`;
const loginFile = { claude: ".credentials.json", codex: "auth.json" } as const;
/** The file the login leaves in its config folder (CLAUDE_CONFIG_DIR, CODEX_HOME). */
export const aiLoginFilePath = (agent: AiLoginAgent) => `${aiLoginDirectory(agent)}/config/${loginFile[agent]}`;

const MINUTES = { claude: 25, codex: 14 } as const;
const agentSpec = {
  claude: { bin: "claude", name: "Claude Code", env: "CLAUDE_CONFIG_DIR", args: "auth login --claudeai", ready: "oauth/authorize",
    // Never the sign-in of a Claude Code that runs this command.
    skip: "CLAUDECODE\\|CLAUDE_CODE_[A-Za-z0-9_]*\\|ANTHROPIC_[A-Za-z0-9_]*\\|CLAUDE_CONFIG_DIR" },
  codex: { bin: "codex", name: "Codex", env: "CODEX_HOME", args: "-c cli_auth_credentials_store=file login --device-auth", ready: "[A-Z0-9]{4}-[A-Z0-9]{4,}",
    skip: "CODEX_[A-Za-z0-9_]*\\|OPENAI_API_KEY" },
} as const;

/** Python that prints the login's terminal output as plain text (tool-sdk plainOutput). */
const plainOutput = `python3 -I -c 'import re,sys;t=open(sys.argv[1],errors="replace").read();t=re.sub(r"\\x1b\\][^\\x07\\x1b]*(\\x07|\\x1b\\\\)","",t);t=re.sub(r"\\x1b\\[(\\d*)C",lambda m:" "*int(m.group(1) or 1),t);print(re.sub(r"\\x1b\\[[0-9;?<>]*[A-Za-z]","",t))'`;
/** Python that prints {"state":"failed"} with the output's last line, never a line with a token in it. */
const failedLine = (fallback: string) => `python3 -I -c 'import json,sys;l=[x.strip() for x in sys.stdin.read().splitlines() if x.strip() and "sk-ant" not in x];print(json.dumps({"state":"failed","detail":(l[-1] if l else "${fallback}")[:200]}))'`;
const head = (agent: AiLoginAgent) => ["set -u", "umask 077", `d=${aiLoginDirectory(agent)}`, `f=${aiLoginFilePath(agent)}`,
  // Done only once the file parses and holds a refresh token, as the CLI capture checks, never on a partial write.
  `has() { python3 -I -c 'import json,sys;a=json.load(open(sys.argv[1]));t=a.get("claudeAiOauth") or a.get("tokens") or {};sys.exit(0 if t.get("refreshToken") or t.get("refresh_token") else 1)' "$f" 2>/dev/null; }`,
  'alive() { [ -f "$d/pid" ] && kill -0 "$(cat "$d/pid")" 2>/dev/null; }',
  'stop() { [ -f "$d/pid" ] && kill -- "-$(cat "$d/pid")" 2>/dev/null; rm -f -- "$d/pid"; }',
  `ok() { stop; echo '{"state":"done"}'; exit 0; }`];

/**
 * Starts the login, or reuses one still waiting so a link the person already has keeps working. Prints one JSON line:
 * {"url","code"?,"tell_person"}, {"state":"done"} when a finished login is waiting to be saved, or {"state":"failed","detail"}.
 */
export function aiLoginStartScript(agent: AiLoginAgent): string {
  const spec = agentSpec[agent];
  const tell = agent === "claude" ? '"Open this link, approve it, and send me the code it shows: "+u.group(0)'
    : '"Open "+u.group(0)+" and enter this code: "+c.group(0)+". Tell me when you\\x27re done."';
  const found = agent === "claude" ? 'u=re.search(r"https://\\S+/oauth/authorize\\?\\S+",t);c=True'
    : 'u=re.search(r"https://auth\\.openai\\.com/\\S+",t);c=re.search(r"\\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\\b",t)';
  const link = agent === "claude" ? '{"url":u.group(0),"tell_person":' + tell + "}" : '{"url":u.group(0),"code":c.group(0),"tell_person":' + tell + "}";
  const run = `stty cols 1000 rows 50; ${spec.env}=\\"$1/config\\" BROWSER=true exec \\"$2\\" ${spec.args}`;
  return [...head(agent),
    'fail() { printf \'{"state":"failed","detail":"%s"}\\n\' "$1"; exit 0; }',
    'has && { echo \'{"state":"done"}\'; exit 0; }',
    'for t in script setsid mkfifo python3; do command -v "$t" >/dev/null 2>&1 || fail "$t is not installed in the sandbox"; done',
    `c="$HOME/.local/bin/${spec.bin}"; [ -x "$c" ] || c="$(command -v ${spec.bin})" || fail "${spec.name} is not installed in the sandbox yet"`,
    // o11's agent wrapper sets its own config folder, which would put the login in the sandbox's agent instead.
    `case "$c" in */o11/agents/*) fail "${spec.name} is not installed in the sandbox yet";; esac`,
    `if alive && [ -z "$(find "$d/pid" -mmin +${MINUTES[agent]} 2>/dev/null)" ]; then :; else`,
    '  stop; rm -rf -- "$d"; mkdir -p -m 700 -- "$d/config"; mkfifo -m 600 "$d/in"',
    `  for v in $(env | sed -n 's/^\\(${spec.skip}\\)=.*/\\1/p'); do unset "$v"; done`,
    `  setsid sh -c 'exec 3<>"$1/in"; cd "$1/config"; script -qfec "${run}" /dev/null <&3 >"$1/out" 2>&1; echo $? >"$1/exit"' sh "$d" "$c" >/dev/null 2>&1 &`,
    '  echo $! >"$d/pid"',
    "fi",
    `i=0; while [ "$i" -lt 40 ]; do grep -qE "${spec.ready}" "$d/out" 2>/dev/null && break; [ -f "$d/exit" ] && break; sleep 1; i=$((i+1)); done`,
    `${plainOutput} "$d/out" | python3 -I -c 'import json,re,sys;t=sys.stdin.read();${found};l=[x.strip() for x in t.splitlines() if x.strip()];print(json.dumps(${link} if u and c else {"state":"failed","detail":(l[-1] if l else "${spec.bin} did not show a link")[:200]}))'`,
  ].join("\n");
}

/**
 * Finishes the login. Claude: types the code the person pasted (from OSTACK_LOGIN_CODE in the exec's env, checked here
 * before use), with Enter on its own a moment later, since Claude Code reads a burst of text as a paste. Only the first
 * finish of a login types it: one run again while the first still waits only waits too. Codex: waits for the person to
 * enter the code on OpenAI's page. Prints {"state":"done"|"waiting"|"expired"|"failed","detail"?}. Never a token.
 */
export function aiLoginFinishScript(agent: AiLoginAgent): string {
  const expired = `echo '{"state":"expired","detail":"That sign-in had expired. Run start_login again for a new link."}'; exit 0`;
  const last = `${plainOutput} "$d/out" 2>/dev/null | ${failedLine(`${agent} login ended`)}; stop; exit 0`;
  if (agent === "codex") return [...head(agent), 'has && ok', `[ -f "$d/out" ] || { ${expired}; }`,
    'i=0; while [ "$i" -lt 60 ]; do has && ok; alive || break; sleep 1; i=$((i+1)); done',
    'sleep 1; has && ok',
    `alive && { echo '{"state":"waiting","detail":"The code has not been entered yet. Run finish_login again once the person says they are done."}'; exit 0; }`,
    last].join("\n");
  return [...head(agent), 'code="${OSTACK_LOGIN_CODE:-}"', 'has && ok',
    'case "$code" in ""|*[!A-Za-z0-9._~#-]*) echo \'{"state":"failed","detail":"That code has an unexpected format. Copy the whole code the page shows."}\'; exit 0;; esac',
    `alive || { ${expired}; }`,
    // The marker is created only if absent (noclobber) and holds where the output stood before the code went in.
    'n="$(wc -c <"$d/out")"',
    'if (set -C; echo "$n" >"$d/typed") 2>/dev/null; then',
    "  printf '%s' \"$code\" >\"$d/in\"; sleep 1; printf '\\r' >\"$d/in\"",
    'else n="$(cat "$d/typed" 2>/dev/null)"; [ -n "$n" ] || n="$(wc -c <"$d/out")"; fi',
    'i=0; while [ "$i" -lt 90 ]; do has && break; tail -c +"$((n + 1))" "$d/out" | grep -qiE "error|invalid|failed" && break; [ -f "$d/exit" ] && break; sleep 1; i=$((i+1)); done',
    'sleep 1; has && ok',
    last].join("\n");
}

/** Stops the login and deletes its folder. o11 runs it after reading the file, whatever happened. */
export const aiLoginCleanupScript = (agent: AiLoginAgent) =>
  [`d=${aiLoginDirectory(agent)}`, '[ -f "$d/pid" ] && kill -- "-$(cat "$d/pid")" 2>/dev/null', 'rm -rf -- "$d"', 'rmdir -- "${d%/*}" 2>/dev/null', "true"].join("\n");
