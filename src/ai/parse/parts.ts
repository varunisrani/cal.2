/**
 * The parts breakdown of a food answer (rice, curry, naan), read all or nothing (R03.14). Kept
 * parts replace the meal's kcal and macros, so a partial or padded list would corrupt the totals:
 * any doubt drops the whole list and the answer's own totals stay (ACC-E8-2). Parts whose weight
 * the answer left out get a share of the weight the listed parts leave over, in proportion to their
 * kcal, but only when that share is physically possible.
 */
import type { IngredientLine, NutritionDraft } from '../../domain/model';
import { lineTotals } from '../../domain/servings/ingredients';
import { isWeightKnown } from '../../domain/servings/units';
import { isRecord, readNumber } from './json';
import { FOOD_REPLY_KEYS, PART_REPLY_KEYS } from './foodReply';

/** A longer list is dropped, never cut short: the cut parts would vanish from the totals. */
export const MAX_PARTS = 20;
/** No part's kcal, macro or weight comes near this; a larger value is malformed. */
export const MAX_PART_VALUE = 100_000;
/** About 9 kcal/g (fat, the densest food): weights filled in for unweighed parts stay under it. */
export const MAX_KCAL_PER_GRAM = 9;
/** The parts' kcal must cover at least this share of the meal's (fewer means dishes are missing)… */
export const MIN_COVERAGE = 0.5;
/** …and at most this share (more means something is counted twice, such as a total row). */
export const MAX_COVERAGE = 1.5;

/** A part as read, before unknown weights are filled. */
interface PartValues {
  readonly name: string;
  /** Undefined when the answer gave no weight (missing, null or 0). */
  readonly grams: number | undefined;
  readonly kcal: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
}

/**
 * The parts in `reply.parts` for a meal of `meal.kcal` and `meal.basis`, or an empty list when
 * there is no usable breakdown. The list is dropped when it is missing, empty or longer than 20;
 * when any part lacks a name, has a kcal or macro outside 0–100 000 (numbers or numeric strings),
 * or a weight outside (0, 100 000] other than 0 or none for unknown; when a part of unknown weight
 * has no kcal to size it by; when unknown weights cannot be filled; or when the parts' kcal is
 * outside 0.5–1.5 of a meal kcal above 0. Each part's kcal is rounded to a whole kcal.
 */
export function readParts(
  reply: unknown,
  meal: Pick<NutritionDraft, 'kcal' | 'basis'>,
): IngredientLine[] {
  const list = isRecord(reply) ? reply[FOOD_REPLY_KEYS.parts] : undefined;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_PARTS) return [];

  const parts: PartValues[] = [];
  for (const element of list as readonly unknown[]) {
    const part = readPart(element);
    if (part === undefined) return [];
    parts.push(part);
  }

  const gramsPerKcal = fillRate(parts, isWeightKnown(meal.basis) ? meal.basis.grams : undefined);
  if (gramsPerKcal === undefined) return [];

  const lines = parts.map((part): IngredientLine => ({
    name: part.name,
    grams: part.grams ?? Math.round(part.kcal * gramsPerKcal * 10) / 10,
    kcal: Math.round(part.kcal),
    protein: part.protein,
    carbs: part.carbs,
    fat: part.fat,
    photoIds: [],
  }));
  if (meal.kcal > 0) {
    const coverage = lineTotals(lines).kcal / meal.kcal;
    if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) return [];
  }
  return lines;
}

/**
 * The draft carrying `lines`. When there are parts, its kcal and macros become their sums; the
 * serving weight stays as the answer gave it. With no parts the answer's own totals stay.
 */
export function withParts<D extends NutritionDraft>(draft: D, lines: readonly IngredientLine[]): D {
  if (lines.length === 0) return { ...draft, lines: [] };
  const totals = lineTotals(lines);
  return {
    ...draft,
    lines: [...lines],
    kcal: totals.kcal,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
  };
}

/** One element as a part, or undefined when it is malformed. */
function readPart(element: unknown): PartValues | undefined {
  if (!isRecord(element)) return undefined;
  const rawName = element[PART_REPLY_KEYS.name];
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const kcal = amount(element[PART_REPLY_KEYS.kcal]);
  const protein = amount(element[PART_REPLY_KEYS.protein]);
  const carbs = amount(element[PART_REPLY_KEYS.carbs]);
  const fat = amount(element[PART_REPLY_KEYS.fat]);
  if (
    name === '' ||
    kcal === undefined ||
    protein === undefined ||
    carbs === undefined ||
    fat === undefined
  ) {
    return undefined;
  }

  const rawGrams = element[PART_REPLY_KEYS.grams];
  let grams: number | undefined;
  if (rawGrams !== undefined && rawGrams !== null) {
    const listed = readNumber(rawGrams);
    if (listed === undefined || listed < 0 || listed > MAX_PART_VALUE) return undefined;
    if (listed > 0) grams = listed;
  }
  // A part of unknown weight is sized by its kcal; with none there is nothing to size it by.
  if (grams === undefined && kcal <= 0) return undefined;
  return { name, grams, kcal, protein, carbs, fat };
}

/** A kcal or macro: a number or numeric string within 0–100 000. */
function amount(value: unknown): number | undefined {
  const n = readNumber(value);
  return n !== undefined && n >= 0 && n <= MAX_PART_VALUE ? n + 0 : undefined; // + 0: -0 is 0
}

/**
 * Grams per kcal for the parts of unknown weight: the meal weight the listed parts leave over,
 * shared in proportion to kcal. 0 when every weight is listed. Undefined when weights are missing
 * and the meal weight is unknown, nothing is left over, or the share would pack more than 9 kcal
 * into a gram.
 */
function fillRate(parts: readonly PartValues[], mealGrams: number | undefined): number | undefined {
  let unknownKcal = 0;
  let listedGrams = 0;
  for (const part of parts) {
    if (part.grams === undefined) unknownKcal += part.kcal;
    else listedGrams += part.grams;
  }
  if (unknownKcal === 0) return 0;
  if (mealGrams === undefined) return undefined;
  const room = mealGrams - listedGrams;
  if (room <= 0 || unknownKcal / room > MAX_KCAL_PER_GRAM) return undefined;
  return room / unknownKcal;
}
