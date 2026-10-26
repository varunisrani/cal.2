// Energy in kilocalories or kilojoules. Every stored amount (entries, goals, AI requests and
// replies, exports) is kcal; a kJ reader only changes what is shown and how typed text is read.
// Both directions round to whole units, and the two roundings meet, so a stored kcal shown in kJ
// and saved again unchanged is the same kcal.

import { clamp, formatNumber, parseLocaleNumber, type WheelRange } from './numbers';

export const ENERGY_DISPLAY_UNITS = ['kcal', 'kJ'] as const;
/** How a person reads energy (setting `units.energy`). Storage is always kcal. */
export type EnergyDisplayUnit = (typeof ENERGY_DISPLAY_UNITS)[number];

export function isEnergyDisplayUnit(value: unknown): value is EnergyDisplayUnit {
  return value === 'kcal' || value === 'kJ';
}

export const DEFAULT_ENERGY_UNIT: EnergyDisplayUnit = 'kcal';

/** The thermochemical calorie: 1 kcal is 4.184 kJ. */
export const KJ_PER_KCAL = 4.184;

/** The exact amount in the display unit, for charts and averages. */
export function toDisplayUnrounded(kcal: number, unit: EnergyDisplayUnit): number {
  return unit === 'kJ' ? kcal * KJ_PER_KCAL : kcal;
}

/** Whole display units for a kcal amount: in kJ, 1 → 4, 100 → 418, 2 000 → 8 368. */
export function toDisplay(kcal: number, unit: EnergyDisplayUnit): number {
  return Math.round(toDisplayUnrounded(kcal, unit));
}

/** Whole kcal for an amount in the display unit: 8 368 kJ → 2 000, 418 kJ → 100. */
export function fromDisplay(value: number, unit: EnergyDisplayUnit): number {
  return Math.round(unit === 'kJ' ? value / KJ_PER_KCAL : value);
}

/** A kcal amount in the display unit as grouped text without a unit word: "8,368" (en-US). */
export function formatEnergy(kcal: number, unit: EnergyDisplayUnit, locale: string): string {
  return formatNumber(toDisplay(kcal, unit), locale);
}

/**
 * The amount typed in an energy field, in the unit it was typed in, or null. Reads the locale's
 * grouping and decimal marks, with a comma as the decimal mark as a fallback ("8,368" en-US →
 * 8 368; "8.368" and "418,4" de-DE → 8 368 and 418.4). Empty, non-numeric, trailing junk,
 * negative and non-finite text is null.
 */
export function parseEnergy(text: string, locale: string): number | null {
  const value = parseLocaleNumber(text, locale);
  return value === null || value < 0 ? null : value;
}

/** The kcal to store for text typed in an energy field, or null when it does not read. */
export function typedKcal(text: string, unit: EnergyDisplayUnit, locale: string): number | null {
  const value = parseEnergy(text, locale);
  return value === null ? null : fromDisplay(value, unit);
}

/** The calorie goal wheel: the same span of energy in either unit. */
export const ENERGY_GOAL_WHEEL: Readonly<Record<EnergyDisplayUnit, WheelRange>> = {
  kcal: { min: 800, max: 6_000, step: 50 },
  kJ: { min: 3_400, max: 25_100, step: 100 },
};

/**
 * Where the goal wheel opens: the goal in the display unit, snapped down onto the wheel's steps
 * and kept inside its range (2 000 kcal opens the kJ wheel at 8 300).
 */
export function pickerStart(kcalGoal: number, unit: EnergyDisplayUnit): number {
  const { min, max, step } = ENERGY_GOAL_WHEEL[unit];
  const snapped = Math.floor(toDisplay(kcalGoal, unit) / step) * step;
  return clamp(snapped, min, max);
}

/**
 * The kcal goal to store for a wheel value. A kJ wheel left where it opened (`picked === start`)
 * keeps `storedKcal` exactly: its opening value was snapped, and converting it back would move the
 * goal on every open and save (R06.20). Any other pick is converted (8 400 kJ → 2 008 kcal); the
 * kcal wheel always stores what it shows.
 */
export function pickerSave(
  picked: number,
  start: number,
  storedKcal: number,
  unit: EnergyDisplayUnit,
): number {
  if (unit === 'kJ' && picked === start) return storedKcal;
  return fromDisplay(picked, unit);
}
