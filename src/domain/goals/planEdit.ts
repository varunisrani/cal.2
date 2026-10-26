// Editing the plan on the wizard's last step (Plan Ready). The four values stay tied together: a
// change to kcal, protein or fat recomputes carbs from the energy left, and a change to carbs
// recomputes kcal, so the plan the person keeps adds up (R01.7). The wheels use the same ranges
// as Settings (D-16.12). Any change marks the plan as touched; a touched plan turns the weekly
// tune-up off when onboarding completes.

import type { MacroKey, Targets } from '../model';
import { clamp, type WheelRange } from '../units/numbers';
import { carbsLeft } from './formulas';
import { div } from './integers';
import { macroKcal } from './targets';

/** A value on the plan: the kcal target or one macro. */
export type PlanField = 'kcal' | MacroKey;

/** The highest kcal a plan may reach, by any edit. */
export const PLAN_MAX_KCAL = 6_000;

/** Wheel bounds and steps for each value (D-16.12): kcal in 50s, grams in 5s. */
export const PLAN_WHEELS: Readonly<Record<PlanField, WheelRange>> = {
  kcal: { min: 800, max: PLAN_MAX_KCAL, step: 50 },
  protein: { min: 10, max: 500, step: 5 },
  carbs: { min: 0, max: 800, step: 5 },
  fat: { min: 10, max: 300, step: 5 },
};

/** The plan on Plan Ready and whether the person has changed any of it. */
export interface PlanDraft {
  readonly plan: Targets;
  readonly touched: boolean;
}

/**
 * The carbs wheel for `plan`: its usual range, with the top lowered to the last step at which
 * kcal (re-derived from carbs) stays at or under 6 000.
 */
export function carbsWheel(plan: Pick<Targets, 'protein' | 'fat'>): WheelRange {
  const { min, max, step } = PLAN_WHEELS.carbs;
  const room = carbsLeft(PLAN_MAX_KCAL, plan.protein, plan.fat);
  return { min, max: Math.max(min, Math.min(max, div(room, step) * step)), step };
}

/** Where a wheel opens for `value`: snapped down onto the steps, then kept inside the range. */
export function wheelStart(range: WheelRange, value: number): number {
  return clamp(Math.floor(value / range.step) * range.step, range.min, range.max);
}

function rangeFor(field: PlanField, plan: Targets): WheelRange {
  return field === 'carbs' ? carbsWheel(plan) : PLAN_WHEELS[field];
}

/**
 * Applies a picked `value` to `field`. The value is kept inside the field's range but not snapped,
 * so an exact kcal from an untouched kJ wheel survives (R06.20). kcal, protein or fat re-derive
 * carbs; carbs re-derive kcal. The draft becomes touched when any value changed.
 */
export function editPlan(draft: PlanDraft, field: PlanField, value: number): PlanDraft {
  const { min, max } = rangeFor(field, draft.plan);
  const picked = Math.round(clamp(value, min, max));
  const edited: Targets = { ...draft.plan, [field]: picked };
  const plan =
    field === 'carbs'
      ? { ...edited, kcal: macroKcal(edited) }
      : { ...edited, carbs: carbsLeft(edited.kcal, edited.protein, edited.fat) };
  const changed = (['kcal', 'protein', 'carbs', 'fat'] as const).some(
    (key) => plan[key] !== draft.plan[key],
  );
  return { plan, touched: draft.touched || changed };
}
