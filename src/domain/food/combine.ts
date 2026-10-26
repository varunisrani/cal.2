// Combining diary entries into one meal: each entry becomes one line of the new meal.
//
// Lines carry energy and macros only, so the meal's optional nutrients and extras are summed
// from the entries themselves, and only where every entry knows the value: one unknown keeps the
// sum unknown, never a partial total (D-16.20). An entry whose weight is unknown still gets a
// visible line of 0 g (R02.9). Notes and product info belong to the originals and are dropped.

import {
  EXTRA_KEYS,
  NUTRIENT_KEYS,
  type DiaryEntry,
  type IngredientLine,
  type NutritionDraft,
} from '../model';
import { lineTotals } from '../servings/ingredients';
import { basisFor, weightKnown } from '../servings/units';

/** Names of the combined meal, from the catalogue. */
export interface CombineNames {
  /** Used when no entry has a name, e.g. "Combined meal". */
  fallback: string;
  /** The tail after the first two names when there are more than three, e.g. 2 → "2 more". */
  more: (count: number) => string;
}

/** A combined meal ready to be written; the caller gives it its id. */
export type CombinedEntry = Omit<DiaryEntry, 'id'>;

/** The names joined with " + " when three or fewer; else the first two and a "K more" tail. */
export function combinedName(
  entries: readonly Pick<NutritionDraft, 'name'>[],
  names: CombineNames,
): string {
  const named = entries.map((entry) => entry.name.trim()).filter((name) => name !== '');
  if (named.length === 0) return names.fallback;
  if (named.length <= 3) return named.join(' + ');
  return [...named.slice(0, 2), names.more(named.length - 2)].join(' + ');
}

/** An entry's photos in gallery order: its own, then its lines', without repeats. */
function galleryOf(entry: DiaryEntry): string[] {
  return [...new Set([...entry.photoIds, ...entry.lines.flatMap((line) => line.photoIds)])];
}

/** One entry as a line: its known weight or 0 g, its values, photos and emoji. */
function lineFor(entry: DiaryEntry): IngredientLine {
  const line: IngredientLine = {
    name: entry.name,
    grams: weightKnown(entry.basis) ? entry.basis.grams : 0,
    kcal: entry.kcal,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    photoIds: galleryOf(entry),
  };
  return entry.emoji ? { ...line, emoji: entry.emoji } : line;
}

/** Sums each key that every record knows; a key any record lacks stays absent. */
function sumWhereAllKnow<K extends string>(
  records: readonly Partial<Record<K, number>>[],
  keys: readonly K[],
): Partial<Record<K, number>> {
  const sums: Partial<Record<K, number>> = {};
  for (const key of keys) {
    let sum = 0;
    let known = true;
    for (const record of records) {
      const value = record[key];
      if (value === undefined || !Number.isFinite(value)) {
        known = false;
        break;
      }
      sum += value;
    }
    if (known) sums[key] = sum;
  }
  return sums;
}

/**
 * Combines two or more entries into one meal: one line per entry; the name from
 * `combinedName`; time, day and meal of the latest entry (the first of equal times); every photo
 * in order without repeats; the first emoji; source manual; weight = the sum of the known weights
 * when above 0, else one serving; kcal and macros summed; optional nutrients and extras summed
 * where every entry knows them (D-16.20); no notes, product info or named units.
 * Throws a `RangeError` for fewer than two entries.
 */
export function combineEntries(entries: readonly DiaryEntry[], names: CombineNames): CombinedEntry {
  const [first] = entries;
  if (first === undefined || entries.length < 2) {
    throw new RangeError(`combineEntries needs at least two entries, got ${entries.length}`);
  }
  const latest = entries.reduce((kept, entry) => (entry.loggedAt > kept.loggedAt ? entry : kept));
  const lines = entries.map(lineFor);
  const totals = lineTotals(lines);
  const emoji = entries.find((entry) => entry.emoji)?.emoji;
  const combined: CombinedEntry = {
    name: combinedName(entries, names),
    kcal: totals.kcal,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    nutrients: sumWhereAllKnow(
      entries.map((entry) => entry.nutrients),
      NUTRIENT_KEYS,
    ),
    extras: sumWhereAllKnow(
      entries.map((entry) => entry.extras),
      EXTRA_KEYS,
    ),
    basis: basisFor(totals.grams),
    units: [],
    lines,
    progressive: false,
    loggedAt: latest.loggedAt,
    dayKey: latest.dayKey,
    meal: latest.meal,
    source: 'manual',
    photoIds: [...new Set(entries.flatMap(galleryOf))],
  };
  return emoji ? { ...combined, emoji } : combined;
}
