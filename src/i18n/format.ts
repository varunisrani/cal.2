/**
 * Number and date formatting through `Intl`. UI text is English in v1, but numbers, dates and
 * times follow the person's locale. Every helper takes the locale as an optional last argument;
 * the default is the current browser locale.
 *
 * Dates are always formatted as UTC instants with `timeZone: 'UTC'`: a day key becomes that
 * calendar day at UTC midnight, and an instant becomes its local wall-clock time placed on a UTC
 * instant. The output therefore never depends on the zone a cached formatter was built in, and
 * a time-zone change while the app runs shows at once.
 */
import { currentLocale } from './locale';

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const pluralRulesCache = new Map<string, Intl.PluralRules>();
const listFormats = new Map<string, Intl.ListFormat>();

function cached<T>(cache: Map<string, T>, locale: string, options: object, make: () => T): T {
  const key = `${locale}|${JSON.stringify(options)}`;
  let value = cache.get(key);
  if (value === undefined) {
    value = make();
    cache.set(key, value);
  }
  return value;
}

/** The shared `Intl.NumberFormat` for a locale and options (built once, then reused). */
export function numberFormat(
  locale: string,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  return cached(numberFormats, locale, options, () => new Intl.NumberFormat(locale, options));
}

/** The shared `Intl.DateTimeFormat` for a locale and options (built once, then reused). */
export function dateFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormat {
  return cached(dateFormats, locale, options, () => new Intl.DateTimeFormat(locale, options));
}

/** The shared `Intl.PluralRules` for a locale and options (built once, then reused). */
export function pluralRules(
  locale: string,
  options: Intl.PluralRulesOptions = {},
): Intl.PluralRules {
  return cached(pluralRulesCache, locale, options, () => new Intl.PluralRules(locale, options));
}

function listFormat(locale: string, options: Intl.ListFormatOptions): Intl.ListFormat {
  return cached(listFormats, locale, options, () => new Intl.ListFormat(locale, options));
}

/**
 * `Intl` prints "-0" for a negative value that rounds to zero at `digits` decimals; such a value
 * is passed as 0 instead. (`signDisplay: 'negative'` does the same but throws in engines older
 * than 2023, which would break every number on the page.)
 */
function withoutNegativeZero(n: number, digits: number): number {
  return Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n;
}

const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

/** A whole number with the locale's grouping: 8368 → "8,368" (en-US), "8.368" (de-DE). */
export function formatInt(n: number, locale: string = currentLocale()): string {
  return numberFormat(locale, WHOLE).format(withoutNegativeZero(n, 0));
}

/** Up to `maxDigits` decimals, trailing zeros dropped: (70.25, 1) → "70.3"; (1, 2) → "1". */
export function formatDecimal(
  n: number,
  maxDigits: number,
  locale: string = currentLocale(),
): string {
  const format = numberFormat(locale, { maximumFractionDigits: maxDigits });
  return format.format(withoutNegativeZero(n, maxDigits));
}

/** A fraction as a percentage: (0.235, 1) → "23.5%" (en-US), "23,5 %" (de-DE). */
export function formatPercent(
  fraction: number,
  maxDigits = 0,
  locale: string = currentLocale(),
): string {
  const format = numberFormat(locale, { style: 'percent', maximumFractionDigits: maxDigits });
  return format.format(withoutNegativeZero(fraction, maxDigits + 2));
}

export type DayStyle = 'short' | 'medium' | 'long' | 'weekday';

