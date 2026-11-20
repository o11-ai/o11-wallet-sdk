import { PATHS, SANDBOX_WORKSPACE, START_CRON } from "./sandbox-setup.js";

/**
 * What the person's own agent reads from their Ostack sandbox when they come back: the sandbox never asks anyone, so
 * what its scheduled runs recorded (`o11 ostack run need`, kept in .ostack/needs.json) comes back here for the agent
 * to ask. Runs with the sandbox's o11 CLI, which may be older than this one, so apart from starting cron it only reads.
 * Pure: no node: or Bun imports, so the wallet serves it over MCP.
 *
 * Prints one JSON object: doctor (ok and failing checks), setup (version, timezone and the ids of questions still open),
 * ask_person (the needs runs recorded), schedules_installed (this workspace's block in cron), cron_running, and
 * agent_login (the agent the schedules start, or with none installed the one with a saved login, its login's source and
 * the cron refresh's last result). doctor or setup is null when it could not be read, and agent_login.needs_sign_in
 * when it can't be told: unknown, never all clear.
 */
export const NEEDS_PATH = ".ostack/needs.json";
/** The cron refresh's last stand-in key result for o11's AI proxy ({agent, result, at}), written by `schedule cron install --refresh`. */
export const PROXY_KEY_PATH = ".ostack/proxy-key.json";

const summarize = [
  "import json,sys",
  "def load(p):",
  "  try: return json.load(open(p))",
  "  except Exception: return None",
  "d,s,n=load(sys.argv[1]),load(sys.argv[2]),load(sys.argv[3])",
  "checks=d.get('checks') if isinstance(d,dict) and isinstance(d.get('checks'),list) else []",
  "doctor={'ok':d.get('ok') is True,'version':d.get('version'),'o11_version':d.get('o11_version'),'failing':[{'check':c.get('check'),'detail':c.get('detail')} for c in checks if isinstance(c,dict) and c.get('status')=='fail']} if isinstance(d,dict) else None",
  // Ids only: the full question texts run to tens of KB. `o11 ostack setup status` (ostack_read setup) has them.
  "ids=lambda v:[q.get('id') if isinstance(q,dict) else q for q in (v if isinstance(v,list) else []) if isinstance(q,str) or (isinstance(q,dict) and isinstance(q.get('id'),str))]",
  "setup={'version':s.get('version'),'timezone':s.get('timezone'),'pending_questions':ids(s.get('pending_questions')),'team_pending':ids(s.get('team_pending')),'question_text':'o11 ostack setup status, or ostack_read setup'} if isinstance(s,dict) else None",
  "needs=[x for x in (n.get('needs') if isinstance(n,dict) and isinstance(n.get('needs'),list) else []) if isinstance(x,dict) and isinstance(x.get('workflow'),str) and isinstance(x.get('ask'),str)]",
  "import datetime,os",
  "a=sys.argv[6] or None",
  "path=lambda x:os.path.expanduser('~/.local/share/o11/logins/%s.json'%x)",
  // With no schedules in cron yet, the agent whose login o11 saved here (Claude first); with neither, nobody is signed in.
  "a=a or next((x for x in ('claude','codex') if os.path.exists(path(x))),None)",
  "rec=load(path(a)) if a in ('claude','codex') else None",
  "src=rec.get('source') if isinstance(rec,dict) else None",
  "k=load(sys.argv[5]); k=k if isinstance(k,dict) and k.get('agent')==a else None",
  "last={'result':k.get('result'),'at':k.get('at')} if k else None",
  "def age(t):",
  "  try: return (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(str(t).replace('Z','+00:00'))).total_seconds()",
  "  except Exception: return None",
  // A result older than two 15-minute refreshes says nothing about now (the sandbox may have stopped since).
  "x=age(last['at']) if last else None; fresh=x is not None and x<1200",
  "need=True if a is None or src is None or (fresh and last['result']=='failed') else False if src!='o11-proxy' or fresh else None",
  "login={'agent':a,'source':src,'last_refresh':last,'needs_sign_in':need}",
  "print(json.dumps({'doctor':doctor,'setup':setup,'ask_person':needs,'schedules_installed':sys.argv[4]=='1','cron_running':sys.argv[7]=='1','agent_login':login}))",
].join("\n");

export function sandboxStatusScript(): string {
  return [
    PATHS,
    `cd ${SANDBOX_WORKSPACE} 2>/dev/null || { echo '{"doctor":null,"setup":null,"ask_person":[],"schedules_installed":false,"cron_running":false,"agent_login":null,"error":"ostack is not set up on this sandbox"}'; exit 0; }`,
    START_CRON,
    'r=0; { pgrep -x cron || pgrep -x crond; } >/dev/null 2>&1 && r=1',
    't="$(mktemp -d)"; trap \'rm -rf -- "$t"\' EXIT',
    'o11 ostack doctor >"$t/doctor" 2>/dev/null || true',
    'o11 ostack setup status >"$t/setup" 2>/dev/null || true',
    // The sandbox has one workspace, so any ostack block in its cron is this one's.
    'c=0; crontab -l 2>/dev/null | grep -q "^# >>> ostack " && c=1',
    // The agent the installed schedules start.
    `a="$(crontab -l 2>/dev/null | sed -n 's/.* ostack schedule cron install --agent \\([a-z]*\\).*/\\1/p' | head -n 1)"`,
    `python3 -I -c '${summarize.replaceAll("'", "'\\''")}' "$t/doctor" "$t/setup" ${NEEDS_PATH} "$c" ${PROXY_KEY_PATH} "$a" "$r"`,
  ].join("\n");
}
