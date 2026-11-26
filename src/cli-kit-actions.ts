import { createHash } from 'node:crypto';
import { constants as fsConstants, type Stats } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { OstackError } from './ostack/src/index.js';
import { isWriteKitAction, KIT_ACTION_NAMES, KIT_ACTIONS, type KitActionName } from './contracts/kit-actions.js';
import { kitBinaryType, kitObjectHashSchema } from './contracts/kit-objects.js';
import { KIT_PATH } from './contracts/kit-standard.js';
import type { walletRequester } from './cli-ostack.js';

type Requester = Pick<ReturnType<typeof walletRequester>, 'request'>;
export type KitArgs = { positionals: string[]; flags: Map<string, string> };
/** `kit`: the command takes the kit as its one argument after the action. */
type Command = { usage: string; kit: boolean; run: (args: KitArgs, wallet: Requester) => Promise<unknown> };
type LocalFile = { path: string; bytes: Buffer };

const isAction = (value: string | undefined): value is KitActionName => (KIT_ACTION_NAMES as readonly string[]).includes(value ?? '');

/** `o11 kit <action>` for every kit action; anything else is an ostack command. */
export const isKitCommand = (args: string[]) => isAction(args[0]);

/** Flags that take no value. Every other flag needs one, which may be empty (`--website ""`). */
const SWITCHES = new Set(['force', 'help']);

/** Splits the arguments. A flag without its value, a value on a switch, or a flag given twice is refused, never guessed. */
export function parseKitArgs(argv: string[]): KitArgs {
  const positionals: string[] = [], flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? '';
    if (!arg.startsWith('--')) { positionals.push(arg); continue; }
    const equals = arg.indexOf('=');
    const name = equals > 0 ? arg.slice(2, equals) : arg.slice(2);
    if (!name) throw new OstackError('invalid_argument', `${arg} is not a flag.`);
    if (flags.has(name)) throw new OstackError('invalid_argument', `--${name} is given twice.`);
    if (SWITCHES.has(name)) {
      if (equals > 0) throw new OstackError('invalid_argument', `--${name} takes no value.`);
      flags.set(name, 'true');
    } else if (equals > 0) flags.set(name, arg.slice(equals + 1));
    else {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) throw new OstackError('missing_flag', `--${name} needs a value.`);
      flags.set(name, next);
      index++;
    }
  }
  return { positionals, flags };
}

const kitArg = (args: KitArgs) => {
  const kit = args.positionals[1];
  if (!kit) throw new OstackError('missing_argument', 'Name the kit, such as acme-seo, or paste a link to its page.');
  return kit;
};
const flag = (args: KitArgs, name: string) => {
  const value = args.flags.get(name);
  if (!value) throw new OstackError('missing_flag', `--${name} is required.`);
  return value;
};

/** A draft path this CLI writes under a folder: the Kit Standard's rule, which allows no `..`, leading `/`, `\` or dot-names. */
export const isSafeKitPath = (path: string) => KIT_PATH.test(path);

/**
 * A refused kit action names what it conflicts with: `draft_changed` when the draft changed since it was read (read it
 * again), else `conflict` (the message says what, such as a release already submitted). Ostack file commands keep
 * `file_changed`.
 */
function kitConflict(error: unknown) {
  if (!(error instanceof OstackError) || error.code !== 'file_changed') return error;
  return new OstackError(error.details?.reason === 'DRAFT_CHANGED' ? 'draft_changed' : 'conflict', error.message, error.details);
}

/** Runs one action the way kit_manage does: GET with the input in the query for reads, POST with a JSON body for the rest. */
async function act(wallet: Requester, name: KitActionName, input: Record<string, unknown> = {}) {
  try {
    if (isWriteKitAction(name)) return await wallet.request('POST', `/v1/kit-actions/${name}`, input);
    const query = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])).toString();
    return await wallet.request('GET', `/v1/kit-actions/${name}${query ? `?${query}` : ''}`);
  } catch (error) {
    throw kitConflict(error);
  }
}

