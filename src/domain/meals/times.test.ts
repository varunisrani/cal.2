import { describe, expect, it } from 'vitest';
import { inTimeZone } from '../../test/time';
import type { MealTimes } from '../model';
import {
  DEFAULT_MEAL_TIMES,
  isValidMealTimes,
  mealAt,
  mealAtInstant,
  mealTimeBounds,
  mealTimeOptions,
  minuteOfDay,
  readMealTimes,
} from './times';

const ZONES = ['America/New_York', 'Asia/Tokyo'];
const hm = (hours: number, minutes: number) => hours * 60 + minutes;

describe('mealAt', () => {
  it('splits the default day at 05:00, 12:00, 18:00 and 23:00', () => {
    const cases: [number, number, string][] = [
      [0, 0, 'snack'],
      [4, 59, 'snack'],
      [5, 0, 'breakfast'],
      [11, 59, 'breakfast'],
      [12, 0, 'lunch'],
      [17, 59, 'lunch'],
      [18, 0, 'dinner'],
      [22, 59, 'dinner'],
      [23, 0, 'snack'],
      [23, 59, 'snack'],
    ];
    for (const [hours, minutes, meal] of cases) {
      expect(mealAt(hm(hours, minutes), DEFAULT_MEAL_TIMES)).toBe(meal);
    }
  });

  it('moves the edges with custom times', () => {
    const times: MealTimes = {
      breakfast: hm(6, 30),
      lunch: hm(11, 0),
      dinner: hm(19, 15),
      lateSnack: hm(22, 0),
    };
    expect(mealAt(hm(6, 29), times)).toBe('snack');
    expect(mealAt(hm(6, 30), times)).toBe('breakfast');
    expect(mealAt(hm(11, 0), times)).toBe('lunch');
    expect(mealAt(hm(19, 14), times)).toBe('lunch');
    expect(mealAt(hm(19, 15), times)).toBe('dinner');
    expect(mealAt(hm(22, 0), times)).toBe('snack');
  });

  it('places a breakfast at midnight in breakfast, not snack', () => {
    const times: MealTimes = {
      breakfast: 0,
      lunch: hm(12, 0),
      dinner: hm(18, 0),
      lateSnack: hm(23, 0),
    };
    expect(mealAt(0, times)).toBe('breakfast');
    expect(mealAt(hm(23, 30), times)).toBe('snack');
  });
});

describe('mealAtInstant', () => {
  it('uses the local time of day in New York and in Tokyo', () => {
    for (const tz of ZONES) {
      inTimeZone(tz, () => {
        const at = (hours: number, minutes: number) =>
          new Date(2026, 9, 26, hours, minutes, 30).getTime();
        expect(minuteOfDay(at(12, 30))).toBe(hm(12, 30));
        expect(mealAtInstant(at(4, 59), DEFAULT_MEAL_TIMES)).toBe('snack');
        expect(mealAtInstant(at(5, 0), DEFAULT_MEAL_TIMES)).toBe('breakfast');
        expect(mealAtInstant(at(12, 0), DEFAULT_MEAL_TIMES)).toBe('lunch');
        expect(mealAtInstant(at(18, 0), DEFAULT_MEAL_TIMES)).toBe('dinner');
        expect(mealAtInstant(at(23, 0), DEFAULT_MEAL_TIMES)).toBe('snack');
      });
    }
  });

  it('reads the wall clock on a 23-hour DST day', () => {
    // 2026-03-08 in New York: 02:00 jumps to 03:00.
    const afterJump = new Date(2026, 2, 8, 12, 0).getTime();
    expect(minuteOfDay(afterJump)).toBe(hm(12, 0));
    expect(mealAtInstant(afterJump, DEFAULT_MEAL_TIMES)).toBe('lunch');
  });
});

