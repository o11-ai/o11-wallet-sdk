export const sandboxUsage = `o11 sandbox <command> [NAME|ID] [options]
  providers                      E2B, Boat and Vercel: which is the default and when to use each
  create [--provider e2b|boat|vercel]   E2B unless you name another provider
    --name NAME --connection ID   Name and connected provider account
    --ttl SECONDS                 Runtime limit on every provider
    --size xs|small|medium|large|xl   1/2, 2/4, 4/8, 8/16 or 16/32 vCPU/GB on any provider
    --cpus N --memory-gb M [--disk-gb D]   At least this much. o11 picks the provider's smallest
                                  shape that fits, or the cheapest provider when --provider is left out
    --env KEY=VALUE --tag KEY=VALUE   Environment and tags (E2B metadata, Boat labels, Vercel tags)
    --no-prepare                  Skip installing the current o11, claude, codex, cursor-agent, gemini, opencode,
                                  Chrome and cron after create (create and get-or-create do it by default)
    --keep-running                On o11's account, E2B and Boat: renew from your wallet until you stop or delete it,
                                  or the wallet can't pay. E2B pauses and resumes it before its 24-hour cap (a few seconds).
                                  Not with --connection: use --ttl (and --auto-pause on E2B). info and usage show keepRunning
  E2B create options:
    --template NAME               Template to start from (default desktop, or base with --no-prepare). List them with templates
    --from SNAPSHOT_ID            Start from one of your E2B snapshots
    --timeout MS                  Runtime limit in milliseconds, as E2B's SDK takes it (or --ttl SECONDS)
    --cpu-count N                 Only for templates that can be resized
    --metadata KEY=VALUE          E2B metadata, filterable with list --tag
    --auto-pause                  Pause instead of delete when time runs out. --auto-resume wakes it on traffic
    --no-internet                 No outbound internet (same as --deny-out 0.0.0.0/0)
    --allow-out DOMAIN|CIDR --deny-out CIDR   Outbound rules; repeat each flag. Allow wins
    --allow-public-traffic=false  Sandbox URLs need E2B's traffic token
    --mask-request-host HOST      Host header E2B sends to your app
  Boat create options: --type small|default|large|xlarge --setup-file FILE --file REMOTE=LOCAL --fail-fast
    --host PORT[:public]          After create, host the port (same as host NAME --port PORT). Repeat for more ports
  Vercel create options: --vcpus N --ports [3000,8080] --image IMAGE --architecture arm64 --network-policy deny-all
    --non-persistent --mount DRIVE:/path[:read-write|snapshot]   DRIVE is an o11 drive name or ID. Up to 4 --tag (o11 uses the fifth)
    --allowed-domain D --allowed-cidr CIDR --denied-cidr CIDR   Vercel firewall rules (repeat each). Also on network-policy
  get-or-create --name NAME [create options] [--resume]   Your sandbox with that name, or a new one
  list [--provider P] [--name-prefix TEXT] [--state running|stopped|paused|failed] [--tag KEY=VALUE]   paused = stopped
    --sort-by created|name|statusUpdatedAt --order asc|desc --limit N --cursor ID
  templates [--public]            E2B: your account's templates, or E2B's public ones, with vCPUs and memory
  info NAME                       State and saved configuration
  exec NAME "shell command"       Run a shell command
  exec NAME -- COMMAND [ARG...]   Run a program with separate arguments
    --attach                      Print output live. --detached (E2B: --background) returns a command ID
    --cwd DIR                     Run in DIR
    --timeout-seconds N           Boat and E2B: stop it after N seconds with exit 124. E2B and Vercel: --timeout MS
    --stdin                       Keep input open (E2B, Vercel). Then command-stdin NAME --command-id ID --input TEXT|--close
  attach NAME --command-id ID     Print a running command's output live
  kill NAME --command-id ID       Stop a command (E2B also takes --pid PID). delete removes the sandbox
  run [--provider P] [create options] [--push DIR] [--workdir DIR] [--rm|--stop|--keep] -- COMMAND [ARG...]
                                  Create, run with live output, then delete (default), stop or keep
  terminal|connect NAME [--browser]   Shell through o11
    --workdir DIR --env KEY=VALUE --sudo   Vercel
  ssh NAME [-- SSH_ARGS...]       Real OpenSSH through o11, e.g. ssh NAME -- -L 8080:localhost:3000
  ssh-config NAME [--install]     Print an ~/.ssh/config entry (o11-NAME) for scp, rsync, sftp,
                                  VS Code and Cursor Remote-SSH. --install adds it, --uninstall removes it
  ssh-key NAME --rotate           Replace this computer's key for the sandbox. Private keys stay here
  login NAME [--login o11,claude,codex,cursor,gemini,opencode,copilot,amp,goose] [--approve] [--renew] [--code CODE]   Sign the sandbox in to o11 and your coding agents
  o11-key NAME --path PATH        Write an o11 key for this sandbox alone to PATH (ending in /.o11-login/o11-key) for its own o11
  ai-login-status|ai-login-save|ai-login-delete --provider claude|codex [--from-sandbox NAME]   The Claude or ChatGPT login o11 keeps for you (o11 login claude|codex).
                                  --from-sandbox saves one made on your own sandbox (ostack sandbox-setup) and deletes it there
  files read|write|list|info|stat|mkdir|delete NAME --path PATH [--content TEXT]
  files move NAME --source PATH --destination PATH [--overwrite]   (--path and --to also work)
  files search NAME --path DIR --pattern GLOB               Boat: file names, like '*.py'
  files find NAME --path DIR --pattern TEXT [--regex]       Boat: lines that contain TEXT
  files replace NAME --paths '["a.txt"]' --pattern OLD --new-value NEW   Boat
  files permissions NAME --path PATH --mode 600                  Boat (Vercel: files chmod)
  files watch NAME --path DIR [--recursive] [--seconds N]   E2B: print file changes until Ctrl-C
  copy LOCAL_FILE NAME:PATH       Or NAME:PATH LOCAL_FILE
  copy -r LOCAL_DIR NAME:PATH     Or NAME:PATH LOCAL_DIR [--force]. 4 MiB compressed, without .git
  push NAME DIR [--to PATH]       Copy a folder in; git checkouts send tracked files only
  preview NAME --port PORT [--open]   One-use browser link to a port
  forward NAME --remote PORT [--local PORT] [--bind ADDR]   Tunnel a sandbox port to this computer
  host NAME --port PORT           E2B: the port's public URL. Boat: its hosted link (--public, --rotate, --localhost)
  domain NAME [--port PORT]       Vercel: o11 link for an exposed port
  network-policy NAME             Change outbound rules now. E2B: --allow-out/--deny-out. Vercel: --network-policy
  desktop NAME [--open]           One-use link to the sandbox's desktop. browser NAME shows only a browser
                                  E2B: create the sandbox with --template desktop first
    browser NAME --browser-profile /PATH   Boat: Chrome profile folder in the sandbox (--profile /PATH also works)
  stop|pause NAME                 Stop compute and keep the disk. E2B and Boat also keep memory when they can
    --memory false (--mode filesystem) --strict   E2B, your own account: filesystem-only pause; refuse rather than lose memory
  resume NAME [--ttl SECONDS]     Start a stopped sandbox. On o11's account the wallet holds the new run first
    --memory false (--on-resume reboot)   E2B: boot from disk, ignoring saved memory. Vercel: config NAME --timeout MS, then resume
  extend NAME --ttl SECONDS       Give it more time. Vercel adds SECONDS; E2B stops it SECONDS from now.
                                  Boat: --hours N. At most 24 hours each time; auto-stop stays on.
                                  On o11's account the wallet holds each extra window before the auto-stop moves
  rename NAME --name NEW_NAME     Boat and E2B: rename it
  delete NAME                     Delete it. E2B and Vercel keep snapshots unless you pass --delete-snapshots
  fork NAME [--name NEW_NAME]     Copy a sandbox. Boat and Vercel copy its last snapshot, not unsaved changes.
                                  E2B forks a running sandbox only
  snapshot NAME | snapshots NAME  Save or list snapshots. Boat: snapshot NAME --name SNAPSHOT
  usage NAME | metrics NAME       Billing evidence | CPU, memory and disk over time (E2B)
  limits|pricing [--provider P]   Provider limits and billing meters
  sizes [--provider P] [--size S | --cpus N --memory-gb M] [--ttl S]   Every shape, its price and limits,
                                  and which provider o11 picks for a size. No provider has GPUs
  capabilities [--provider P] [--matrix]   What o11 runs on each provider. --matrix compares all three
  agents|agents-status NAME       Whether Claude Code and Codex are installed and signed in
  agent exec NAME --agent claude|codex -- ARGS...
  logs NAME --command-id ID       A command's output. processes NAME lists running commands
  command-status NAME --command-id ID   A command's state and exit code (E2B, Boat, Vercel)
  history NAME [--q TEXT] [--mode commands]   Boat: past commands
  command-logs|get-command NAME --command-id ID   Boat: one command's state and output
  Boat agent runs (Boat's own harness; o11 signs Codex in with --login codex):
    prompt NAME "TEXT" --agent codex|claude|... [--model M] [--reasoning-effort L] [--fast] [--new]
    prompt-status NAME --prompt-id ID | events|conversations NAME | steer NAME "TEXT" | interrupt NAME
    ai-usage NAME [--days N]       Boat: agent usage for the sandbox
  stop-status NAME --stop-id ID   Boat: progress of a stop
  artifact NAME --path PATH [--out FILE]   Boat: download a file the agent made. Text prints as is
  command-stdin NAME --command-id ID   Read the input byte offset on Vercel
    --offset BYTES --input TEXT   Send input at the expected offset
    --offset BYTES --close        Close input and deliver EOF
  private-preview NAME --port PORT [--path /PATH]    Fetch a private guest HTTP response
    --provision [--localhost=false]                   Set up a protected Boat port first
  config NAME --ports [3000] --vcpus 4   Change saved Vercel settings. A higher --timeout MS also extends the running session
  snapshot-restore NAME --snapshot-id ID [--name NEW]   Vercel: new sandbox from that snapshot. --in-place changes NAME instead
  account me|list-organizations|get-data-retention --connection ID   Read your Boat account (owners and admins). Manage it at boat.dev. account usage: your sandboxes' usage
  snapshots-get|snapshots-tree|snapshots-delete NAME --snapshot-id ID   Manage a tracked Vercel snapshot
  saved-snapshots --provider boat  List this card's saved Boat snapshots
  saved-snapshot-save NAME --name SNAPSHOT
  saved-snapshot-get|saved-snapshot-delete NAME --name SNAPSHOT
  saved-snapshot-share|saved-snapshot-shares NAME --name SNAPSHOT   Boat share codes
  saved-snapshot-unshare NAME --name SNAPSHOT --share-id ID
  snapshot-tree|snapshot-delete NAME --snapshot-id ID   Boat: files in, or delete, one of its snapshots
  snapshot-file NAME --snapshot-id ID [--path PATH] [--out FILE]   Boat: read a file (or folder tar) from a snapshot
  snapshots-latest|snapshots-purge NAME   Boat: newest snapshot | delete all of the sandbox's snapshots
  snapshot-download NAME --snapshot-id ID [--out DIR]   Boat: signed links to a whole snapshot; --out downloads and unpacks it
  files-download-url|files-upload-url NAME --path PATH [--ttl-seconds N]   Boat: signed file link. Anyone with it can use it until it expires
  create --provider boat --share-code bsh_... --type small   Boat: start from another account's share code
  drives NAME                     List tracked Vercel drives for this account and card
  drive-create NAME --name DRIVE   Create a Vercel drive under this sandbox's account
  drive-get|drive-delete NAME --drive-id ID
  drive-fork NAME --drive-id ID --name NEW_DRIVE
  drive-snapshot NAME --drive-id ID   Get a read-only Vercel mount descriptor
  user-create NAME --username USER   Create a Vercel sandbox user
  group-create NAME --groupname GROUP   Create a Vercel sandbox group
  user-exec NAME --username USER [--cwd DIR] -- COMMAND [ARG...]   Vercel also: --env K=V --sudo --detached
  user-files-read|user-files-mkdir NAME --username USER --path PATH
  user-files-write NAME --username USER --path PATH --content TEXT   Vercel: files as another user

Claude Code and Codex install by default. Use --agents none to opt out.
o11 doesn't store model keys. Sign-ins go from this computer straight into the sandbox:
  create with no --login signs a new sandbox in to o11 and the agent running the command (--login none opts out).
  create --login claude,codex (or login NAME --login claude,codex) names the agents (also cursor, gemini, opencode, copilot, amp, goose).
  --login o11 installs o11 in the sandbox and signs it in with a key o11 issues for that sandbox alone.
  It runs tools on your card, and o11 revokes it when you sign the sandbox in again or delete it.
  --claude-key-file FILE or --codex-key-file FILE (on create, login or agent exec) copies an API key.
  Claude copies a "claude setup-token" token (--claude-token-file FILE or CLAUDE_CODE_OAUTH_TOKEN) or ANTHROPIC_API_KEY.
  Live Claude and ChatGPT sign-ins are never copied. login NAME --approve has the sandbox sign in on its own:
  it returns a link (and for Codex a code) for you to approve once; finish Claude with --code CODE. --renew replaces a sign-in that stopped working.
Anyone with shell access to the sandbox can read a key or login copied into it.
Compute is billed to the connected provider account, or to your wallet where o11 funds it.

Unknown --kebab-case flags go to the provider as camelCase parameters.
Use --param KEY=JSON for exact provider keys, arrays or objects, and --data JSON|@FILE|@- for a native request.
Use --request-id UUID to recover the same operation after an uncertain result. Run info before retrying.
Use --json for structured output. Provider keys stay on o11; every request goes through your o11 server.`;
