// Scaling a food to the amount the person picked. Every value scales by shown amount ÷ base
// amount, where the base is what the stored numbers describe: the known weight in grams, or a
// count of servings when the weight is unknown. Energy is a whole kcal after scaling; macros,
// optional nutrients and extras stay unrounded and are rounded only on screen, so the review, the
// fit check and the stored row agree (R02.25). A value the person types while the amount is
// scaled describes the shown amount, so it is divided by the scale before it is stored (R02.3).

import type { IngredientLine, NutritionDraft } from '../model';
import {
  countIn,
  initialUnit,
  isWeightKnown,
  normaliseChoices,
  unitId,
  type ShownAmount,
} from './units';

function isPositive(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * The amount the draft's numbers describe: the known weight in grams, else its serving count when
 * that is above 0, else 1 serving. Never an invented weight (R02.1).
 */
export function reviewBase(draft: Pick<NutritionDraft, 'basis'>): number {
  const { basis } = draft;
  if (isWeightKnown(basis)) return basis.grams;
  if (basis.kind === 'servings' && isPositive(basis.count)) return basis.count;
  return 1;
}

/**
 * The amount a review or edit sheet opens with, at scale 1: the unit from `initialUnit`, and as
 * count the stored chosen count when that unit is the chosen one, else the base in that unit.
 */
export function initialAmount(
  draft: Pick<NutritionDraft, 'basis' | 'units' | 'chosenUnit' | 'chosenCount'>,
  gramsFirst: boolean,
): ShownAmount {
  const unit = initialUnit(draft, gramsFirst);
  const amount = reviewBase(draft);
  const keepsChosenCount =
    unit.kind === 'unit' &&
    draft.chosenUnit !== undefined &&
    unitId(draft.chosenUnit) === unit.id &&
    isPositive(draft.chosenCount);
  const count = keepsChosenCount ? (draft.chosenCount ?? 1) : countIn(unit, amount);
  return { unit, count, amount };
}

/** Shown amount ÷ base amount; 1 when the base is not above 0 or either is not a usable number. */
export function scaleFor(shownAmount: number, baseAmount: number): number {
  if (!Number.isFinite(shownAmount) || shownAmount < 0 || !isPositive(baseAmount)) return 1;
  return shownAmount / baseAmount;
}

/** Energy at a scale: always a whole kcal. */
export function scaledKcal(kcal: number, scale: number): number {
  return Math.round(kcal * scale);
}

/**
 * Optional nutrients or extras multiplied by `factor`, unrounded. Only known (finite) values are
 * kept: an unknown value stays absent, never 0.
 */
export function scaleValues<K extends string>(
  values: Partial<Record<K, number>>,
  factor: number,
): Partial<Record<K, number>> {
  const scaled: Partial<Record<K, number>> = {};
  for (const key of Object.keys(values) as K[]) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) scaled[key] = value * factor;
  }
  return scaled;
}

/** A part at `factor` of its size: grams and macros unrounded, kcal whole. */
export function scaleLine(line: IngredientLine, factor: number): IngredientLine {
  return {
    ...line,
    grams: line.grams * factor,
    kcal: scaledKcal(line.kcal, factor),
    protein: line.protein * factor,
    carbs: line.carbs * factor,
    fat: line.fat * factor,
  };
}

/**
 * The stored base value for a value typed at the shown amount: typed ÷ scale. A scale that is not
 * a finite number above 0 counts as 1, so nothing is divided by 0 (R02.3).
 */
export function baseFromTyped(typed: number, scale: number): number {
  return typed / (isPositive(scale) ? scale : 1);
}

/** A nutrient or extra as a screen shows it: rounded to 0.1, or null when unknown. */
export function shownTenth(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

/**
 * The draft rewritten at the shown amount, ready to store: every value scaled (kcal whole, the
 * rest unrounded), parts scaled with it, the basis set to the shown grams or serving count, each
 * named unit's count refreshed for the new weight, and the chosen unit set to the shown unit
 * (absent for grams and the serving count). A shown amount that is not a finite number above 0
 * leaves the draft as it is.
 */
export function draftAtAmount<D extends NutritionDraft>(draft: D, shown: ShownAmount): D {
  if (!isPositive(shown.amount)) return draft;
  const scale = scaleFor(shown.amount, reviewBase(draft));
  const byServings = shown.unit.kind === 'servings';
  const next: D = {
    ...draft,
    kcal: scaledKcal(draft.kcal, scale),
    protein: draft.protein * scale,
    carbs: draft.carbs * scale,
    fat: draft.fat * scale,
    nutrients: scaleValues(draft.nutrients, scale),
    extras: scaleValues(draft.extras, scale),
    lines: draft.lines.map((line) => scaleLine(line, scale)),
    basis: byServings
      ? { kind: 'servings', count: shown.amount }
      : { kind: 'grams', grams: shown.amount },
    units: byServings
      ? draft.units
      : normaliseChoices(
          draft.units.map(({ unit, gramsEach }) => ({ unit, gramsEach })),
          shown.amount,
        ),
  };
  delete next.chosenUnit;
  delete next.chosenCount;
  if (shown.unit.kind === 'unit') {
    next.chosenUnit = shown.unit.id;
    next.chosenCount = shown.count;
  }
  return next;
}
