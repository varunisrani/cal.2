// The numbers the calculation methods page prints, all taken from the domain so the page can
// never disagree with the maths the app runs. The resting-burn coefficients live inside `bmr`
// rather than as named constants, so they are read off the function itself: evaluated at zero
// weight and height, at age 0 and 1, and with and without body fat, each difference is one
// coefficient.

import { birthDateYearsBefore } from '../../domain/profile/profile';
import {
  ACTIVITY_FACTORS,
  bmr,
  FAT_PER_KG,
  KCAL_PER_GRAM,
  KCAL_PER_KG,
  LOSING_PROTEIN_EXTRA,
  paceAdjustment,
  type FormulaInputs,
} from '../../domain/goals/formulas';
import { ACTIVITIES, type Activity } from '../../domain/model';
import { PACE_IDS, PACE_PRESETS, type PaceId } from '../../domain/profile/editRules';
import { KJ_PER_KCAL } from '../../domain/units/energy';

/** Any fixed day works: only the difference between the probe ages matters. */
const PROBE_DAY = '2000-06-15';

/** A person of no weight, no height and age 0, changed as named; female unless said. */
function restingAt(changes: Partial<FormulaInputs>): number {
  const probe: FormulaInputs = {
    sex: 'female',
    birthDate: PROBE_DAY,
    heightCm: 0,
    weightKg: 0,
    activity: 'sedentary',
    goal: 'maintain',
    ...changes,
  };
  return bmr(probe, PROBE_DAY);
}

/** Drops the float noise a subtraction leaves (21.600000000000023 → 21.6). */
function tidy(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** The standard equation: the same slopes for everyone, a constant that depends on sex. */
export interface MifflinFigures {
  readonly perKg: number;
  readonly perCm: number;
  /** Taken off for every year of age. */
  readonly perYear: number;
  /** The constant for men (added). */
  readonly male: number;
  /** The constant for women and for other (added; negative). */
  readonly other: number;
}

/** The lean-mass equation: a constant plus a slope per kilogram of lean mass. */
export interface KatchFigures {
  readonly base: number;
  readonly perLeanKg: number;
}

export function mifflinFigures(): MifflinFigures {
  const other = restingAt({});
  return {
    perKg: tidy(restingAt({ weightKg: 1 }) - other),
    perCm: tidy(restingAt({ heightCm: 1 }) - other),
    perYear: tidy(other - restingAt({ birthDate: birthDateYearsBefore(PROBE_DAY, 1) })),
    male: tidy(restingAt({ sex: 'male' })),
    other: tidy(other),
  };
}

export function katchFigures(): KatchFigures {
  const base = restingAt({ bodyFat: 0 });
  return { base: tidy(base), perLeanKg: tidy(restingAt({ bodyFat: 0, weightKg: 1 }) - base) };
}

export interface ActivityRow {
  readonly activity: Activity;
  readonly multiplier: number;
  readonly proteinPerKg: number;
}

/** The activity table, least active first. */
export function activityRows(): readonly ActivityRow[] {
  return ACTIVITIES.map((activity) => ({
    activity,
    multiplier: ACTIVITY_FACTORS[activity].multiplier,
    proteinPerKg: ACTIVITY_FACTORS[activity].proteinPerKg,
  }));
}

/** The lowest and highest protein rate of the table, in g per kg. */
export function proteinSpan(): { readonly low: number; readonly high: number } {
  const rates = activityRows().map((row) => row.proteinPerKg);
  return { low: Math.min(...rates), high: Math.max(...rates) };
}

export interface PaceRow {
  readonly pace: PaceId;
  readonly weeklyKg: number;
  /** The daily kcal change this pace asks for (positive: the size of the cut or the surplus). */
  readonly perDay: number;
}

/** Each pace preset with the daily change the formulas make for it. */
export function paceRows(): readonly PaceRow[] {
  return PACE_IDS.map((pace) => ({
    pace,
    weeklyKg: PACE_PRESETS[pace],
    perDay: paceAdjustment({ goal: 'gain', weeklyKg: PACE_PRESETS[pace] }),
  }));
}

/** Energy per kilogram of body weight (weight is kg only, D-16.91). */
export function energyPerWeight(): { readonly perKg: number } {
  return { perKg: KCAL_PER_KG };
}

/** Everything the page shows that is not an equation. */
export const METHOD_CONSTANTS = {
  kcalPerGram: KCAL_PER_GRAM,
  fatPerKg: FAT_PER_KG,
  losingProteinExtra: LOSING_PROTEIN_EXTRA,
  kjPerKcal: KJ_PER_KCAL,
} as const;
