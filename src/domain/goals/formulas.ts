// The formula plan: the daily targets the body data and goal give on their own, before any AI.
// It is the fallback when no AI plan can be had, and the anchor every AI plan is checked against.
//
// Every step keeps the spec's whole-number rules: the daily burn, the pace change, protein and fat
// are cut toward zero and carbs come from integer division, never rounding (R01.9). The floating
// steps keep the spec's order of operations, so a rate such as 2.2 + 0.2 truncates the same way
// on every device.

import { ageOn } from '../dates/age';
import type { DayKey } from '../dates/dayKey';
import type { Activity, MacroKey, Profile, Targets } from '../model';
import { div } from './integers';

/** Energy in one kilogram of body weight change; pace and trend maths share it. */
export const KCAL_PER_KG = 7_700;

/** Energy in one gram of each macro. */
export const KCAL_PER_GRAM: Readonly<Record<MacroKey, number>> = { protein: 4, carbs: 4, fat: 9 };

/** Weekly pace used for lose and gain when the profile has none. */
export const DEFAULT_WEEKLY_KG = 0.5;

/** Extra protein, in grams per kg, while losing weight. */
export const LOSING_PROTEIN_EXTRA = 0.2;

/** Fat in grams per kg of body weight. */
export const FAT_PER_KG = 0.6;

/** A steps-a-day band: from `from` up to, but not including, `below` (null: no upper end). */
export interface StepBand {
  readonly from: number;
  readonly below: number | null;
}

export interface ActivityFactors {
  /** Daily burn = resting burn × this. */
  readonly multiplier: number;
  /** Protein in grams per kg of full body weight (never lean mass). */
  readonly proteinPerKg: number;
  /** A rough steps-a-day guide shown with the level. */
  readonly steps: StepBand;
}

/** The activity table, least active first. Moderate is 1.465, not the textbook 1.55. */
export const ACTIVITY_FACTORS: Readonly<Record<Activity, ActivityFactors>> = {
  sedentary: { multiplier: 1.2, proteinPerKg: 0.8, steps: { from: 0, below: 5_000 } },
  light: { multiplier: 1.375, proteinPerKg: 1.2, steps: { from: 5_000, below: 7_500 } },
  moderate: { multiplier: 1.465, proteinPerKg: 1.6, steps: { from: 7_500, below: 10_000 } },
  active: { multiplier: 1.55, proteinPerKg: 1.8, steps: { from: 10_000, below: 12_500 } },
  hard: { multiplier: 1.725, proteinPerKg: 2.0, steps: { from: 12_500, below: 15_000 } },
  athlete: { multiplier: 1.9, proteinPerKg: 2.2, steps: { from: 15_000, below: null } },
};

/** The profile fields the formulas read. A whole `Profile` fits. */
export type FormulaInputs = Pick<
  Profile,
  'sex' | 'birthDate' | 'heightCm' | 'weightKg' | 'activity' | 'goal' | 'bodyFat' | 'weeklyKg'
>;

/** Which resting-burn equation applies: lean mass when body fat is known, else the standard one. */
export type BmrMethod = 'katch' | 'mifflin';

export function bmrMethod(inputs: FormulaInputs): BmrMethod {
  return inputs.bodyFat === undefined ? 'mifflin' : 'katch';
}

/**
 * Resting burn in kcal a day, unrounded. Katch-McArdle when body fat is known (age, height and sex
 * do not matter then); otherwise Mifflin-St Jeor, where only men add 166 to the shared base.
 */
export function bmr(inputs: FormulaInputs, today: DayKey): number {
  const { bodyFat, weightKg } = inputs;
  if (bodyFat !== undefined) return 370 + 21.6 * (1 - bodyFat) * weightKg;
  const age = ageOn(inputs.birthDate, today);
  const shared = 10 * weightKg + 6.25 * inputs.heightCm - 5 * age - 161;
  return inputs.sex === 'male' ? shared + 166 : shared;
}

/** Daily burn in kcal, unrounded: resting burn × the activity multiplier. */
export function tdee(inputs: FormulaInputs, today: DayKey): number {
  return bmr(inputs, today) * ACTIVITY_FACTORS[inputs.activity].multiplier;
}

/**
 * The daily kcal change the weekly pace asks for: 0 for maintain, otherwise the pace (0.5 kg when
 * unset) × 7 700 ÷ 7 cut toward zero, negative for lose. 0.25 / 0.5 / 1.0 kg → 275 / 550 / 1 100.
 */
export function paceAdjustment(inputs: Pick<FormulaInputs, 'goal' | 'weeklyKg'>): number {
  if (inputs.goal === 'maintain') return 0;
  const perDay = Math.trunc(((inputs.weeklyKg ?? DEFAULT_WEEKLY_KG) * KCAL_PER_KG) / 7);
  if (inputs.goal === 'gain' || perDay === 0) return perDay;
  return -perDay;
}

/** Whole grams of protein: the level's rate (+0.2 g/kg while losing) × full body weight. */
export function formulaProtein(
  inputs: Pick<FormulaInputs, 'activity' | 'goal' | 'weightKg'>,
): number {
  const extra = inputs.goal === 'lose' ? LOSING_PROTEIN_EXTRA : 0;
  return Math.trunc((ACTIVITY_FACTORS[inputs.activity].proteinPerKg + extra) * inputs.weightKg);
}

/** Whole grams of fat: 0.6 g per kg of body weight. */
export function formulaFat(inputs: Pick<FormulaInputs, 'weightKg'>): number {
  return Math.trunc(FAT_PER_KG * inputs.weightKg);
}

/** Whole grams of carbs that fill the energy protein and fat leave; never below 0. */
export function carbsLeft(kcal: number, protein: number, fat: number): number {
  const rest = kcal - KCAL_PER_GRAM.protein * protein - KCAL_PER_GRAM.fat * fat;
  return Math.max(0, div(rest, KCAL_PER_GRAM.carbs));
}

/**
 * The formula plan: kcal = the daily burn cut to a whole number plus the pace change (no lower
 * floor; the low-kcal warning is the screen's job), then protein, fat and the carbs that remain.
 */
export function formulaPlan(inputs: FormulaInputs, today: DayKey): Targets {
  const kcal = Math.trunc(tdee(inputs, today)) + paceAdjustment(inputs);
  const protein = formulaProtein(inputs);
  const fat = formulaFat(inputs);
  return { kcal, protein, carbs: carbsLeft(kcal, protein, fat), fat };
}
