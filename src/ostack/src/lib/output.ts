import { OstackError } from "./errors.js";

export function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printText(value: string): void {
  process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
}

/** Expected failures carry a stable code skills can branch on. Anything else is reported without its internals. */
export function printError(error: unknown): void {
  const body =
    error instanceof OstackError
      ? { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }
      : { code: "internal_error", message: error instanceof Error ? error.message : String(error) };
  process.stderr.write(`${JSON.stringify({ error: body }, null, 2)}\n`);
  process.exitCode = 1;
}
