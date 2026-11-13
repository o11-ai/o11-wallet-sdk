import { OstackError } from "../../lib/errors.js";
import { isRecord } from "../../lib/paths.js";
import type { PlaybookValues } from "../../lib/remote.js";
import { formatClock, formatWindow, nextAt, parseClock, parseWindow, type Window } from "../../lib/time.js";

export const MODES = ["draft", "send"] as const;
export type Mode = (typeof MODES)[number];

export type Limits = {
  new_per_day: number;
  touches_per_day: number;
  per_company: number;
  max_touches: number;
};

export const LIMIT_KEYS = ["new_per_day", "touches_per_day", "per_company", "max_touches"] as const;

/** GTM's settings as the CLI applies them. The wallet stores them in ostack_gtm_setting; audience files can override them. */
export type GtmSettings = {
  send_mode: Mode;
  limits: Limits;
  /** Days to wait after the previous touch before each follow-up. Its length plus the first message is max_touches. */
  follow_up_days: number[];
  /** When cold messages may go out, in the workspace timezone. Null means any time. Replies are never held. */
  send_window: Window | null;
  /**
   * When scheduled first messages land, as minutes after midnight in the workspace timezone, on the send window's
   * days. Outbound runs the evening before and schedules each message for then. Null sends as the run goes.
   */
  send_at: number | null;
};

export const DEFAULT_LIMITS: Limits = { new_per_day: 20, touches_per_day: 60, per_company: 1, max_touches: 4 };
export const DEFAULT_FOLLOW_UP_DAYS = [3, 4, 7];
export const DEFAULT_SEND_WINDOW: Window = { days: [1, 2, 3, 4, 5], from: 8 * 60, to: 18 * 60 };
export const DEFAULT_SEND_AT = 8 * 60;
/** Values that turn scheduled sending off. */
const OFF = ["off", "now", "none", "false"];

export function defaultSettings(): GtmSettings {
  return {
    send_mode: "draft",
    limits: { ...DEFAULT_LIMITS },
    follow_up_days: [...DEFAULT_FOLLOW_UP_DAYS],
    send_window: { ...DEFAULT_SEND_WINDOW, days: [...DEFAULT_SEND_WINDOW.days] },
    send_at: DEFAULT_SEND_AT,
  };
}

/** Keeps max_touches and the follow-up schedule in step: the schedule is cut or extended (repeating its last gap) to fit. */
export function fitSchedule(days: number[], maxTouches: number): number[] {
  const wanted = Math.max(0, maxTouches - 1);
  const fill = days.at(-1) ?? DEFAULT_FOLLOW_UP_DAYS.at(-1)!;
  return Array.from({ length: wanted }, (_, index) => days[index] ?? fill);
}

/** Reads settings in the CLI's own names, falling back to defaults for anything missing or invalid. 0.6 and older called send_mode mode. */
export function readSettings(raw: unknown): GtmSettings {
  const source = isRecord(raw) ? raw : {};
  const limits = isRecord(source.limits) ? source.limits : {};
  const parsedLimits = Object.fromEntries(
    LIMIT_KEYS.map((key) => {
      const value = limits[key];
      return [key, isPositive(value) ? value : DEFAULT_LIMITS[key]];
    }),
  ) as Limits;
  const days = Array.isArray(source.follow_up_days) ? source.follow_up_days.filter(isPositive) : DEFAULT_FOLLOW_UP_DAYS;
  let window: Window | null = defaultSettings().send_window;
  if (source.send_window === null) window = null;
  else if (source.send_window === "any") window = null;
  else if (typeof source.send_window === "string") window = parseWindow(source.send_window);
  return {
    send_mode: (source.send_mode ?? source.mode) === "send" ? "send" : "draft",
    limits: parsedLimits,
    follow_up_days: fitSchedule(days, parsedLimits.max_touches),
    send_window: window,
    send_at: readSendAt(source.send_at),
  };
}

/** A stored send_at: "09:00", or "off". Anything else uses the default. */
function readSendAt(value: unknown): number | null {
  if (typeof value !== "string") return DEFAULT_SEND_AT;
  if (OFF.includes(value.trim().toLowerCase())) return null;
  try {
    const sendAt = parseClock(value);
    return sendAt < 24 * 60 ? sendAt : DEFAULT_SEND_AT;
  } catch {
    return DEFAULT_SEND_AT;
  }
}

/** "08:00", or "off". */
function formatSendAt(sendAt: number | null): string {
  return sendAt === null ? "off" : formatClock(sendAt);
}

/**
 * When the next scheduled first message should land: the next day in the send window (any day without one) at
 * send_at. Null when scheduled sending is off. `local` is the workspace's clock; `utc` is what mail tools take.
 */
export function nextSendAt(settings: GtmSettings, timeZone: string, date: Date): { local: string; utc: string } | null {
  if (settings.send_at === null) return null;
  const next = nextAt(settings.send_window?.days ?? [0, 1, 2, 3, 4, 5, 6], settings.send_at, timeZone, date);
  return next ? { local: next.local, utc: next.date.toISOString() } : null;
}

