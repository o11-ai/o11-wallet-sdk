import { z } from "zod";
import { ToolClient } from "./client";
import { parseCardAccessUrl } from "./contracts/card-access";

export const tokensSchema = z.object({ access_token: z.string().startsWith("o11_"),
  refresh_token: z.string().min(40).optional(), expires_in: z.number().int().positive(), task: z.string().optional() });
export function walletOrigin(value: string) {
  new ToolClient({ baseUrl: value, apiKey: "o11_validation" });
  const url = new URL(value);
  if (url.pathname !== "/") throw new Error("Use the wallet origin without a path");
  return url.origin;
}
export async function tokenRequest(baseUrl: string, input: Record<string, string>, resource?: string) {
  const origin = walletOrigin(baseUrl);
  const response = await fetch(`${origin}/oauth/token`, { method: "POST", redirect: "error",
    signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...input, resource: parseCardAccessUrl(resource ?? `${origin}/mcp`, origin).resource }),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(value);
    return { error: error.success ? error.data.error : "unavailable" } as const;
  }
  return { tokens: tokensSchema.parse(value) } as const;
}