describe('meal times validity', () => {
  it('accepts strictly increasing whole minutes inside one day', () => {
    expect(isValidMealTimes(DEFAULT_MEAL_TIMES)).toBe(true);
    expect(isValidMealTimes({ breakfast: 0, lunch: 1, dinner: 2, lateSnack: 1_439 })).toBe(true);
  });

  it('reads [720, 300, 1080, 1380] as the defaults', () => {
    const stored = { breakfast: 720, lunch: 300, dinner: 1_080, lateSnack: 1_380 };
    expect(isValidMealTimes(stored)).toBe(false);
    expect(readMealTimes(stored)).toEqual(DEFAULT_MEAL_TIMES);
  });

  it('reads anything out of order, out of the day or malformed as the defaults', () => {
    const bad: unknown[] = [
      { breakfast: 300, lunch: 300, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: 300, lunch: 1_140, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: 300, lunch: 720, dinner: 1_080, lateSnack: 1_440 },
      { breakfast: -1, lunch: 720, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: 300.5, lunch: 720, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: '300', lunch: 720, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: 300, lunch: 720, dinner: 1_080 },
      { breakfast: 300, lunch: 720, dinner: 1_080, lateSnack: Number.NaN },
      [300, 720, 1_080, 1_380],
      null,
      undefined,
      'breakfast',
    ];
    for (const raw of bad) {
      expect(isValidMealTimes(raw)).toBe(false);
      expect(readMealTimes(raw)).toEqual(DEFAULT_MEAL_TIMES);
    }
  });

  it('keeps valid stored times as a fresh record without extra fields', () => {
    const stored = { breakfast: 420, lunch: 780, dinner: 1_200, lateSnack: 1_410, extra: 1 };
    const times = readMealTimes(stored);
    expect(times).toEqual({ breakfast: 420, lunch: 780, dinner: 1_200, lateSnack: 1_410 });
    expect(times).not.toBe(stored);
    expect(readMealTimes(undefined)).not.toBe(DEFAULT_MEAL_TIMES);
  });
});

describe('meal times editor', () => {
  it('keeps each start 15 minutes from its neighbours', () => {
    expect(mealTimeBounds(DEFAULT_MEAL_TIMES, 'breakfast')).toEqual({ min: 0, max: hm(11, 45) });
    expect(mealTimeBounds(DEFAULT_MEAL_TIMES, 'lunch')).toEqual({
      min: hm(5, 15),
      max: hm(17, 45),
    });
    expect(mealTimeBounds(DEFAULT_MEAL_TIMES, 'dinner')).toEqual({
      min: hm(12, 15),
      max: hm(22, 45),
    });
    expect(mealTimeBounds(DEFAULT_MEAL_TIMES, 'lateSnack')).toEqual({
      min: hm(18, 15),
      max: 1_439,
    });
  });

  it('offers lunch from breakfast + 15 to dinner − 15 in 15-minute steps', () => {
    const options = mealTimeOptions(DEFAULT_MEAL_TIMES, 'lunch');
    expect(options[0]).toBe(hm(5, 15));
    expect(options.at(-1)).toBe(hm(17, 45));
    expect(options).toHaveLength((hm(17, 45) - hm(5, 15)) / 15 + 1);
    expect(options.every((minute) => minute % 15 === 0)).toBe(true);
    expect(options).toContain(DEFAULT_MEAL_TIMES.lunch);
  });

  it('ends the late-snack wheel at 23:45 and starts breakfast at midnight', () => {
    expect(mealTimeOptions(DEFAULT_MEAL_TIMES, 'lateSnack').at(-1)).toBe(hm(23, 45));
    expect(mealTimeOptions(DEFAULT_MEAL_TIMES, 'breakfast')[0]).toBe(0);
  });

  it('always offers the current value, in order, even off the 15-minute grid', () => {
    const times: MealTimes = {
      breakfast: hm(5, 7),
      lunch: hm(12, 7),
      dinner: hm(18, 0),
      lateSnack: hm(23, 0),
    };
    const lunch = mealTimeOptions(times, 'lunch');
    expect(lunch).toContain(hm(12, 7));
    expect(lunch.indexOf(hm(12, 7))).toBe(lunch.indexOf(hm(12, 0)) + 1);
    expect(lunch[0]).toBe(hm(5, 30)); // breakfast + 15 = 05:22, rounded up onto the grid
    expect([...lunch].sort((a, b) => a - b)).toEqual(lunch);
    // Breakfast may go up to lunch − 15 = 11:52, so the last grid step is 11:45.
    const breakfast = mealTimeOptions(times, 'breakfast');
    expect(breakfast.at(-1)).toBe(hm(11, 45));
    expect(breakfast).toContain(hm(5, 7));
  });

  it('offers only the current value when the neighbours are too close', () => {
    const times: MealTimes = {
      breakfast: hm(12, 0),
      lunch: hm(12, 10),
      dinner: hm(12, 20),
      lateSnack: hm(23, 0),
    };
    expect(mealTimeOptions(times, 'lunch')).toEqual([hm(12, 10)]);
  });
});
