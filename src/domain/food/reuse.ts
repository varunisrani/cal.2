// The reuse lists of the add menu (02 §3.16, D-16.17, R02.7): Recent is every entry of the last 30
// days, newest first, one row per entry; Often eaten puts the entries of the last 90 days together
// by food (the name trimmed, lower-cased and without accents, plus the kcal) and shows each group's
// latest entry, most eaten first. Saved meals are their own records with their own ids, so they
// are never grouped here. Search matches any part of a name, ignoring case and accents. A food
// picked from any list goes back to the review as a draft, never straight into the diary.

import type { DiaryEntry, NutritionDraft } from '../model';

export const RECENT_DAYS = 30;
export const OFTEN_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The first instant of a window of `days` × 24 h ending at `now` (no calendar days involved). */
export function windowStart(now: number, days: number): number {
  return now - days * DAY_MS;
}

// Combining marks left behind once accented letters are taken apart (é → e + ´).
const MARKS = /\p{M}/gu;

/** A name as lists compare it: trimmed, accents taken off, lower-case. */
export function foldName(name: string): string {
  return name.trim().normalize('NFD').replace(MARKS, '').toLowerCase();
}

/** True when the trimmed query is part of the name, ignoring case and accents; a blank one always is. */
export function matchesQuery(name: string, query: string): boolean {
  const wanted = foldName(query);
  return wanted === '' || foldName(name).includes(wanted);
}

/** The items whose name matches the query, in their order. */
export function searchFoods<T>(
  items: readonly T[],
  query: string,
  nameOf: (item: T) => string,
): T[] {
  return items.filter((item) => matchesQuery(nameOf(item), query));
}

/** Entries at or after `start`, newest first; equal times keep the order they came in. */
function newestSince(entries: readonly DiaryEntry[], start: number): DiaryEntry[] {
  return entries.filter((entry) => entry.loggedAt >= start).sort((a, b) => b.loggedAt - a.loggedAt);
}

/** Recent: every entry of the last 30 × 24 h, newest first, the same food as often as it was logged. */
export function recentEntries(entries: readonly DiaryEntry[], now: number): DiaryEntry[] {
  return newestSince(entries, windowStart(now, RECENT_DAYS));
}

/** One food of Often eaten. */
export interface OftenGroup {
  /** The folded name and the kcal: what makes two entries the same food. */
  readonly key: string;
  /** The group's latest entry: what the row shows and a pick reuses. */
  readonly template: DiaryEntry;
  /** Entries in the group. */
  readonly count: number;
}

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Often eaten: the entries of the last 90 × 24 h by food, the latest entry of each as its
 * template, sorted by count (most first), then by folded name, then kcal.
 */
export function oftenEaten(entries: readonly DiaryEntry[], now: number): OftenGroup[] {
  const groups = new Map<string, { template: DiaryEntry; count: number; name: string }>();
  // Newest first, so the first entry met in each group is its template.
  for (const entry of newestSince(entries, windowStart(now, OFTEN_DAYS))) {
    const name = foldName(entry.name);
    const key = `${name}|${entry.kcal}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { template: entry, count: 1, name });
  }
  return [...groups.entries()]
    .sort(
      ([, a], [, b]) =>
        b.count - a.count || byText(a.name, b.name) || a.template.kcal - b.template.kcal,
    )
    .map(([key, { template, count }]) => ({ key, template, count }));
}

/**
 * The food values of an entry or a saved meal, as a draft for the review: its basis (a known
 * weight opens in grams with its units, an unknown one as servings, R02.1), its units and chosen
 * amount, values, lines, note and product details. Its id, time, day, meal, source and photos are
 * left behind; the caller hands the photos and the source over beside the draft.
 */
export function reuseDraft(food: NutritionDraft): NutritionDraft {
  const draft: NutritionDraft = {
    name: food.name,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    nutrients: { ...food.nutrients },
    extras: { ...food.extras },
    basis: { ...food.basis },
    units: food.units.map((choice) => ({ ...choice })),
    lines: food.lines.map((line) => ({ ...line, photoIds: [...line.photoIds] })),
    progressive: food.progressive,
  };
  if (food.chosenUnit !== undefined) draft.chosenUnit = food.chosenUnit;
  if (food.chosenCount !== undefined) draft.chosenCount = food.chosenCount;
  if (food.emoji !== undefined) draft.emoji = food.emoji;
  if (food.note !== undefined) draft.note = food.note;
  if (food.product !== undefined) draft.product = food.product;
  return draft;
}