const objectRefSchema = z.object({ sha256: kitObjectHashSchema, sizeBytes: z.number().int().nonnegative(), contentType: z.string() });
const draftSchema = z.looseObject({
  status: z.string(),
  release: z.string().nullable(),
  issues: z.array(z.looseObject({ level: z.string(), code: z.string(), path: z.string().nullable(), message: z.string() })),
  files: z.array(z.looseObject({ path: z.string(), content: z.string(), object: objectRefSchema.nullish() })),
});
const preparedSchema = z.array(z.object({ sha256: z.string(), stored: z.boolean(), uploadUrl: z.string().nullable() }).loose());
type KitDraft = z.infer<typeof draftSchema>;

function answer<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new OstackError('invalid_response', 'The wallet answered in a shape this o11 CLI does not know. Run "o11 update".');
  return parsed.data;
}
const readDraft = async (wallet: Requester, kit: string) => answer(draftSchema, await act(wallet, 'draft', { kit }));

const missing = (error: unknown): null => {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
  throw error;
};
const lstatOrNull = (path: string): Promise<Stats | null> => lstat(path).catch(missing);
const NO_FOLLOW_WRITE = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | (fsConstants.O_NOFOLLOW ?? 0);

/** The folder to write a draft into: created when new; an existing one must be empty unless `force`. */
async function draftRoot(dir: string, force: boolean) {
  const wanted = resolve(dir);
  if (!await lstatOrNull(wanted)) {
    await mkdir(wanted, { recursive: true });
    return realpath(wanted);
  }
  // The folder itself may be a link the person chose (like /tmp on macOS); everything inside it is checked.
  const root = await realpath(wanted);
  if (!(await lstat(root)).isDirectory()) throw new OstackError('invalid_input', `${wanted} is not a folder.`);
  if (!force && (await readdir(root)).length > 0)
    throw new OstackError('folder_not_empty', `${wanted} is not empty. Pick an empty folder, or add --force to overwrite the draft's own files there.`);
  return root;
}

/** Writes one file under root, refusing any link on the way or at the file, so nothing lands outside the folder. */
async function writeInside(root: string, path: string, content: string) {
  const parts = path.split('/');
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const info = await lstatOrNull(current), shown = parts.slice(0, index + 1).join('/');
    if (info?.isSymbolicLink()) throw new OstackError('unsafe_path', `${shown} is a link. The CLI does not write through links.`, { path: shown });
    if (index === parts.length - 1) {
      if (info && !info.isFile()) throw new OstackError('unsafe_path', `${shown} is not a file.`, { path: shown });
    } else if (!info) await mkdir(current).catch((error: unknown) => { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; });
    else if (!info.isDirectory()) throw new OstackError('unsafe_path', `${shown} is a file, not a folder.`, { path: shown });
  }
  await writeFile(current, content, { flag: NO_FOLLOW_WRITE });
}

/** Writes a draft's text files into a folder. Every path is checked before anything is written. */
export async function writeDraftFolder(dir: string, draft: KitDraft, force: boolean) {
  const unsafe = draft.files.map((file) => file.path).filter((path) => !isSafeKitPath(path));
  if (unsafe.length) throw new OstackError('unsafe_path', `The draft has file paths this CLI will not write: ${unsafe.join(', ')}.`, { paths: unsafe });
  const root = await draftRoot(dir, force), binary: string[] = [];
  for (const file of draft.files) {
    if (file.object) binary.push(file.path);
    else await writeInside(root, file.path, file.content);
  }
  return {
    dir: root, release: draft.release, status: draft.status, written: draft.files.length - binary.length, issues: draft.issues,
    ...(binary.length ? { binary_files_not_written: binary, note: 'push keeps these from the draft while the folder lacks them. Add a file at the same path to replace one.' } : {}),
  };
}

