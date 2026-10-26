// The plan the app suggests without any AI: resting burn, daily burn, a pace adjustment and four
// whole-number targets, all from the profile and today's date (for the age).
//
// Whole numbers come from cutting the fraction, never from rounding (R01.9): the daily burn, the
// pace adjustment, protein, fat and the carbs remainder are all truncated, and the carbs remainder
// is whole-gram integer division. The order of each floating-point expression is kept as the
// spec writes it, so a value that lands a hair below a whole number cuts the same way everywhere.

import { ageOn } from '../dates/age';
import type { DayKey } from '../dates/dayKey';
import type { Activity, GoalKind, MacroKey, Profile, Targets } from '../model';

/** Energy in one kg of body weight change, for pace and trend maths. */
export const KCAL_PER_KG = 7_700;

/** Weekly pace for lose and gain when the profile has none, in kg. */
export const DEFAULT_PACE_KG = 0.5;

/** Extra protein per kg while losing weight. */
export const CUT_PROTEIN_BOOST = 0.2;

/** Fat target per kg of body weight. */
export const FAT_PER_KG = 0.6;

export const KCAL_PER_GRAM: Readonly<Record<MacroKey, number>> = { protein: 4, carbs: 4, fat: 9 };

/** One activity level's numbers. */
export interface ActivityRow {
  /** TDEE = BMR × factor. */
  factor: number;
  /** Protein grams per kg of full body weight. */
  proteinPerKg: number;
  /** A rough guide in steps a day: from `from` up to (not including) `below`; null is open. */
  steps: { from: number; below: number | null };
}

/** The activity table, least active first. Moderate is 1.465, not the textbook 1.55. */
export const ACTIVITY_TABLE: Readonly<Record<Activity, ActivityRow>> = {
  sedentary: { factor: 1.2, proteinPerKg: 0.8, steps: { from: 0, below: 5_000 } },
  light: { factor: 1.375, proteinPerKg: 1.2, steps: { from: 5_000, below: 7_500 } },
  moderate: { factor: 1.465, proteinPerKg: 1.6, steps: { from: 7_500, below: 10_000 } },
  active: { factor: 1.55, proteinPerKg: 1.8, steps: { from: 10_000, below: 12_500 } },
  hard: { factor: 1.725, proteinPerKg: 2.0, steps: { from: 12_500, below: 15_000 } },
  athlete: { factor: 1.9, proteinPerKg: 2.2, steps: { from: 15_000, below: null } },
};

// ---- Integer maths ------------------------------------------------------------------------

/** Integer division that cuts toward zero: intDiv(7, 2) = 3, intDiv(-7, 2) = -3. */
export function intDiv(a: number, b: number): number {
  return Math.trunc(a / b) + 0; // `+ 0` turns a -0 into 0
}

/**
 * The remainder that always lies in 0…n−1: floorMod(-1, 4) = 3, where `-1 % 4` is -1 (R01.9).
 */
export function floorMod(a: number, n: number): number {
  return (((a % n) + n) % n) + 0;
}

/** kcal in a set of macro grams at 4 / 4 / 9 kcal per gram. */
export function macroKcal(grams: Pick<Targets, MacroKey>): number {
  return (
    grams.protein * KCAL_PER_GRAM.protein +
    grams.carbs * KCAL_PER_GRAM.carbs +
    grams.fat * KCAL_PER_GRAM.fat
  );
}

/** Carbs that fill what protein and fat leave of `kcal`: whole grams, never below 0. */
export function remainderCarbs(kcal: number, protein: number, fat: number): number {
  return Math.max(0, intDiv(kcal - protein * KCAL_PER_GRAM.protein - fat * KCAL_PER_GRAM.fat, 4));
}

// ---- Burn -----------------------------------------------------------------------------------

/** Which resting-burn equation applies: lean mass when body fat is known, else the standard. */
export type BmrMethod = 'leanMass' | 'standard';

export function bmrMethod(profile: Pick<Profile, 'bodyFat'>): BmrMethod {
  return profile.bodyFat === undefined ? 'standard' : 'leanMass';
}

/**
 * Resting burn in kcal a day, unrounded. With body fat: 370 + 21.6 × (1 − fraction) × kg. Without:
 * 10 × kg + 6.25 × cm − 5 × age − 161, plus 166 for men (women and "other" use the base).
 */
export function bmr(profile: Profile, today: DayKey): number {
  if (profile.bodyFat !== undefined) {
    return 370 + 21.6 * (1 - profile.bodyFat) * profile.weightKg;
  }
  const age = ageOn(profile.birthDate, today);
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * age - 161;
  return profile.sex === 'male' ? base + 166 : base;
}

/** Daily burn in kcal, unrounded: BMR × the activity factor. */
export function tdee(profile: Profile, today: DayKey): number {
  return bmr(profile, today) * ACTIVITY_TABLE[profile.activity].factor;
}

/**
 * Whole kcal a day added for the goal: 0 to maintain, −trunc(pace × 7 700 ÷ 7) to lose and the same
 * amount added to gain. A missing pace counts as 0.5 kg a week.
 */
export function paceAdjustment(goal: GoalKind, weeklyKg: number | undefined): number {
  if (goal === 'maintain') return 0;
  const perDay = Math.trunc(((weeklyKg ?? DEFAULT_PACE_KG) * KCAL_PER_KG) / 7);
  return goal === 'lose' ? 0 - perDay : perDay + 0;
}

// ---- Plan -----------------------------------------------------------------------------------

/** Protein grams: (g/kg for the activity, + 0.2 while losing) × full body weight, cut. */
export function formulaProtein(profile: Profile): number {
  const boost = profile.goal === 'lose' ? CUT_PROTEIN_BOOST : 0;
  return Math.trunc((ACTIVITY_TABLE[profile.activity].proteinPerKg + boost) * profile.weightKg);
}

/** Fat grams: 0.6 × kg, cut. */
export function formulaFat(profile: Profile): number {
  return Math.trunc(FAT_PER_KG * profile.weightKg);
}

/**
 * The four formula targets: kcal = trunc(TDEE) + pace adjustment (no floor), protein and fat as
 * above, carbs the whole-gram remainder.
 */
export function formulaPlan(profile: Profile, today: DayKey): Targets {
  const kcal = Math.trunc(tdee(profile, today)) + paceAdjustment(profile.goal, profile.weeklyKg);
  const protein = formulaProtein(profile);
  const fat = formulaFat(profile);
  return { kcal, protein, carbs: remainderCarbs(kcal, protein, fat), fat };
}
