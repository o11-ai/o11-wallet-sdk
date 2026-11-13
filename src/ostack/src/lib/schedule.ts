import { OstackError } from "./errors.js";
import { formatClock, formatDays, localTime, parseClock, parseDays } from "./time.js";

/**
 * One rule of a schedule, in the workspace's local time: once a day at `at`, or every `every_minutes` between
 * `from` and `to`, starting `offset` minutes past the hour so runs don't all land on :00.
 */
export type ScheduleSlot =
  | { days: number[]; at: number }
  | { days: number[]; every_minutes: number; from: number; to: number; offset: number };

/** When a workflow runs: one or more slots on separate days, such as every 30 minutes on weekdays and hourly on weekends. */
export type ScheduleSpec = ScheduleSlot[];

type Interval = Extract<ScheduleSlot, { every_minutes: number }>;

const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseSlot(raw: Record<string, unknown>): ScheduleSlot {
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

/** Monday first, so weekdays come before weekends. */
const firstDay = (slot: ScheduleSlot) => Math.min(...slot.days.map((day) => (day + 6) % 7));

function ordered(slots: ScheduleSlot[]): ScheduleSpec {
  const seen = new Set<number>();
  for (const slot of slots) {
    for (const day of slot.days) {
      if (seen.has(day)) throw new OstackError("invalid_flag", "Each day can follow only one rule of a schedule.");
      seen.add(day);
    }
  }
  if (slots.length === 0) throw new OstackError("invalid_flag", "A schedule needs at least one rule.");
  return [...slots].sort((a, b) => firstDay(a) - firstDay(b));
}

/** Reads a spec from a playbook manifest or ostack.json: one slot, or a list of slots on separate days. */
export function parseSchedule(raw: unknown): ScheduleSpec {
  const slots = Array.isArray(raw) ? raw : [raw];
  return ordered(slots.map((slot) => {
    if (typeof slot !== "object" || slot === null || Array.isArray(slot)) throw new OstackError("invalid_flag", "Each schedule rule must be an object.");
    return parseSlot(slot as Record<string, unknown>);
  }));
}

/** Replaces the rule for `slot`'s days and keeps every other day as it was. */
export function withSlot(spec: ScheduleSpec, slot: ScheduleSlot): ScheduleSpec {
  return ordered([...withoutDays(spec, slot.days), slot]);
}

/** The schedule without `days`; empty when nothing is left. */
export function withoutDays(spec: ScheduleSpec, days: number[]): ScheduleSlot[] {
  return spec.map((slot) => ({ ...slot, days: slot.days.filter((day) => !days.includes(day)) })).filter((slot) => slot.days.length > 0);
}

function storeSlot(slot: ScheduleSlot): Record<string, unknown> {
  if ("at" in slot) return { days: formatDays(slot.days), at: formatClock(slot.at) };
  return { days: formatDays(slot.days), every_minutes: slot.every_minutes, from: formatClock(slot.from), to: formatClock(slot.to), offset: slot.offset };
}

/** The form kept in ostack.json, readable by people: one object for a single rule, so older files stay the same. */
export function storeSchedule(spec: ScheduleSpec): Record<string, unknown> | Record<string, unknown>[] {
  return spec.length === 1 ? storeSlot(spec[0]!) : spec.map(storeSlot);
}

/** Hours whose runs fall inside [from, to). */
function hours(slot: Interval): number[] {
  const result: number[] = [];
  for (let hour = 0; hour < 24; hour += Math.max(1, slot.every_minutes / 60)) {
    if (hour * 60 + slot.offset >= slot.from && hour * 60 + slot.offset < slot.to) result.push(hour);
  }
  return result;
}

function minutes(slot: Interval): number[] {
  const step = Math.min(slot.every_minutes, 60);
  const result: number[] = [];
  for (let minute = slot.offset; minute < 60; minute += step) result.push(minute);
  return result;
}

/** Five-field cron expressions in local time, one per slot: what Claude Desktop's Custom schedule and crontab take. */
export function toCron(spec: ScheduleSpec): string[] {
  return spec.map((slot) => {
    const days = slot.days.length === 7 ? "*" : slot.days.join(",");
    if ("at" in slot) return `${slot.at % 60} ${Math.floor(slot.at / 60)} * * ${days}`;
    return `${minutes(slot).join(",")} ${hours(slot).join(",")} * * ${days}`;
  });
}

/** RFC 5545 recurrence rules in local time, one per slot: what Codex's custom schedule takes. */
export function toRRule(spec: ScheduleSpec): string[] {
  return spec.map((slot) => {
    const byDay = `BYDAY=${slot.days.map((day) => RRULE_DAYS[day]).join(",")}`;
    if ("at" in slot) return `RRULE:FREQ=WEEKLY;${byDay};BYHOUR=${Math.floor(slot.at / 60)};BYMINUTE=${slot.at % 60}`;
    return `RRULE:FREQ=WEEKLY;${byDay};BYHOUR=${hours(slot).join(",")};BYMINUTE=${minutes(slot).join(",")}`;
  });
}

function describeSlot(slot: ScheduleSlot): string {
  const days = formatDays(slot.days);
  if ("at" in slot) return `${days} at ${formatClock(slot.at)}`;
  const every = slot.every_minutes < 60 ? `every ${slot.every_minutes} minutes` : slot.every_minutes === 60 ? "every hour" : `every ${slot.every_minutes / 60} hours`;
  return `${days}, ${every} from ${formatClock(slot.from)} to ${formatClock(slot.to)}`;
}

export function describeSchedule(spec: ScheduleSpec, timeZone: string): string {
  return `${spec.map(describeSlot).join("; ")} (${timeZone})`;
}

/** Runs per day for each slot's days, so a summary can say what a schedule costs: { weekdays: 36, weekends: 18 }. */
export function runsPerDay(spec: ScheduleSpec): Record<string, number> {
  return Object.fromEntries(spec.map((slot) => [formatDays(slot.days), "at" in slot ? 1 : hours(slot).length * minutes(slot).length]));
}

/** A short name for a slot's days, for task names: "weekdays", "weekends", "mon-wed-fri". */
export function slotLabel(slot: ScheduleSlot): string {
  return formatDays(slot.days).replaceAll(",", "-");
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

function shiftSlot(slot: ScheduleSlot, minutes: number): ScheduleSlot {
  if ("at" in slot) {
    const total = slot.at + minutes;
    const dayShift = Math.floor(total / 1440);
    return { days: slot.days.map((day) => (((day + dayShift) % 7) + 7) % 7).sort(), at: ((total % 1440) + 1440) % 1440 };
  }
  const step = Math.min(slot.every_minutes, 60);
  const offset = (((slot.offset + minutes) % step) + step) % step;
  const from = slot.from + minutes;
  const to = slot.to + minutes;
  // Hours that cross midnight in the other zone: fire all day there and let the guard keep only the real slots.
  if (from < 0 || to > 1440) return { ...slot, from: 0, to: 1440, offset, days: [0, 1, 2, 3, 4, 5, 6] };
  return { ...slot, from, to, offset };
}

/**
 * The same schedule expressed in another zone's clock, for schedulers that only know the computer's local time.
 * Shifted slots may overlap; the run guard (`isDue`) keeps only runs that match a real slot, including after a
 * daylight-saving change moves them by an hour.
 */
export function shiftSchedule(spec: ScheduleSpec, minutes: number): ScheduleSlot[] {
  return minutes === 0 ? spec : spec.map((slot) => shiftSlot(slot, minutes));
}

function slotDue(slot: ScheduleSlot, day: number, now: number): boolean {
  if (!slot.days.includes(day)) return false;
  if ("at" in slot) return now >= slot.at - 90 && now <= slot.at + 180;
  if (now < slot.from - 30 || now >= slot.to + slot.every_minutes) return false;
  // Only the first half of each gap counts (or a few minutes early), so a converted or overlapping task that fires
  // between this slot's runs, such as every 30 minutes on an hourly day, does nothing.
  const step = Math.min(slot.every_minutes, 60);
  const since = (((now - slot.offset) % step) + step) % step;
  return since < step / 2 || since >= step - 5;
}

/**
 * Whether a scheduled run that fires now belongs to this schedule, in the workspace timezone. Schedulers fire late
 * (catch-up after sleep), an hour off (daylight saving) or on a converted clock; a run far from its slot does nothing.
 */
export function isDue(spec: ScheduleSpec, timeZone: string, date: Date): boolean {
  const local = localTime(date, timeZone);
  return spec.some((slot) => slotDue(slot, local.day, local.minutes));
}
