// Combining diary entries into one meal. Each original becomes one part of the new entry (its
// known weight, or 0 g when the weight is unknown: the part stays visible, R02.9); energy and
// macros are the sums; time, day and meal come from the latest original. An optional nutrient or
// extra is summed when every original knows it and stays unknown otherwise (D-16.20). Notes and
// product details are not carried. The words a person reads come from the caller.

import { EXTRA_KEYS, NUTRIENT_KEYS, type DiaryEntry, type ServingBasis } from '../model';
import { draftAsLine, lineTotals } from '../servings/ingredients';

/** Catalogue words for a combined entry's name. */
export interface CombineWords {
  /** The name when no original has one. */
  readonly fallbackName: string;
  /** The end of a long name for the names not listed: 2 → "2 more". */
  readonly more: (count: number) => string;
}

const NAME_JOINER = ' + ';
/** Up to this many names are listed in full; past it, the first two and a "more" tail. */
const LISTED_NAMES = 3;

/** A combined entry before the store gives it an id. */
export type CombinedEntry = Omit<DiaryEntry, 'id'>;

/**
 * The combined name: the trimmed, non-blank names joined with " + " when there are at most
 * three; else the first two and `words.more(count − 2)`; `words.fallbackName` when there are none.
 */
export function combinedName(
  entries: readonly Pick<DiaryEntry, 'name'>[],
  words: CombineWords,
): string {
  const names = entries.map((entry) => entry.name.trim()).filter((name) => name !== '');
  if (names.length === 0) return words.fallbackName;
  if (names.length <= LISTED_NAMES) return names.join(NAME_JOINER);
  return [...names.slice(0, 2), words.more(names.length - 2)].join(NAME_JOINER);
}

function distinct(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** An entry's photos in gallery order: its own, then its parts', without repeats. */
function photosOf(entry: DiaryEntry): string[] {
  return distinct([...entry.photoIds, ...entry.lines.flatMap((line) => line.photoIds)]);
}

/** Per key, the sum over `records` when every record holds a finite value; otherwise absent. */
function sumKnown<K extends string>(
  keys: readonly K[],
  records: readonly Partial<Record<K, number>>[],
): Partial<Record<K, number>> {
  const sums: Partial<Record<K, number>> = {};
  for (const key of keys) {
    let total = 0;
    const allKnow = records.every((record) => {
      const value = record[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      total += value;
      return true;
    });
    if (allKnow) sums[key] = total;
  }
  return sums;
}

function nonBlank(text: string | undefined): string | undefined {
  return text !== undefined && text.trim() !== '' ? text : undefined;
}

/**
 * Two or more entries as one new entry (without an id: the store assigns it), or null for fewer
 * than two. One part per original in the given order; the weight is the sum of the known weights
 * when above 0, else one serving; time, day and meal of the latest original (the first of equal
 * times); photos in order without repeats; the first non-blank emoji; source manual; no units,
 * note or product details; nutrients and extras summed where every original knows them.
 */
export function combineEntries(
  entries: readonly DiaryEntry[],
  words: CombineWords,
): CombinedEntry | null {
  const [first, ...rest] = entries;
  if (first === undefined || rest.length === 0) return null;
  const latest = rest.reduce(
    (pick, entry) => (entry.loggedAt > pick.loggedAt ? entry : pick),
    first,
  );
  const lines = entries.map((entry) => draftAsLine(entry, photosOf(entry)));
  const totals = lineTotals(lines);
  const basis: ServingBasis =
    Number.isFinite(totals.grams) && totals.grams > 0
      ? { kind: 'grams', grams: totals.grams }
      : { kind: 'servings', count: 1 };
  const combined: CombinedEntry = {
    name: combinedName(entries, words),
    kcal: totals.kcal,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    nutrients: sumKnown(
      NUTRIENT_KEYS,
      entries.map((entry) => entry.nutrients),
    ),
    extras: sumKnown(
      EXTRA_KEYS,
      entries.map((entry) => entry.extras),
    ),
    basis,
    units: [],
    lines,
    progressive: false,
    loggedAt: latest.loggedAt,
    dayKey: latest.dayKey,
    meal: latest.meal,
    source: 'manual',
    photoIds: distinct(entries.flatMap(photosOf)),
  };
  const emoji = entries.map((entry) => nonBlank(entry.emoji)).find((value) => value !== undefined);
  if (emoji !== undefined) combined.emoji = emoji;
  return combined;
}
