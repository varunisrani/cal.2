// Editing the plan on the Plan ready step of onboarding. kcal and the macros stay tied together:
// changing kcal, protein or fat re-derives carbs from what is left; changing carbs re-derives kcal
// from the macros (R01.7). The wheels use one set of ranges everywhere, the same as the Settings
// pickers (D-16.12): kcal 800–6 000 in steps of 50, protein 10–500, carbs 0–800 and fat 10–300 in
// steps of 5. The carbs wheel stops early when more carbs would take kcal past 6 000.

import type { MacroKey, Targets } from '../model';
import { ENERGY_GOAL_WHEEL } from '../units/energy';
import { clamp, type StepRange } from '../units/numbers';
import { KCAL_PER_GRAM, remainderCarbs } from './formulas';

/** Macro pickers in grams, shared by Plan ready and Settings. */
export const MACRO_WHEELS: Readonly<Record<MacroKey, StepRange>> = {
  protein: { min: 10, max: 500, step: 5 },
  carbs: { min: 0, max: 800, step: 5 },
  fat: { min: 10, max: 300, step: 5 },
};

/** Plan ready wheels for all four targets (kcal is the kcal goal wheel of the energy units). */
export const PLAN_WHEELS: Readonly<Record<keyof Targets, StepRange>> = {
  kcal: ENERGY_GOAL_WHEEL.kcal,
  ...MACRO_WHEELS,
};

/** Where a wheel opens for a value: snapped down onto a row, kept inside the wheel. */
export function wheelStart(value: number, wheel: StepRange): number {
  return clamp(Math.floor(value / wheel.step) * wheel.step, wheel.min, wheel.max);
}

/** The highest carbs row that keeps 4C + 4P + 9F within the kcal wheel's maximum. */
export function carbsCeiling(plan: Pick<Targets, 'protein' | 'fat'>): number {
  const { min, max, step } = MACRO_WHEELS.carbs;
  const room =
    PLAN_WHEELS.kcal.max - plan.protein * KCAL_PER_GRAM.protein - plan.fat * KCAL_PER_GRAM.fat;
  const rows = Math.floor(Math.floor(room / KCAL_PER_GRAM.carbs) / step) * step;
  return clamp(rows, min, max);
}

/**
 * The plan after one field is set to `value` (made whole and kept inside that field's wheel).
 * kcal, protein or fat: carbs become what is left, max(0, (kcal − 4P − 9F) div 4). Carbs (at most
 * the carbs ceiling): kcal becomes 4C + 4P + 9F.
 */
export function editPlan(plan: Targets, field: keyof Targets, value: number): Targets {
  const wheel = PLAN_WHEELS[field];
  const max = field === 'carbs' ? carbsCeiling(plan) : wheel.max;
  const next = { ...plan, [field]: clamp(Math.round(value), wheel.min, max) };
  if (field === 'carbs') {
    return {
      ...next,
      kcal:
        next.carbs * KCAL_PER_GRAM.carbs +
        next.protein * KCAL_PER_GRAM.protein +
        next.fat * KCAL_PER_GRAM.fat,
    };
  }
  return { ...next, carbs: remainderCarbs(next.kcal, next.protein, next.fat) };
}
