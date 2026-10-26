// The profile a first run starts from, and record equality for stored profiles. "Today" and the
// locale are parameters: the domain never reads a clock or the browser.

import { isDayKey, splitDayKey, type DayKey } from '../dates/dayKey';
import type { Profile } from '../model';
import { defaultUnits, type UnitDefaults } from '../units/defaults';

/** A first-run person is this many years old on the day they start. */
export const DEFAULT_AGE_YEARS = 25;
export const DEFAULT_HEIGHT_CM = 175;
export const DEFAULT_WEIGHT_KG = 70;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * The same month and day `years` calendar years before `today`. A 29 February that does not
 * exist in the earlier year becomes 28 February. Throws `RangeError` for a malformed `today`.
 */
export function birthDateYearsBefore(today: DayKey, years: number): DayKey {
  const { year, month, day } = splitDayKey(today);
  const earlierYear = year - Math.trunc(years);
  const sameDay = `${pad(earlierYear, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  return isDayKey(sameDay) ? sameDay : `${pad(earlierYear, 4)}-${pad(month, 2)}-${pad(day - 1, 2)}`;
}

/**
 * The profile a first run starts from: male, 25 years old today, 175 cm, 70 kg, moderately
 * active, maintaining; no body fat, pace or target weight; every target automatic; no locks and
 * no allergens.
 */
export function profileDefaults(today: DayKey): Profile {
  return {
    sex: 'male',
    birthDate: birthDateYearsBefore(today, DEFAULT_AGE_YEARS),
    heightCm: DEFAULT_HEIGHT_CM,
    weightKg: DEFAULT_WEIGHT_KG,
    activity: 'moderate',
    goal: 'maintain',
    saved: {},
    allergens: [],
    caloriesLocked: false,
    lockedMacros: [],
  };
}

/** What a first run seeds: the default profile and the display units for the locale. */
export interface FirstRunDefaults {
  readonly profile: Profile;
  readonly units: UnitDefaults;
}

/**
 * The default profile plus the first-run units for a BCP 47 tag (normally the browser's
 * language), so height and weight units are always seeded together (R01.18).
 */
export function firstRunDefaults(today: DayKey, localeTag: string): FirstRunDefaults {
  return { profile: profileDefaults(today), units: defaultUnits(localeTag) };
}

/** Structural equality for plain stored data; a key holding `undefined` counts as absent. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameValue(left[key], right[key])) return false;
  }
  return true;
}

/**
 * True when two profiles are the same record in every field, saved targets, locks and allergens
 * included (order matters in lists). A rebuild or tune-up reply is applied only when the stored
 * profile still equals the one the request was built from (R01.4).
 */
export function sameProfile(a: Profile, b: Profile): boolean {
  return sameValue(a, b);
}