/** Every file under a kit folder, as kit paths; hidden files and folders are left out, as the Kit Standard requires. Links are listed, not read. */
async function kitFolder(dir: string): Promise<{ files: LocalFile[]; links: string[] }> {
  const root = resolve(dir);
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => {
    throw new OstackError('not_found', `No folder at ${root}.`);
  });
  const visible = entries.map((entry) => ({ entry, path: relative(root, join(entry.parentPath, entry.name)).split(sep).join('/') }))
    .filter(({ path }) => !path.split('/').some((part) => part.startsWith('.')));
  const links = visible.filter(({ entry }) => entry.isSymbolicLink()).map(({ path }) => path).sort();
  const paths = visible.filter(({ entry }) => entry.isFile()).map(({ path }) => path).sort();
  return { files: await Promise.all(paths.map(async (path) => ({ path, bytes: await readFile(join(root, path)) }))), links };
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Stores binary files the workspace does not hold yet (upload, then one PUT each) and returns their hashes by path. */
async function uploadBinaries(wallet: Requester, files: LocalFile[]) {
  const hashed = files.map((file) => ({ ...file, sha256: sha256(file.bytes) }));
  for (let offset = 0; offset < hashed.length; offset += 50) {
    const batch = hashed.slice(offset, offset + 50);
    const prepared = answer(preparedSchema, await act(wallet, 'upload', { uploads: batch.map((file) => ({ path: file.path, sha256: file.sha256, size_bytes: file.bytes.byteLength })) }));
    const answers = new Map(prepared.map((item) => [item.sha256, item]));
    const unique = [...new Map(batch.map((file) => [file.sha256, file])).values()];
    for (const file of unique) {
      const item = answers.get(file.sha256);
      if (item?.stored) continue;
      if (!item?.uploadUrl) throw new OstackError('upload_missing', `The wallet gave no upload link for ${file.path}. Run the command again.`, { path: file.path });
      const response = await fetch(item.uploadUrl, { method: 'PUT', body: new Uint8Array(file.bytes), signal: AbortSignal.timeout(300_000) })
        .catch(() => { throw new OstackError('offline', `${file.path} could not be uploaded.`); });
      if (!response.ok) throw new OstackError('offline', `${file.path} upload answered HTTP ${response.status}. Run the command again.`);
    }
  }
  return new Map(hashed.map((file) => [file.path, file.sha256]));
}

const asObject = (value: unknown): object => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : { result: value });

/** Pushes a folder. Binary files the draft has and the folder lacks are kept by their stored hash, never dropped silently. */
async function pushFolder(args: KitArgs, wallet: Requester) {
  const kit = kitArg(args);
  const { files, links } = await kitFolder(flag(args, 'dir'));
  const empty = files.filter((file) => kitBinaryType(file.path) && file.bytes.byteLength === 0).map((file) => file.path);
  const local = files.filter((file) => !empty.includes(file.path));
  const draft = await readDraft(wallet, kit);
  const paths = new Set(local.map((file) => file.path));
  const kept = draft.files.flatMap((file) => (file.object && !paths.has(file.path) ? [{ path: file.path, content: '', sha256: file.object.sha256 }] : []));
  const hashes = await uploadBinaries(wallet, local.filter((file) => kitBinaryType(file.path)));
  const result = await act(wallet, 'push', {
    kit,
    files: [...local.map((file) => {
      const hash = hashes.get(file.path);
      return hash ? { path: file.path, content: '', sha256: hash } : { path: file.path, content: file.bytes.toString('utf8') };
    }), ...kept],
  });
  return {
    ...asObject(result),
    ...(kept.length ? { kept_from_draft: kept.map((file) => file.path), kept_note: 'Kept from the draft: the folder lacks them. Deleted in the folder? Remove it in the wallet editor.' } : {}),
    ...(empty.length ? { skipped_empty: empty, skipped_empty_note: 'Empty binary files were not sent.' } : {}),
    ...(links.length ? { skipped_links: links, skipped_links_note: 'Links are not followed. Copy the files in to send them.' } : {}),
  };
}

/**
 * One CLI command per kit action. Typed by KIT_ACTIONS, so an action added for kit_manage fails the typecheck until it
 * has a command here: the CLI and MCP always offer the same things.
 */
