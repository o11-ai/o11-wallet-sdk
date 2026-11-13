import { OstackError } from "./errors.js";

/** Days of the week as numbers, Sunday 0, matching cron. */
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_SETS: Record<string, number[]> = {
  daily: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
};

/** Hours of the week, in the workspace timezone: `days` plus a start and end as minutes after midnight. */
export type Window = { days: number[]; from: number; to: number };

/** "weekdays", "daily", "mon-fri", "mon,wed,fri" -> day numbers. */
export function parseDays(value: string): number[] {
  const text = value.trim().toLowerCase();
  if (DAY_SETS[text]) return [...DAY_SETS[text]];
  const days = new Set<number>();
  for (const part of text.split(",")) {
    const [start, end] = part.split("-").map((name) => DAY_NAMES.indexOf(name.trim().slice(0, 3) as (typeof DAY_NAMES)[number]));
    if (start === undefined || start < 0 || (end !== undefined && end < 0)) {
      throw new OstackError("invalid_flag", `Not a set of days: "${value}". Use weekdays, daily, weekends, mon-fri or mon,wed,fri.`);
    }
    for (let day = start; ; day = (day + 1) % 7) {
      days.add(day);
      if (end === undefined || day === end) break;
    }
  }
  return [...days].sort();
}

export function formatDays(days: number[]): string {
  const sorted = [...days].sort();
  for (const [name, set] of Object.entries(DAY_SETS)) if (set.join() === sorted.join()) return name;
  return sorted.map((day) => DAY_NAMES[day]).join(",");
}

/** "08:40" -> minutes after midnight. */
export function parseClock(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  const minutes = match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  if (!match || Number(match[1]) > 24 || Number(match[2]) > 59 || minutes > 24 * 60) {
    throw new OstackError("invalid_flag", `Not a time: "${value}". Use 24-hour HH:MM, such as 08:40.`);
  }
  return minutes;
}

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "weekdays 08:00-18:00" -> a window. */
export function parseWindow(value: string): Window {
  const match = value.trim().match(/^(\S+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!match) throw new OstackError("invalid_flag", `Not a window: "${value}". Use days and hours, such as "weekdays 08:00-18:00", or "any".`);
  const window = { days: parseDays(match[1]!), from: parseClock(match[2]!), to: parseClock(match[3]!) };
  if (window.to <= window.from) throw new OstackError("invalid_flag", "A window must end after it starts.");
  return window;
}

export function formatWindow(window: Window): string {
  return `${formatDays(window.days)} ${formatClock(window.from)}-${formatClock(window.to)}`;
}

/** The weekday and minute of the day at `date` in `timeZone`. */
const formatters = new Map<string, Intl.DateTimeFormat>();

export function localTime(date: Date, timeZone: string): { day: number; minutes: number; text: string } {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const day = DAY_NAMES.indexOf(parts.weekday!.toLowerCase().slice(0, 3) as (typeof DAY_NAMES)[number]);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { day, minutes, text: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` };
}

export function isOpen(window: Window, timeZone: string, date: Date): boolean {
  const local = localTime(date, timeZone);
  return window.days.includes(local.day) && local.minutes >= window.from && local.minutes < window.to;
}

/** The next moment the window is open, to the minute, or null if it never opens. */
export function nextOpen(window: Window, timeZone: string, date: Date): Date | null {
  if (isOpen(window, timeZone, date)) return date;
  const start = new Date(Math.ceil(date.getTime() / 60_000) * 60_000);
  for (let step = 0; step <= 8 * 24 * 60; step += 1) {
    const candidate = new Date(start.getTime() + step * 60_000);
    if (isOpen(window, timeZone, candidate)) return candidate;
  }
  return null;
}

/**
 * The next moment, from `date` on, that is `minutes` after midnight on one of `days` in `timeZone`, or null within
 * eight days (a time that a daylight-saving change skips is skipped that day).
 */
export function nextAt(days: number[], minutes: number, timeZone: string, date: Date): { date: Date; local: string } | null {
  const start = new Date(Math.ceil(date.getTime() / 60_000) * 60_000);
  for (let step = 0; step <= 8 * 24 * 60; step += 1) {
    const candidate = new Date(start.getTime() + step * 60_000);
    const local = localTime(candidate, timeZone);
    if (local.minutes === minutes && days.includes(local.day)) return { date: candidate, local: local.text };
  }
  return null;
}

export function checkTimeZone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new OstackError("invalid_flag", `Not a timezone: "${value}". Use an IANA name such as America/New_York or Europe/London.`);
  }
  return value;
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
