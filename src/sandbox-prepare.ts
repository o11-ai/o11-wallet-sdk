import type { SandboxInput, SandboxResult } from './contracts/sandboxes.js';
import { executeSandboxCommand, sandboxCommandOutput } from './sandbox-execution.js';
import { o11InstallScript } from './ostack/src/index.js';

/**
 * Makes a new sandbox ready for an agent to work in, through o11's own exec: the wallet's current o11 CLI (with
 * ostack), the coding-agent CLIs at their latest releases, Chrome and a running cron. Boat's image and E2B's desktop
 * template already ship Chrome, claude and codex; this installs what an image lacks, upgrades what is older than the
 * latest release and leaves current tools alone, so a second run takes a few seconds. Every item is best effort: a tool that can't be installed is reported as missing and never fails
 * the create. Sign-ins are separate (sandbox-login-transfer.ts, sandbox-wallet-login.ts).
 */
type SandboxClient = { sandbox(input: SandboxInput): Promise<SandboxResult> };
export const preparedAgents = ['claude', 'codex', 'cursor-agent', 'gemini', 'opencode'] as const;
/** Each coding agent's version on the sandbox and the latest published one (null when the lookup failed). */
export type PreparedAgent = { version: string | null; latest: string | null; current: boolean };
/** missing: not on the sandbox. outdated: older than the latest release after its upgrade was tried (see ~/.cache/o11-prepare). */
export type SandboxPrepared = { o11: string | null; ostack: string | null; agents: Record<string, PreparedAgent>; chrome: string | null;
  cron: boolean; desktop: boolean; missing: string[]; outdated: string[]; seconds: number };
/** The client waits 600s. Installs stop at `installSeconds`; cron and the report finish by `totalSeconds`. */
const prepareWaitMs = 600_000;
export const prepareBudget = { installSeconds: 400, totalSeconds: 560 } as const;

/**
 * One shell script: installs run in parallel, each capped, then the report lines `key=value`. Never exits non-zero.
 * Every capped step stops at the deadline `dl`, every download has a total time limit, and the script stops waiting for
 * its jobs at the install deadline. A job still running then (apt unpacking, say) carries on in the background and is
 * reported as missing.
 */
