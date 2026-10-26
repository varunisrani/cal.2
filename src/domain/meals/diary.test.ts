import { describe, expect, it } from 'vitest';
import { inTimeZone } from '../../test/time';
import { dayKeyOf } from '../dates/dayKey';
import type { DiaryEntry, Fast, MealKind } from '../model';
import {
  fastsOnDay,
  groupDiary,
  isDiarySort,
  rowMeal,
  sectionTotals,
  type DiaryRow,
  type DiarySection,
} from './diary';
import { DEFAULT_MEAL_TIMES } from './times';

const ZONES = ['America/New_York', 'Asia/Tokyo'];
const HOUR = 3_600_000;

/** A local instant on 26 October 2026 (or `day` of October) in the current zone. */
function at(hours: number, minutes = 0, day = 26): number {
  return new Date(2026, 9, day, hours, minutes).getTime();
}

let serial = 0;

function foodRow(
  meal: MealKind,
  loggedAt: number,
  kcal: number,
  macros: { protein?: number; carbs?: number; fat?: number } = {},
): DiaryRow {
  serial += 1;
  const entry: DiaryEntry = {
    id: `food-${serial}`,
    name: `Plate ${serial}`,
    loggedAt,
    dayKey: dayKeyOf(loggedAt),
    meal,
    source: 'manual',
    kcal,
    protein: macros.protein ?? 0,
    carbs: macros.carbs ?? 0,
    fat: macros.fat ?? 0,
    nutrients: {},
    extras: {},
    basis: { kind: 'grams', grams: 100 },
    units: [],
    lines: [],
    progressive: false,
    photoIds: [],
  };
  return { kind: 'food', entry };
}

function waterRow(atMs: number, ml = 250): DiaryRow {
  serial += 1;
  return { kind: 'water', log: { id: `water-${serial}`, at: atMs, dayKey: dayKeyOf(atMs), ml } };
}

function fast(start: number, end: number | null, goalMin = 16 * 60): Fast {
  serial += 1;
  return { id: `fast-${serial}`, start, end, goalMin };
}

const fastRow = (value: Fast): DiaryRow => ({ kind: 'fast', fast: value });

function idOf(row: DiaryRow): string {
  return row.kind === 'food' ? row.entry.id : row.kind === 'water' ? row.log.id : row.fast.id;
}

/** Each section as "meal: row ids", for compact comparisons. */
function outline(sections: DiarySection[]): string[] {
  return sections.map((section) => `${section.meal}: ${section.rows.map(idOf).join(' ')}`);
}

describe('groupDiary by meal', () => {
  it('lists breakfast, lunch, dinner, snack and other in that order, leaving out empty ones', () => {
    const rows = [
      foodRow('other', at(9), 100),
      foodRow('snack', at(23, 30), 150),
      foodRow('breakfast', at(8), 300),
      foodRow('dinner', at(19), 700),
    ];
    const sections = groupDiary(rows, 'byMeal', DEFAULT_MEAL_TIMES);
    expect(sections.map((section) => section.meal)).toEqual([
      'breakfast',
      'dinner',
      'snack',
      'other',
    ]);
  });

  it('puts the newest row first inside a section', () => {
    const early = foodRow('lunch', at(12, 5), 200);
    const late = foodRow('lunch', at(14, 40), 300);
    const middle = waterRow(at(13, 0));
    const [lunch] = groupDiary([early, late, middle], 'byMeal', DEFAULT_MEAL_TIMES);
    expect(lunch?.rows).toEqual([late, middle, early]);
  });

  it('keeps a food row in its own meal whatever its time', () => {
    const rows = [foodRow('breakfast', at(21), 400)];
    expect(groupDiary(rows, 'byMeal', DEFAULT_MEAL_TIMES).map((each) => each.meal)).toEqual([
      'breakfast',
    ]);
  });

  it('keeps the given order for rows logged at the same instant', () => {
    const first = foodRow('dinner', at(19), 100);
    const second = waterRow(at(19));
    const [dinner] = groupDiary([first, second], 'byMeal', DEFAULT_MEAL_TIMES);
    expect(dinner?.rows).toEqual([first, second]);
  });

  it('gives no sections for a day without rows', () => {
    expect(groupDiary([], 'byMeal', DEFAULT_MEAL_TIMES)).toEqual([]);
    expect(groupDiary([], 'newestFirst', DEFAULT_MEAL_TIMES)).toEqual([]);
  });
});

