// The profile a new person starts with, and exact comparison of two profiles.

import { isDayKey, splitDayKey, type DayKey } from '../dates/dayKey';
import type { Profile } from '../model';
import { defaultUnits, type UnitSettings } from '../units/defaults';

/** A new profile's age in whole years. */
export const DEFAULT_AGE_YEARS = 25;

function keyOf(year: number, month: number, day: number): DayKey {
  const pad = (value: number, width: number): string => String(value).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * The calendar date 25 years before `today`. A 29 February today lands on 28 February when that
 * year has none. A day key, so it never shifts with the time zone (R01.15).
 */
export function defaultBirthDate(today: DayKey): DayKey {
  const { year, month, day } = splitDayKey(today);
  const key = keyOf(year - DEFAULT_AGE_YEARS, month, day);
  return isDayKey(key) ? key : keyOf(year - DEFAULT_AGE_YEARS, month, day - 1);
}

/**
 * A new person's profile: male, 25 years old, 175 cm, 70 kg, moderate activity, maintain; no body
 * fat, pace or goal weight, no saved targets, no locks, no allergens.
 */
export function defaultProfile(today: DayKey): Profile {
  return {
    sex: 'male',
    birthDate: defaultBirthDate(today),
    heightCm: 175,
    weightKg: 70,
    activity: 'moderate',
    goal: 'maintain',
    saved: {},
    allergens: [],
    caloriesLocked: false,
    lockedMacros: [],
  };
}

/** The starting profile together with the starting units for the browser's locale. */
export function startingSetup(
  today: DayKey,
  localeTag: string,
): { profile: Profile; units: UnitSettings } {
  return { profile: defaultProfile(today), units: defaultUnits(localeTag) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural equality for plain data: a key holding undefined counts as missing. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameData(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set(
      [...Object.keys(a), ...Object.keys(b)].filter(
        (key) => a[key] !== undefined || b[key] !== undefined,
      ),
    );
    return [...keys].every((key) => sameData(a[key], b[key]));
  }
  return false;
}

/**
 * True when every field matches, saved targets, locks and lists included. A rebuild or tune-up
 * result is applied only when the profile is still the same as when the call started (R01.4).
 */
export function sameProfile(a: Profile, b: Profile): boolean {
  return sameData(a, b);
}
