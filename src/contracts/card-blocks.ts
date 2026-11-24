import { z } from "zod";

/**
 * A card's block list: provider names (`apollo`) or exact tool ids (`apollo.people.search`), any case. A blocked entry
 * always wins over the card's allowed tools, including "*". The server stores entries normalized (`card-block-keys.ts`).
 */
export const blockedToolIdsSchema = z.array(z.string().trim().min(1).max(250)).max(500);
