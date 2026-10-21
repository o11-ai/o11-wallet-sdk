import { z } from "zod";

/** A card URL identifies the requested card, never a credential. */
export function cardAccessUrl(origin: string, cardId?: string, name?: string) {
  const base = new URL(origin).origin;
  if (!cardId) return `${base}/mcp${name?.trim() ? `/agents/${encodeURIComponent(name.trim().slice(0, 100))}` : ""}`;
  z.uuid().parse(cardId);
  return `${base}/mcp/cards/${cardId}${name?.trim() ? `/${encodeURIComponent(name.trim().slice(0, 100))}` : ""}`;
}

export function parseCardAccessUrl(value: string, origin: string) {
  const url = new URL(value);
  if (url.origin !== new URL(origin).origin || url.search || url.hash || url.username || url.password)
    throw new Error("Use this wallet's connection URL");
  if (url.pathname === "/mcp") return { resource: url.href, cardId: undefined, name: undefined };
  const agent = /^\/mcp\/agents\/([^/]+)$/.exec(url.pathname);
  if (agent) {
    const name = z.string().trim().min(1).max(100).parse(decodeURIComponent(agent[1]!));
    return { resource: cardAccessUrl(origin, undefined, name), cardId: undefined, name };
  }
  const match = /^\/mcp\/cards\/([^/]+)(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match) throw new Error("Use a valid card connection URL");
  const cardId = z.uuid().parse(match[1]);
  const name = match[2] ? z.string().trim().min(1).max(100).parse(decodeURIComponent(match[2])) : undefined;
  return { resource: cardAccessUrl(origin, cardId, name), cardId, name };
}

export function defaultCardName(name: string) {
  return `${name.trim().slice(0, 93)}’s card`;
}