const COMMANDS: { [N in KitActionName]: Command } = {
  list: { usage: 'list', kit: false, run: (_args, wallet) => act(wallet, 'list') },
  add: { usage: 'add <kit name or link>', kit: true, run: (args, wallet) => act(wallet, 'add', { kit: kitArg(args) }) },
  remove: { usage: 'remove <kit>', kit: true, run: (args, wallet) => act(wallet, 'remove', { kit: kitArg(args) }) },
  seller: { usage: 'seller', kit: false, run: (_args, wallet) => act(wallet, 'seller') },
  profile: {
    usage: 'profile --slug <address> --name <name> [--website <url>] [--about <one line>]',
    kit: false,
    run: (args, wallet) => {
      const website = args.flags.get('website'), about = args.flags.get('about');
      // An empty value clears the field; a flag left out keeps the saved value.
      return act(wallet, 'profile', {
        slug: flag(args, 'slug'), name: flag(args, 'name'),
        ...(website !== undefined ? { website: website || null } : {}), ...(about !== undefined ? { about: about || null } : {}),
      });
    },
  },
  create: { usage: 'create <kit name> --title <title>', kit: true, run: (args, wallet) => act(wallet, 'create', { slug: kitArg(args), title: flag(args, 'title') }) },
  draft: {
    usage: 'draft <kit> [--dir <folder>] [--force]',
    kit: true,
    async run(args, wallet) {
      const draft = await readDraft(wallet, kitArg(args));
      const dir = args.flags.get('dir');
      if (dir === undefined) return draft;
      if (!dir) throw new OstackError('missing_flag', '--dir needs a folder.');
      return writeDraftFolder(dir, draft, args.flags.has('force'));
    },
  },
  upload: {
    usage: 'upload --file <local file> --as <kit path>',
    kit: false,
    async run(args, wallet) {
      const path = flag(args, 'as');
      if (!isSafeKitPath(path) || !kitBinaryType(path)) throw new OstackError('invalid_input', `${path} is not a kit path for a binary file, such as assets/logo.png.`);
      const bytes = await readFile(resolve(flag(args, 'file')));
      if (bytes.byteLength === 0) throw new OstackError('invalid_input', 'The file is empty.');
      await uploadBinaries(wallet, [{ path, bytes }]);
      return { path, sha256: sha256(bytes) };
    },
  },
  push: { usage: 'push <kit> --dir <folder>', kit: true, run: pushFolder },
  try: { usage: 'try <kit>', kit: true, run: (args, wallet) => act(wallet, 'try', { kit: kitArg(args) }) },
  submit: { usage: 'submit <kit>', kit: true, run: (args, wallet) => act(wallet, 'submit', { kit: kitArg(args) }) },
  withdraw: { usage: 'withdraw <kit>', kit: true, run: (args, wallet) => act(wallet, 'withdraw', { kit: kitArg(args) }) },
};

/** The kit commands for `o11 kit help`, one line each. */
export const KIT_COMMAND_HELP = KIT_ACTION_NAMES.map((name) => `  ${COMMANDS[name].usage.padEnd(44)} ${KIT_ACTIONS[name].summary}`).join('\n');

/** Refuses arguments a command does not take: extra positionals and flags its usage does not name. */
function checkArguments(name: KitActionName, args: KitArgs) {
  const command = COMMANDS[name];
  const extra = args.positionals.slice(command.kit ? 2 : 1);
  if (extra.length) throw new OstackError('invalid_argument', `o11 kit ${name} does not take ${extra.join(' ')}. Use: o11 kit ${command.usage}`, { extra });
  const known = new Set([...command.usage.matchAll(/--([a-z]+)/g)].map((match) => match[1]));
  const unknown = [...args.flags.keys()].filter((flagName) => flagName !== 'help' && !known.has(flagName));
  if (unknown.length) throw new OstackError('invalid_argument', `o11 kit ${name} has no ${unknown.map((flagName) => `--${flagName}`).join(', ')}. Use: o11 kit ${command.usage}`);
}

/** Runs `o11 kit <action> ...`. Prints JSON like every ostack command; failures go to stderr with a stable code. */
export async function kitCommand(argv: string[], wallet: Requester): Promise<number> {
  const name = argv[0];
  if (!isAction(name)) return 1;
  try {
    const args = parseKitArgs(argv);
    if (args.flags.has('help')) {
      process.stdout.write(`o11 kit ${COMMANDS[name].usage}\n  ${KIT_ACTIONS[name].summary}\n`);
      return 0;
    }
    checkArguments(name, args);
    process.stdout.write(`${JSON.stringify(await COMMANDS[name].run(args, wallet), null, 2)}\n`);
    return 0;
  } catch (error) {
    const body = error instanceof OstackError
      ? { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }
      : { code: 'internal_error', message: error instanceof Error ? error.message : String(error) };
    process.stderr.write(`${JSON.stringify({ error: body }, null, 2)}\n`);
    return 1;
  }
}
