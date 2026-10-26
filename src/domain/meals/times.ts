// Meal times: four start minutes after local midnight that split a day into meal windows. They
// pick the meal a new entry starts with and place water and fast rows in the diary. The late
// snack window wraps over midnight until breakfast starts.

import type { MealKind, MealTimes } from '../model';

export const MINUTES_PER_DAY = 1_440;

/** The four starts, earliest first. */
export const MEAL_TIME_FIELDS = ['breakfast', 'lunch', 'dinner', 'lateSnack'] as const;
export type MealTimeField = (typeof MEAL_TIME_FIELDS)[number];

/** 05:00, 12:00, 18:00 and 23:00. */
export const DEFAULT_MEAL_TIMES: Readonly<MealTimes> = Object.freeze({
  breakfast: 300,
  lunch: 720,
  dinner: 1_080,
  lateSnack: 1_380,
});

/** A meal a time of day can fall in (`other` is only ever picked by hand). */
export type TimedMeal = Exclude<MealKind, 'other'>;

/** True for whole minutes with 0 ≤ breakfast < lunch < dinner < late snack < 1 440. */
export function isValidMealTimes(value: unknown): value is MealTimes {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<Record<MealTimeField, unknown>>;
  let previous = -1;
  for (const field of MEAL_TIME_FIELDS) {
    const minute = record[field];
    if (typeof minute !== 'number' || !Number.isInteger(minute) || minute <= previous) return false;
    previous = minute;
  }
  return previous < MINUTES_PER_DAY;
}

/** The stored meal times when they are valid (as a fresh record), otherwise the defaults. */
export function readMealTimes(raw: unknown): MealTimes {
  if (!isValidMealTimes(raw)) return { ...DEFAULT_MEAL_TIMES };
  const { breakfast, lunch, dinner, lateSnack } = raw;
  return { breakfast, lunch, dinner, lateSnack };
}

/**
 * The meal whose window holds `minute` (minutes after local midnight): late snack from its start
 * through midnight until breakfast, then breakfast, lunch and dinner from their starts.
 */
export function mealAt(minute: number, times: MealTimes): TimedMeal {
  if (minute >= times.lateSnack || minute < times.breakfast) return 'snack';
  if (minute >= times.dinner) return 'dinner';
  if (minute >= times.lunch) return 'lunch';
  return 'breakfast';
}

/** Whole minutes after local midnight (runtime zone) of the instant `ms`. */
export function minuteOfDay(ms: number): number {
  const local = new Date(ms);
  return local.getHours() * 60 + local.getMinutes();
}

/** The meal for the local time of day of the instant `ms`. */
export function mealAtInstant(ms: number, times: MealTimes): TimedMeal {
  return mealAt(minuteOfDay(ms), times);
}

// ---- Editor ------------------------------------------------------------------------------------

/** The editor's wheel step, which is also the least gap kept between neighbouring starts. */
export const MEAL_TIME_STEP = 15;

/** The earliest and latest start the editor allows for `field`, 15 minutes from each neighbour. */
export function mealTimeBounds(
  times: MealTimes,
  field: MealTimeField,
): { min: number; max: number } {
  switch (field) {
    case 'breakfast':
      return { min: 0, max: times.lunch - MEAL_TIME_STEP };
    case 'lunch':
      return { min: times.breakfast + MEAL_TIME_STEP, max: times.dinner - MEAL_TIME_STEP };
    case 'dinner':
      return { min: times.lunch + MEAL_TIME_STEP, max: times.lateSnack - MEAL_TIME_STEP };
    case 'lateSnack':
      return { min: times.dinner + MEAL_TIME_STEP, max: MINUTES_PER_DAY - 1 };
  }
}

/**
 * The starts the editor offers for `field`, earliest first: every multiple of 15 minutes inside
 * its bounds, plus the current value when it is off that grid or outside the bounds.
 */
export function mealTimeOptions(times: MealTimes, field: MealTimeField): number[] {
  const { min, max } = mealTimeBounds(times, field);
  const options: number[] = [];
  const first = Math.ceil(min / MEAL_TIME_STEP) * MEAL_TIME_STEP;
  for (let minute = first; minute <= max; minute += MEAL_TIME_STEP) options.push(minute);
  const current = times[field];
  if (!options.includes(current)) {
    options.push(current);
    options.sort((a, b) => a - b);
  }
  return options;
}
