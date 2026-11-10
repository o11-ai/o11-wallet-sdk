import { OstackError } from "./errors.js";
import { formatClock, formatDays, localTime, parseClock, parseDays } from "./time.js";

/**
 * When a workflow runs, in the workspace's local time. Either once a day at `at`, or every `every_minutes`
 * between `from` and `to`, starting `offset` minutes past the hour so runs don't all land on :00.
 */
export type ScheduleSpec =
  | { days: number[]; at: number }
  | { days: number[]; every_minutes: number; from: number; to: number; offset: number };

const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Reads a spec from a module manifest or from ostack.json. */
export function parseSchedule(raw: Record<string, unknown>): ScheduleSpec {
  const days = parseDays(typeof raw.days === "string" ? raw.days : "daily");
  if (typeof raw.at === "string") return { days, at: parseClock(raw.at) };
  const every = Number(raw.every_minutes);
  if (![15, 20, 30, 60, 120, 180, 240].includes(every)) {
    throw new OstackError("invalid_flag", "every_minutes must be 15, 20, 30, 60, 120, 180 or 240, so runs line up with the clock.");
  }
  const from = parseClock(typeof raw.from === "string" ? raw.from : "00:00");
  const to = parseClock(typeof raw.to === "string" ? raw.to : "24:00");
  const offset = Number(raw.offset ?? 0);
  if (to <= from) throw new OstackError("invalid_flag", "A schedule's hours must end after they start.");
  if (!Number.isInteger(offset) || offset < 0 || offset >= Math.min(every, 60)) {
    throw new OstackError("invalid_flag", `offset must be a whole number of minutes below ${Math.min(every, 60)}.`);
  }
  return { days, every_minutes: every, from, to, offset };
}

/** The form kept in ostack.json, readable by people. */
export function storeSchedule(spec: ScheduleSpec): Record<string, unknown> {
  if ("at" in spec) return { days: formatDays(spec.days), at: formatClock(spec.at) };
  return { days: formatDays(spec.days), every_minutes: spec.every_minutes, from: formatClock(spec.from), to: formatClock(spec.to), offset: spec.offset };
}

/** Hours whose runs fall inside [from, to). */
function hours(spec: Extract<ScheduleSpec, { every_minutes: number }>): number[] {
  const result: number[] = [];
  for (let hour = 0; hour < 24; hour += Math.max(1, spec.every_minutes / 60)) {
    if (hour * 60 + spec.offset >= spec.from && hour * 60 + spec.offset < spec.to) result.push(hour);
  }
  return result;
}

function minutes(spec: Extract<ScheduleSpec, { every_minutes: number }>): number[] {
  const step = Math.min(spec.every_minutes, 60);
  const result: number[] = [];
  for (let minute = spec.offset; minute < 60; minute += step) result.push(minute);
  return result;
}

/** A five-field cron expression in local time: what Claude Desktop's Custom schedule and crontab take. */
export function toCron(spec: ScheduleSpec): string {
  const days = spec.days.length === 7 ? "*" : spec.days.join(",");
  if ("at" in spec) return `${spec.at % 60} ${Math.floor(spec.at / 60)} * * ${days}`;
  return `${minutes(spec).join(",")} ${hours(spec).join(",")} * * ${days}`;
}

/** An RFC 5545 recurrence rule in local time: what Codex's custom schedule takes. */
export function toRRule(spec: ScheduleSpec): string {
  const byDay = `BYDAY=${spec.days.map((day) => RRULE_DAYS[day]).join(",")}`;
  if ("at" in spec) return `RRULE:FREQ=WEEKLY;${byDay};BYHOUR=${Math.floor(spec.at / 60)};BYMINUTE=${spec.at % 60}`;
  return `RRULE:FREQ=WEEKLY;${byDay};BYHOUR=${hours(spec).join(",")};BYMINUTE=${minutes(spec).join(",")}`;
}

export function describeSchedule(spec: ScheduleSpec, timeZone: string): string {
  const days = formatDays(spec.days);
  if ("at" in spec) return `${days} at ${formatClock(spec.at)} (${timeZone})`;
  const every = spec.every_minutes < 60 ? `every ${spec.every_minutes} minutes` : `every ${spec.every_minutes / 60} hours`;
  return `${days}, ${every} from ${formatClock(spec.from)} to ${formatClock(spec.to)} (${timeZone})`;
}

/** Runs per day, so a summary can say what a schedule costs. */
export function runsPerDay(spec: ScheduleSpec): number {
  return "at" in spec ? 1 : hours(spec).length * minutes(spec).length;
}

/** Minutes to add to a local time in `from` to get the same moment in `to`, at `date`. */
export function zoneOffset(from: string, to: string, date: Date): number {
  const a = localTime(date, from);
  const b = localTime(date, to);
  let diff = b.day * 1440 + b.minutes - (a.day * 1440 + a.minutes);
  if (diff > 7 * 720) diff -= 7 * 1440;
  if (diff < -7 * 720) diff += 7 * 1440;
  return diff;
}

/**
 * The same schedule expressed in another zone's clock, for schedulers that only know the computer's local time.
 * Correct for today's offsets; a daylight-saving change can move it by an hour, which the run guard (`isDue`) absorbs.
 */
export function shiftSchedule(spec: ScheduleSpec, minutes: number): ScheduleSpec {
  if (minutes === 0) return spec;
  if ("at" in spec) {
    const total = spec.at + minutes;
    const dayShift = Math.floor(total / 1440);
    return { days: spec.days.map((day) => (((day + dayShift) % 7) + 7) % 7).sort(), at: ((total % 1440) + 1440) % 1440 };
  }
  const step = Math.min(spec.every_minutes, 60);
  const offset = (((spec.offset + minutes) % step) + step) % step;
  const from = spec.from + minutes;
  const to = spec.to + minutes;
  // Hours that cross midnight in the other zone: fire all day there and let the guard keep only the real hours.
  if (from < 0 || to > 1440) return { ...spec, from: 0, to: 1440, offset, days: [0, 1, 2, 3, 4, 5, 6] };
  return { ...spec, from, to, offset };
}

/**
 * Whether a scheduled run that fires now belongs to this schedule, in the workspace timezone. Schedulers fire late
 * (catch-up after sleep) or an hour off (daylight saving); a run far from its slot should do nothing.
 */
export function isDue(spec: ScheduleSpec, timeZone: string, date: Date): boolean {
  const local = localTime(date, timeZone);
  if (!spec.days.includes(local.day)) return false;
  if ("at" in spec) return local.minutes >= spec.at - 90 && local.minutes <= spec.at + 180;
  return local.minutes >= spec.from - 30 && local.minutes < spec.to + spec.every_minutes;
}
