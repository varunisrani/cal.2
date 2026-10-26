import { describe, expect, it } from 'vitest';
import { inTimeZone } from '../../test/time';
import { dayKeyOf } from '../dates/dayKey';
import type { DiaryEntry, Fast, MealKind } from '../model';
import {
  DEFAULT_DIARY_SORT,
  fastsOnDay,
  groupDiary,
  isDiarySortMode,
  rowMeal,
  rowTime,
  sectionTotals,
  type DiaryRow,
  type DiarySection,
} from './diary';
import { DEFAULT_MEAL_TIMES } from './times';

/** Local time (the test zone is America/New_York) on 2026-10-20, or `day` of October. */
const clock = (hours: number, minutes: number, day = 20): number =>
  new Date(2026, 9, day, hours, minutes).getTime();

type Energy = Partial<Pick<DiaryEntry, 'kcal' | 'protein' | 'carbs' | 'fat'>>;

function food(id: string, meal: MealKind, loggedAt: number, energy: Energy = {}): DiaryRow {
  const entry: DiaryEntry = {
    id,
    name: id,
    kcal: 100,
    protein: 10,
    carbs: 20,
    fat: 5,
    nutrients: {},
    extras: {},
    basis: { kind: 'grams', grams: 100 },
    units: [],
    lines: [],
    progressive: false,
    loggedAt,
    dayKey: dayKeyOf(loggedAt),
    meal,
    source: 'manual',
    photoIds: [],
    ...energy,
  };
  return { kind: 'food', entry };
}

function water(id: string, at: number, ml = 250): DiaryRow {
  return { kind: 'water', log: { id, at, dayKey: dayKeyOf(at), ml } };
}

function fastOf(id: string, start: number, end: number | null): Fast {
  return { id, start, end, goalMin: 16 * 60 };
}

function fast(id: string, start: number, end: number | null): DiaryRow {
  return { kind: 'fast', fast: fastOf(id, start, end) };
}

const idOf = (row: DiaryRow): string => {
  switch (row.kind) {
    case 'food':
      return row.entry.id;
    case 'water':
      return row.log.id;
    case 'fast':
      return row.fast.id;
  }
};

/** Sections as `meal: ids` for compact expectations. */
const outline = (sections: DiarySection[]): string[] =>
  sections.map((section) => `${section.meal}: ${section.rows.map(idOf).join(' ')}`);

describe('diary sort modes', () => {
  it('defaults to by meal and guards the two values', () => {
    expect(DEFAULT_DIARY_SORT).toBe('byMeal');
    expect(isDiarySortMode('byMeal')).toBe(true);
    expect(isDiarySortMode('newestFirst')).toBe(true);
    for (const value of ['standard', 'NewestFirst', '', null])
      expect(isDiarySortMode(value)).toBe(false);
  });
});

describe('row placement', () => {
  it('keeps food under the meal it was logged with, whatever its time', () => {
    expect(rowMeal(food('late breakfast', 'breakfast', clock(20, 0)), DEFAULT_MEAL_TIMES)).toBe(
      'breakfast',
    );
    expect(rowMeal(food('misc', 'other', clock(12, 30)), DEFAULT_MEAL_TIMES)).toBe('other');
  });

  it('places water by its time of day', () => {
    expect(rowMeal(water('w', clock(13, 1)), DEFAULT_MEAL_TIMES)).toBe('lunch');
    expect(rowMeal(water('w', clock(4, 59)), DEFAULT_MEAL_TIMES)).toBe('snack');
  });

  it('places a completed fast by its end and a running one by its start', () => {
    const done = fast('done', clock(20, 0, 19), clock(12, 30));
    expect(rowTime(done)).toBe(clock(12, 30));
    expect(rowMeal(done, DEFAULT_MEAL_TIMES)).toBe('lunch');
    const running = fast('running', clock(19, 0), null);
    expect(rowTime(running)).toBe(clock(19, 0));
    expect(rowMeal(running, DEFAULT_MEAL_TIMES)).toBe('dinner');
  });
});

