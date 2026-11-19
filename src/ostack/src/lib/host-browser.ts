import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The hosted computer's Chrome: one profile where the person signs in to sites through `o11 ostack host open`, and
 * that scheduled runs drive through a browser MCP. Chrome never opens a DevTools port: the MCP starts Chrome itself and
 * speaks to it over a pipe, so nothing on the network, E2B's public port forwarding included, can reach DevTools. The
 * profile lives on disk with a fixed cookie key (--password-store=basic), so sign-ins outlast a Chrome restart and an
 * E2B pause.
 */

/** The MCP server name both agents see; its tools are mcp__browser__* in Claude Code. */
export const BROWSER_MCP = "browser";
const MCP_PACKAGE = "chrome-devtools-mcp";
const MCP_VERSION = "1.13.0";
export const BROWSER_LAUNCHER = "$HOME/.local/bin/ostack-browser";

/** The launcher on the hosted computer, so scheduled runs know to use the browser MCP. */
export const hasHostBrowser = () => existsSync(join(homedir(), ".local", "bin", "ostack-browser"));

/**
 * `ostack-browser start [url]`: shows the page in the profile's Chrome on the desktop. When Chrome is not running it
 * starts one for the person under a keeper (`ostack-browser keep`), which holds Chrome's DevTools pipe and only ever
 * sends Browser.close on it, so a stop saves the newest cookies (SIGTERM can lose a sign-in made seconds before).
 * `ostack-browser mcp`: the MCP on stdio; on its first browser tool it starts Chrome through this launcher
 * (`ostack-browser --...`, its --executablePath) with the pipe to the MCP. That stops the person's Chrome first; when
 * the run ends the MCP closes Chrome and, if the person opened a page during the run, Chrome comes back with the last
 * tabs. `ostack-browser stop`: quits Chrome so it saves its cookies.
 */
