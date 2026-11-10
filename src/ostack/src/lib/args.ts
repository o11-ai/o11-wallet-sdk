import { OstackError } from "./errors.js";

export type Args = { positionals: string[]; flags: Record<string, string | true> };

export function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    if (equals > 0) {
      flags[arg.slice(2, equals)] = arg.slice(equals + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[arg.slice(2)] = next;
      index++;
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return { positionals, flags };
}

export function optional(args: Args, name: string): string | undefined {
  const value = args.flags[name];
  if (value === undefined) return undefined;
  if (value === true) throw new OstackError("invalid_flag", `--${name} needs a value.`);
  return value;
}

export function required(args: Args, name: string): string {
  const value = optional(args, name);
  if (!value) throw new OstackError("missing_flag", `--${name} is required.`);
  return value;
}

export function integer(args: Args, name: string, fallback: number): number {
  const value = optional(args, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new OstackError("invalid_flag", `--${name} must be a positive integer.`);
  }
  return parsed;
}

export function oneOf<T extends string>(args: Args, name: string, allowed: readonly T[]): T {
  const value = required(args, name);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new OstackError("invalid_flag", `--${name} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

/** Reads `--<name>` text directly, or `--<name>-file <path|->` from a file or stdin. */
export async function textInput(args: Args, name: string): Promise<string | undefined> {
  const inline = optional(args, name);
  const file = optional(args, `${name}-file`);
  if (inline !== undefined && file !== undefined) {
    throw new OstackError("invalid_flag", `Use --${name} or --${name}-file, not both.`);
  }
  if (file === undefined) return inline;
  return readFileOrStdin(file);
}

export async function readFileOrStdin(path: string): Promise<string> {
  if (path === "-") return Bun.stdin.text();
  const file = Bun.file(path);
  if (!(await file.exists())) throw new OstackError("file_not_found", `No file at ${path}.`);
  return file.text();
}

export function parseDate(value: string, flag: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new OstackError("invalid_flag", `--${flag} must be an ISO date such as 2026-11-03.`);
  }
  return date;
}