describe('groupDiary', () => {
  const day: DiaryRow[] = [
    food('toast', 'breakfast', clock(7, 0)),
    food('salad', 'lunch', clock(12, 30)),
    food('crisps', 'snack', clock(15, 0)),
    food('pasta', 'dinner', clock(19, 0)),
    water('glass', clock(19, 30)),
    food('tea', 'other', clock(16, 0)),
    food('nuts', 'snack', clock(23, 30)),
    food('coffee', 'breakfast', clock(8, 0)),
  ];

  it('by meal: breakfast, lunch, dinner, snack, other, newest first inside each', () => {
    expect(outline(groupDiary(day, 'byMeal', DEFAULT_MEAL_TIMES))).toEqual([
      'breakfast: coffee toast',
      'lunch: salad',
      'dinner: glass pasta',
      'snack: nuts crisps',
      'other: tea',
    ]);
  });

  it('by meal: leaves out meals with no rows', () => {
    const rows = [food('pasta', 'dinner', clock(19, 0)), water('glass', clock(6, 0))];
    expect(outline(groupDiary(rows, 'byMeal', DEFAULT_MEAL_TIMES))).toEqual([
      'breakfast: glass',
      'dinner: pasta',
    ]);
  });

  it('newest first: runs of one meal, so a meal can repeat (Snack, Dinner, Snack)', () => {
    const rows = [
      food('crisps', 'snack', clock(15, 0)),
      food('pasta', 'dinner', clock(19, 0)),
      water('glass', clock(19, 30)),
      food('nuts', 'snack', clock(23, 30)),
    ];
    expect(outline(groupDiary(rows, 'newestFirst', DEFAULT_MEAL_TIMES))).toEqual([
      'snack: nuts',
      'dinner: glass pasta',
      'snack: crisps',
    ]);
  });

  it('newest first: every row of the day in time order', () => {
    const sections = groupDiary(day, 'newestFirst', DEFAULT_MEAL_TIMES);
    expect(sections.flatMap((section) => section.rows.map(idOf))).toEqual([
      'nuts',
      'glass',
      'pasta',
      'tea',
      'crisps',
      'salad',
      'coffee',
      'toast',
    ]);
    expect(sections.map((section) => section.meal)).toEqual([
      'snack',
      'dinner',
      'other',
      'snack',
      'lunch',
      'breakfast',
    ]);
  });

  it('keeps the given order for rows at the same time', () => {
    const same = clock(13, 0);
    const rows = [food('a', 'lunch', same), water('b', same), food('c', 'lunch', same)];
    for (const mode of ['byMeal', 'newestFirst'] as const) {
      expect(outline(groupDiary(rows, mode, DEFAULT_MEAL_TIMES))).toEqual(['lunch: a b c']);
    }
  });

  it('gives no sections for an empty day', () => {
    expect(groupDiary([], 'byMeal', DEFAULT_MEAL_TIMES)).toEqual([]);
    expect(groupDiary([], 'newestFirst', DEFAULT_MEAL_TIMES)).toEqual([]);
  });

  it('places rows with the meal times it is given', () => {
    const late = { breakfast: 480, lunch: 840, dinner: 1_200, lateSnack: 1_410 };
    const rows = [water('glass', clock(7, 30)), water('bottle', clock(13, 30))];
    expect(outline(groupDiary(rows, 'byMeal', DEFAULT_MEAL_TIMES))).toEqual([
      'breakfast: glass',
      'lunch: bottle',
    ]);
    expect(outline(groupDiary(rows, 'byMeal', late))).toEqual([
      'breakfast: bottle',
      'snack: glass',
    ]);
  });
});