/** GTM's settings as the wallet stores them: unset fields fall back to the defaults, and "any" is a window that is always open. */
export function fromRemote(values: PlaybookValues): GtmSettings {
  return readSettings({
    send_mode: values.sendMode,
    limits: values.limits,
    ...(Array.isArray(values.followUpDays) ? { follow_up_days: values.followUpDays } : {}),
    ...(typeof values.sendWindow === "string" ? { send_window: values.sendWindow } : {}),
    ...(typeof values.sendAt === "string" ? { send_at: values.sendAt } : {}),
  });
}

/** GTM's stored values for a change. */
export function toPatch(settings: GtmSettings): PlaybookValues {
  return {
    sendMode: settings.send_mode,
    limits: settings.limits,
    followUpDays: settings.follow_up_days,
    sendWindow: settings.send_window ? formatWindow(settings.send_window) : "any",
    sendAt: formatSendAt(settings.send_at),
  };
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export const SETTING_KEYS = ["send_mode", ...LIMIT_KEYS, "follow_up_days", "send_window", "send_at"] as const;
/** Names from 0.7 and older, still accepted. */
export const SETTING_ALIASES: Record<string, string> = { mode: "send_mode" };

/** Applies one `ostack settings set` change, keeping the limits consistent with each other. */
export function applySetting(settings: GtmSettings, name: string, value: string): GtmSettings {
  const key = SETTING_ALIASES[name] ?? name;
  if (key === "follow_up_days") {
    const off = ["none", "off", "0", "false"].includes(value.trim().toLowerCase());
    const days = off ? [] : value.split(",").map((part) => Number(part.trim()));
    if (!days.every(isPositive)) {
      throw new OstackError("invalid_flag", 'follow_up_days is the days after the previous message for each follow-up, such as "3,4,7", or "off".');
    }
    return { ...settings, follow_up_days: days, limits: { ...settings.limits, max_touches: days.length + 1 } };
  }
  if (key === "send_window") {
    return { ...settings, send_window: value === "any" ? null : parseWindow(value) };
  }
  if (key === "send_at") {
    if (OFF.includes(value.trim().toLowerCase())) return { ...settings, send_at: null };
    const sendAt = parseClock(value);
    if (sendAt >= 24 * 60) throw new OstackError("invalid_flag", 'send_at is a time of day, such as "08:00", or "off".');
    return { ...settings, send_at: sendAt };
  }
  if (key === "send_mode") {
    if (!(MODES as readonly string[]).includes(value)) throw new OstackError("invalid_flag", "send_mode must be draft or send.");
    return { ...settings, send_mode: value as Mode };
  }
  if (!(LIMIT_KEYS as readonly string[]).includes(key)) {
    throw new OstackError("unknown_setting", `Unknown gtm setting "${key}".`, { settings: SETTING_KEYS });
  }
  const number = Number(value);
  if (!isPositive(number)) throw new OstackError("invalid_flag", `${key} must be a positive whole number.`);
  const limits = { ...settings.limits, [key]: number };
  if (limits.touches_per_day < limits.new_per_day) {
    throw new OstackError("invalid_flag", "touches_per_day must be at least new_per_day, since every first message is also a touch.");
  }
  return { ...settings, limits, follow_up_days: fitSchedule(settings.follow_up_days, limits.max_touches) };
}

/** What `settings show` prints for GTM. */
export function showSettings(settings: GtmSettings) {
  return { ...settings, follow_ups: settings.follow_up_days.length > 0 ? "on" : "off", send_window: settings.send_window ? formatWindow(settings.send_window) : "any", send_at: formatSendAt(settings.send_at) };
}

/** Settings an audience's audience.md can set in its front matter, and follow-up.md's `days`. */
const AUDIENCE_KEYS = new Set(["send_mode", ...LIMIT_KEYS, "follow_up_days", "send_window", "send_at"]);

/** YAML values as `settings set` text: lists join with commas, and false (YAML's "off") turns follow-ups off. */
function settingText(value: unknown): string | null {
  if (value === false) return "off";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value) && value.every((item) => typeof item === "number" || typeof item === "string")) return value.length ? value.join(",") : "off";
  return null;
}

export type AudienceSource = { path: string; data: Record<string, unknown> };

/**
 * An audience's settings: the team's and this person's, then the front matter of the audience's audience.md and
 * follow-up.md (`days: 3, 4, 7` or `days: off`). A value that does not parse is skipped and named in `warnings`.
 */
export function withAudience(base: GtmSettings, sources: { audience?: AudienceSource; followUp?: AudienceSource }) {
  let settings = base;
  const from: string[] = [];
  const warnings: string[] = [];
  const apply = (path: string, key: string, raw: unknown) => {
    const text = settingText(raw);
    try {
      if (text === null) throw new OstackError("invalid_flag", "not a single value or list");
      settings = applySetting(settings, key, text);
      if (!from.includes(path)) from.push(path);
    } catch (error) {
      warnings.push(`${path}: ${key} was skipped (${error instanceof Error ? error.message : String(error)})`);
    }
  };
  for (const [key, raw] of Object.entries(sources.audience?.data ?? {})) {
    const name = SETTING_ALIASES[key] ?? key;
    if (AUDIENCE_KEYS.has(name)) apply(sources.audience!.path, name, raw);
  }
  if (sources.followUp && "days" in sources.followUp.data) apply(sources.followUp.path, "follow_up_days", sources.followUp.data.days);
  return { settings, from, warnings };
}
