// Scaling a draft to the amount on screen.
//
// A draft's values describe its base amount (`reviewBase`); the sheet shows them at
// scale = shown amount ÷ base amount. Shown kcal is rounded to a whole number; macros, optional
// nutrients, extras and line macros are kept unrounded and only rounded where they are drawn, so
// the review, the fit check and the logged totals agree (R02.25). A value typed at the shown
// amount is stored divided by the scale, or every later amount change would apply it twice
// (R02.3).

import type { IngredientLine, NutritionDraft, ServingBasis } from '../model';
import { isPositive, unitId, weightKnown, type PickerUnit } from './units';

/** The values that scale with the amount. */
export type NutritionValues = Pick<
  NutritionDraft,
  'kcal' | 'protein' | 'carbs' | 'fat' | 'nutrients' | 'extras'
>;

/**
 * The amount a draft's values describe, in its basis: the known weight in grams, else the serving
 * count (the basis count, then the chosen count), else 1. Never 0, so it can divide.
 */
export function reviewBase(draft: Pick<NutritionDraft, 'basis' | 'chosenCount'>): number {
  const { basis } = draft;
  if (weightKnown(basis)) return basis.grams;
  if (basis.kind === 'servings' && isPositive(basis.count)) return basis.count;
  if (isPositive(draft.chosenCount)) return draft.chosenCount;
  return 1;
}

/**
 * The quantity the amount field opens with in `unit`: the saved count when `unit` is the saved
 * named unit, otherwise the base amount in that unit (an unknown weight opens at its count).
 */
export function initialAmount(
  draft: Pick<NutritionDraft, 'basis' | 'chosenUnit' | 'chosenCount'>,
  unit: PickerUnit,
): number {
  const saved = draft.chosenUnit === undefined ? undefined : unitId(draft.chosenUnit);
  if (unit.kind === 'unit' && saved === unit.id && isPositive(draft.chosenCount)) {
    return draft.chosenCount;
  }
  return reviewBase(draft) / unit.amountEach;
}

/** shown ÷ base; 1 when the base is not a positive number or the shown amount is unusable. */
export function scaleOf(shownAmount: number, baseAmount: number): number {
  if (!isPositive(baseAmount) || !Number.isFinite(shownAmount) || shownAmount < 0) return 1;
  return shownAmount / baseAmount;
}

/** Every known value of a partial record multiplied by `factor`; unknown keys stay absent. */
export function scaleRecord<K extends string>(
  values: Partial<Record<K, number>>,
  factor: number,
): Partial<Record<K, number>> {
  const scaled: Partial<Record<K, number>> = {};
  for (const key of Object.keys(values) as K[]) {
    const value = values[key];
    if (value !== undefined) scaled[key] = value * factor;
  }
  return scaled;
}

/** The values at `scale`: kcal rounded to a whole number, everything else unrounded. */
export function scaleValues(values: NutritionValues, scale: number): NutritionValues {
  return {
    kcal: Math.round(values.kcal * scale),
    protein: values.protein * scale,
    carbs: values.carbs * scale,
    fat: values.fat * scale,
    nutrients: scaleRecord(values.nutrients, scale),
    extras: scaleRecord(values.extras, scale),
  };
}

/** A line scaled with its meal: grams and macros unrounded, kcal rounded. */
export function scaleLine(line: IngredientLine, factor: number): IngredientLine {
  return {
    ...line,
    grams: line.grams * factor,
    kcal: Math.round(line.kcal * factor),
    protein: line.protein * factor,
    carbs: line.carbs * factor,
    fat: line.fat * factor,
  };
}

/** The basis of the amount on screen; an unknown weight stays a serving count. */
function scaleBasis(
  draft: Pick<NutritionDraft, 'basis' | 'chosenCount'>,
  scale: number,
): ServingBasis {
  const { basis } = draft;
  if (weightKnown(basis)) return { kind: 'grams', grams: basis.grams * scale };
  return { kind: 'servings', count: reviewBase(draft) * scale };
}

/**
 * The draft at the amount on screen, as logging stores it: values, lines and basis multiplied by
 * `scale` (kcal rounded, the rest unrounded). Units and the chosen unit are left for the caller to
 * record. A scale that is not a positive number counts as 1.
 */
export function scaleDraft<T extends NutritionDraft>(draft: T, scale: number): T {
  const factor = isPositive(scale) ? scale : 1;
  return {
    ...draft,
    ...scaleValues(draft, factor),
    lines: draft.lines.map((line) => scaleLine(line, factor)),
    basis: scaleBasis(draft, factor),
  };
}

/**
 * The base value for a value typed at the shown amount: typed ÷ scale, with a scale that is not a
 * positive number treated as 1 (R02.3). The result is not rounded.
 */
export function fromShown(typed: number, scale: number): number {
  return typed / (isPositive(scale) ? scale : 1);
}
