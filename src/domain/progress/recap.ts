// The weekly recap at the top of Progress (P07-15): the last week that has fully ended, by the
// app's week start, set against the week before it. For each week: the days with food, the days
// near the calorie goal, the days the protein goal was met, the average over the logged days, the
// weigh-ins with their change, and the longest run of logged days; then a few lines of good news.
// Pure: callers pass today's day key and food entries only, so water and fasts never count
// (R05.4); nothing here reads the clock.

import { addDays, daysBetween, type DayKey } from '../dates/dayKey';
import { inDays, type DayWindow } from '../dates/ranges';
import { weekStart, type WeekStart } from '../dates/week';
import type { DiaryEntry, WeighIn } from '../model';

/** Days in a recap week. */
export const WEEK_DAYS = 7;
/** A day is near the calorie goal within this many percent of it, either way. */
export const NEAR_GOAL_PERCENT = 10;
/** A run of logged days at least this long is worth a line when the week is not full. */
export const RUN_WORTH_NAMING = 3;
/** The average is only called near the goal over at least this many logged days. */
export const DAYS_FOR_AVERAGE = 3;
/** Never more lines of good news than this. */
export const MAX_HIGHLIGHTS = 3;

/** What a food entry brings to the recap. Water logs and fasts have no place here. */
export type RecapEntry = Pick<DiaryEntry, 'dayKey' | 'kcal' | 'protein'>;

/** What a weigh-in brings to the recap. */
export type RecapWeighIn = Pick<WeighIn, 'at' | 'kg'>;

/** The goals the days are measured against: kcal and grams, as stored. */
export interface RecapGoals {
  readonly kcal: number;
  readonly protein: number;
}

/** One week in numbers. */
export interface WeekTally {
  /** Days with at least one food entry. */
  readonly loggedDays: number;
  /** Logged days whose calories are within 10 % of a positive calorie goal. */
  readonly nearGoalDays: number;
  /** Logged days whose protein, to the whole gram, reaches a positive protein goal. */
  readonly proteinDays: number;
  /** Whole kcal over the logged days; null when no day was logged. */
  readonly averageKcal: number | null;
  readonly weighIns: number;
  /** The last weigh-in minus the first, in kg; null with fewer than two. */
  readonly weightChangeKg: number | null;
  /** The longest run of logged days in a row. */
  readonly longestRun: number;
}

/** A line of good news. Only improvements are named, never a step back. */
export type Highlight =
  | { readonly kind: 'everyDay' }
  | { readonly kind: 'run'; readonly days: number }
  | { readonly kind: 'moreNearGoal'; readonly more: number }
  | { readonly kind: 'moreProtein'; readonly more: number }
  | { readonly kind: 'averageNearGoal' }
  | { readonly kind: 'moreLogged'; readonly more: number };

/** The recap the card shows. */
export interface WeeklyRecap {
  /** The recapped week's first and last day. */
  readonly week: DayWindow;
  readonly tally: WeekTally;
  /** The week just before, for the changes. */
  readonly before: WeekTally;
  /** At most three, in a fixed order. */
  readonly highlights: readonly Highlight[];
}

function steps(offset: number): number {
  return Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
}

/**
 * The week recapped at `offset`: 0 is the last week that has ended (the one before the week that
 * holds today), 1 the week before that, and so on. The week holding today is never recapped, even
 * on its last day. Weeks start on the app's setting, never the locale's.
 */
export function recapWeek(todayKey: DayKey, start: WeekStart, offset: number): DayWindow {
  const first = addDays(weekStart(todayKey, start), -WEEK_DAYS * (steps(offset) + 1));
  return { first, last: addDays(first, WEEK_DAYS - 1) };
}

/** The recapped week and the one before it: every day the recap reads. */
export function recapSpan(todayKey: DayKey, start: WeekStart, offset: number): DayWindow {
  const { first, last } = recapWeek(todayKey, start, offset);
  return { first: addDays(first, -WEEK_DAYS), last };
}

/**
 * True when `kcal` is within 10 % of a positive goal, both ends included (1 800 and 2 200 for a
 * goal of 2 000). Always kcal: a kJ reader only sees the figures converted.
 */
export function nearCalorieGoal(kcal: number, goal: number): boolean {
  // Whole numbers on both sides keep the edge exact.
  return goal > 0 && Math.abs(kcal - goal) * 100 <= goal * NEAR_GOAL_PERCENT;
}

/** True when the week has anything to show: a logged day or a weigh-in. */
export function hasActivity(tally: WeekTally): boolean {
  return tally.loggedDays > 0 || tally.weighIns > 0;
}

/**
 * The tally of the seven days from `first`. Entries count on their day key (the day the diary
 * shows them on); weigh-ins on the local day of their instant, late on the last day included.
 */