describe('groupDiary newest first', () => {
  it('gives Snack, Dinner, Snack for an interleaved day', () => {
    const rows = [
      foodRow('snack', at(15), 150),
      foodRow('dinner', at(19), 650),
      foodRow('snack', at(21, 30), 120),
    ];
    const sections = groupDiary(rows, 'newestFirst', DEFAULT_MEAL_TIMES);
    expect(sections.map((section) => section.meal)).toEqual(['snack', 'dinner', 'snack']);
    expect(sections.map((section) => section.totals?.kcal)).toEqual([120, 650, 150]);
  });

  it('joins consecutive rows of one meal into one section', () => {
    const a = foodRow('lunch', at(12, 10), 300);
    const b = waterRow(at(13));
    const c = foodRow('lunch', at(13, 30), 200);
    const d = foodRow('breakfast', at(7), 350);
    expect(outline(groupDiary([a, b, c, d], 'newestFirst', DEFAULT_MEAL_TIMES))).toEqual([
      `lunch: ${idOf(c)} ${idOf(b)} ${idOf(a)}`,
      `breakfast: ${idOf(d)}`,
    ]);
  });
});

describe('row placement', () => {
  it('places water and fasts by local time of day: a fast by its end, or its start while active', () => {
    for (const tz of ZONES) {
      inTimeZone(tz, () => {
        expect(rowMeal(waterRow(at(4, 59)), DEFAULT_MEAL_TIMES)).toBe('snack');
        expect(rowMeal(waterRow(at(5)), DEFAULT_MEAL_TIMES)).toBe('breakfast');
        expect(rowMeal(waterRow(at(12, 30)), DEFAULT_MEAL_TIMES)).toBe('lunch');
        const done = fast(at(20, 0, 25), at(12, 0));
        expect(rowMeal(fastRow(done), DEFAULT_MEAL_TIMES)).toBe('lunch');
        const running = fast(at(19, 30), null);
        expect(rowMeal(fastRow(running), DEFAULT_MEAL_TIMES)).toBe('dinner');
      });
    }
  });

  it('follows custom meal times', () => {
    const times = { breakfast: 420, lunch: 780, dinner: 1_200, lateSnack: 1_410 };
    expect(rowMeal(waterRow(at(12, 30)), times)).toBe('breakfast');
    expect(rowMeal(waterRow(at(23, 45)), times)).toBe('snack');
  });
});

