// The Home diary for one day: food, water and fast rows grouped into meal sections, with each
// section's food totals. Food keeps the meal it was logged with; water and fasts go to the meal
// window of their local time of day. Water and fasts never count in any total (R05.4).

import { dayKeyOf, type DayKey } from '../dates/dayKey';
import type { DiaryEntry, Fast, MealKind, MealTimes, WaterLog } from '../model';
import { mealAtInstant } from './times';

export type DiaryRow =
  | { kind: 'food'; entry: DiaryEntry }
  | { kind: 'water'; log: WaterLog }
  | { kind: 'fast'; fast: Fast };

/** The values of the `home.sort` setting. */
export const DIARY_SORTS = ['byMeal', 'newestFirst'] as const;
/**
 * `byMeal`: one section per meal in a fixed order, newest row first inside. `newestFirst`: every
 * row newest first, cut into runs of one meal, so a meal can head more than one section.
 */
export type DiarySort = (typeof DIARY_SORTS)[number];

export function isDiarySort(value: unknown): value is DiarySort {
  return value === 'byMeal' || value === 'newestFirst';
}

/** A section's food totals: kcal, and protein, carbs and fat in whole grams. */
export interface SectionTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DiarySection {
  meal: MealKind;
  rows: DiaryRow[];
  /** Null when the section has no food row (only water or fasts). */
  totals: SectionTotals | null;
}

const SECTION_ORDER: readonly MealKind[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other'];

/** The instant a row is placed and ordered by: logged time, or a fast's end (start while active). */
export function rowTime(row: DiaryRow): number {
  switch (row.kind) {
    case 'food':
      return row.entry.loggedAt;
    case 'water':
      return row.log.at;
    case 'fast':
      return row.fast.end ?? row.fast.start;
  }
}

/** The section a row belongs to: a food row's own meal, else the meal window of its time. */
export function rowMeal(row: DiaryRow, times: MealTimes): MealKind {
  return row.kind === 'food' ? row.entry.meal : mealAtInstant(rowTime(row), times);
}

/** Totals of the food rows only, or null when there are none. */
export function sectionTotals(rows: readonly DiaryRow[]): SectionTotals | null {
  let found = false;
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const row of rows) {
    if (row.kind !== 'food') continue;
    found = true;
    kcal += row.entry.kcal;
    protein += row.entry.protein;
    carbs += row.entry.carbs;
    fat += row.entry.fat;
  }
  if (!found) return null;
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
  };
}

function section(meal: MealKind, rows: DiaryRow[]): DiarySection {
  return { meal, rows, totals: sectionTotals(rows) };
}

/**
 * Groups a day's rows into sections. Rows are ordered newest first (rows logged at the same
 * instant keep their input order); empty sections never appear.
 */
export function groupDiary(
  rows: readonly DiaryRow[],
  sort: DiarySort,
  times: MealTimes,
): DiarySection[] {
  const placed = rows
    .map((row) => ({ row, meal: rowMeal(row, times), at: rowTime(row) }))
    .sort((a, b) => b.at - a.at);

  if (sort === 'byMeal') {
    return SECTION_ORDER.map((meal) =>
      section(
        meal,
        placed.filter((each) => each.meal === meal).map((each) => each.row),
      ),
    ).filter((each) => each.rows.length > 0);
  }

  const runs: { meal: MealKind; rows: DiaryRow[] }[] = [];
  for (const { row, meal } of placed) {
    const last = runs.at(-1);
    if (last?.meal === meal) last.rows.push(row);
    else runs.push({ meal, rows: [row] });
  }
  return runs.map((run) => section(run.meal, run.rows));
}

/**
 * The fasts the diary shows for `dayKey`: completed fasts that ended on that local day, plus the
 * running fast when `dayKey` is today (never on the day it started, if that was earlier; R05.21).
 */
export function fastsOnDay(fasts: readonly Fast[], dayKey: DayKey, todayKey: DayKey): Fast[] {
  return fasts.filter((fast) =>
    fast.end === null ? dayKey === todayKey : dayKeyOf(fast.end) === dayKey,
  );
}
