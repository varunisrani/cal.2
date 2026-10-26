/**
 * A nutrition-label answer: the label's values per 100 g, scaled to the serving the person chose.
 * The dedicated label request is a later item (D29; "Scan label" uses the meal request for now,
 * D-16.62), but the reader is small and its rounding is a known trap: kcal is rounded, never cut
 * down (R03.24).
 */
import {
  EXTRA_KEYS,
  NUTRIENT_KEYS,
  type NutritionDraft,
  type ServingBasis,
} from '../../domain/model';
import { normaliseChoices } from '../../domain/servings/units';
import { err, ok, type Result } from '../../lib/result';
import type { SingleFailure } from '../errors';
import { isRecord, readNumber } from './json';
import { FOOD_REPLY_KEYS } from './foodReply';
import { readUnits, withUnits } from './units';

/**
 * The keys of our label reply. `per100g` holds `kcal`, `protein`, `carbs`, `fat` and the
 * `nutrients` object under the food reply's names; `servingGrams` is the serving printed on the
 * label, which the `units` describe.
 */
export const LABEL_REPLY_KEYS = {
  name: 'name',
  per100g: 'per100g',
  servingGrams: 'servingGrams',
  units: FOOD_REPLY_KEYS.units,
} as const;

/** A label answer at the chosen serving. */
export interface LabelReading {
  readonly draft: NutritionDraft;
  /** The unit list was missing or mangled (see `readUnits`). */
  readonly needsRepair: boolean;
}

const L = LABEL_REPLY_KEYS;
const F = FOOD_REPLY_KEYS;

/** The values of a label are given for this many grams. */
const LABEL_BASIS_GRAMS = 100;

/**
 * The draft for a label answer already cut out of the model's text (`parseModelJson`), at a
 * serving of `grams`: every per-100 g value times grams ÷ 100, kcal rounded to a whole number,
 * optional nutrients and extras rounded to 0.1, macros unrounded. A name and the per-100 g kcal,
 * protein, carbs and fat (numbers or numeric strings, at least 0) are required. The units are
 * read against the printed serving; each keeps its grams and gets its count for the chosen
 * serving, and the first is chosen. When `grams` is not a number above 0 the printed serving is
 * used, and without one 100 g, the amount the values describe.
 */
export function readLabelReply(reply: unknown, grams: number): Result<LabelReading, SingleFailure> {
  if (!isRecord(reply)) return invalid();
  const name = textOf(reply[L.name]);
  const per100g = reply[L.per100g];
  if (name === undefined || !isRecord(per100g)) return invalid();
  const kcal = required(per100g[F.kcal]);
  const protein = required(per100g[F.protein]);
  const carbs = required(per100g[F.carbs]);
  const fat = required(per100g[F.fat]);
  if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) {
    return invalid();
  }

  const printed = aboveZero(readNumber(reply[L.servingGrams]));
  const serving = aboveZero(grams) ?? printed ?? LABEL_BASIS_GRAMS;
  const atServing = (value: number) => (value * serving) / LABEL_BASIS_GRAMS;

  const optional = per100g[F.nutrients];
  const listed = isRecord(optional) ? optional : {};
  const draft: NutritionDraft = {
    name,
    kcal: Math.round(atServing(kcal)),
    protein: atServing(protein),
    carbs: atServing(carbs),
    fat: atServing(fat),
    nutrients: tenths(listed, NUTRIENT_KEYS, atServing),
    extras: tenths(listed, EXTRA_KEYS, atServing),
    basis: { kind: 'grams', grams: serving },
    units: [],
    lines: [],
    progressive: false,
  };

  const printedBasis: ServingBasis =
    printed === undefined ? { kind: 'servings', count: 1 } : { kind: 'grams', grams: printed };
  const reading = readUnits(reply, printedBasis);
  const units = normaliseChoices(
    reading.units.map(({ unit, gramsEach }) => ({ unit, gramsEach })),
    serving,
  );
  return ok({ draft: withUnits(draft, units), needsRepair: reading.needsRepair });
}

/** A required per-100 g value: present, finite and not negative. */
function required(value: unknown): number | undefined {
  const n = readNumber(value);
  return n !== undefined && n >= 0 ? n + 0 : undefined; // + 0 turns -0 into 0
}

function aboveZero(n: number | undefined): number | undefined {
  return n !== undefined && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The listed values for `keys` that are finite and at least 0, scaled and rounded to 0.1. */
function tenths<Key extends string>(
  listed: Readonly<Record<string, unknown>>,
  keys: readonly Key[],
  scale: (value: number) => number,
): Partial<Record<Key, number>> {
  const values: Partial<Record<Key, number>> = {};
  for (const key of keys) {
    const n = Object.hasOwn(listed, key) ? readNumber(listed[key]) : undefined;
    if (n !== undefined && n >= 0) values[key] = Math.round(scale(n) * 10) / 10 + 0;
  }
  return values;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function invalid(): Result<never, SingleFailure> {
  return err({ kind: 'invalidResponse' });
}