export function sandboxPrepareScript(origin: string) {
  return [
    'PATH="$HOME/.local/bin:$HOME/.local/share/o11-wallet/bin:$HOME/.opencode/bin:$PATH"; export PATH',
    `t0=$(date +%s); dl=$((t0 + ${prepareBudget.installSeconds})); pids=""`,
    'log="$HOME/.cache/o11-prepare"; mkdir -p "$log" "$HOME/.local/bin"',
    'has() { command -v "$1" >/dev/null 2>&1; }',
    // A sandbox without internet (or with egress rules) fails each download fast instead of stalling the create.
    // A --max-time later on the command line wins over this default.
    'curl() { command curl --connect-timeout 15 --max-time 120 "$@"; }',
    'S=""; root=""; if [ "$(id -u)" = 0 ]; then root=1; elif sudo -n true 2>/dev/null; then S="sudo -n"; root=1; fi',
    // cap SECONDS CMD...: never runs past the deadline. Without timeout(1) the command runs uncapped.
    'cap() { t="$1"; shift; r=$((dl - $(date +%s))); [ "$r" -lt "$t" ] && t="$r"; [ "$t" -gt 0 ] || return 124; if has timeout; then timeout "$t" "$@"; else "$@"; fi; }',
    'npmi() { has npm && cap 240 npm install -g --prefix "$HOME/.local" --no-fund --no-audit --loglevel=error "$@"; }',
    'curlsh() { u="$1" n="$2"; shift 2; curl -fsSL --proto \'=https\' --max-time 60 "$u" -o "$log/$n.sh" && cap 240 bash "$log/$n.sh" "$@"; }',
    // The wallet's current o11, not whatever release go.o11.ai serves.
    `( ${o11InstallScript(origin).split('\n').join('\n  ')}\n) >"$log/o11.log" 2>&1 & pids="$pids $!"`,
    // System packages in one apt job: cron, and Chrome where the image has none. Only the downloads are capped, which
    // is safe to stop; the install itself (dpkg) is never interrupted, and waits up to 60s for another apt's lock.
    '( [ -n "$root" ] && has apt-get || exit 0',
    '  pk=""; has cron || has crond || pk="cron"',
    '  if ! has google-chrome && ! has google-chrome-stable && [ "$(uname -m)" = x86_64 ] && curl -fsSL --proto \'=https\' --max-time 180 https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o "$log/chrome.deb"; then pk="$pk $log/chrome.deb"; fi',
    '  [ -n "$pk" ] || exit 0',
    '  apt() { $S env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=60 "$@"; }',
    '  fetch() { cap 180 $S env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=60 install -y -q --no-install-recommends --download-only $pk; }',
    '  { fetch || { cap 120 $S env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=60 update -q && fetch; }; } && apt install -y -q --no-install-recommends $pk',
    '  rm -f "$log/chrome.deb"',
    ') >"$log/system.log" 2>&1 & pids="$pids $!"',
    // Coding-agent CLIs at their latest releases: npm's latest tag for claude, codex, gemini and opencode, and the
    // version cursor.com's installer pins. A missing or older one is installed into ~/.local, ahead of the image's copy
    // on PATH; a current one is left alone. Each install is capped, and one that fails is reported, never fatal.
    'ver() { cap 10 "$1" --version 2>/dev/null | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.]+)?" | head -n 1; }',
    'older() { [ -z "$1" ] || { [ -n "$2" ] && [ "$1" != "$2" ] && [ "$(printf "%s\\n%s\\n" "$1" "$2" | sort -V | head -n 1)" = "$1" ]; }; }',
    'lat() { cat "$log/latest.$1" 2>/dev/null; }',
    'due() { older "$(ver "$1")" "$(lat "$1")"; }',
    'npmlatest() { curl -fsSL --proto \'=https\' --max-time 30 "https://registry.npmjs.org/$2/latest" | python3 -I -c \'import json,sys;print(json.load(sys.stdin).get("version",""))\' > "$log/latest.$1" 2>/dev/null; }',
    // Only these lookups are awaited here; the o11 and system jobs keep running.
    '( npmlatest claude @anthropic-ai/claude-code & npmlatest codex @openai/codex & npmlatest gemini @google/gemini-cli & npmlatest opencode opencode-ai &',
    '  curl -fsSL --proto \'=https\' --max-time 30 https://cursor.com/install -o "$log/cursor.sh" && grep -oE "downloads\\.cursor\\.com/lab/[^/]+" "$log/cursor.sh" | head -n 1 | sed "s#.*/##" > "$log/latest.cursor-agent"',
    '  wait ) & lookups=$!',
    'wait "$lookups"',
    'due claude && curlsh https://claude.ai/install.sh claude latest >"$log/claude.log" 2>&1 & pids="$pids $!"',
    'due cursor-agent && [ -s "$log/cursor.sh" ] && cap 240 bash "$log/cursor.sh" >"$log/cursor.log" 2>&1 & pids="$pids $!"',
    // codex, gemini and opencode come from npm; an image without Node gets the current Node 22 in ~/.local, checked against its SHA-256.
    '( if ! has npm; then case "$(uname -m)" in x86_64) a=x64 ;; aarch64|arm64) a=arm64 ;; *) a="" ;; esac',
    '    n="https://nodejs.org/dist/latest-v22.x"; f="$(curl -fsSL --proto \'=https\' --max-time 30 "$n/SHASUMS256.txt" | grep -E " node-v[0-9.]+-linux-$a\\.tar\\.xz$" || true)"',
    '    if [ -n "$a" ] && [ -n "$f" ] && curl -fsSL --proto \'=https\' --max-time 180 "$n/${f##* }" -o "$log/node.tar.xz" && [ "${f%% *}" = "$(sha256sum "$log/node.tar.xz" | cut -d" " -f1)" ]; then',
    '      rm -rf "$HOME/.local/lib/node" && mkdir -p "$HOME/.local/lib/node" && tar -xJf "$log/node.tar.xz" -C "$HOME/.local/lib/node" --strip-components=1',
    '      for b in node npm npx; do ln -sf "$HOME/.local/lib/node/bin/$b" "$HOME/.local/bin/$b"; done',
    '    fi; rm -f "$log/node.tar.xz"',
    '  fi',
    // A CLI's own updater first (it knows how it was installed: E2B ships a standalone codex), then npm, which
    // --force lets replace a launcher another installer left in ~/.local/bin. Every step stops at the deadline.
    '  due codex && { has codex && cap 240 codex update </dev/null; due codex && npmi --force @openai/codex@latest; } >"$log/codex.log" 2>&1 &',
    '  due gemini && npmi --force @google/gemini-cli@latest >"$log/gemini.log" 2>&1 &',
    '  due opencode && { has opencode && cap 240 opencode upgrade </dev/null; due opencode && { npmi --force opencode-ai@latest || curlsh https://opencode.ai/install opencode; }; } >"$log/opencode.log" 2>&1 &',
    '  wait',
    ') >"$log/node.log" 2>&1 & pids="$pids $!"',
    // Wait for the jobs until the install deadline at most: a signal with a trap ends `wait` early (POSIX). The trap
    // stays set, so a late signal is harmless.
    'trap : USR1',
    'r=$((dl - $(date +%s))); [ "$r" -gt 0 ] || r=1',
    // The timer's sleep is ended with it, so nothing outlives a fast prepare.
    '( sleep "$r" & s=$!; trap \'kill "$s" 2>/dev/null; exit 0\' TERM; wait "$s"; kill -USR1 $$ ) >/dev/null 2>&1 </dev/null & timer=$!',
    'wait $pids; kill "$timer" 2>/dev/null',
    // cron and the report get until the total budget.
    `dl=$((t0 + ${prepareBudget.totalSeconds}))`,
    // cron for scheduled runs: systemd where the machine has it (survives restarts), else the daemon itself.
    'if [ -n "$root" ] && ! pgrep -x cron >/dev/null && ! pgrep -x crond >/dev/null; then',
    '  if [ -d /run/systemd/system ]; then cap 30 $S systemctl enable --now cron >/dev/null 2>&1 || cap 30 $S systemctl enable --now crond >/dev/null 2>&1; fi',
    '  pgrep -x cron >/dev/null || pgrep -x crond >/dev/null || cap 30 $S service cron start >/dev/null 2>&1 || cap 10 $S cron >/dev/null 2>&1 || cap 10 $S crond >/dev/null 2>&1 || true',
    'fi',
    'line() { cap 10 "$@" 2>/dev/null | head -n 1 | tr -d \'\\r\' | cut -c1-80; }',
    'printf \'o11=%s\\n\' "$(tail -n 1 "$log/o11.log" | grep -E \'^[0-9]+\\.[0-9]+\' || true)"',
    'printf \'ostack=%s\\n\' "$(has o11 && line o11 ostack --version)"',
    `for t in ${preparedAgents.join(' ')}; do v=""; has "$t" && { v="$(ver "$t")"; [ -n "$v" ] || v="$(line "$t" --version)"; [ -n "$v" ] || v=installed; }; printf 'agent.%s=%s\\nlatest.%s=%s\\n' "$t" "$v" "$t" "$(lat "$t")"; older "$v" "$(lat "$t")" && printf 'stale.%s=1\\n' "$t"; done`,
    'c=""; for b in google-chrome-stable google-chrome chromium chromium-browser; do has "$b" && { c="$(line "$b" --version)"; [ -n "$c" ] || c="$b"; break; }; done; printf \'chrome=%s\\n\' "$c"',
    'printf \'cron=%s\\n\' "$(pgrep -x cron >/dev/null || pgrep -x crond >/dev/null && echo 1)"',
    'd=""; for b in Xvfb Xvnc startxfce4 gnome-session; do has "$b" && d=1; done',
    'ls /tmp/.X11-unix 2>/dev/null | grep -q X && d=1',
    'printf \'desktop=%s\\n\' "$d"',
  ].join('\n');
}

