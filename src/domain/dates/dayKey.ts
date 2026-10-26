// Day keys: a local calendar day in the runtime's zone, written 'YYYY-MM-DD'.
//
// A key is never handed to `new Date('YYYY-MM-DD')`: that reads it as UTC midnight, which is
// the previous evening anywhere west of UTC. Keys are split into numbers instead. Stepping days
// happens on the calendar alone (a zone-free day count), so a 23- or 25-hour DST day is still
// exactly one day.

/** A local calendar day, 'YYYY-MM-DD'. Check untrusted strings with `isDayKey`. */
export type DayKey = string;

const MS_PER_DAY = 86_400_000;
const KEY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A day key split into numbers. */
export interface CalendarDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function readKey(value: unknown): CalendarDate | null {
  if (typeof value !== 'string') return null;
  const match = KEY_SHAPE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Splits a key into numbers, or throws `RangeError` when it is not a real calendar day. */
export function splitDayKey(key: DayKey): CalendarDate {
  const date = readKey(key);
  if (!date) throw new RangeError(`Not a day key: ${JSON.stringify(key)}`);
  return date;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function formatKey({ year, month, day }: CalendarDate): DayKey {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

// The UTC fields of a Date serve below as a plain proleptic calendar with no zone and no DST.
// No instant is ever taken from them. `setUTCFullYear` keeps years below 100 as they are.

/** Whole days from 1970-01-01 to the given date on the calendar. */
export function dayNumberOf(key: DayKey): number {
  const { year, month, day } = splitDayKey(key);
  const scratch = new Date(0);
  scratch.setUTCFullYear(year, month - 1, day);
  return Math.round(scratch.getTime() / MS_PER_DAY);
}

function keyOfDayNumber(dayNumber: number): DayKey {
  const scratch = new Date(dayNumber * MS_PER_DAY);
  return formatKey({
    year: scratch.getUTCFullYear(),
    month: scratch.getUTCMonth() + 1,
    day: scratch.getUTCDate(),
  });
}

/** True for a 'YYYY-MM-DD' string naming a real calendar day. */
export function isDayKey(value: unknown): value is DayKey {
  return readKey(value) !== null;
}

/** The local day (runtime zone) that contains the instant `ms`. */
export function dayKeyOf(ms: number): DayKey {
  const local = new Date(ms);
  return formatKey({
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
  });
}

/**
 * The first instant of the local day. When the zone skips midnight on that day, this is the
 * first wall-clock time that exists (local-time setters move forward over the gap).
 */
export function startOfDay(key: DayKey): number {
  const { year, month, day } = splitDayKey(key);
  const local = new Date(0);
  local.setFullYear(year, month - 1, day);
  local.setHours(0, 0, 0, 0);
  return local.getTime();
}

/** The day `n` calendar days after `key` (before it when `n` is negative). */
export function addDays(key: DayKey, n: number): DayKey {
  return keyOfDayNumber(dayNumberOf(key) + Math.trunc(n));
}

/** Calendar days from `a` to `b`: positive when `b` is later, 0 for the same day. */
export function daysBetween(a: DayKey, b: DayKey): number {
  return dayNumberOf(b) - dayNumberOf(a);
}