describe('section totals', () => {
  it('sums food energy and rounds each macro to whole grams (R05.4)', () => {
    const rows = [
      food('a', 'lunch', clock(12, 10), { kcal: 420, protein: 10.4, carbs: 0.2, fat: 12.5 }),
      food('b', 'lunch', clock(12, 20), { kcal: 380, protein: 10.3, carbs: 0.2, fat: 0 }),
    ];
    expect(sectionTotals(rows)).toEqual({ kcal: 800, protein: 21, carbs: 0, fat: 13 });
  });

  it('does not change a section total for a water row in Breakfast (R05.4)', () => {
    const breakfastFood = food('oats', 'breakfast', clock(7, 0), {
      kcal: 420,
      protein: 30,
      carbs: 45,
      fat: 12,
    });
    const withWater = groupDiary(
      [breakfastFood, water('glass', clock(7, 1))],
      'byMeal',
      DEFAULT_MEAL_TIMES,
    );
    expect(outline(withWater)).toEqual(['breakfast: glass oats']);
    expect(withWater[0]!.totals).toEqual({ kcal: 420, protein: 30, carbs: 45, fat: 12 });
  });

  it('does not change a section total for a fast that ended in it (R05.4)', () => {
    const lunchFood = food('soup', 'lunch', clock(13, 0), {
      kcal: 420,
      protein: 30,
      carbs: 45,
      fat: 12,
    });
    const ended = fast('fast', clock(21, 0, 19), clock(13, 1));
    const [lunch] = groupDiary([lunchFood, ended], 'byMeal', DEFAULT_MEAL_TIMES);
    expect(outline([lunch!])).toEqual(['lunch: fast soup']);
    expect(lunch!.totals).toEqual({ kcal: 420, protein: 30, carbs: 45, fat: 12 });
  });

  it('gives no totals to a section without food (R05.4)', () => {
    const sections = groupDiary(
      [water('glass', clock(7, 0)), fast('fast', clock(20, 0, 19), clock(12, 0))],
      'byMeal',
      DEFAULT_MEAL_TIMES,
    );
    expect(outline(sections)).toEqual(['breakfast: glass', 'lunch: fast']);
    expect(sections.map((section) => section.totals)).toEqual([null, null]);
    expect(sectionTotals([])).toBeNull();
  });

  it('counts each run on its own in newest-first mode', () => {
    const rows = [
      food('crisps', 'snack', clock(15, 0), { kcal: 150, protein: 2, carbs: 15, fat: 9 }),
      food('pasta', 'dinner', clock(19, 0), { kcal: 600, protein: 20, carbs: 80, fat: 15 }),
      food('nuts', 'snack', clock(23, 30), { kcal: 200, protein: 6, carbs: 6, fat: 18 }),
    ];
    expect(groupDiary(rows, 'newestFirst', DEFAULT_MEAL_TIMES).map((s) => s.totals?.kcal)).toEqual([
      200, 600, 150,
    ]);
  });
});

describe('fastsOnDay', () => {
  it('shows a fast from 20:00 to 12:00 the next day on the second day only (R05.21, ACC-F8-1)', () => {
    const overnight = fastOf('overnight', clock(20, 0, 19), clock(12, 0, 20));
    const today = '2026-10-21';
    expect(fastsOnDay([overnight], '2026-10-19', today)).toEqual([]);
    expect(fastsOnDay([overnight], '2026-10-20', today)).toEqual([overnight]);
    expect(fastsOnDay([overnight], '2026-10-21', today)).toEqual([]);
  });

  it('shows the running fast on today and not on the day it started (R05.21)', () => {
    const running = fastOf('running', clock(20, 0, 19), null);
    expect(fastsOnDay([running], '2026-10-20', '2026-10-20')).toEqual([running]);
    expect(fastsOnDay([running], '2026-10-19', '2026-10-20')).toEqual([]);
    expect(fastsOnDay([running], '2026-10-21', '2026-10-20')).toEqual([]);
  });

  it('lists the completed fasts of the day and the running one together on today (R05.21)', () => {
    const early = fastOf('early', clock(20, 0, 18), clock(10, 0, 19));
    const ended = fastOf('ended', clock(22, 0, 19), clock(0, 30, 20));
    const running = fastOf('running', clock(18, 0, 20), null);
    const all = [early, ended, running];
    expect(fastsOnDay(all, '2026-10-20', '2026-10-20')).toEqual([ended, running]);
    expect(fastsOnDay(all, '2026-10-19', '2026-10-20')).toEqual([early]);
  });

  it('uses the local day of the end in the device zone (R05.21)', () => {
    // 23:30 on 20 October in New York is 12:30 on 21 October in Tokyo.
    const ended = fastOf('ended', clock(8, 0, 20), clock(23, 30, 20));
    expect(fastsOnDay([ended], '2026-10-20', '2026-10-22')).toEqual([ended]);
    const inTokyo = inTimeZone('Asia/Tokyo', () => [
      fastsOnDay([ended], '2026-10-20', '2026-10-22'),
      fastsOnDay([ended], '2026-10-21', '2026-10-22'),
    ]);
    expect(inTokyo).toEqual([[], [ended]]);
  });
});
