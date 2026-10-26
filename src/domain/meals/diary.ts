// Home's diary: the selected day's food entries, water logs and fasts in meal sections. Food keeps
// the meal it was logged under; water goes where its time of day falls, and a fast where it ended
// (or where it started, while it is still running). Section totals count food only: water and
// fasts never add energy or macros (R05.4).

import { dayKeyOf, type DayKey } from '../dates/dayKey';
import {
  MEAL_KINDS,
  type DiaryEntry,
  type Fast,
  type MealKind,
  type MealTimes,
  type WaterLog,
} from '../model';
import { mealAtInstant } from './times';

export const DIARY_SORT_MODES = ['byMeal', 'newestFirst'] as const;
/**
 * How sections are formed (setting `home.sort`): `byMeal` gives one section per meal in a fixed
 * order; `newestFirst` lists every row newest first and starts a new section whenever the meal
 * changes, so a meal can appear more than once.
 */
export type DiarySortMode = (typeof DIARY_SORT_MODES)[number];
export const DEFAULT_DIARY_SORT: DiarySortMode = 'byMeal';

export function isDiarySortMode(value: unknown): value is DiarySortMode {
  return value === 'byMeal' || value === 'newestFirst';
}

/** One row of the diary. */
export type DiaryRow =
  | { kind: 'food'; entry: DiaryEntry }
  | { kind: 'water'; log: WaterLog }
  | { kind: 'fast'; fast: Fast };

/** A section's food totals: whole kcal and whole grams. */
export interface SectionTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DiarySection {
  meal: MealKind;
  /** Newest first. */
  rows: DiaryRow[];
  /** Food totals; null when the section holds no food row. */
  totals: SectionTotals | null;
}

/** The instant a row is placed and ordered by: a running fast uses its start, a finished one its end. */
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

/** The section a row belongs to: its own meal for food, the meal of its time for the others. */
export function rowMeal(row: DiaryRow, times: MealTimes): MealKind {
  return row.kind === 'food' ? row.entry.meal : mealAtInstant(rowTime(row), times);
}

/** Totals of the food rows only (R05.4); null when there is none. */
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
 * Splits a day's rows into sections. Rows are ordered newest first; rows with the same time keep
 * the order they were given in.
 */
export function groupDiary(
  rows: readonly DiaryRow[],
  mode: DiarySortMode,
  times: MealTimes,
): DiarySection[] {
  const placed = rows
    .map((row) => ({ row, meal: rowMeal(row, times), at: rowTime(row) }))
    .sort((a, b) => b.at - a.at);

  if (mode === 'byMeal') {
    return MEAL_KINDS.map((meal) =>
      section(
        meal,
        placed.filter((item) => item.meal === meal).map((item) => item.row),
      ),
    ).filter((built) => built.rows.length > 0);
  }

  const sections: DiarySection[] = [];
  let run: DiaryRow[] = [];
  let runMeal: MealKind | null = null;
  for (const item of placed) {
    if (item.meal !== runMeal && runMeal !== null) {
      sections.push(section(runMeal, run));
      run = [];
    }
    runMeal = item.meal;
    run.push(item.row);
  }
  if (runMeal !== null) sections.push(section(runMeal, run));
  return sections;
}

/**
 * The fasts a day's diary lists: completed fasts that ended on `dayKey` (local zone), and the
 * running fast only when `dayKey` is today, whatever day it started on (R05.21).
 */
export function fastsOnDay(fasts: readonly Fast[], dayKey: DayKey, todayKey: DayKey): Fast[] {
  return fasts.filter((fast) =>
    fast.end === null ? dayKey === todayKey : dayKeyOf(fast.end) === dayKey,
  );
}
