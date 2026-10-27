import { describe, expect, it } from 'vitest';
import { makeEntry } from '../../test/factories';
import { addDays, startOfDay, type DayKey } from '../dates/dayKey';
import type { DiaryEntry } from '../model';
import { GOAL_KEYS } from '../nutrients/catalogue';
import { DEFAULT_GOAL_VALUES, type GoalValues } from '../nutrients/goalDefaults';
import { windowNutrition, windowNutritionSteps, type WindowNutritionInput } from './averages';
import { nutritionWindow } from './ranges';

const HOUR = 3_600_000;
const TODAY = '2026-10-26';
const WEEK = { first: '2026-10-20', last: TODAY };

/** No goal for anything: only nutrients actually eaten are listed. */
const NO_GOALS = Object.fromEntries(GOAL_KEYS.map((key) => [key, 0])) as GoalValues;

/** A plain food entry on `day` at `hour` o'clock: no optional nutrients unless given. */
function food(day: DayKey, values: Partial<DiaryEntry> = {}, hour = 12): DiaryEntry {
  const loggedAt = startOfDay(day) + hour * HOUR;
  return makeEntry({
    loggedAt,
    dayKey: day,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    nutrients: {},
    extras: {},
    ...values,
  });
}

const input = (
  entries: DiaryEntry[],
  extra: Partial<WindowNutritionInput> = {},
): WindowNutritionInput => ({ entries, window: WEEK, goals: NO_GOALS, ...extra });