describe('section totals', () => {
  it('leaves Breakfast totals unchanged by a water row in it (R05.4)', () => {
    const plate = foodRow('breakfast', at(8), 420, { protein: 30.4, carbs: 45.2, fat: 12.6 });
    const water = waterRow(at(8, 1));
    const [withWater] = groupDiary([plate, water], 'byMeal', DEFAULT_MEAL_TIMES);
    const [withoutWater] = groupDiary([plate], 'byMeal', DEFAULT_MEAL_TIMES);
    expect(withWater?.meal).toBe('breakfast');
    expect(withWater?.rows).toEqual([water, plate]);
    expect(withWater?.totals).toEqual({ kcal: 420, protein: 30, carbs: 45, fat: 13 });
    expect(withWater?.totals).toEqual(withoutWater?.totals);
  });

  it('leaves a section total unchanged by a fast row in it (R05.4)', () => {
    for (const tz of ZONES) {
      inTimeZone(tz, () => {
        const ended = fast(at(12, 1) - 16 * HOUR, at(12, 1));
        const plate = foodRow('lunch', at(12, 0), 420, { protein: 30, carbs: 45, fat: 12 });
        const [lunch] = groupDiary([plate, fastRow(ended)], 'byMeal', DEFAULT_MEAL_TIMES);
        expect(lunch?.meal).toBe('lunch');
        expect(lunch?.rows[0]).toEqual(fastRow(ended));
        expect(lunch?.totals).toEqual({ kcal: 420, protein: 30, carbs: 45, fat: 12 });
      });
    }
  });

  it('gives no totals to a section of water and fasts only (R05.4)', () => {
    const rows = [waterRow(at(15)), fastRow(fast(at(1), at(14)))];
    const sections = groupDiary(rows, 'byMeal', DEFAULT_MEAL_TIMES);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.totals).toBeNull();
    expect(sectionTotals(rows)).toBeNull();
  });

  it('rounds the macro totals to whole grams after adding them up', () => {
    const rows = [
      foodRow('dinner', at(19), 250, { protein: 12.4, carbs: 0.3, fat: 7.25 }),
      foodRow('dinner', at(20), 251, { protein: 12.4, carbs: 0.3, fat: 7.25 }),
    ];
    expect(sectionTotals(rows)).toEqual({ kcal: 501, protein: 25, carbs: 1, fat: 15 });
  });
});

describe('fastsOnDay', () => {
  it('shows a fast from 20:00 to 12:00 on the second day only (R05.21, ACC-F8-1)', () => {
    for (const tz of ZONES) {
      inTimeZone(tz, () => {
        const overnight = fast(at(20, 0, 25), at(12, 0, 26));
        expect(fastsOnDay([overnight], '2026-10-25', '2026-10-27')).toEqual([]);
        expect(fastsOnDay([overnight], '2026-10-26', '2026-10-27')).toEqual([overnight]);
        const rows = fastsOnDay([overnight], '2026-10-26', '2026-10-27').map(fastRow);
        expect(groupDiary(rows, 'byMeal', DEFAULT_MEAL_TIMES).map((each) => each.meal)).toEqual([
          'lunch',
        ]);
      });
    }
  });

  it('shows the active fast on today and not on yesterday (R05.21)', () => {
    for (const tz of ZONES) {
      inTimeZone(tz, () => {
        const running = fast(at(20, 0, 25), null);
        expect(fastsOnDay([running], '2026-10-26', '2026-10-26')).toEqual([running]);
        expect(fastsOnDay([running], '2026-10-25', '2026-10-26')).toEqual([]);
        expect(fastsOnDay([running], '2026-10-24', '2026-10-26')).toEqual([]);
      });
    }
  });

  it('puts a fast that ends at local midnight on the new day', () => {
    for (const tz of ZONES) {
      inTimeZone(tz, () => {
        const toMidnight = fast(at(8, 0, 25), at(0, 0, 26));
        expect(fastsOnDay([toMidnight], '2026-10-25', '2026-10-26')).toEqual([]);
        expect(fastsOnDay([toMidnight], '2026-10-26', '2026-10-26')).toEqual([toMidnight]);
      });
    }
  });

  it('keeps the completed fasts of the day and the active one in their given order', () => {
    const morning = fast(at(18, 0, 25), at(10, 0));
    const elsewhere = fast(at(18, 0, 23), at(10, 0, 24));
    const running = fast(at(20, 0), null);
    expect(fastsOnDay([elsewhere, morning, running], '2026-10-26', '2026-10-26')).toEqual([
      morning,
      running,
    ]);
  });
});

describe('isDiarySort', () => {
  it('accepts the two sort modes and nothing else', () => {
    expect(isDiarySort('byMeal')).toBe(true);
    expect(isDiarySort('newestFirst')).toBe(true);
    for (const miss of ['standard', 'NewestFirst', '', null, 0]) {
      expect(isDiarySort(miss)).toBe(false);
    }
  });
});