// In en-US: short "Oct 11", medium "Oct 11, 2026", long "Sunday, October 11, 2026", weekday
// "Sun, Oct 11". Every locale uses its own order and words.
const DAY_STYLES: Readonly<Record<DayStyle, Intl.DateTimeFormatOptions>> = {
  short: { month: 'short', day: 'numeric', timeZone: 'UTC' },
  medium: { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' },
  long: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' },
  weekday: { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' },
};

/** A local day key (`YYYY-MM-DD`) in one of the named styles. */
export function formatDay(
  dayKey: string,
  style: DayStyle,
  locale: string = currentLocale(),
): string {
  return dateFormat(locale, DAY_STYLES[style]).format(dayInstant(dayKey));
}

// The locale's own short pattern: en-GB and de-DE pad the hour ("09:05"), en-US does not.
const TIME: Intl.DateTimeFormatOptions = { timeStyle: 'short', timeZone: 'UTC' };

/** The local time of day of an instant: "2:05 PM" (en-US), "14:05" (en-GB). */
export function formatTime(ms: number, locale: string = currentLocale()): string {
  return dateFormat(locale, TIME).format(wallClock(ms));
}

const PERIOD: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
const PERIOD_WITH_YEAR: Intl.DateTimeFormatOptions = { ...PERIOD, year: 'numeric' };

/**
 * The label of an inclusive range of days, as the Progress period arrows show it: "Oct 11 – 17",
 * "Sep 28 – Oct 4". The year is shown only when either end lies outside today's year:
 * "Dec 28, 2025 – Jan 3, 2026".
 */
export function formatPeriod(
  firstKey: string,
  lastKey: string,
  todayKey: string,
  locale: string = currentLocale(),
): string {
  const first = dayInstant(firstKey);
  const last = dayInstant(lastKey);
  if (first.getTime() > last.getTime()) {
    throw new RangeError(`A period cannot end before it starts: ${firstKey} > ${lastKey}`);
  }
  const year = dayInstant(todayKey).getUTCFullYear();
  const showYear = first.getUTCFullYear() !== year || last.getUTCFullYear() !== year;
  const format = dateFormat(locale, showYear ? PERIOD_WITH_YEAR : PERIOD);
  if (typeof format.formatRange !== 'function') {
    const start = format.format(first);
    const end = format.format(last);
    return start === end ? start : `${start} – ${end}`;
  }
  // `formatRange` puts thin spaces around the dash; plain spaces read the same everywhere.
  return format.formatRange(first, last).replace(/\u2009/g, ' ');
}

const HOURS: Intl.NumberFormatOptions = { style: 'unit', unit: 'hour', unitDisplay: 'narrow' };
const MINUTES: Intl.NumberFormatOptions = { style: 'unit', unit: 'minute', unitDisplay: 'narrow' };
const UNIT_LIST: Intl.ListFormatOptions = { type: 'unit', style: 'narrow' };

/**
 * A length of time given in minutes (fractions floored, negatives as 0), in the locale's narrow
 * units: 45 → "45m", 960 → "16h", 990 → "16h 30m" (en).
 */
export function formatDuration(minutes: number, locale: string = currentLocale()): string {
  const total = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(numberFormat(locale, HOURS).format(hours));
  if (rest > 0 || hours === 0) parts.push(numberFormat(locale, MINUTES).format(rest));
  return listFormat(locale, UNIT_LIST).format(parts);
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar day of a day key at UTC midnight. `new Date(key)` is avoided on purpose. */
function dayInstant(dayKey: string): Date {
  const match = DAY_KEY.exec(dayKey);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]) - 1;
  const day = Number(match?.[3]);
  const at = new Date(0);
  at.setUTCFullYear(year, month, day);
  const real =
    at.getUTCFullYear() === year && at.getUTCMonth() === month && at.getUTCDate() === day;
  if (!match || !real) throw new RangeError(`Not a day key (YYYY-MM-DD): "${dayKey}"`);
  return at;
}

/** The local wall-clock time of an instant, placed on a UTC instant. */
function wallClock(ms: number): Date {
  const local = new Date(ms);
  const wall = new Date(0);
  wall.setUTCFullYear(local.getFullYear(), local.getMonth(), local.getDate());
  wall.setUTCHours(
    local.getHours(),
    local.getMinutes(),
    local.getSeconds(),
    local.getMilliseconds(),
  );
  return wall;
}
