// The units an amount can be typed in. Grams are the truth: a named unit (slice, cup, a split
// recipe's serving) is only a number of grams per unit, so changing unit never changes the amount.
// When the food's weight is unknown there are no grams to convert to, and the only unit is a count
// of servings: its own kind, never a unit that happens to be called "serving" and never a made-up
// 100 g (R02.1, R02.2).

import type { NutritionDraft, ServingBasis, UnitChoice } from '../model';

/** An entry carries at most this many named units. */
export const MAX_UNIT_CHOICES = 4;

/** The picker id of grams. */
export const GRAMS_ID = 'g';

/** The name of the unit a recipe split adds, and the picker id of the serving count. */
export const SERVING_UNIT = 'serving';

const GRAM_SPELLINGS: ReadonlySet<string> = new Set(['g', 'gram', 'grams']);

// Metric and kitchen abbreviations read the same after any count ("2 tbsp", "3 ml").
const INVARIANT_LABELS: ReadonlySet<string> = new Set([
  ...GRAM_SPELLINGS,
  'kg',
  'mg',
  'ml',
  'l',
  'oz',
  'fl oz',
  'tbsp',
  'tsp',
]);

/** A count this close to 1 reads as one ("1 slice", not "1 slices"). */
const ONE_TOLERANCE = 0.0001;

/** The id of a unit name: trimmed and lower-case (" Slice " → "slice"). */
export function unitId(name: string): string {
  return name.trim().toLowerCase();
}

/** True for g, gram and grams in any case. Grams are offered by the picker, never stored. */
export function isGramSpelling(name: string): boolean {
  return GRAM_SPELLINGS.has(unitId(name));
}

function isPositive(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** True only for a grams basis with a finite weight above 0. */
export function isWeightKnown(basis: ServingBasis): basis is { kind: 'grams'; grams: number } {
  return basis.kind === 'grams' && isPositive(basis.grams);
}

/**
 * A clean list of named units: ids trimmed and lower-cased; gram spellings, empty names, a
 * gramsEach that is not a finite number above 0, and repeats (the first one wins) dropped; at most
 * `MAX_UNIT_CHOICES` kept. A count that is missing or not a positive number is filled with
 * `baseGrams ÷ gramsEach` when the base weight is known, and left out when it is not.
 */
export function normaliseChoices(list: readonly UnitChoice[], baseGrams: number): UnitChoice[] {
  const seen = new Set<string>();
  const kept: UnitChoice[] = [];
  for (const choice of list) {
    if (kept.length === MAX_UNIT_CHOICES) break;
    const id = unitId(choice.unit);
    if (id === '' || GRAM_SPELLINGS.has(id) || seen.has(id) || !isPositive(choice.gramsEach)) {
      continue;
    }
    seen.add(id);
    const next: UnitChoice = { unit: id, gramsEach: choice.gramsEach };
    if (isPositive(choice.count)) next.count = choice.count;
    else if (isPositive(baseGrams)) next.count = baseGrams / choice.gramsEach;
    kept.push(next);
  }
  return kept;
}

/** One entry of the amount picker. */
export type PickerUnit =
  | { readonly kind: 'grams'; readonly id: typeof GRAMS_ID }
  | { readonly kind: 'unit'; readonly id: string; readonly gramsEach: number }
  | { readonly kind: 'servings'; readonly id: typeof SERVING_UNIT };

export const GRAMS_UNIT: PickerUnit = { kind: 'grams', id: GRAMS_ID };

/** The only unit of a food whose weight is unknown: a count of servings. */
export const SERVING_COUNT_UNIT: PickerUnit = { kind: 'servings', id: SERVING_UNIT };

/**
 * The units the amount row offers: grams first and then the named units when the weight is
 * known; only the serving count when it is not (R02.1). A named unit called "serving" (a recipe
 * split) is an ordinary named unit here (R02.2).
 */
export function pickerUnits(basis: ServingBasis, choices: readonly UnitChoice[]): PickerUnit[] {
  if (!isWeightKnown(basis)) return [SERVING_COUNT_UNIT];
  const named = normaliseChoices(choices, basis.grams).map((choice): PickerUnit => ({
    kind: 'unit',
    id: choice.unit,
    gramsEach: choice.gramsEach,
  }));
  return [GRAMS_UNIT, ...named];
}

/** The unit with id `id` among `units`, or undefined. */
export function findUnit(units: readonly PickerUnit[], id: string): PickerUnit | undefined {
  const wanted = unitId(id);
  return units.find((unit) => unit.id === wanted);
}

/**
 * The unit a sheet opens in: the serving count when the weight is unknown; grams when the
 * grams-first setting is on; the draft's chosen unit when it is offered; the first named unit;
 * grams.
 */
export function initialUnit(
  draft: Pick<NutritionDraft, 'basis' | 'units' | 'chosenUnit'>,
  gramsFirst: boolean,
): PickerUnit {
  if (!isWeightKnown(draft.basis)) return SERVING_COUNT_UNIT;
  if (gramsFirst) return GRAMS_UNIT;
  const offered = pickerUnits(draft.basis, draft.units);
  const chosen = draft.chosenUnit === undefined ? undefined : findUnit(offered, draft.chosenUnit);
  return chosen ?? offered.find((unit) => unit.kind === 'unit') ?? GRAMS_UNIT;
}

/**
 * What the amount row shows: `count` in `unit`, standing for `amount` of the draft's basis
 * (grams when the weight is known, servings for the serving count).
 */
export interface ShownAmount {
  readonly unit: PickerUnit;
  readonly count: number;
  readonly amount: number;
}

/** The basis amount (grams, or servings for the serving count) that `count` of `unit` makes. */
export function amountOf(unit: PickerUnit, count: number): number {
  return unit.kind === 'unit' ? count * unit.gramsEach : count;
}

/** How many of `unit` make the basis `amount`. */
export function countIn(unit: PickerUnit, amount: number): number {
  return unit.kind === 'unit' ? amount / unit.gramsEach : amount;
}

/** The same amount in another unit: the grams stay, the count is rewritten. */
export function switchUnit(shown: ShownAmount, unit: PickerUnit): ShownAmount {
  return { unit, count: countIn(unit, shown.amount), amount: shown.amount };
}

/** The amount after the person types `count` in the current unit. */
export function withCount(shown: ShownAmount, count: number): ShownAmount {
  return { unit: shown.unit, count, amount: amountOf(shown.unit, count) };
}

/** The word for one serving and for several, from the catalogue. */
export interface ServingWord {
  readonly one: string;
  readonly other: string;
}

/**
 * The label after a count: `unit` is a unit name or picker id. No count, or a count within 0.0001
 * of 1, keeps the singular. A serving (a recipe split's unit or the serving count) shows the
 * caller's serving word. Metric and kitchen abbreviations never change; "piece" becomes "pieces";
 * any other name gains an "s" unless it already ends in one.
 */
export function unitLabel(unit: string, count: number | undefined, word: ServingWord): string {
  const id = unitId(unit);
  const singular = count === undefined || Math.abs(count - 1) <= ONE_TOLERANCE;
  if (id === SERVING_UNIT) return singular ? word.one : word.other;
  const name = unit.trim();
  if (singular || INVARIANT_LABELS.has(id)) return name;
  if (id === 'piece') return 'pieces';
  return id.endsWith('s') ? name : `${name}s`;
}
