// Ingredient lines: the parts of a meal, and what a change to them does to the meal.
//
// Lines carry weight, energy and the three macros only. When the lines change, the meal header
// is rebuilt from them as the sheet shows them (at the current amount); the optional nutrients
// and extras, which no line carries, are stretched by how much the total line weight changed
// instead of being recomputed (R02.4).

import { err, ok, type Result } from '../../lib/result';
import type { IngredientLine, NutritionDraft } from '../model';
import { scaleRecord } from './scale';
import { GRAMS_PICK, isPositive, withChoice } from './units';

/** Line energy must stay below this (the largest 32-bit signed integer). */
export const LINE_KCAL_LIMIT = 2 ** 31 - 1;

/** The sums of a list of lines. Unknown weights (0 g) add nothing to `grams`. */
export interface LineTotals {
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function lineTotals(lines: readonly IngredientLine[]): LineTotals {
  const totals: LineTotals = { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const line of lines) {
    if (isPositive(line.grams)) totals.grams += line.grams;
    totals.kcal += line.kcal;
    totals.protein += line.protein;
    totals.carbs += line.carbs;
    totals.fat += line.fat;
  }
  return totals;
}

/**
 * How much to stretch the meal's nutrients when its line weight goes from `oldGrams` to
 * `newGrams`: new ÷ old; `null` (leave them alone) when the old weight is not a positive number;
 * 0 when the new weight is not.
 */
export function stretchFactor(oldGrams: number, newGrams: number): number | null {
  if (!isPositive(oldGrams)) return null;
  if (!isPositive(newGrams)) return 0;
  return newGrams / oldGrams;
}

/**
 * The draft after its lines change to `nextLines`, given as the sheet shows them (at the current
 * amount); `draft` is at its base amount. Header kcal and macros become the line sums; optional
 * nutrients and extras are stretched by the line weight ratio, never rebuilt from lines. When the
 * new lines weigh something, that weight becomes the basis and the named units and chosen unit
 * are cleared (any recipe split ends); when every weight is unknown the serving stays as it was.
 * The caller then shows the result at its base amount (scale 1).
 */
export function applyLineChange<T extends NutritionDraft>(
  draft: T,
  nextLines: readonly IngredientLine[],
): T {
  const after = lineTotals(nextLines);
  const factor = stretchFactor(lineTotals(draft.lines).grams, after.grams);
  const changed: T = {
    ...draft,
    kcal: after.kcal,
    protein: after.protein,
    carbs: after.carbs,
    fat: after.fat,
    nutrients: factor === null ? draft.nutrients : scaleRecord(draft.nutrients, factor),
    extras: factor === null ? draft.extras : scaleRecord(draft.extras, factor),
    lines: [...nextLines],
  };
  if (after.grams <= 0) return changed;
  const weighed: T = { ...changed, basis: { kind: 'grams', grams: after.grams }, units: [] };
  return withChoice(weighed, GRAMS_PICK, after.grams);
}

// ---- Line editor ------------------------------------------------------------------------------

/** A line's weight, energy and macros as unrounded numbers: the editor's baseline. */
export interface LineAmounts {
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function lineAmounts(line: IngredientLine): LineAmounts {
  const { grams, kcal, protein, carbs, fat } = line;
  return { grams, kcal, protein, carbs, fat };
}

/**
 * The editor's numbers for a new weight, scaled in proportion from `baseline`. The editor keeps
 * one baseline while the weight is typed, so "1", "15", "150" never drift; editing a value makes
 * the current numbers the new baseline. `null` when either weight is not a positive number or a
 * result is not finite, is negative or reaches `LINE_KCAL_LIMIT`.
 */
export function rescaleLine(baseline: LineAmounts, grams: number): LineAmounts | null {
  if (!isPositive(baseline.grams) || !isPositive(grams)) return null;
  const factor = grams / baseline.grams;
  const next: LineAmounts = {
    grams,
    kcal: baseline.kcal * factor,
    protein: baseline.protein * factor,
    carbs: baseline.carbs * factor,
    fat: baseline.fat * factor,
  };
  const values = [next.kcal, next.protein, next.carbs, next.fat];
  return values.every((value) => Number.isFinite(value) && value >= 0 && value < LINE_KCAL_LIMIT)
    ? next
    : null;
}

/** The line editor's fields; a number is `null` when the field does not hold one. */
export interface LineInput {
  name: string;
  grams: number | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export type LineField = keyof LineInput;

/** A line that may be saved: trimmed name, whole kcal. */
export interface ValidLine extends LineAmounts {
  name: string;
}

function isAmount(n: number | null): n is number {
  return n !== null && Number.isFinite(n) && n >= 0;
}

/**
 * Save is allowed when the name is not blank, the weight is a positive number and every value is
 * a finite number of at least 0, with kcal below `LINE_KCAL_LIMIT`. The error lists the fields
 * that block it, in field order.
 */
export function validateLine(input: LineInput): Result<ValidLine, LineField[]> {
  const name = input.name.trim();
  const { grams, protein, carbs, fat } = input;
  const kcal = isAmount(input.kcal) ? Math.round(input.kcal) : null;
  const kcalFits = kcal !== null && kcal < LINE_KCAL_LIMIT;
  if (name !== '' && isPositive(grams) && kcalFits && isAmount(protein)) {
    if (isAmount(carbs) && isAmount(fat)) return ok({ name, grams, kcal, protein, carbs, fat });
  }
  const problems: LineField[] = [];
  if (name === '') problems.push('name');
  if (!isPositive(grams)) problems.push('grams');
  if (!kcalFits) problems.push('kcal');
  if (!isAmount(protein)) problems.push('protein');
  if (!isAmount(carbs)) problems.push('carbs');
  if (!isAmount(fat)) problems.push('fat');
  return err(problems);
}
