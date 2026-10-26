// Dividing a whole dish into servings. The split adds one named unit, "serving", weighing the
// dish ÷ n; it goes first in the unit list so the four-unit cap never drops it, and the amount
// opens at 1 serving. A row logged from a split dish keeps that unit: it holds a portion, not the
// dish, so splitting it again would divide the portion, and the control is not offered (R02.6).
// While split, the sheet shows a portion; a part edited there is scaled back up into a new whole
// dish, which is divided into the same number of servings again.

import type { IngredientLine, NutritionDraft, UnitChoice } from '../model';
import { clamp } from '../units/numbers';
import { applyLineChange, lineTotals } from './ingredients';
import { scaleLine } from './scale';
import {
  countIn,
  findUnit,
  GRAMS_UNIT,
  isWeightKnown,
  normaliseChoices,
  pickerUnits,
  SERVING_UNIT,
  unitId,
  type PickerUnit,
  type ShownAmount,
} from './units';

export const SPLIT_MIN = 1;
export const SPLIT_MAX = 50;

/** A servings count for the stepper: a whole number from 1 to 50 (NaN reads as 1). */
export function clampServings(n: number): number {
  return clamp(Math.trunc(n), SPLIT_MIN, SPLIT_MAX);
}

/** True when the units hold a "serving" unit: the row is a portion of a split dish (R02.6). */
export function isLoggedPortion(units: readonly UnitChoice[]): boolean {
  return units.some((choice) => unitId(choice.unit) === SERVING_UNIT);
}

/**
 * True when the draft may be split: at least two parts, a known weight above 0, and not a
 * portion of a dish split before (R02.6). Check the draft as it opened, not the sheet's working
 * copy, which holds the split's own serving unit.
 */
export function canSplit(draft: Pick<NutritionDraft, 'basis' | 'units' | 'lines'>): boolean {
  return draft.lines.length >= 2 && isWeightKnown(draft.basis) && !isLoggedPortion(draft.units);
}

/** A split draft and what its amount row shows. */
export interface RecipeSplit<D extends NutritionDraft> {
  /** The whole dish (its basis unchanged) with the serving unit first. */
  draft: D;
  shown: ShownAmount;
  /** The servings count after clamping. */
  servings: number;
}

function isAboveZero(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function withChosen<D extends NutritionDraft>(draft: D, shown: ShownAmount): D {
  const next: D = { ...draft };
  delete next.chosenUnit;
  delete next.chosenCount;
  if (shown.unit.kind === 'unit') {
    next.chosenUnit = shown.unit.id;
    next.chosenCount = shown.count;
  }
  return next;
}

/**
 * The dish divided into `servings` (clamped to 1–50): a "serving" unit of weight ÷ servings
 * replaces any earlier one and goes first, the other units follow (four at most), and one serving
 * is selected. Null when the weight is unknown.
 */
export function splitRecipe<D extends NutritionDraft>(
  draft: D,
  servings: number,
): RecipeSplit<D> | null {
  if (!isWeightKnown(draft.basis)) return null;
  const count = clampServings(servings);
  const whole = draft.basis.grams;
  const gramsEach = whole / count;
  const others = draft.units.filter((choice) => unitId(choice.unit) !== SERVING_UNIT);
  const units = normaliseChoices([{ unit: SERVING_UNIT, gramsEach }, ...others], whole);
  const unit: PickerUnit = { kind: 'unit', id: SERVING_UNIT, gramsEach };
  const shown: ShownAmount = { unit, count: 1, amount: gramsEach };
  return { draft: withChosen({ ...draft, units }, shown), shown, servings: count };
}

/**
 * The split carried through a part edit. `nextLines` are the parts as the sheet shows them, at
 * `scale` of the whole dish. They are scaled back up into a new whole dish (energy and macros
 * from the parts, nutrients stretched as for any part change), which is split into the same
 * `servings`; `unit` stays selected (grams when it is gone) with a count that shows exactly the
 * edited portion. Null when no split is active (servings 1), the scale is not a finite number
 * above 0, fewer than two parts are left, or the portion or the new dish weighs nothing: the edit
 * is then an ordinary part change (`applyLineChange`).
 */
export function keepSplit<D extends NutritionDraft>(
  draft: D,
  nextLines: readonly IngredientLine[],
  scale: number,
  servings: number,
  unit: PickerUnit,
): RecipeSplit<D> | null {
  const count = clampServings(servings);
  if (count <= SPLIT_MIN || !isAboveZero(scale)) return null;
  const portion = lineTotals(nextLines).grams;
  const wholeLines = nextLines.map((line) => scaleLine(line, 1 / scale));
  const wholeGrams = lineTotals(wholeLines).grams;
  if (wholeLines.length < 2 || !isAboveZero(portion) || !isAboveZero(wholeGrams)) return null;

  // The rebuilt dish drops its units like any part change; the split keeps the others.
  const rebuilt = { ...applyLineChange(draft, wholeLines), units: draft.units };
  const split = splitRecipe(rebuilt, count);
  if (split === null) return null;
  const kept = findUnit(pickerUnits(split.draft.basis, split.draft.units), unit.id) ?? GRAMS_UNIT;
  const shown: ShownAmount = { unit: kept, count: countIn(kept, portion), amount: portion };
  return { draft: withChosen(split.draft, shown), shown, servings: split.servings };
}