describe('windowNutrition', () => {
  describe('calorie history (R05.17)', () => {
    it('gives 1 800 and 2 200 with an empty day between two bars and Avg 2 000', () => {
      const stats = windowNutrition(
        input([food('2026-10-22', { kcal: 1_800 }), food('2026-10-24', { kcal: 2_200 })]),
      );
      expect(stats.calorieDays).toEqual([
        { day: '2026-10-22', kcal: 1_800 },
        { day: '2026-10-24', kcal: 2_200 },
      ]);
      expect(stats.averageKcal).toBe(2_000);
    });

    it('adds a day up from all its entries and lists the days oldest first', () => {
      const stats = windowNutrition(
        input([
          food('2026-10-25', { kcal: 600 }, 19),
          food('2026-10-21', { kcal: 500 }),
          food('2026-10-25', { kcal: 900 }, 8),
        ]),
      );
      expect(stats.calorieDays).toEqual([
        { day: '2026-10-21', kcal: 500 },
        { day: '2026-10-25', kcal: 1_500 },
      ]);
      expect(stats.averageKcal).toBe(1_000);
    });

    it('drops the remainder of the mean instead of rounding it up', () => {
      const stats = windowNutrition(
        input([food('2026-10-22', { kcal: 1_800 }), food('2026-10-23', { kcal: 2_201 })]),
      );
      expect(stats.averageKcal).toBe(2_000);
    });

    it('gives a day of 0 kcal food no bar and leaves it out of Avg, but counts it as logged', () => {
      const stats = windowNutrition(
        input([
          food('2026-10-22', { kcal: 2_000, protein: 120 }),
          food('2026-10-23', { kcal: 0, protein: 0 }),
        ]),
      );
      expect(stats.calorieDays.map((day) => day.day)).toEqual(['2026-10-22']);
      expect(stats.averageKcal).toBe(2_000);
      expect(stats.loggedDays).toBe(2);
      expect(stats.macros.protein).toBe(60);
    });

    it('has no history, no Avg and zero averages without food', () => {
      const stats = windowNutrition(input([], { goals: DEFAULT_GOAL_VALUES }));
      expect(stats).toEqual({
        calorieDays: [],
        averageKcal: null,
        loggedDays: 0,
        macros: { protein: 0, carbs: 0, fat: 0 },
        nutrients: [],
      });
    });

    it('leaves out entries on days outside the window', () => {
      const stats = windowNutrition(
        input([
          food('2026-10-19', { kcal: 3_000, protein: 200 }),
          food('2026-10-20', { kcal: 1_000, protein: 50 }),
          food('2026-10-27', { kcal: 3_000, protein: 200 }),
        ]),
      );
      expect(stats.calorieDays).toEqual([{ day: '2026-10-20', kcal: 1_000 }]);
      expect(stats.loggedDays).toBe(1);
      expect(stats.macros.protein).toBe(50);
    });
  });

  describe('averages per logged day (ACC-G11-1, R05.17)', () => {
    it('divides the macros by the days with food, not by the days of the window', () => {
      const stats = windowNutrition(
        input([
          food('2026-10-21', { kcal: 1_900, protein: 100, carbs: 200, fat: 60 }),
          food('2026-10-24', { kcal: 2_100, protein: 80, carbs: 250, fat: 70 }, 9),
          food('2026-10-24', { kcal: 300, protein: 40, carbs: 30, fat: 10 }, 18),
        ]),
      );
      expect(stats.loggedDays).toBe(2);
      expect(stats.macros).toEqual({ protein: 110, carbs: 240, fat: 70 });
    });

    it('averages every other pillar nutrient, sports compounds too, by logged days', () => {
      const stats = windowNutrition(
        input([
          food('2026-10-21', { kcal: 500, nutrients: { sodium: 2_000, fibre: 20 } }),
          food('2026-10-23', { kcal: 500, nutrients: { sodium: 1_000 }, extras: { creatine: 5 } }),
        ]),
      );
      expect(stats.nutrients).toEqual([
        { key: 'fibre', average: 10, goal: 0 },
        { key: 'sodium', average: 1_500, goal: 0 },
        { key: 'creatine', average: 2.5, goal: 0 },
      ]);
    });

    it('leaves a nutrient off only when its average is under 0.05 and its goal is 0', () => {
      const goals = { ...NO_GOALS, sodium: 2_300, zinc: 0, iron: 0 };
      const stats = windowNutrition(
        input(
          [
            food('2026-10-21', { kcal: 500, nutrients: { zinc: 0.04, iron: 0.1 } }),
            food('2026-10-22', { kcal: 500, nutrients: { zinc: 0.04 } }),
          ],
          { goals },
        ),
      );
      expect(stats.nutrients).toEqual([
        { key: 'iron', average: 0.05, goal: 0 },
        { key: 'sodium', average: 0, goal: 2_300 },
      ]);
    });

    it('lists the nutrients asked for in the order asked, never the macros or the fats without goals', () => {
      const stats = windowNutrition(
        input(
          [
            food('2026-10-21', {
              kcal: 500,
              nutrients: { sugar: 30, fibre: 8, monounsaturatedFat: 12, polyunsaturatedFat: 6 },
            }),
          ],
          { keys: ['sugar', 'fibre'] },
        ),
      );
      expect(stats.nutrients.map((item) => item.key)).toEqual(['sugar', 'fibre']);

      const every = windowNutrition(
        input([food('2026-10-21', { kcal: 500, protein: 30 })], { goals: DEFAULT_GOAL_VALUES }),
      );
      const listed = every.nutrients.map((item) => item.key as string);
      expect(listed).not.toContain('protein');
      expect(listed).not.toContain('monounsaturatedFat');
      expect(listed).not.toContain('polyunsaturatedFat');
      // By default 20 nutrients have a goal; trans fat and the sports compounds start at 0 and
      // were not eaten.
      expect(listed).toHaveLength(20);
      expect(listed).not.toContain('transFat');
      expect(listed).not.toContain('creatine');
    });

    it('counts a missing or unreadable amount as nothing', () => {
      const stats = windowNutrition(
        input([
          food('2026-10-21', { kcal: 500, protein: Number.NaN, nutrients: { sodium: 400 } }),
          food('2026-10-22', { kcal: 500, protein: 20, nutrients: {} }),
        ]),
      );
      expect(stats.macros.protein).toBe(10);
      expect(stats.nutrients).toEqual([{ key: 'sodium', average: 200, goal: 0 }]);
    });
  });

  describe('Count today (ACC-G9-1, R05.17)', () => {
    // Two full days and a breakfast-only today.
    const entries = [
      food('2026-10-24', { kcal: 2_000, protein: 120 }, 13),
      food('2026-10-25', { kcal: 2_200, protein: 140 }, 19),
      food(TODAY, { kcal: 400, protein: 20 }, 8),
    ];
    const week = { range: 'week', offset: 0 } as const;

    it('keeps today in the bars and the averages while it is counted', () => {
      const window = nutritionWindow(week, TODAY, true);
      const stats = windowNutrition(input(entries, { window }));
      expect(stats.calorieDays.map((day) => day.kcal)).toEqual([2_000, 2_200, 400]);
      expect(stats.averageKcal).toBe(1_533);
      expect(stats.macros.protein).toBeCloseTo(280 / 3, 6);
    });

    it("leaves today's partial day out of the bars and every average when it is not", () => {
      const window = nutritionWindow(week, TODAY, false);
      expect(window).toEqual({ first: addDays(TODAY, -7), last: addDays(TODAY, -1) });
      const stats = windowNutrition(input(entries, { window }));
      expect(stats.calorieDays.map((day) => day.kcal)).toEqual([2_000, 2_200]);
      expect(stats.averageKcal).toBe(2_100);
      expect(stats.loggedDays).toBe(2);
      expect(stats.macros.protein).toBe(130);
    });
  });

  describe('windowNutritionSteps', () => {
    it('takes one step per logged day after sorting, then gives the same result', () => {
      const entries = [
        food('2026-10-21', { kcal: 1_800, protein: 90, nutrients: { fibre: 25 } }),
        food('2026-10-22', { kcal: 0 }),
        food('2026-10-25', { kcal: 2_200, protein: 110, nutrients: { fibre: 35 } }),
      ];
      const steps = windowNutritionSteps(input(entries, { goals: DEFAULT_GOAL_VALUES }));
      let pauses = 0;
      let step = steps.next();
      while (!step.done) {
        pauses += 1;
        step = steps.next();
      }
      expect(pauses).toBe(1 + 3);
      expect(step.value).toEqual(windowNutrition(input(entries, { goals: DEFAULT_GOAL_VALUES })));
    });
  });
});
