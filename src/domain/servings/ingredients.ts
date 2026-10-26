// A meal's parts (ingredient lines). Parts carry weight, energy and macros only. When the parts
// change, the meal's energy and macros become their sums as the sheet shows them, and the
// meal-level nutrients and extras (which the parts do not have) stretch by how much the parts'
// weight changed: they are never rebuilt from the parts (R02.4). The line editor rescales a part
// from an unrounded baseline so repeated weight edits do not drift.

import type { IngredientLine, NutritionDraft } from '../model';
import { scaleValues } from './scale';
import { isWeightKnown } from './units';

/** Sums over a list of parts. */
export interface LineTotals {
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Plain sums of the parts' weight (unknown weights count as 0), energy and macros. */
export function lineTotals(lines: readonly IngredientLine[]): LineTotals {
  const totals: LineTotals = { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const line of lines) {
    totals.grams += line.grams;
    totals.kcal += line.kcal;
    totals.protein += line.protein;
    totals.carbs += line.carbs;
    totals.fat += line.fat;
  }
  return totals;
}

function isAboveZero(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/**
 * A whole food (a diary entry, an analysis, a saved meal) as one part: its name trimmed, its
 * known weight or 0 g when the weight is unknown (never the serving count, R02.1), its energy and
 * macros, the given photos and its emoji when it has one. Its own parts are not expanded.
 */
export function draftAsLine(
  draft: Pick<NutritionDraft, 'name' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'basis' | 'emoji'>,
  photoIds: readonly string[],
): IngredientLine {
  const line: IngredientLine = {
    name: draft.name.trim(),
    grams: isWeightKnown(draft.basis) ? draft.basis.grams : 0,
    kcal: draft.kcal,
    protein: draft.protein,
    carbs: draft.carbs,
    fat: draft.fat,
    photoIds,
  };
  if (draft.emoji !== undefined && draft.emoji.trim() !== '') line.emoji = draft.emoji;
  return line;
}

/**
 * How much meal-level nutrients stretch when the parts' weight goes from `oldGrams` to
 * `newGrams`: null (leave them) when the old weight is not above 0, since there is no ratio; 0
 * when the new weight is not above 0; otherwise new ÷ old.
 */
export function stretchFactor(oldGrams: number, newGrams: number): number | null {
  if (!isAboveZero(oldGrams)) return null;
  if (!isAboveZero(newGrams)) return 0;
  return newGrams / oldGrams;
}

/**
 * The draft after its parts change to `nextLines`, the parts as the sheet shows them (at the
 * current scale); `draft.lines` are the stored parts. Energy and macros become the sums of
 * `nextLines`; nutrients and extras stretch by the parts' new weight ÷ old weight. A new weight
 * above 0 becomes the basis, and the named units, the chosen unit and with them any recipe split
 * are dropped, because their grams described the old meal. When every new weight is unknown, the
 * basis, units and chosen unit stay as they were.
 */
export function applyLineChange<D extends NutritionDraft>(
  draft: D,
  nextLines: readonly IngredientLine[],
): D {
  const before = lineTotals(draft.lines);
  const after = lineTotals(nextLines);
  const factor = stretchFactor(before.grams, after.grams);
  const next: D = {
    ...draft,
    kcal: after.kcal,
    protein: after.protein,
    carbs: after.carbs,
    fat: after.fat,
    nutrients: factor === null ? draft.nutrients : scaleValues(draft.nutrients, factor),
    extras: factor === null ? draft.extras : scaleValues(draft.extras, factor),
    lines: nextLines,
  };
  if (isAboveZero(after.grams)) {
    next.basis = { kind: 'grams', grams: after.grams };
    next.units = [];
    delete next.chosenUnit;
    delete next.chosenCount;
  }
  return next;
}

/** A part's numbers in the line editor, energy unrounded. */
export interface LinePortion {
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Values at or above this are refused (the largest 32-bit integer). */
export const LINE_VALUE_LIMIT = 2 ** 31 - 1;

/**
 * The part at `grams`, scaled from `baseline` (keep the baseline and call this on every weight
 * edit, so typing 1, 15, 150 never drifts; after the person edits a value, the numbers on screen
 * become the new baseline). Null when either weight is not a finite number above 0, or a result
 * is not finite, negative, or at least `LINE_VALUE_LIMIT`.
 */
export function rescaleLine(baseline: LinePortion, grams: number): LinePortion | null {
  if (!isAboveZero(baseline.grams) || !isAboveZero(grams)) return null;
  const factor = grams / baseline.grams;
  const next: LinePortion = {
    grams,
    kcal: baseline.kcal * factor,
    protein: baseline.protein * factor,
    carbs: baseline.carbs * factor,
    fat: baseline.fat * factor,
  };
  const values = [next.kcal, next.protein, next.carbs, next.fat];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value >= LINE_VALUE_LIMIT)) {
    return null;
  }
  return next;
}

/** The line editor's fields; a number is null when its text did not read as one. */
export interface LineFields {
  name: string;
  grams: number | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export type LineField = keyof LineFields;

function isAmount(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

/**
 * The fields that keep the line editor from saving, in field order; empty when it may save. The
 * name must hold more than spaces, the weight must be above 0, every value a finite number of at
 * least 0, and energy below `LINE_VALUE_LIMIT`.
 */
export function validateLine(fields: LineFields): LineField[] {
  const problems: LineField[] = [];
  if (fields.name.trim() === '') problems.push('name');
  if (fields.grams === null || !isAboveZero(fields.grams)) problems.push('grams');
  if (!isAmount(fields.kcal) || fields.kcal >= LINE_VALUE_LIMIT) problems.push('kcal');
  if (!isAmount(fields.protein)) problems.push('protein');
  if (!isAmount(fields.carbs)) problems.push('carbs');
  if (!isAmount(fields.fat)) problems.push('fat');
  return problems;
}

/**
 * The part the line editor saves: trimmed name, whole kcal, the rest as typed; `media` keeps the
 * part's photos and emoji. Null while `validateLine` reports a problem.
 */
export function toLine(
  fields: LineFields,
  media: Pick<IngredientLine, 'photoIds' | 'emoji'>,
): IngredientLine | null {
  if (validateLine(fields).length > 0) return null;
  const line: IngredientLine = {
    name: fields.name.trim(),
    grams: fields.grams ?? 0,
    kcal: Math.round(fields.kcal ?? 0),
    protein: fields.protein ?? 0,
    carbs: fields.carbs ?? 0,
    fat: fields.fat ?? 0,
    photoIds: media.photoIds,
  };
  if (media.emoji !== undefined) line.emoji = media.emoji;
  return line;
}
