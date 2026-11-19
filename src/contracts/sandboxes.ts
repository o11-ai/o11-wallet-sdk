import { z } from "zod";

export const sandboxProviderSchema = z.enum(["boat", "vercel", "e2b"]);
/** Used when a create, help or pricing request names no provider. */
export const defaultSandboxProvider = "e2b" as const;
export const sandboxCommandActions = ["exec", "files-list", "files-stat", "files-lstat", "files-unlink", "files-rm", "files-rmdir",
  "files-rename", "files-copy", "files-access", "files-exists", "files-chmod", "files-chown", "files-symlink", "files-readlink",
  "files-realpath", "files-truncate", "files-mkdtemp", "files-append", "user-default", "user-create", "user-exec", "group-create", "group-add-user", "group-remove-user",
  "user-files-read", "user-files-write", "user-files-mkdir"] as const;
export const sandboxRequestSchema = z.strictObject({
  action: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  id: z.string().trim().min(1).max(128).optional(),
  provider: sandboxProviderSchema.optional(),
  connectionId: z.uuid().optional(),
  requestId: z.uuid().optional().describe("Reuse this ID and the same input to recover a mutation; uncertain commands are never automatically repeated."),
  params: z.record(z.string().min(1).max(100), z.json()).default({}),
});
export const sandboxSummarySchema = z.object({
  id: z.uuid(), name: z.string(), provider: sandboxProviderSchema, state: z.string(),
});
export const sandboxResultSchema = z.object({
  requestId: z.uuid().optional(), sandbox: sandboxSummarySchema.optional(),
  status: z.string().optional(), data: z.json(),
  /** Create with --size/--cpus/--memory-gb: the provider shape o11 chose and its price. */
  sizing: z.json().optional(),
});
/**
 * Agent sign-ins o11 keeps and refreshes for a person (`o11 login claude|codex`). Account-level actions take no id;
 * ai-access takes the sandbox id and returns a placeholder the AI proxy swaps for the real token. Secrets go in on
 * ai-login-save only and never come back out.
 */
export const aiLoginProviderSchema = z.enum(["claude", "codex"]);
export const aiLoginActions = ["ai-login-save", "ai-login-status", "ai-login-delete", "ai-access"] as const;
export const aiLoginSaveParamsSchema = z.strictObject({
  provider: aiLoginProviderSchema,
  accessToken: z.string().min(1).max(8192), refreshToken: z.string().min(1).max(8192),
  /** ISO time or Unix milliseconds. */
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.number().int().positive()]),
  accountId: z.string().min(1).max(200).optional(),
  /** Claude only: the scopes its sign-in was granted (claudeAiOauth.scopes), which the refresh asks for again. */
  scopes: z.array(z.string().regex(/^[a-z0-9:_-]{1,100}$/)).max(50).optional(),
});
export const aiLoginProviderParamsSchema = z.strictObject({ provider: aiLoginProviderSchema });
export const aiLoginStatusSchema = z.object({ provider: aiLoginProviderSchema, connected: z.boolean(), expiresAt: z.string().nullable(), needsSignIn: z.boolean() });
export const aiAccessResultSchema = z.object({ provider: aiLoginProviderSchema, baseUrl: z.url(), placeholder: z.string().regex(/^o11ai_/) });
export type AiLoginProvider = z.infer<typeof aiLoginProviderSchema>;
export type SandboxRequest = z.input<typeof sandboxRequestSchema>;
export type SandboxInput = z.infer<typeof sandboxRequestSchema>;
export type SandboxResult = z.infer<typeof sandboxResultSchema>;
export type SandboxProvider = z.infer<typeof sandboxProviderSchema>;

export function sandboxCommandResult(action: string, params: SandboxInput["params"], result: {
  exitCode: number; stdout: string; stderr: string;
}): SandboxResult["data"] {
  if (action === "files-exists") return { exists: result.exitCode === 0 };
  if (action === "user-exec") return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
  if (result.exitCode !== 0) return { error: "COMMAND_FAILED", exitCode: result.exitCode, stderr: result.stderr };
  if (action === "user-files-read") return { path: params.path ?? null, content: result.stdout };
  if (action === "user-files-write" || action === "user-files-mkdir") return { path: params.path ?? null, username: params.username ?? null };
  const output = result.stdout.trim();
  if (action === "user-create" && typeof params.username === "string") return { username: params.username, homeDir: ["", "home", params.username].join("/") };
  if (action === "group-create" && typeof params.groupname === "string") return { groupname: params.groupname, sharedDir: `/shared/${params.groupname}` };
  if (["files-readlink", "files-realpath", "files-mkdtemp"].includes(action)) return { path: output };
  if (action === "user-default") {
    const [username, group] = output.split("\n");
    if (!username || !group) throw new Error("The sandbox returned an invalid user identity");
    return { username, group };
  }
  if (action === "files-list") {
    const lines = output.split("\n").filter(Boolean);
    if (!params.withFileTypes) return { entries: lines };
    return { entries: lines.map(line => {
      const divider = line.lastIndexOf("|"), name = line.slice(0, divider), type = line.slice(divider + 1);
      if (divider < 1 || !/^[fdlbcps]$/.test(type)) throw new Error("The sandbox returned an invalid directory entry");
      return { name, type, parentPath: params.path ?? "" };
    }) };
  }
  if (["files-stat", "files-lstat"].includes(action)) {
    const fields = output.split("|");
    if (fields.length !== 13 || fields.some((value, index) => !(index === 1 ? /^[0-9a-f]+$/i : /^-?\d+(?:\.\d+)?$/).test(value)))
      throw new Error("The sandbox returned invalid file metadata");
    const values = fields.map((value, index) => index === 1 ? Number.parseInt(value, 16) : Number(value));
    if (!values.every(Number.isFinite)) throw new Error("The sandbox returned invalid file metadata");
    const [size, mode, uid, gid, atime, mtime, ctime, birthtime, nlink, ino, dev, blksize, blocks] = values;
    return z.json().parse({ size, mode, uid, gid, atimeMs: atime! * 1000, mtimeMs: mtime! * 1000, ctimeMs: ctime! * 1000,
      birthtimeMs: birthtime! * 1000, nlink, ino, dev, rdev: 0, blksize, blocks });
  }
  return { completed: true };
}
