/**
 * The unit choices a food answer offers ("2 slices", "1 bowl"), read strictly (R03.16). The list
 * is either fully usable or thrown away: a missing list, a value that is not a list, or one bad
 * element leaves no choices and flags the answer for the one unit repair request (P03-18 sends it
 * only for zero-energy foods with a known weight). An empty list is a complete answer, "no unit
 * fits", and flags nothing.
 */
import type { NutritionDraft, ServingBasis, UnitChoice } from '../../domain/model';
import {
  isGramSpelling,
  isWeightKnown,
  MAX_UNIT_CHOICES,
  unitId,
} from '../../domain/servings/units';
import { isRecord } from './json';
import { FOOD_REPLY_KEYS, UNIT_REPLY_KEYS } from './foodReply';

/** What an answer's unit list gave. */
export interface UnitsReading {
  /** At most four choices in the answer's order, ids lower-case; empty when none or voided. */
  readonly units: readonly UnitChoice[];
  /** The list was missing, not a list, or had a bad element: worth one repair request. */
  readonly needsRepair: boolean;
}

/** A unit's count × grams each may miss the weight by this many grams… */
export const UNIT_TOLERANCE_GRAMS = 5;
/** …or by this share of the weight, whichever is larger. */
export const UNIT_TOLERANCE_SHARE = 0.15;

const VOID: UnitsReading = { units: [], needsRepair: true };

/**
 * The unit choices in `reply.units`. Each element must be an object with a unit name that is not
 * blank and not a spelling of grams, and a count and grams each that are JSON numbers above 0
 * (numeric strings and booleans are mangled elements). With a known weight in `basis`, count ×
 * grams each must be within max(5 g, 15 %) of it. Any bad element voids the list. Repeats of a
 * unit, in any case, keep the first; four at most.
 */
export function readUnits(reply: unknown, basis: ServingBasis): UnitsReading {
  const list = isRecord(reply) ? reply[FOOD_REPLY_KEYS.units] : undefined;
  if (!Array.isArray(list)) return VOID;

  const weight = isWeightKnown(basis) ? basis.grams : undefined;
  const units: UnitChoice[] = [];
  const seen = new Set<string>();
  for (const element of list as readonly unknown[]) {
    const choice = readChoice(element, weight);
    if (choice === undefined) return VOID;
    if (seen.has(choice.unit)) continue;
    seen.add(choice.unit);
    units.push(choice);
  }
  return { units: units.slice(0, MAX_UNIT_CHOICES), needsRepair: false };
}

/**
 * The draft offering `units`. With a known weight the first unit becomes the one the sheet opens
 * in, with its count; with an unknown weight (or no units) nothing is chosen, since the sheet then
 * offers grams or the serving count only.
 */
export function withUnits<D extends NutritionDraft>(draft: D, units: readonly UnitChoice[]): D {
  const next: D = { ...draft, units: [...units] };
  delete next.chosenUnit;
  delete next.chosenCount;
  const first = units[0];
  if (first !== undefined && isWeightKnown(draft.basis)) {
    next.chosenUnit = first.unit;
    next.chosenCount = first.count ?? draft.basis.grams / first.gramsEach;
  }
  return next;
}

/** One element as a choice, or undefined when it is malformed or does not fit the weight. */
function readChoice(element: unknown, weight: number | undefined): UnitChoice | undefined {
  if (!isRecord(element)) return undefined;
  const name = element[UNIT_REPLY_KEYS.unit];
  if (typeof name !== 'string') return undefined;
  const unit = unitId(name);
  if (unit === '' || isGramSpelling(unit)) return undefined;

  const count = positiveNumber(element[UNIT_REPLY_KEYS.count]);
  const gramsEach = positiveNumber(element[UNIT_REPLY_KEYS.gramsEach]);
  if (count === undefined || gramsEach === undefined) return undefined;
  if (weight !== undefined && !fitsWeight(count * gramsEach, weight)) return undefined;
  return { unit, gramsEach, count };
}

/** A JSON number that is finite and above 0. `readNumber` is too lenient here: it reads "2". */
function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** True when `grams` is within max(5 g, 15 % of the weight) of the weight. */
function fitsWeight(grams: number, weight: number): boolean {
  const allowed = Math.max(UNIT_TOLERANCE_GRAMS, weight * UNIT_TOLERANCE_SHARE);
  return Math.abs(grams - weight) <= allowed;
}