const LAUNCHER = String.raw`#!/bin/bash
# Written by o11 ostack host. Chrome for the person's sign-ins and the scheduled runs' browser MCP.
set -u
SELF="$HOME/.local/bin/ostack-browser"
PROFILE="$HOME/.local/share/o11/ostack-chrome"
MCP="$HOME/.local/share/o11/ostack-browser-mcp/node_modules/.bin/${MCP_PACKAGE}"
LOG="$HOME/.cache/o11-ostack-browser.log"
SHOWN="$PROFILE.shown" KEEPER="$PROFILE.keeper" RUN="$PROFILE.run"
# Without the pipe's navigator.webdriver, sites see the person's usual browser.
FLAGS=(--password-store=basic --no-first-run --no-default-browser-check --disable-blink-features=AutomationControlled
  --window-position=0,0 --window-size=1280,800)
mkdir -p "$PROFILE" "$(dirname "$LOG")"
has() { command -v "$1" >/dev/null 2>&1; }
chrome() { for b in google-chrome google-chrome-stable chromium chromium-browser; do has "$b" && { echo "$b"; return 0; }; done; return 1; }
# The profile's browser process ("pid args"), not its helpers.
browser() {
  ps -u "$(id -u)" -o pid=,comm=,args= | awk -v d="--user-data-dir=$PROFILE" \
    '$2 ~ /^chrom/ && !/ --type=/ { for (i = 4; i <= NF; i++) if ($i == d) { print; break } }'
}
running() { [ -n "$(browser)" ]; }
# A keeper or a run's launcher still alive, by its pid file.
alive() { p="$(cat "$1" 2>/dev/null)" && [ -n "$p" ] && ps -p "$p" -o args= 2>/dev/null | grep -q ostack-browser; }
# The desktop's display. E2B starts its desktop with the first link, so without one this starts the same Xvfb :0 that
# o11's desktop script would, and that script then reuses it.
display() {
  for d in "${"$"}{DISPLAY:-}" :0 :1 :99; do [ -n "$d" ] && [ -S "/tmp/.X11-unix/X${"$"}{d#:}" ] && { echo "$d"; return 0; }; done
  has Xvfb || return 1
  rm -f /tmp/.X0-lock
  setsid nohup Xvfb :0 -ac -screen 0 1280x800x24 -retro -dpi 96 -nolisten tcp >>"$LOG" 2>&1 </dev/null 9>&- &
  for _ in $(seq 20); do [ -S /tmp/.X11-unix/X0 ] && { echo :0; return 0; }; sleep 0.5; done
  return 1
}
# Sets DISPLAY, or $head to the headless flag when there is no desktop.
screen() { head=""; d="$(display)" && export DISPLAY="$d" || head="--headless=new"; }
stop() {
  pids="$(browser | awk '{print $1}')"; [ -n "$pids" ] || return 0
  # The person's Chrome quits through its keeper (Browser.close); a run's through the MCP or SIGTERM.
  alive "$KEEPER" && { kill -TERM "$(cat "$KEEPER")"; for _ in $(seq 20); do running || return 0; sleep 0.5; done; }
  kill -TERM $pids 2>/dev/null
  for _ in $(seq 20); do running || return 0; sleep 0.5; done
  kill -KILL $pids 2>/dev/null; sleep 1
}
# A lock left by a killed Chrome or another hostname (an E2B snapshot) blocks a start.
unlock() { rm -f "$PROFILE"/Singleton* "$PROFILE/DevToolsActivePort"; }
prefs() {
  # Reopen the last tabs and keep session cookies across restarts.
  [ -f "$PROFILE/Default/Preferences" ] || { mkdir -p "$PROFILE/Default"; echo '{"session":{"restore_on_startup":1}}' > "$PROFILE/Default/Preferences"; }
}
# Chrome for the person, with no DevTools port: its pipe goes only to the keeper, and its answers to /dev/null.
plain() {
  chrome >/dev/null || { echo "no Chrome on this computer" >&2; return 4; }
  unlock; prefs
  setsid nohup "$SELF" keep "$@" >>"$LOG" 2>&1 </dev/null 3>&- 4>&- 9>&- &
  for _ in $(seq 40); do [ -L "$PROFILE/SingletonLock" ] && return 0; sleep 0.5; done
  echo "Chrome did not start; see $LOG" >&2; return 5
}
keep() {
  c="$(chrome)"; screen; echo $$ > "$KEEPER"
  coproc CH { exec "$c" --user-data-dir="$PROFILE" "${"$"}{FLAGS[@]}" $head --remote-debugging-pipe "$@" 3<&0 4>/dev/null </dev/null >>"$LOG" 2>&1; }
  trap 'printf "{\"id\":1,\"method\":\"Browser.close\"}\0" >&"${"$"}{CH[1]}"' TERM
  pid=$CH_PID # bash unsets CH_PID when Chrome exits
  while kill -0 "$pid" 2>/dev/null; do wait "$pid"; done
  rm -f "$KEEPER"
}
start() {
  url="${"$"}{1:-}"
  exec 9>"$PROFILE.lock"; flock -w 60 9
  # A Chrome from before this launcher has a DevTools port; replace it.
  browser | grep -q -- --remote-debugging-port && stop
  if ! running; then plain ${"$"}{url:+"$url"} || return; exec 9>&-; return 0; fi
  [ -n "$url" ] || return 0
  # Handed to the running Chrome through its profile; a run's Chrome brings the page back after the run.
  alive "$RUN" && touch "$SHOWN"
  c="$(chrome)"; screen
  timeout 30 "$c" --user-data-dir="$PROFILE" "$url" >>"$LOG" 2>&1 </dev/null 9>&- || { echo "could not open $url" >&2; return 6; }
  exec 9>&-
}
# Started by the MCP as its Chrome, with --remote-debugging-pipe on fds 3 and 4. One run drives the profile at a time.
piped() {
  exec 9>"$PROFILE.lock"; flock -w 60 9
  for _ in $(seq 20); do alive "$RUN" || break; sleep 1; done
  # The MCP hides Chrome's stderr, so reasons go to the log too.
  if alive "$RUN"; then echo "another run is using the browser" | tee -a "$LOG" >&2; exit 7; fi
  c="$(chrome)" || { echo "no Chrome on this computer" | tee -a "$LOG" >&2; exit 4; }
  # The person's Chrome, open now or opened during the run, comes back after it.
  rm -f "$SHOWN"; alive "$KEEPER" && touch "$SHOWN"
  stop; unlock; prefs; echo $$ > "$RUN"
  # Puppeteer's automation flag shows a banner and tells sites a robot is browsing.
  args=(); for a in "$@"; do case "$a" in --enable-automation|about:blank) ;; *) args+=("$a") ;; esac; done
  screen
  "$c" "${"$"}{args[@]}" "${"$"}{FLAGS[@]}" $head >>"$LOG" 2>&1 </dev/null 9>&- &
  pid=$!
  trap 'kill -TERM $pid 2>/dev/null' TERM INT HUP
  for _ in $(seq 40); do [ -L "$PROFILE/SingletonLock" ] && break; sleep 0.25; done
  exec 9>&-
  code=0; while kill -0 "$pid" 2>/dev/null; do wait "$pid"; code=$?; done
  rm -f "$RUN"
  [ -f "$SHOWN" ] && { rm -f "$SHOWN"; (exec 9>"$PROFILE.lock"; flock -w 60 9; running || plain) >>"$LOG" 2>&1 3>&- 4>&- & }
  exit "$code"
}
case "${"$"}{1:-}" in
  start) shift; [ "${"$"}{1:-}" = --show ] && shift; start "$@" ;;
  stop) exec 9>"$PROFILE.lock"; flock -w 60 9; stop ;;
  keep) shift; keep "$@" ;;
  mcp)
    [ -x "$MCP" ] || MCP="npx -y ${MCP_PACKAGE}@${MCP_VERSION}"
    exec $MCP --userDataDir "$PROFILE" --executablePath "$HOME/.local/bin/ostack-browser" --no-usage-statistics --no-performance-crux ;;
  --*) piped "$@" ;;
  *) echo "Use: ostack-browser start [url] | stop | mcp" >&2; exit 2 ;;
esac
`;

