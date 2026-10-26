import { describe, expect, it } from 'vitest';
import { inTimeZone } from '../../test/time';
import type { MealTimes } from '../model';
import {
  DEFAULT_MEAL_TIMES,
  isValidMealTimes,
  mealAt,
  mealAtInstant,
  mealTimeBounds,
  mealTimeChoices,
  MINUTES_PER_DAY,
  minuteOfDay,
  readMealTimes,
} from './times';

const at = (hours: number, minutes: number): number => hours * 60 + minutes;

describe('meal times', () => {
  it('defaults to 05:00, 12:00, 18:00 and 23:00', () => {
    expect(DEFAULT_MEAL_TIMES).toEqual({
      breakfast: 300,
      lunch: 720,
      dinner: 1_080,
      lateSnack: 1_380,
    });
    expect(MINUTES_PER_DAY).toBe(1_440);
    expect(isValidMealTimes(DEFAULT_MEAL_TIMES)).toBe(true);
  });

  it('accepts only whole minutes with breakfast < lunch < dinner < late snack inside one day', () => {
    expect(isValidMealTimes({ breakfast: 0, lunch: 1, dinner: 2, lateSnack: 1_439 })).toBe(true);
    const bad: unknown[] = [
      { breakfast: 720, lunch: 300, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: 300, lunch: 1_140, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: 300, lunch: 300, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: -1, lunch: 720, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: 300, lunch: 720, dinner: 1_080, lateSnack: 1_440 },
      { breakfast: 300.5, lunch: 720, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: '300', lunch: 720, dinner: 1_080, lateSnack: 1_380 },
      { breakfast: 300, lunch: 720, dinner: 1_080 },
      { breakfast: 300, lunch: 720, dinner: Number.NaN, lateSnack: 1_380 },
      [300, 720, 1_080, 1_380],
      null,
      undefined,
      '300,720,1080,1380',
    ];
    for (const value of bad) expect(isValidMealTimes(value)).toBe(false);
  });

  it('reads an invalid stored value as the defaults', () => {
    expect(readMealTimes({ breakfast: 720, lunch: 300, dinner: 1_080, lateSnack: 1_380 })).toEqual(
      DEFAULT_MEAL_TIMES,
    );
    expect(readMealTimes([720, 300, 1_080, 1_380])).toEqual(DEFAULT_MEAL_TIMES);
    expect(readMealTimes(null)).toEqual(DEFAULT_MEAL_TIMES);
  });

  it('reads a valid stored value as a fresh record without extra keys', () => {
    const stored = { breakfast: 420, lunch: 780, dinner: 1_200, lateSnack: 1_410, extra: 1 };
    const times = readMealTimes(stored);
    expect(times).toEqual({ breakfast: 420, lunch: 780, dinner: 1_200, lateSnack: 1_410 });
    expect(times).not.toBe(stored);
    expect(readMealTimes(undefined)).not.toBe(DEFAULT_MEAL_TIMES);
  });
});

