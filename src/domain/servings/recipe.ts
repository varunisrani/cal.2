// Split into servings: a whole recipe divided into N equal portions through a named "serving"
// unit, so the sheet logs one portion and a saved copy can later log 1 or 2 of them.
//
// A draft that already holds a "serving" unit is a logged portion of a split recipe, not the pot:
// splitting it again would divide the portion, so it is never offered (R02.6). While a split is
// active, line edits are made on the portion on screen and are carried back to the whole recipe.

import { clamp } from '../units/numbers';
import type { IngredientLine, NutritionDraft, UnitChoice } from '../model';
import { applyLineChange, lineTotals } from './ingredients';
import { scaleLine } from './scale';
import {
  GRAMS_PICK,
  MAX_UNITS,
  SERVING_UNIT,
  isPositive,
  normaliseChoices,
  pickFor,
  pickerUnits,
  unitId,
  weightKnown,
  withChoice,
  type PickerUnit,
} from './units';

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 50;

/** The stepper value as a whole number of servings, 1–50 (NaN counts as 1). */
export function clampServings(servings: number): number {
  if (Number.isNaN(servings)) return MIN_SERVINGS;
  return clamp(Math.round(servings), MIN_SERVINGS, MAX_SERVINGS);
}

/** True when the units hold a split recipe's serving unit (the draft is a logged portion). */
export function isLoggedPortion(units: readonly UnitChoice[]): boolean {
  return units.some((choice) => unitId(choice.unit) === SERVING_UNIT);
}

/**
 * Whether "Split into servings" is offered: at least two lines, a known weight, and not a logged
 * portion (R02.6). Judge the draft as the sheet received it; a split made in the sheet itself
 * adds a serving unit but keeps the control.
 */
export function canSplit(draft: Pick<NutritionDraft, 'basis' | 'units' | 'lines'>): boolean {
  return draft.lines.length >= 2 && weightKnown(draft.basis) && !isLoggedPortion(draft.units);
}

/** A split recipe: the whole recipe, its servings, and the unit and quantity to show. */
export interface RecipeSplit<T extends NutritionDraft = NutritionDraft> {
  /** The whole recipe with the serving unit first and recorded as its chosen unit. */
  draft: T;
  /** 1–50. */
  servings: number;
  /** The unit the amount field shows; the shown amount is `quantity × unit.amountEach`. */
  unit: PickerUnit;
  quantity: number;
}

/** The serving unit of `totalGrams ÷ servings` first, then the other units, at most four. */
function splitUnits(
  units: readonly UnitChoice[],
  totalGrams: number,
  servings: number,
): UnitChoice[] {
  const others = units.filter((choice) => unitId(choice.unit) !== SERVING_UNIT);
  const serving: UnitChoice = { unit: SERVING_UNIT, gramsEach: totalGrams / servings };
  return [serving, ...normaliseChoices(others, 0)].slice(0, MAX_UNITS);
}

/**
 * Divides the whole recipe (the draft's known weight) into `servings` (clamped to 1–50): a serving
 * unit of total ÷ N grams replaces any earlier one and goes first, so the four-unit cap keeps it,
 * and one serving is selected. `null` when the weight is unknown.
 */
export function splitRecipe<T extends NutritionDraft>(
  draft: T,
  servings: number,
): RecipeSplit<T> | null {
  const { basis } = draft;
  if (!weightKnown(basis)) return null;
  const count = clampServings(servings);
  const units = splitUnits(draft.units, basis.grams, count);
  const unit = pickFor({ unit: SERVING_UNIT, gramsEach: basis.grams / count });
  return { draft: withChoice({ ...draft, units }, unit, 1), servings: count, unit, quantity: 1 };
}

/** The split the sheet is showing: its servings and the unit the person picked. */
export interface ActiveSplit {
  servings: number;
  unit: PickerUnit;
}

/**
 * A line change made while a split is active. `nextLines` are the edited portion as shown at
 * `scale` of the whole recipe: they are multiplied back up into a new whole recipe (header and
 * nutrients follow `applyLineChange`), which is divided into the same servings again. The picked
 * unit stays (grams when it is no longer offered) with its quantity recomputed, so the amount on
 * screen is exactly the edited portion (R02.6). `null` when no split is active (1 serving), the
 * scale is not a positive number, the portion weighs nothing or fewer than two lines remain: the
 * caller then applies the change with `applyLineChange`, which ends the split.
 */
export function applySplitLineChange<T extends NutritionDraft>(
  draft: T,
  nextLines: readonly IngredientLine[],
  scale: number,
  split: ActiveSplit,
): RecipeSplit<T> | null {
  const servings = clampServings(split.servings);
  if (servings <= MIN_SERVINGS || !isPositive(scale) || nextLines.length < 2) return null;
  const portionGrams = lineTotals(nextLines).grams;
  if (!isPositive(portionGrams)) return null;
  const whole = applyLineChange(
    draft,
    nextLines.map((line) => scaleLine(line, 1 / scale)),
  );
  const { basis } = whole;
  if (!weightKnown(basis)) return null;
  const units = splitUnits(draft.units, basis.grams, servings);
  const offered = pickerUnits(basis, units);
  const unit =
    offered.find((pick) => pick.kind === split.unit.kind && pick.id === split.unit.id) ??
    GRAMS_PICK;
  const quantity = portionGrams / unit.amountEach;
  return { draft: withChoice({ ...whole, units }, unit, quantity), servings, unit, quantity };
}