/** Parses the script's `key=value` report. A tool without a version line still counts as present. */
export function parsePrepared(stdout: string, seconds: number): SandboxPrepared {
  const values = new Map(stdout.split('\n').map(row => row.trim()).filter(row => /^[a-z0-9.-]+=/.test(row))
    .map(row => [row.slice(0, row.indexOf('=')), row.slice(row.indexOf('=') + 1).trim()] as const));
  const text = (key: string) => values.get(key) || null;
  const agents: Record<string, PreparedAgent> = Object.fromEntries(preparedAgents.map(agent => {
    const version = text(`agent.${agent}`);
    return [agent, { version, latest: text(`latest.${agent}`), current: version !== null && values.get(`stale.${agent}`) !== '1' }];
  }));
  const prepared = { o11: text('o11'), ostack: text('ostack'), agents, chrome: text('chrome'), cron: values.get('cron') === '1', desktop: values.get('desktop') === '1' };
  const missing = [...(prepared.o11 ? [] : ['o11']), ...preparedAgents.filter(agent => !agents[agent]!.version), ...(prepared.chrome ? [] : ['chrome']),
    ...(prepared.cron ? [] : ['cron']), ...(prepared.desktop ? [] : ['desktop'])];
  const outdated = preparedAgents.filter(agent => agents[agent]!.version && !agents[agent]!.current);
  return { ...prepared, missing, outdated, seconds };
}

/** Runs the preparation on a running sandbox. Returns the report; on a failed exec, the error instead of throwing. */
export async function prepareSandbox(client: SandboxClient, id: string, origin: string): Promise<SandboxPrepared | { error: string; seconds: number }> {
  const started = Date.now(), seconds = () => Math.round((Date.now() - started) / 1000);
  try {
    const result = await executeSandboxCommand(client, { action: 'exec', id, params: { command: sandboxPrepareScript(origin) } }, { timeoutMs: prepareWaitMs });
    const { stdout, stderr } = sandboxCommandOutput(result);
    if (!stdout.includes('o11=')) return { error: `Preparing the sandbox failed: ${(stderr || stdout).trim().slice(-300) || result.status}`, seconds: seconds() };
    return parsePrepared(stdout, seconds());
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 300) : 'Preparing the sandbox failed', seconds: seconds() };
  }
}