export function tallyWeek(
  first: DayKey,
  entries: readonly RecapEntry[],
  weighIns: readonly RecapWeighIn[],
  goals: RecapGoals,
): WeekTally {
  const logged: boolean[] = Array.from({ length: WEEK_DAYS }, () => false);
  const kcal: number[] = Array.from({ length: WEEK_DAYS }, () => 0);
  const protein: number[] = Array.from({ length: WEEK_DAYS }, () => 0);
  for (const entry of entries) {
    const day = daysBetween(first, entry.dayKey);
    if (day < 0 || day >= WEEK_DAYS) continue;
    logged[day] = true;
    kcal[day] = (kcal[day] ?? 0) + entry.kcal;
    protein[day] = (protein[day] ?? 0) + entry.protein;
  }

  let loggedDays = 0;
  let nearGoalDays = 0;
  let proteinDays = 0;
  let total = 0;
  let run = 0;
  let longestRun = 0;
  for (let day = 0; day < WEEK_DAYS; day++) {
    if (!logged[day]) {
      run = 0;
      continue;
    }
    const dayKcal = kcal[day] ?? 0;
    loggedDays += 1;
    total += dayKcal;
    run += 1;
    longestRun = Math.max(longestRun, run);
    if (nearCalorieGoal(dayKcal, goals.kcal)) nearGoalDays += 1;
    // To the whole gram, as the day's protein is shown: 149.6 g reads 150 g and meets 150.
    if (goals.protein > 0 && Math.round(protein[day] ?? 0) >= goals.protein) proteinDays += 1;
  }

  const last = addDays(first, WEEK_DAYS - 1);
  const readings = weighIns
    .filter((reading) => inDays(reading.at, first, last))
    .sort((a, b) => a.at - b.at);
  const firstReading = readings[0];
  const lastReading = readings[readings.length - 1];
  const weightChangeKg =
    readings.length >= 2 && firstReading && lastReading ? lastReading.kg - firstReading.kg : null;

  return {
    loggedDays,
    nearGoalDays,
    proteinDays,
    averageKcal: loggedDays > 0 ? Math.round(total / loggedDays) : null,
    weighIns: readings.length,
    weightChangeKg,
    longestRun,
  };
}

/**
 * The good news of `week` against `before`, at most three lines in this order: every day logged
 * (or else a run of three days or more); more days near the calorie goal; more days with the
 * protein goal met; an average near the calorie goal over three logged days or more; more logged
 * days (only when the week was not full, which the first line already names).
 */
export function highlightsFor(
  week: WeekTally,
  before: WeekTally,
  kcalGoal: number,
): readonly Highlight[] {
  const lines: Highlight[] = [];
  if (week.loggedDays === WEEK_DAYS) lines.push({ kind: 'everyDay' });
  else if (week.longestRun >= RUN_WORTH_NAMING) lines.push({ kind: 'run', days: week.longestRun });
  if (week.nearGoalDays > before.nearGoalDays) {
    lines.push({ kind: 'moreNearGoal', more: week.nearGoalDays - before.nearGoalDays });
  }
  if (week.proteinDays > before.proteinDays) {
    lines.push({ kind: 'moreProtein', more: week.proteinDays - before.proteinDays });
  }
  if (
    week.loggedDays >= DAYS_FOR_AVERAGE &&
    week.averageKcal !== null &&
    nearCalorieGoal(week.averageKcal, kcalGoal)
  ) {
    lines.push({ kind: 'averageNearGoal' });
  }
  if (week.loggedDays < WEEK_DAYS && week.loggedDays > before.loggedDays) {
    lines.push({ kind: 'moreLogged', more: week.loggedDays - before.loggedDays });
  }
  return lines.slice(0, MAX_HIGHLIGHTS);
}

export interface RecapInput {
  readonly todayKey: DayKey;
  readonly weekStart: WeekStart;
  /** Weeks back from the last one that has ended; 0 or more. */
  readonly offset: number;
  /** Food entries; any outside the two weeks are left out. */
  readonly entries: readonly RecapEntry[];
  readonly weighIns: readonly RecapWeighIn[];
  readonly goals: RecapGoals;
}

/** The recap of the week at `offset` and the week before it, with its highlights. */
export function buildRecap(input: RecapInput): WeeklyRecap {
  const week = recapWeek(input.todayKey, input.weekStart, input.offset);
  const tally = tallyWeek(week.first, input.entries, input.weighIns, input.goals);
  const before = tallyWeek(
    addDays(week.first, -WEEK_DAYS),
    input.entries,
    input.weighIns,
    input.goals,
  );
  return { week, tally, before, highlights: highlightsFor(tally, before, input.goals.kcal) };
}
