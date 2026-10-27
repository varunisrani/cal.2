// What was eaten over a nutrition window (P07-16): the days that get a calorie bar, the "Avg" of
// those days, and the macro and nutrient averages per logged day. Only diary entries come in, so
// water and fasts can never add to any of it (R05.4). Pure: the caller passes the entries of the
// window, the window itself (P07-09 `nutritionWindow`, which already leaves today out when Count
// today is off) and the nutrient goals. `windowNutritionSteps` is the same work one day at a time,
// so a caller can spread it over several turns and drop it when a newer request comes in.

import type { DayKey } from '../dates/dayKey';
import type { DayWindow } from '../dates/ranges';
import { isMacroKey, isNutrientKey, MACRO_KEYS, type DiaryEntry, type MacroKey } from '../model';
import { GOAL_KEYS, type GoalKey } from '../nutrients/catalogue';
import type { GoalValues } from '../nutrients/goalDefaults';

/** Below this an average counts as nothing, so a nutrient without a goal is left off the list. */
export const LISTED_FROM = 0.05;

/** One day of the calorie history: a day whose food adds up to more than 0 kcal. */
export interface CalorieDay {
  readonly day: DayKey;
  /** The day's whole kcal. */
  readonly kcal: number;
}

/** A nutrient's average per logged day against its goal (0 = no goal), in its storage unit. */
export interface NutrientAverage {
  readonly key: GoalKey;
  readonly average: number;
  readonly goal: number;
}

/** What the nutrition cards show for one window. */
export interface WindowNutrition {
  /** The days with energy, oldest first. Days without food, or with only 0 kcal, are absent. */
  readonly calorieDays: readonly CalorieDay[];
  /** The whole-kcal mean of `calorieDays`, remainder dropped; null without any such day. */
  readonly averageKcal: number | null;
  /** Days with at least one entry, whatever its energy. */
  readonly loggedDays: number;
  /** Grams per logged day; 0 without a logged day. */
  readonly macros: Readonly<Record<MacroKey, number>>;
  /**
   * Every requested nutrient per logged day, in the order asked for, except one whose average is
   * under 0.05 while its goal is 0. Empty without a logged day.
   */
  readonly nutrients: readonly NutrientAverage[];
}

export interface WindowNutritionInput {
  /** Food entries; any outside the window are left out. */
  readonly entries: readonly DiaryEntry[];
  readonly window: DayWindow;
  /** The optional nutrient goals (setting `goals.nutrients`). */
  readonly goals: Readonly<GoalValues>;
  /** The nutrients to average, in the order to list them; every goal key by default. */
  readonly keys?: readonly GoalKey[];
}

function finite(amount: number | undefined): number {
  return amount !== undefined && Number.isFinite(amount) ? amount : 0;
}

/** How much of `key` an entry holds; a nutrient it does not state counts 0. */
function amountOf(entry: DiaryEntry, key: MacroKey | GoalKey): number {
  if (isMacroKey(key)) return finite(entry[key]);
  if (isNutrientKey(key)) return finite(entry.nutrients[key]);
  return finite(entry.extras[key]);
}

/** The window's entries by day, the days oldest first. */
function byDay(entries: readonly DiaryEntry[], window: DayWindow): Array<readonly DiaryEntry[]> {
  const days = new Map<DayKey, DiaryEntry[]>();
  for (const entry of entries) {
    if (entry.dayKey < window.first || entry.dayKey > window.last) continue;
    const list = days.get(entry.dayKey);
    if (list) list.push(entry);
    else days.set(entry.dayKey, [entry]);
  }
  return [...days.keys()].sort().map((day) => days.get(day) ?? []);
}

/**
 * The window's nutrition, one logged day per step: each `next()` adds one day, and the last one
 * returns the result. Stopping early (or never asking again) leaves nothing behind.
 */
export function* windowNutritionSteps({
  entries,
  window,
  goals,
  keys = GOAL_KEYS,
}: WindowNutritionInput): Generator<void, WindowNutrition, void> {
  const days = byDay(entries, window);
  yield;

  const calorieDays: CalorieDay[] = [];
  let calorieTotal = 0;
  const macroTotals: Record<MacroKey, number> = { protein: 0, carbs: 0, fat: 0 };
  const nutrientTotals = new Map<GoalKey, number>(keys.map((key) => [key, 0]));

  for (const day of days) {
    let kcal = 0;
    for (const entry of day) {
      kcal += finite(entry.kcal);
      for (const macro of MACRO_KEYS) macroTotals[macro] += amountOf(entry, macro);
      for (const key of keys) {
        nutrientTotals.set(key, (nutrientTotals.get(key) ?? 0) + amountOf(entry, key));
      }
    }
    const first = day[0];
    if (first && kcal > 0) {
      calorieDays.push({ day: first.dayKey, kcal });
      calorieTotal += kcal;
    }
    yield;
  }

  const loggedDays = days.length;
  const perDay = (total: number) => (loggedDays > 0 ? total / loggedDays : 0);
  const nutrients: NutrientAverage[] = [];
  if (loggedDays > 0) {
    for (const key of keys) {
      const average = perDay(nutrientTotals.get(key) ?? 0);
      const goal = goals[key];
      if (average < LISTED_FROM && goal === 0) continue;
      nutrients.push({ key, average, goal });
    }
  }

  return {
    calorieDays,
    averageKcal: calorieDays.length > 0 ? Math.floor(calorieTotal / calorieDays.length) : null,
    loggedDays,
    macros: {
      protein: perDay(macroTotals.protein),
      carbs: perDay(macroTotals.carbs),
      fat: perDay(macroTotals.fat),
    },
    nutrients,
  };
}

/** The window's nutrition, all at once. */
export function windowNutrition(input: WindowNutritionInput): WindowNutrition {
  const steps = windowNutritionSteps(input);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
