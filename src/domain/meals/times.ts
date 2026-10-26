// Meal times (setting `meals.times`): four start minutes after local midnight split the day into
// breakfast, lunch, dinner and a late snack that runs past midnight until breakfast starts. They
// suggest the meal for a new entry and place water and fasts in the diary. A stored set that is
// not strictly increasing inside one day reads as the defaults.

import type { MealKind, MealTimes } from '../model';

export const MINUTES_PER_DAY = 1_440;
/** The editor's step, and the least gap it keeps between two neighbouring starts. */
export const MEAL_TIME_STEP = 15;

/** The four starts in the order they fall in a day. */
export const MEAL_TIME_SLOTS = ['breakfast', 'lunch', 'dinner', 'lateSnack'] as const;
export type MealTimeSlot = (typeof MEAL_TIME_SLOTS)[number];

/** 05:00, 12:00, 18:00 and 23:00. */
export const DEFAULT_MEAL_TIMES: Readonly<MealTimes> = Object.freeze({
  breakfast: 300,
  lunch: 720,
  dinner: 1_080,
  lateSnack: 1_380,
});

/** The meals a time of day can suggest; `other` is never picked from the clock. */
export type TimedMeal = Exclude<MealKind, 'other'>;

/** True for whole minutes with 0 ≤ breakfast < lunch < dinner < late snack < 1 440. */
export function isValidMealTimes(value: unknown): value is MealTimes {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  let previous = -1;
  for (const slot of MEAL_TIME_SLOTS) {
    const minute = record[slot];
    if (typeof minute !== 'number' || !Number.isInteger(minute) || minute <= previous) return false;
    previous = minute;
  }
  return previous < MINUTES_PER_DAY;
}

/** The stored meal times when valid, else the defaults. Always a fresh record. */
export function readMealTimes(stored: unknown): MealTimes {
  const source = isValidMealTimes(stored) ? stored : DEFAULT_MEAL_TIMES;
  return {
    breakfast: source.breakfast,
    lunch: source.lunch,
    dinner: source.dinner,
    lateSnack: source.lateSnack,
  };
}

/**
 * The meal whose window holds `minute` (minutes after local midnight). From the late-snack start
 * until breakfast the answer is snack, which covers the hours after midnight.
 */
export function mealAt(minute: number, times: MealTimes): TimedMeal {
  if (minute >= times.lateSnack || minute < times.breakfast) return 'snack';
  if (minute >= times.dinner) return 'dinner';
  if (minute >= times.lunch) return 'lunch';
  return 'breakfast';
}

/** Minutes after local midnight (runtime zone) on the wall clock at instant `ms`. */
export function minuteOfDay(ms: number): number {
  const local = new Date(ms);
  return local.getHours() * 60 + local.getMinutes();
}

/** The meal for an instant, read on the local wall clock. */
export function mealAtInstant(ms: number, times: MealTimes): TimedMeal {
  return mealAt(minuteOfDay(ms), times);
}

// ---- Editor -------------------------------------------------------------------------------

export interface MinuteBounds {
  min: number;
  max: number;
}

/** The range a start may move in: at least 15 minutes from each neighbour, inside the day. */
export function mealTimeBounds(times: MealTimes, slot: MealTimeSlot): MinuteBounds {
  const gap = MEAL_TIME_STEP;
  switch (slot) {
    case 'breakfast':
      return { min: 0, max: times.lunch - gap };
    case 'lunch':
      return { min: times.breakfast + gap, max: times.dinner - gap };
    case 'dinner':
      return { min: times.lunch + gap, max: times.lateSnack - gap };
    case 'lateSnack':
      return { min: times.dinner + gap, max: MINUTES_PER_DAY - 1 };
  }
}

/**
 * The editor wheel for one start: every quarter hour inside its bounds, plus the current value
 * (offered even when it is off the quarter hours or closer than 15 minutes to a neighbour).
 * Ascending, without repeats.
 */
export function mealTimeChoices(times: MealTimes, slot: MealTimeSlot): number[] {
  const { min, max } = mealTimeBounds(times, slot);
  const current = times[slot];
  const choices: number[] = [];
  const first = Math.ceil(min / MEAL_TIME_STEP) * MEAL_TIME_STEP;
  for (let minute = first; minute <= max; minute += MEAL_TIME_STEP) choices.push(minute);
  if (!choices.includes(current)) {
    choices.push(current);
    choices.sort((a, b) => a - b);
  }
  return choices;
}
