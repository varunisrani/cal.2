// Named units and the amount picker of the review sheet.
//
// Every amount is measured against a draft's serving basis: grams when the weight is known, or a
// count of servings when it is not. Named units (slice, cup, a split recipe's serving) only make
// sense against grams, so an unknown weight offers nothing but the serving count: it is never
// shown as grams and never turned into 100 g (R02.1). That serving count is its own picker kind,
// not a unit that happens to be named "serving" (R02.2).

import type { ServingBasis, UnitChoice } from '../model';

/** At most this many named units are kept on a draft. */
export const MAX_UNITS = 4;

/** The named unit a recipe split adds; it is a real unit with grams, unlike the serving count. */
export const SERVING_UNIT = 'serving';

const GRAM_SPELLINGS: ReadonlySet<string> = new Set(['g', 'gram', 'grams']);

/** Units whose label is the same for one or many: metric and kitchen abbreviations. */
const SAME_FOR_MANY: ReadonlySet<string> = new Set([
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

/** One entry of the unit picker. */
export interface PickerUnit {
  /** Grams, a named unit, or the serving count of an unknown weight. */
  kind: 'grams' | 'unit' | 'servings';
  /** `'g'` for grams, the unit's id for a named unit, `'servings'` for the serving count. */
  id: string;
  /** How much of the basis one of this is: grams for grams and named units, 1 for servings. */
  amountEach: number;
}

export const GRAMS_PICK: PickerUnit = { kind: 'grams', id: 'g', amountEach: 1 };
export const SERVINGS_PICK: PickerUnit = { kind: 'servings', id: 'servings', amountEach: 1 };

/** Catalogue words for a serving, chosen by count ("serving" / "servings"). */
export interface ServingWords {
  one: string;
  other: string;
}

/** True for a finite number above 0. */
export function isPositive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** The id a unit name is known by: trimmed and lower-case. */
export function unitId(name: string): string {
  return name.trim().toLowerCase();
}

/** True for any spelling of grams ("g", "Gram", " grams "). */
export function isGramUnit(name: string): boolean {
  return GRAM_SPELLINGS.has(unitId(name));
}

/** True when the basis is a real weight: grams, finite and above 0. */
export function weightKnown(basis: ServingBasis): basis is { kind: 'grams'; grams: number } {
  return basis.kind === 'grams' && isPositive(basis.grams);
}

/**
 * The basis for a weight that may be unknown: grams only when finite and above 0, otherwise a
 * serving count (`count` when positive, else 1). A missing weight never becomes grams.
 */
export function basisFor(grams: number | null | undefined, count = 1): ServingBasis {
  if (isPositive(grams)) return { kind: 'grams', grams };
  return { kind: 'servings', count: isPositive(count) ? count : 1 };
}

/**
 * Cleans a list of named units: ids trimmed and lower-cased; gram spellings, empty names, weights
 * that are not finite and above 0, and repeated ids dropped (the first one wins); a count that is
 * missing or not positive filled with `baseGrams ÷ gramsEach` when the base weight is known; at
 * most `MAX_UNITS` kept, in order.
 */
export function normaliseChoices(list: readonly UnitChoice[], baseGrams: number): UnitChoice[] {
  const kept: UnitChoice[] = [];
  const seen = new Set<string>();
  for (const choice of list) {
    if (kept.length === MAX_UNITS) break;
    const unit = unitId(choice.unit);
    const { gramsEach } = choice;
    if (unit === '' || GRAM_SPELLINGS.has(unit) || !isPositive(gramsEach) || seen.has(unit)) {
      continue;
    }
    seen.add(unit);
    if (isPositive(choice.count)) kept.push({ unit, gramsEach, count: choice.count });
    else if (isPositive(baseGrams)) kept.push({ unit, gramsEach, count: baseGrams / gramsEach });
    else kept.push({ unit, gramsEach });
  }
  return kept;
}

/** A named unit as a picker entry. */
export function pickFor(choice: UnitChoice): PickerUnit {
  return { kind: 'unit', id: unitId(choice.unit), amountEach: choice.gramsEach };
}

/**
 * What the unit picker offers: grams first and then the cleaned named units when the weight is
 * known; only the serving count when it is not (R02.1, R02.2).
 */
export function pickerUnits(basis: ServingBasis, units: readonly UnitChoice[]): PickerUnit[] {
  if (!weightKnown(basis)) return [SERVINGS_PICK];
  return [GRAMS_PICK, ...normaliseChoices(units, 0).map(pickFor)];
}

/** The draft fields that decide which units are offered and which one opens. */
export interface UnitState {
  basis: ServingBasis;
  units: readonly UnitChoice[];
  chosenUnit?: string;
}

/**
 * The unit the amount field opens with: grams when the person prefers grams and the weight is
 * known; else the draft's chosen unit when it is offered; else the first named unit; else grams.
 * An unknown weight always opens on the serving count.
 */
export function initialUnit(draft: UnitState, gramsFirst: boolean): PickerUnit {
  if (!weightKnown(draft.basis)) return SERVINGS_PICK;
  if (gramsFirst) return GRAMS_PICK;
  const offered = pickerUnits(draft.basis, draft.units);
  if (draft.chosenUnit !== undefined) {
    const chosen = unitId(draft.chosenUnit);
    const match = offered.find((pick) => pick.id === chosen);
    if (match) return match;
  }
  return offered.find((pick) => pick.kind === 'unit') ?? GRAMS_PICK;
}

/**
 * The draft with `unit` recorded as its chosen unit: a named unit keeps its id and `quantity`;
 * grams and the serving count leave both fields absent (the basis says it all).
 */
export function withChoice<T extends UnitState & { chosenCount?: number }>(
  draft: T,
  unit: PickerUnit,
  quantity: number,
): T {
  const { chosenUnit: _unit, chosenCount: _count, ...rest } = draft;
  if (unit.kind !== 'unit') return rest as T;
  return { ...rest, chosenUnit: unit.id, chosenCount: quantity } as T;
}

/** The basis amount (grams, or servings) that `quantity` of `unit` stands for. */
export function shownAmount(quantity: number, unit: PickerUnit): number {
  return quantity * unit.amountEach;
}

/** The quantity in `to` that keeps the same amount as `quantity` of `from` (2 slices → 60 g). */
export function switchUnit(quantity: number, from: PickerUnit, to: PickerUnit): number {
  return shownAmount(quantity, from) / to.amountEach;
}

/**
 * The label after a quantity: unchanged for one (within 0.0001) or no quantity, and for metric
 * and kitchen abbreviations; "piece" → "pieces"; otherwise an "s" unless it already ends in one.
 * The serving count and a split recipe's serving unit use the catalogue's serving words.
 */
export function unitLabel(unit: PickerUnit, count: number | null, words: ServingWords): string {
  const single = count === null || Math.abs(count - 1) <= 0.0001;
  if (unit.kind === 'servings' || unit.id === SERVING_UNIT) return single ? words.one : words.other;
  if (single || SAME_FOR_MANY.has(unit.id)) return unit.id;
  if (unit.id === 'piece') return 'pieces';
  return unit.id.endsWith('s') ? unit.id : `${unit.id}s`;
}
