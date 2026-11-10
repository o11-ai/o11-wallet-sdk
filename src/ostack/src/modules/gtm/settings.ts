import { OstackError } from "../../lib/errors.js";
import { isRecord } from "../../lib/paths.js";
import type { ModuleValues } from "../../lib/remote.js";
import { formatWindow, parseWindow, type Window } from "../../lib/time.js";

export const MODES = ["draft", "send"] as const;
export type Mode = (typeof MODES)[number];

export type Limits = {
  new_per_day: number;
  touches_per_day: number;
  per_company: number;
  max_touches: number;
};

export const LIMIT_KEYS = ["new_per_day", "touches_per_day", "per_company", "max_touches"] as const;

/** The gtm module's settings, kept under `modules.gtm.settings` in ostack.json. */
export type GtmSettings = {
  mode: Mode;
  limits: Limits;
  /** Days to wait after the previous touch before each follow-up. Its length plus the first message is max_touches. */
  follow_up_days: number[];
  /** When cold messages may go out, in the workspace timezone. Null means any time. Replies are never held. */
  send_window: Window | null;
};

export const DEFAULT_LIMITS: Limits = { new_per_day: 20, touches_per_day: 60, per_company: 1, max_touches: 4 };
export const DEFAULT_FOLLOW_UP_DAYS = [3, 4, 7];
export const DEFAULT_SEND_WINDOW: Window = { days: [1, 2, 3, 4, 5], from: 8 * 60, to: 18 * 60 };

export function defaultSettings(): GtmSettings {
  return {
    mode: "draft",
    limits: { ...DEFAULT_LIMITS },
    follow_up_days: [...DEFAULT_FOLLOW_UP_DAYS],
    send_window: { ...DEFAULT_SEND_WINDOW, days: [...DEFAULT_SEND_WINDOW.days] },
  };
}

/** Keeps max_touches and the follow-up schedule in step: the schedule is cut or extended (repeating its last gap) to fit. */
export function fitSchedule(days: number[], maxTouches: number): number[] {
  const wanted = Math.max(0, maxTouches - 1);
  const fill = days.at(-1) ?? DEFAULT_FOLLOW_UP_DAYS.at(-1)!;
  return Array.from({ length: wanted }, (_, index) => days[index] ?? fill);
}

/** Reads stored settings, falling back to defaults for anything missing or invalid. Workspaces from 0.2 have no schedule or window yet. */
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
    mode: source.mode === "send" ? "send" : "draft",
    limits: parsedLimits,
    follow_up_days: fitSchedule(days, parsedLimits.max_touches),
    send_window: window,
  };
}

/** gtm's settings as the wallet stores them: unset fields fall back to the defaults, and "any" is a window that is always open. */
export function fromRemote(values: ModuleValues): GtmSettings {
  return readSettings({
    mode: values.mode,
    limits: values.limits,
    ...(Array.isArray(values.followUpDays) ? { follow_up_days: values.followUpDays } : {}),
    ...(typeof values.sendWindow === "string" ? { send_window: values.sendWindow } : {}),
  });
}

/** gtm's stored values for a change. */
export function toPatch(settings: GtmSettings): ModuleValues {
  return {
    mode: settings.mode,
    limits: settings.limits,
    followUpDays: settings.follow_up_days,
    sendWindow: settings.send_window ? formatWindow(settings.send_window) : "any",
  };
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export const SETTING_KEYS = ["mode", ...LIMIT_KEYS, "follow_up_days", "send_window"] as const;

/** Applies one `ostack settings set` change, keeping the limits consistent with each other. */
export function applySetting(settings: GtmSettings, key: string, value: string): GtmSettings {
  if (key === "follow_up_days") {
    const days = value === "none" || value === "0" ? [] : value.split(",").map((part) => Number(part.trim()));
    if (!days.every(isPositive)) {
      throw new OstackError("invalid_flag", 'follow_up_days is the days after the previous touch for each follow-up, such as "3,4,7", or "none".');
    }
    return { ...settings, follow_up_days: days, limits: { ...settings.limits, max_touches: days.length + 1 } };
  }
  if (key === "send_window") {
    return { ...settings, send_window: value === "any" ? null : parseWindow(value) };
  }
  if (key === "mode") {
    if (!(MODES as readonly string[]).includes(value)) throw new OstackError("invalid_flag", "mode must be draft or send.");
    return { ...settings, mode: value as Mode };
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

/** What `settings show` prints for this module. */
export function showSettings(settings: GtmSettings) {
  return { ...settings, send_window: settings.send_window ? formatWindow(settings.send_window) : "any" };
}
