import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Codex's highest reasoning effort, and the level every recent Codex model accepts when max is not offered. */
export const CODEX_MAX = "max";
export const CODEX_FALLBACK = "xhigh";
export type CodexEffort = typeof CODEX_MAX | typeof CODEX_FALLBACK;

type CachedModel = { slug?: unknown; supported_reasoning_levels?: unknown };

function levels(model: CachedModel): string[] {
  const list = Array.isArray(model.supported_reasoning_levels) ? model.supported_reasoning_levels : [];
  return list.flatMap((level: unknown) =>
    level && typeof level === "object" && "effort" in level && typeof level.effort === "string" ? [level.effort] : []);
}

/** The top-level `model = "..."` in Codex's config.toml, before any [section]. */
export function configuredModel(configToml: string): string | null {
  const top = configToml.split(/^\s*\[/m)[0] ?? "";
  return top.match(/^\s*model\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

/**
 * max when Codex's model list says the model that will run offers it, otherwise xhigh, so a run never fails on an
 * effort its model rejects. With no configured model, max only when every cached model offers it.
 */
export function pickCodexEffort(modelsCacheJson: string | null, configToml: string | null): CodexEffort {
  if (!modelsCacheJson) return CODEX_FALLBACK;
  let parsed: unknown;
  try {
    parsed = JSON.parse(modelsCacheJson);
  } catch {
    return CODEX_FALLBACK;
  }
  const raw = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "models" in parsed ? parsed.models : null;
  const models: CachedModel[] = Array.isArray(raw) ? raw.filter((model): model is CachedModel => !!model && typeof model === "object") : [];
  if (models.length === 0) return CODEX_FALLBACK;
  const slug = configToml ? configuredModel(configToml) : null;
  const chosen = slug ? models.filter((model) => model.slug === slug) : models;
  if (chosen.length === 0) return CODEX_FALLBACK;
  return chosen.every((model) => levels(model).includes(CODEX_MAX)) ? CODEX_MAX : CODEX_FALLBACK;
}

const readIfPresent = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

/** The effort for Codex runs on this computer, read from its own model list (CODEX_HOME, or ~/.codex). */
export function codexRunEffort(): CodexEffort {
  const home = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  try {
    return pickCodexEffort(readIfPresent(join(home, "models_cache.json")), readIfPresent(join(home, "config.toml")));
  } catch {
    return CODEX_FALLBACK;
  }
}