/** Merges the MCP's tools into Claude Code's allow list, so a headless run never stops on a permission prompt. */
const ALLOW_CLAUDE = String.raw`import json, os
p = os.path.expanduser("~/.claude/settings.json")
try:
    s = json.load(open(p))
except Exception:
    s = {}
allow = s.setdefault("permissions", {}).setdefault("allow", [])
if "mcp__${BROWSER_MCP}" not in allow:
    allow.append("mcp__${BROWSER_MCP}")
    tmp = p + ".tmp"
    json.dump(s, open(tmp, "w"), indent=2)
    os.replace(tmp, p)`;

/** Codex's MCP entry, rewritten in place. Chrome can take a while to start, so it gets a minute. */
const CODEX_CONFIG = String.raw`import os, re
p = os.path.expanduser("~/.codex/config.toml")
text = open(p).read() if os.path.exists(p) else ""
text = re.sub(r"(?ms)^\[mcp_servers\.${BROWSER_MCP}\]\n.*?(?=^\[|\Z)", "", text).rstrip()
block = '[mcp_servers.${BROWSER_MCP}]\ncommand = "%s"\nargs = ["mcp"]\nstartup_timeout_sec = 60\ntool_timeout_sec = 120\n' % os.path.expanduser("~/.local/bin/ostack-browser")
open(p, "w").write((text + "\n\n" if text else "") + block)`;
export const CODEX_STEP = `python3 -I - <<'PY' || echo "Codex browser MCP not registered" >&2\n${CODEX_CONFIG}\nPY`;

/**
 * Shell for the hosted computer: writes the launcher, installs the MCP once per version, and registers it with
 * Claude Code (user scope) and Codex. Safe to repeat. Under `set -e` too, a failed step only prints why.
 */
export function browserSetupScript(): string {
  return [
    `mkdir -p "$HOME/.local/bin" "$HOME/.codex" "$HOME/.claude" "$HOME/.local/share/o11/ostack-browser-mcp"`,
    `cat > ${BROWSER_LAUNCHER}.tmp <<'OSTACK_BROWSER'\n${LAUNCHER}OSTACK_BROWSER`,
    `chmod +x ${BROWSER_LAUNCHER}.tmp && mv ${BROWSER_LAUNCHER}.tmp ${BROWSER_LAUNCHER}`,
    // Hides Chrome's "unsupported command-line flag" bar for AutomationControlled, where o11 can write Chrome policy.
    `for d in /etc/opt/chrome/policies/managed /etc/chromium/policies/managed; do sudo -n mkdir -p "$d" 2>/dev/null && echo '{"CommandLineFlagSecurityWarningsEnabled": false}' | sudo -n tee "$d/ostack.json" >/dev/null; done || true`,
    `m="$HOME/.local/share/o11/ostack-browser-mcp"`,
    `[ "$(cat "$m/version" 2>/dev/null)" = ${MCP_VERSION} ] || { npm install --prefix "$m" --no-fund --no-audit --loglevel=error ${MCP_PACKAGE}@${MCP_VERSION} >/dev/null && echo ${MCP_VERSION} > "$m/version"; } || echo "browser MCP install failed; runs fetch it with npx" >&2`,
    `if command -v claude >/dev/null 2>&1; then`,
    `  claude mcp get ${BROWSER_MCP} >/dev/null 2>&1 || claude mcp add --scope user ${BROWSER_MCP} -- ${BROWSER_LAUNCHER} mcp >/dev/null || echo "Claude browser MCP not registered" >&2`,
    `  python3 -I - <<'PY' || echo "Claude browser MCP not allowed" >&2\n${ALLOW_CLAUDE}\nPY`,
    `fi`,
    CODEX_STEP,
  ].join("\n");
}

/** Opens a page in the hosted computer's Chrome, on the desktop the person's link shows. */
export const browserOpenScript = (quotedUrl: string) => `${BROWSER_LAUNCHER} start ${quotedUrl}`;
