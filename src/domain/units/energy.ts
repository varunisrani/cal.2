// Energy in kcal or kJ. Every stored amount (entries, goals, AI requests and replies, exports)
// is kcal; only what is shown and what is typed converts, so changing the unit never rewrites
// data. kJ is the thermochemical one: 1 kcal = 4.184 kJ.

import { clamp, parseLocaleNumber, readPlainNumber, type StepRange } from './numbers';

/** The values of the `units.energy` setting. */
export const ENERGY_MEASURES = ['kcal', 'kJ'] as const;
export type EnergyMeasure = (typeof ENERGY_MEASURES)[number];

export function isEnergyMeasure(value: unknown): value is EnergyMeasure {
  return value === 'kcal' || value === 'kJ';
}

export const KJ_PER_KCAL = 4.184;

/** The unrounded amount in `unit`, for charts and averages. */
export function toDisplayExact(kcal: number, unit: EnergyMeasure): number {
  return unit === 'kJ' ? kcal * KJ_PER_KCAL : kcal;
}

/** The amount shown for a stored kcal value: whole kJ, or the kcal value as it is. */
export function toDisplay(kcal: number, unit: EnergyMeasure): number {
  return unit === 'kJ' ? Math.round(kcal * KJ_PER_KCAL) : kcal;
}

/** Whole kcal for an amount typed or picked in `unit`. */
export function fromDisplay(value: number, unit: EnergyMeasure): number {
  return Math.round(unit === 'kJ' ? value / KJ_PER_KCAL : value);
}

/**
 * The number typed into an energy field, in the display unit, or null. The locale's grouping
 * and decimal marks are read first ("8,368" en-US, "8.368" de-DE); failing that a comma counts
 * as the decimal mark. Empty text, letters, trailing junk, a sign and non-finite values are
 * refused.
 */
export function parseEnergy(text: string, locale: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '' || /^[+\-−]/u.test(trimmed)) return null;
  const value = parseLocaleNumber(trimmed, locale) ?? readPlainNumber(trimmed.replaceAll(',', '.'));
  return value !== null && value >= 0 ? value : null;
}

/** The calorie goal wheel per unit: the same span, 50 kcal or 100 kJ a row. */
export const ENERGY_GOAL_WHEEL: Readonly<Record<EnergyMeasure, StepRange>> = {
  kcal: { min: 800, max: 6_000, step: 50 },
  kJ: { min: 3_400, max: 25_100, step: 100 },
};

/** Where the goal wheel opens: the shown goal snapped down onto a row, kept inside the wheel. */
export function pickerStart(kcalGoal: number, unit: EnergyMeasure): number {
  const { min, max, step } = ENERGY_GOAL_WHEEL[unit];
  return clamp(Math.floor(toDisplay(kcalGoal, unit) / step) * step, min, max);
}

/**
 * The kcal goal to store for a wheel pick. A kcal goal rarely sits on a 100 kJ row, so a kJ
 * wheel saved where it opened (`picked === start`) keeps the stored goal exactly (R06.20);
 * any other pick converts.
 */
export function pickerSave(
  picked: number,
  start: number,
  storedKcal: number,
  unit: EnergyMeasure,
): number {
  if (unit === 'kJ' && picked === start) return storedKcal;
  return fromDisplay(picked, unit);
}