describe('mealAt', () => {
  it('classifies the default boundaries to the minute', () => {
    const cases: [number, string][] = [
      [at(0, 0), 'snack'],
      [at(4, 59), 'snack'],
      [at(5, 0), 'breakfast'],
      [at(11, 59), 'breakfast'],
      [at(12, 0), 'lunch'],
      [at(17, 59), 'lunch'],
      [at(18, 0), 'dinner'],
      [at(22, 59), 'dinner'],
      [at(23, 0), 'snack'],
      [at(23, 59), 'snack'],
    ];
    for (const [minute, meal] of cases)
      expect([minute, mealAt(minute, DEFAULT_MEAL_TIMES)]).toEqual([minute, meal]);
  });

  it('follows custom boundaries', () => {
    const times: MealTimes = {
      breakfast: at(7, 0),
      lunch: at(13, 0),
      dinner: at(20, 0),
      lateSnack: at(23, 30),
    };
    expect(mealAt(at(6, 59), times)).toBe('snack');
    expect(mealAt(at(7, 0), times)).toBe('breakfast');
    expect(mealAt(at(12, 59), times)).toBe('breakfast');
    expect(mealAt(at(17, 0), times)).toBe('lunch');
    expect(mealAt(at(20, 0), times)).toBe('dinner');
    expect(mealAt(at(23, 29), times)).toBe('dinner');
    expect(mealAt(at(23, 30), times)).toBe('snack');
  });

  it('reads an instant on the local wall clock', () => {
    const local = new Date(2026, 9, 20, 18, 0).getTime();
    expect(minuteOfDay(local)).toBe(at(18, 0));
    expect(mealAtInstant(local, DEFAULT_MEAL_TIMES)).toBe('dinner');
    expect(mealAtInstant(local - 60_000, DEFAULT_MEAL_TIMES)).toBe('lunch');
  });

  it('uses the zone the device is in', () => {
    // 03:00 UTC is 23:00 the evening before in New York (EDT) and 12:00 in Tokyo.
    const instant = Date.UTC(2026, 9, 20, 3, 0);
    expect(mealAtInstant(instant, DEFAULT_MEAL_TIMES)).toBe('snack');
    expect(inTimeZone('Asia/Tokyo', () => mealAtInstant(instant, DEFAULT_MEAL_TIMES))).toBe(
      'lunch',
    );
  });

  it('keeps the wall clock on a daylight-saving day', () => {
    // New York moved its clocks from 02:00 to 03:00 on 2026-03-08.
    const morning = new Date(2026, 2, 8, 5, 0).getTime();
    expect(minuteOfDay(morning)).toBe(at(5, 0));
    expect(mealAtInstant(morning, DEFAULT_MEAL_TIMES)).toBe('breakfast');
  });
});

describe('meal time editor', () => {
  it('keeps each start 15 minutes from its neighbours', () => {
    const times = DEFAULT_MEAL_TIMES;
    expect(mealTimeBounds(times, 'breakfast')).toEqual({ min: 0, max: times.lunch - 15 });
    expect(mealTimeBounds(times, 'lunch')).toEqual({
      min: times.breakfast + 15,
      max: times.dinner - 15,
    });
    expect(mealTimeBounds(times, 'dinner')).toEqual({
      min: times.lunch + 15,
      max: times.lateSnack - 15,
    });
    expect(mealTimeBounds(times, 'lateSnack')).toEqual({ min: times.dinner + 15, max: 1_439 });
  });

  it('offers every quarter hour inside the bounds', () => {
    const lunch = mealTimeChoices(DEFAULT_MEAL_TIMES, 'lunch');
    expect(lunch[0]).toBe(315);
    expect(lunch.at(-1)).toBe(1_065);
    expect(lunch).toHaveLength((1_065 - 315) / 15 + 1);
    expect(
      lunch.every((minute, i) => minute % 15 === 0 && (i === 0 || minute > lunch[i - 1]!)),
    ).toBe(true);
    expect(mealTimeChoices(DEFAULT_MEAL_TIMES, 'breakfast')[0]).toBe(0);
    expect(mealTimeChoices(DEFAULT_MEAL_TIMES, 'lateSnack').at(-1)).toBe(1_425);
  });

  it('always offers the current value, in order, even off the quarter hours', () => {
    const times: MealTimes = { breakfast: 307, lunch: 722, dinner: 1_080, lateSnack: 1_439 };
    const lunch = mealTimeChoices(times, 'lunch');
    expect(lunch[0]).toBe(330);
    expect(lunch).toContain(722);
    expect(lunch.indexOf(722)).toBe(lunch.indexOf(720) + 1);
    expect(mealTimeChoices(times, 'lateSnack')).toEqual([
      1_095, 1_110, 1_125, 1_140, 1_155, 1_170, 1_185, 1_200, 1_215, 1_230, 1_245, 1_260, 1_275,
      1_290, 1_305, 1_320, 1_335, 1_350, 1_365, 1_380, 1_395, 1_410, 1_425, 1_439,
    ]);
  });

  it('offers just the current value when the neighbours leave no room', () => {
    const times: MealTimes = { breakfast: 700, lunch: 710, dinner: 720, lateSnack: 1_380 };
    expect(mealTimeChoices(times, 'lunch')).toEqual([710]);
  });
});
