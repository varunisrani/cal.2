import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '../../domain/dates/dayKey';
import { makeBodyFat, makeEntry, makeWalk } from '../../test/factories';
import {
  SNAPSHOT_TODAY,
  activityOn,
  at,
  connectedActivity,
  entryOn,
  fastFrom,
  fixtureDiary,
  makeSnapshot,
  weighInOn,
  workoutOn,
} from './__fixtures__/snapshot';
import { createOwnDesk } from './ownTools';
import { createReminderDesk, type ReminderDesk } from './reminderTool';
import type { CoachSnapshot } from './snapshot';
import { LATER_TOOL_NAMES, NUTRITION_TOOL_NAMES } from './toolSchemas';
import { activityRange, runCoachTool } from './tools';

type Json = Record<string, unknown>;

function call(name: string, args: unknown, snapshot: CoachSnapshot): Json {
  return JSON.parse(runCoachTool(name, args, snapshot)) as Json;
}

function items(result: Json): Json[] {
  return result.items as Json[];
}

/** One entry a day at noon, named "Meal 1" (oldest) to "Meal <count>" (today). */
function dailyEntries(count: number): CoachSnapshot['entries'] {
  return Array.from({ length: count }, (_, index) =>
    entryOn(addDays(SNAPSHOT_TODAY, index - count + 1), '12:00', { name: `Meal ${index + 1}` }),
  );
}

const WIDE = { from: '2025-01-01', to: SNAPSHOT_TODAY };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runCoachTool: ranges (R04.17)', () => {
  it('defaults a bad from to 30 days before to and echoes the range it used', () => {
    const result = call('weight_log', { from: 'last week', to: '2026-10-20' }, makeSnapshot());
    expect(result).toMatchObject({ from: '2026-09-20', to: '2026-10-20' });
  });

  it('defaults a missing to to today and a missing from to 30 days before it', () => {
    for (const name of [
      'weight_log',
      'body_fat_log',
      'daily_energy_totals',
      'food_log',
      'fasting_log',
    ]) {
      expect(call(name, {}, makeSnapshot())).toMatchObject({
        from: '2026-09-26',
        to: '2026-10-26',
      });
    }
  });

  it('treats a day that is not a real YYYY-MM-DD day as missing', () => {
    for (const bad of ['2026-02-30', '2026-10-01T00:00:00Z', '26/10/2026', '', 20261001, null]) {
      expect(call('food_log', { from: bad, to: bad }, makeSnapshot())).toMatchObject({
        from: '2026-09-26',
        to: '2026-10-26',
      });
    }
    expect(
      call('food_log', { from: ' 2026-10-01 ', to: '2026-10-02' }, makeSnapshot()),
    ).toMatchObject({
      from: '2026-10-01',
    });
  });

  it('swaps a range given in the wrong order', () => {
    expect(
      call('food_log', { from: '2026-10-25', to: '2026-10-01' }, makeSnapshot()),
    ).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-25',
    });
  });

  it('includes both end days whole and nothing either side', () => {
    const snapshot = makeSnapshot({
      weighIns: [
        weighInOn('2026-10-09', 64.9, '23:59'),
        weighInOn('2026-10-10', 64.8, '00:00'),
        weighInOn('2026-10-12', 64.6, '23:59'),
        weighInOn('2026-10-13', 64.5, '00:00'),
      ],
    });
    const result = call('weight_log', { from: '2026-10-10', to: '2026-10-12' }, snapshot);
    expect(items(result).map((row) => row.date)).toEqual(['2026-10-10', '2026-10-12']);
  });

  it('keeps every date Gregorian under a Buddhist or Japanese locale', () => {
    const Native = Intl.DateTimeFormat;
    for (const locale of ['th-TH-u-ca-buddhist', 'ja-JP-u-ca-japanese']) {
      vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
        _locales?: unknown,
        options?: Intl.DateTimeFormatOptions,
      ) {
        return new Native(locale, options);
      });
      vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('2569');
      vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('2569');
      // The stub is in force: the default format no longer writes the Gregorian year.
      expect(new Intl.DateTimeFormat().format(at(SNAPSHOT_TODAY))).not.toContain('2026');
      const snapshot = makeSnapshot({
        entries: [entryOn('2026-10-25', '08:00')],
        weighIns: [weighInOn('2026-10-25', 64)],
        fasts: [fastFrom(at('2026-10-25', '20:00'), at('2026-10-26', '10:00'))],
      });
      expect(call('data_overview', {}, snapshot)).toMatchObject({ today: '2026-10-26' });
      expect(items(call('food_log', {}, snapshot))[0]).toMatchObject({ date: '2026-10-25' });
      expect(items(call('weight_log', {}, snapshot))[0]).toMatchObject({ date: '2026-10-25' });
      expect(items(call('fasting_log', {}, snapshot))[0]).toMatchObject({
        start: '2026-10-25T20:00:00-04:00',
        end: '2026-10-26T10:00:00-04:00',
      });
      vi.restoreAllMocks();
    }
  });
});

describe('runCoachTool: limits keep the newest rows (R04.10, D-16.32)', () => {
  it('returns the newest 365 of 400 entries, oldest first, with the markers', () => {
    const result = call(
      'food_log',
      { ...WIDE, from: '2024-01-01', limit: 365 },
      makeSnapshot({ entries: dailyEntries(400) }),
    );
    const rows = items(result);
    expect(rows).toHaveLength(365);
    expect(result).toMatchObject({ count: 365, limited: true, omittedOlder: 35 });
    expect(rows[0]?.name).toBe('Meal 36');
    expect(rows[364]?.name).toBe('Meal 400');
    expect(rows.map((row) => row.date)).toEqual([...rows.map((row) => row.date as string)].sort());
  });

  it('holds limit to 1…max, cuts fractions and reads numeric text', () => {
    const snapshot = makeSnapshot({ entries: dailyEntries(400) });
    const range = { from: '2024-01-01', to: SNAPSHOT_TODAY };
    const counted = (limit: unknown): unknown =>
      call('food_log', { ...range, limit }, snapshot).count;
    expect(counted(0)).toBe(1);
    expect(counted(-5)).toBe(1);
    expect(counted(1000)).toBe(365);
    expect(counted(2.9)).toBe(2);
    expect(counted('3')).toBe(3);
    expect(counted('many')).toBe(200);
    expect(counted(Number.NaN)).toBe(200);
    expect(counted(true)).toBe(200);
    expect(counted(undefined)).toBe(200);
  });

  it("uses each tool's own default and maximum", () => {
    const snapshot = makeSnapshot({
      weighIns: Array.from({ length: 400 }, (_, index) =>
        weighInOn(addDays(SNAPSHOT_TODAY, -index), 64),
      ),
      fasts: Array.from({ length: 250 }, (_, index) => {
        const start = at(addDays(SNAPSHOT_TODAY, -index - 1), '20:00');
        return fastFrom(start, start + 12 * 3_600_000);
      }),
    });
    const range = { from: '2024-01-01', to: SNAPSHOT_TODAY };
    expect(call('weight_log', range, snapshot)).toMatchObject({ count: 365, omittedOlder: 35 });
    expect(call('fasting_log', range, snapshot)).toMatchObject({ count: 200, omittedOlder: 50 });
    expect(call('fasting_log', { ...range, limit: 365 }, snapshot).count).toBe(250);
  });

  it('adds no markers when nothing was left out', () => {
    const result = call('food_log', WIDE, makeSnapshot({ entries: fixtureDiary() }));
    expect(result.count).toBe(4);
    expect(result).not.toHaveProperty('limited');
    expect(result).not.toHaveProperty('omittedOlder');
  });
});

describe('runCoachTool: daily_energy_totals (R04.16)', () => {
  it('leaves days without entries out instead of giving them 0 kcal (ACC-I7-2)', () => {
    const snapshot = makeSnapshot({
      entries: [
        entryOn('2026-10-20', '08:00', { kcal: 300 }),
        entryOn('2026-10-20', '19:00', { kcal: 650 }),
        entryOn('2026-10-22', '13:00', { kcal: 540 }),
      ],
    });
    const result = call('daily_energy_totals', { from: '2026-10-19', to: '2026-10-23' }, snapshot);
    expect(result).toEqual({
      from: '2026-10-19',
      to: '2026-10-23',
      daysWithData: 2,
      items: [
        { date: '2026-10-20', kcal: 950 },
        { date: '2026-10-22', kcal: 540 },
      ],
    });
  });

  it('counts an entry on its stored day key', () => {
    const late = makeEntry({
      loggedAt: at('2026-10-25', '23:50'),
      dayKey: '2026-10-26',
      kcal: 200,
    });
    const result = call(
      'daily_energy_totals',
      { from: '2026-10-25', to: '2026-10-26' },
      makeSnapshot({ entries: [late] }),
    );
    expect(items(result)).toEqual([{ date: '2026-10-26', kcal: 200 }]);
  });
});

describe('runCoachTool: food_log', () => {
  it('gives the day, name, energy, macros, meal, source, weight and every nutrient with its unit', () => {
    const entry = entryOn('2026-10-25', '19:45', {
      meal: 'dinner',
      source: 'label',
      nutrients: { fibre: 14, sodium: 820, vitaminD: 2.5, omega3: 0.4, sugar: 6.123 },
      extras: { creatine: 5 },
    });
    const result = call(
      'food_log',
      { from: '2026-10-25', to: '2026-10-25' },
      makeSnapshot({ entries: [entry] }),
    );
    expect(items(result)).toEqual([
      {
        date: '2026-10-25',
        name: 'Lentil soup',
        kcal: 410,
        proteinG: 24,
        carbsG: 58,
        fatG: 9.5,
        meal: 'dinner',
        source: 'label',
        weightG: 420,
        fibreG: 14,
        omega3G: 0.4,
        sugarG: 6.12,
        sodiumMg: 820,
        vitaminDMcg: 2.5,
        creatineG: 5,
      },
    ]);
  });

  it('gives servings when the weight is unknown and leaves unknown nutrients out', () => {
    const entry = entryOn('2026-10-25', '08:00', {
      basis: { kind: 'servings', count: 2 },
      nutrients: { sugar: Number.NaN },
    });
    const [row] = items(call('food_log', {}, makeSnapshot({ entries: [entry] })));
    expect(row).toMatchObject({ servings: 2 });
    expect(row).not.toHaveProperty('weightG');
    expect(row).not.toHaveProperty('sugarG');
    expect(Object.keys(row ?? {})).not.toContain('loggedAt');
  });

  it('gives the price in its own currency, and no price key for an entry without one (D-16.107)', () => {
    const priced = entryOn('2026-10-25', '13:00', { price: { amount: 120, currency: 'INR' } });
    const plain = entryOn('2026-10-25', '14:00');
    const rows = items(call('food_log', {}, makeSnapshot({ entries: [priced, plain] })));
    expect(rows[0]?.price).toEqual({ amount: 120, currency: 'INR' });
    expect(rows[1]).not.toHaveProperty('price');
  });

  it('lists entries by day, then by the time they were logged', () => {
    const snapshot = makeSnapshot({ entries: [...fixtureDiary()].reverse() });
    const names = items(call('food_log', WIDE, snapshot)).map((row) => row.name);
    expect(names).toEqual([
      'Grandma Rosa lasagne',
      'Matcha oat latte',
      'Kimchi fried rice',
      'Smoked mackerel bagel',
    ]);
  });
});

describe('runCoachTool: weight_log and body_fat_log', () => {
  it("gives each weigh-in's day with its weight in kg to one decimal, oldest first (D-16.91)", () => {
    const snapshot = makeSnapshot({
      weighIns: [weighInOn('2026-10-25', 70.04), weighInOn('2026-10-18', 70.96)],
    });
    expect(call('weight_log', {}, snapshot)).toEqual({
      from: '2026-09-26',
      to: '2026-10-26',
      count: 2,
      items: [
        { date: '2026-10-18', kg: 71 },
        { date: '2026-10-25', kg: 70 },
      ],
    });
  });

  it('gives body fat in percent to one decimal (D-16.64)', () => {
    const snapshot = makeSnapshot({
      bodyFat: [makeBodyFat({ at: at('2026-10-20'), fraction: 0.2468 })],
    });
    expect(items(call('body_fat_log', {}, snapshot))).toEqual([
      { date: '2026-10-20', percent: 24.7 },
    ]);
  });
});

describe('runCoachTool: fasting_log', () => {
  it("includes a fast from 21:00 yesterday to 13:00 today in today's range", () => {
    const snapshot = makeSnapshot({
      now: at('2026-10-26', '15:00'),
      fasts: [fastFrom(at('2026-10-25', '21:00'), at('2026-10-26', '13:00'), 900)],
    });
    expect(call('fasting_log', { from: SNAPSHOT_TODAY, to: SNAPSHOT_TODAY }, snapshot)).toEqual({
      from: '2026-10-26',
      to: '2026-10-26',
      count: 1,
      items: [
        {
          status: 'completed',
          start: '2026-10-25T21:00:00-04:00',
          end: '2026-10-26T13:00:00-04:00',
          durationMin: 960,
          goalMin: 900,
          goalReached: true,
        },
      ],
    });
  });

  it('measures a running fast to now and finds it in every range from its start through today', () => {
    const snapshot = makeSnapshot({ fasts: [fastFrom(at('2026-10-25', '20:00'), null, 1080)] });
    const today = items(
      call('fasting_log', { from: SNAPSHOT_TODAY, to: SNAPSHOT_TODAY }, snapshot),
    );
    expect(today).toEqual([
      {
        status: 'active',
        start: '2026-10-25T20:00:00-04:00',
        end: null,
        durationMin: 990,
        goalMin: 1080,
        goalReached: false,
      },
    ]);
    expect(call('fasting_log', { from: '2026-10-25', to: '2026-10-25' }, snapshot).count).toBe(1);
    expect(call('fasting_log', { from: '2026-10-01', to: '2026-10-24' }, snapshot).count).toBe(0);
  });

  it('leaves out fasts that end before the range or start after it', () => {
    const snapshot = makeSnapshot({
      fasts: [
        fastFrom(at('2026-10-19', '20:00'), at('2026-10-20', '10:00')),
        fastFrom(at('2026-10-22', '20:00'), at('2026-10-23', '10:00')),
        fastFrom(at('2026-10-25', '20:00'), at('2026-10-26', '10:00')),
      ],
    });
    const rows = items(call('fasting_log', { from: '2026-10-21', to: '2026-10-24' }, snapshot));
    expect(rows.map((row) => row.start)).toEqual(['2026-10-22T20:00:00-04:00']);
  });

  it('never makes a fast out of a day without entries (R04.16)', () => {
    const snapshot = makeSnapshot({ entries: [entryOn('2026-10-20', '12:00')] });
    expect(call('fasting_log', { from: '2026-10-01', to: SNAPSHOT_TODAY }, snapshot)).toMatchObject(
      {
        count: 0,
        items: [],
      },
    );
  });
});

describe('runCoachTool: data_overview', () => {
  it('gives counts with the first and last day, and the fasts with whether one is running', () => {
    const snapshot = makeSnapshot({
      entries: fixtureDiary(),
      weighIns: [weighInOn('2026-10-25', 64), weighInOn('2026-03-02', 66.1)],
      bodyFat: [makeBodyFat({ at: at('2026-09-14') })],
      fasts: [
        fastFrom(at('2026-10-24', '20:00'), at('2026-10-25', '12:00')),
        fastFrom(at('2026-10-26', '08:00'), null),
      ],
    });
    expect(call('data_overview', {}, snapshot)).toEqual({
      today: '2026-10-26',
      weighIns: { count: 2, firstDate: '2026-03-02', lastDate: '2026-10-25' },
      bodyFat: { count: 1, firstDate: '2026-09-14', lastDate: '2026-09-14' },
      foodEntries: { count: 4, firstDate: '2026-10-24', lastDate: '2026-10-26' },
      fasts: { count: 2, active: true },
    });
  });

  it('gives null days for empty data', () => {
    expect(call('data_overview', {}, makeSnapshot())).toEqual({
      today: '2026-10-26',
      weighIns: { count: 0, firstDate: null, lastDate: null },
      bodyFat: { count: 0, firstDate: null, lastDate: null },
      foodEntries: { count: 0, firstDate: null, lastDate: null },
      fasts: { count: 0, active: false },
    });
  });
});

/** A week of Health Connect days around a running morning, as the activity copy stores them. */
function activityWeek(): CoachSnapshot {
  return makeSnapshot({
    activity: connectedActivity([
      activityOn('2026-10-26', {
        steps: 4210.4,
        activeKcal: 182.6,
        totalKcal: 1240.2,
        distanceM: 3105.7,
      }),
      activityOn('2026-10-24', {
        steps: 11_874,
        activeKcal: 512.4,
        totalKcal: 2318.9,
        distanceM: 9204.2,
        sessions: [
          workoutOn('2026-10-24', '17:30', 22, { type: 'walking' }),
          workoutOn('2026-10-24', '07:10', 35.4, {
            activeKcal: 311.7,
            title: 'Run with Anna',
          }),
        ],
      }),
      // Stored, but Health Connect gave the day nothing.
      activityOn('2026-10-23'),
      activityOn('2026-10-22', { steps: 6020, activeKcal: null }),
      // Outside the default week.
      activityOn('2026-10-19', { steps: 9000 }),
    ]),
  });
}

describe('runCoachTool: activity_log (D-16.94)', () => {
  it('gives the stored days of the last 7 by default, oldest first, with their figures and workouts', () => {
    expect(call('activity_log', {}, activityWeek())).toEqual({
      from: '2026-10-20',
      to: '2026-10-26',
      daysWithData: 3,
      items: [
        { date: '2026-10-22', steps: 6020, workouts: [] },
        {
          date: '2026-10-24',
          steps: 11_874,
          activeKcal: 512,
          totalKcal: 2319,
          distanceM: 9204,
          workouts: [
            {
              type: 'running',
              start: '2026-10-24T07:10:00-04:00',
              minutes: 35,
              activeKcal: 312,
            },
            { type: 'walking', start: '2026-10-24T17:30:00-04:00', minutes: 22 },
          ],
        },
        {
          date: '2026-10-26',
          steps: 4210,
          activeKcal: 183,
          totalKcal: 1240,
          distanceM: 3106,
          workouts: [],
        },
      ],
    });
  });

  it('leaves out days with no row and days Health Connect gave nothing, never writing 0', () => {
    const result = call('activity_log', { from: '2026-10-19', to: '2026-10-23' }, activityWeek());
    expect(result).toMatchObject({ from: '2026-10-19', to: '2026-10-23', daysWithData: 2 });
    const rows = items(result);
    expect(rows.map((row) => row.date)).toEqual(['2026-10-19', '2026-10-22']);
    expect(rows[1]).toEqual({ date: '2026-10-22', steps: 6020, workouts: [] });
    expect(JSON.stringify(result)).not.toContain('null');
  });

  it('sends no workout title or source app, and names an untyped workout "other"', () => {
    const snapshot = makeSnapshot({
      activity: connectedActivity([
        activityOn(SNAPSHOT_TODAY, {
          sessions: [workoutOn(SNAPSHOT_TODAY, '06:00', 30, { type: '', title: 'Hill reps' })],
        }),
      ]),
    });
    const text = runCoachTool('activity_log', {}, snapshot);
    expect(items(JSON.parse(text) as Json)[0]?.workouts).toEqual([
      { type: 'other', start: '2026-10-26T06:00:00-04:00', minutes: 30 },
    ]);
    expect(text).not.toContain('Hill reps');
    expect(text).not.toContain('com.example.watch');
    expect(runCoachTool('activity_log', {}, activityWeek())).not.toContain('Run with Anna');
  });

  it('holds a range to its newest 90 days and says how many older days it left out', () => {
    const result = call('activity_log', { from: '2026-01-01', to: SNAPSHOT_TODAY }, activityWeek());
    expect(result).toMatchObject({
      from: '2026-07-29',
      to: '2026-10-26',
      daysWithData: 4,
      limited: true,
      omittedOlderDays: 209,
    });
    expect(activityRange({ from: '2026-07-29', to: SNAPSHOT_TODAY }, SNAPSHOT_TODAY)).toEqual({
      from: '2026-07-29',
      to: '2026-10-26',
      omittedOlderDays: 0,
    });
    expect(activityRange({ from: '2026-07-28', to: SNAPSHOT_TODAY }, SNAPSHOT_TODAY)).toEqual({
      from: '2026-07-29',
      to: '2026-10-26',
      omittedOlderDays: 1,
    });
    expect(
      call('activity_log', { from: '2026-10-20', to: SNAPSHOT_TODAY }, activityWeek()),
    ).not.toHaveProperty('limited');
  });

  it('reads bad days as missing, defaults to the 7 days ending on to, and swaps a reversed range', () => {
    expect(
      call('activity_log', { from: 'last week', to: '2026-10-24' }, activityWeek()),
    ).toMatchObject({ from: '2026-10-18', to: '2026-10-24', daysWithData: 3 });
    expect(
      call('activity_log', { from: '2026-10-24', to: '2026-10-22' }, activityWeek()),
    ).toMatchObject({ from: '2026-10-22', to: '2026-10-24', daysWithData: 2 });
    expect(call('activity_log', 'yesterday', activityWeek())).toMatchObject({
      from: '2026-10-20',
      to: '2026-10-26',
    });
  });

  it('answers an empty copy with no rows', () => {
    const snapshot = makeSnapshot({ activity: connectedActivity([]) });
    expect(call('activity_log', {}, snapshot)).toEqual({
      from: '2026-10-20',
      to: '2026-10-26',
      daysWithData: 0,
      items: [],
    });
  });

  it('says it needs Health Connect when the snapshot has no activity (the web, or not connected)', () => {
    expect(call('activity_log', {}, makeSnapshot())).toEqual({
      error:
        'The tool "activity_log" needs Health Connect, which is only in the Android app and is ' +
        `not connected here. Available tools: ${NUTRITION_TOOL_NAMES.join(', ')}.`,
    });
  });

  it('names activity_log among the available tools only while it is connected', () => {
    const offered = `Available tools: ${[...NUTRITION_TOOL_NAMES, 'activity_log'].join(', ')}.`;
    expect(call('meal_planner', {}, activityWeek()).error).toContain(offered);
    expect(call('meal_planner', {}, makeSnapshot()).error).not.toContain('activity_log');
  });

  it('answers {error} instead of throwing when the copy cannot be read, and leaves it as it was', () => {
    const broken = makeSnapshot({
      activity: { countActive: true, days: undefined } as unknown as CoachSnapshot['activity'],
    });
    expect(call('activity_log', {}, broken)).toEqual({
      error: 'The stored data for this tool could not be read.',
    });
    const snapshot = activityWeek();
    const before = structuredClone(snapshot);
    runCoachTool('activity_log', { from: '2026-01-01' }, snapshot);
    expect(snapshot).toEqual(before);
  });
});

describe('runCoachTool: names and answers (R04.20)', () => {
  const available = `Available tools: ${NUTRITION_TOOL_NAMES.join(', ')}.`;

  it('answers our later-phase workout_log, and every other later tool, with not available', () => {
    expect(call('workout_log', {}, makeSnapshot())).toEqual({
      error: `The tool "workout_log" is not available in this version of the app. ${available}`,
    });
    for (const name of LATER_TOOL_NAMES) {
      expect(call(name, {}, makeSnapshot()).error).toContain('is not available');
    }
  });

  it('answers an unknown name with the six available tools', () => {
    expect(call('meal_planner', {}, makeSnapshot())).toEqual({
      error: `There is no tool called "meal_planner". ${available}`,
    });
  });

  it('reads arguments that are not an object as none', () => {
    for (const args of [null, 'from=2026-01-01', [1, 2], 7]) {
      expect(call('food_log', args, makeSnapshot())).toMatchObject({
        from: '2026-09-26',
        to: '2026-10-26',
      });
    }
  });

  it('answers every tool with one JSON object', () => {
    const snapshot = makeSnapshot({ entries: fixtureDiary() });
    for (const name of [...NUTRITION_TOOL_NAMES, ...LATER_TOOL_NAMES, 'nope']) {
      const parsed: unknown = JSON.parse(runCoachTool(name, {}, snapshot));
      expect(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)).toBe(true);
    }
  });

  it('answers {error} instead of throwing when the data cannot be read', () => {
    const broken = { ...makeSnapshot(), entries: undefined } as unknown as CoachSnapshot;
    expect(call('food_log', {}, broken)).toEqual({
      error: 'The stored data for this tool could not be read.',
    });
  });

  it('leaves the snapshot as it was', () => {
    const snapshot = makeSnapshot({
      entries: [...fixtureDiary()].reverse(),
      weighIns: [weighInOn('2026-10-25', 64), weighInOn('2026-10-01', 65)],
      fasts: [fastFrom(at('2026-10-25', '20:00'), null)],
    });
    const before = structuredClone(snapshot);
    for (const name of NUTRITION_TOOL_NAMES) runCoachTool(name, WIDE, snapshot);
    expect(snapshot).toEqual(before);
  });
});

describe('runCoachTool: propose_reminder (P13, D-16.93)', () => {
  const daily = { text: 'Drink water', time: '10:00', days: 'daily' };

  it('notes a proposal on the turn’s desk and answers that it waits for the person', () => {
    const desk = createReminderDesk({ problemWith: () => null });
    const result = JSON.parse(
      runCoachTool('propose_reminder', daily, makeSnapshot(), desk),
    ) as Json;

    expect(result).toMatchObject({ proposed: true, reminder: daily });
    expect(desk.proposals).toHaveLength(1);
  });

  it('says it is not available in a turn without a desk, naming the tools there are', () => {
    expect(call('propose_reminder', daily, makeSnapshot())).toEqual({
      error: `The tool "propose_reminder" is not available here. Available tools: ${NUTRITION_TOOL_NAMES.join(', ')}.`,
    });
  });

  it('names propose_reminder among the available tools only with a desk', () => {
    const desk = createReminderDesk({ problemWith: () => null });
    const unknown = JSON.parse(runCoachTool('meal_planner', {}, makeSnapshot(), desk)) as Json;
    expect(String(unknown.error)).toContain(
      `${NUTRITION_TOOL_NAMES.join(', ')}, propose_reminder.`,
    );
    expect(String(call('meal_planner', {}, makeSnapshot()).error)).not.toContain(
      'propose_reminder',
    );
  });

  it('answers {error} when the checks throw, and keeps nothing', () => {
    const desk = createReminderDesk({
      problemWith: () => {
        throw new Error('broken');
      },
    });
    const result = JSON.parse(
      runCoachTool('propose_reminder', daily, makeSnapshot(), desk),
    ) as Json;
    expect(result).toEqual({ error: 'The reminder could not be checked, so it was not proposed.' });
    expect(desk.proposals).toEqual([]);
  });
});

describe('runCoachTool: the Coach’s own tools (P17-03, D-16.102)', () => {
  const actions = {
    setsReminders: async () => true,
    reminders: { addCustomReminder: vi.fn(), removeCustomReminder: vi.fn() },
    checkIns: {
      add: vi.fn(),
      remove: vi.fn(),
      attach: vi.fn(),
      dropChat: vi.fn(),
      takeDue: vi.fn(),
    },
  };
  const checks = { problemWith: () => null };
  const daily = { text: 'Drink water', time: '10:00', days: 'daily' };

  it('names set_reminder in place of propose_reminder, and schedule_check_in, where offered', () => {
    const setting = createReminderDesk(checks, createOwnDesk(actions, 'chat-1', true));
    const proposing = createReminderDesk(checks, createOwnDesk(actions, 'chat-1', false));
    const names = `${NUTRITION_TOOL_NAMES.join(', ')}`;

    expect(String(call2('meal_planner', setting).error)).toContain(
      `${names}, set_reminder, schedule_check_in.`,
    );
    expect(String(call2('meal_planner', proposing).error)).toContain(
      `${names}, propose_reminder, schedule_check_in.`,
    );
  });

  it('answers a call of a tool the turn does not offer as not available, and writes nothing', () => {
    const setting = createReminderDesk(checks, createOwnDesk(actions, 'chat-1', true));
    const web = createReminderDesk(checks);

    expect(String(call2('propose_reminder', setting, daily).error)).toContain(
      'The tool "propose_reminder" is not available here.',
    );
    expect(setting.proposals).toEqual([]);
    for (const name of ['set_reminder', 'schedule_check_in']) {
      expect(String(call2(name, web, daily).error)).toBe(
        `The tool "${name}" is not available here. Available tools: ${NUTRITION_TOOL_NAMES.join(', ')}, propose_reminder.`,
      );
    }
    expect(actions.reminders.addCustomReminder).not.toHaveBeenCalled();
    expect(actions.checkIns.add).not.toHaveBeenCalled();
  });

  function call2(name: string, desk: ReminderDesk, args: unknown = {}): Json {
    return JSON.parse(runCoachTool(name, args, makeSnapshot(), desk)) as Json;
  }
});

describe('runCoachTool: walk_log (D-16.96)', () => {
  const walks = [
    makeWalk({ id: 'w-old', startedAt: at('2026-07-01', '07:00') }),
    makeWalk({ id: 'w-mon', startedAt: at('2026-10-19', '18:00') }),
    makeWalk({
      id: 'w-thu',
      startedAt: at('2026-10-22', '07:30'),
      activeSeconds: 1_260,
      distanceM: null,
      steps: null,
      briskMinutes: 0,
      briskKnown: false,
      score: null,
      activeKcal: 61,
    }),
    makeWalk({ id: 'w-today', startedAt: at('2026-10-26', '08:05'), distanceM: 2_614 }),
  ];
  const snapshot = makeSnapshot({ walks: { countActive: true, items: walks } });

  it('gives the walks of the last 7 days by default, oldest first, one row each', () => {
    expect(call('walk_log', {}, snapshot)).toEqual({
      from: '2026-10-20',
      to: '2026-10-26',
      count: 2,
      items: [
        { date: '2026-10-22', start: '2026-10-22T07:30:00-04:00', minutes: 21, activeKcal: 61 },
        {
          date: '2026-10-26',
          start: '2026-10-26T08:05:00-04:00',
          minutes: 30,
          km: 2.61,
          steps: 3300,
          briskMinutes: 25,
          score: 81,
          activeKcal: 90,
        },
      ],
    });
  });

  it('holds at most the newest 90 days of a longer range and says how many it left out', () => {
    const result = call('walk_log', { from: '2026-01-01', to: SNAPSHOT_TODAY }, snapshot);
    expect(result).toMatchObject({
      from: '2026-07-29',
      to: SNAPSHOT_TODAY,
      limited: true,
      omittedOlderDays: 209,
      count: 3,
    });
    expect(items(result).map((row) => row.date)).toEqual([
      '2026-10-19',
      '2026-10-22',
      '2026-10-26',
    ]);
  });

  it('says it needs the walk recorder where there is none (the web)', () => {
    expect(call('walk_log', {}, makeSnapshot())).toEqual({
      error:
        'The tool "walk_log" needs the walk recorder, which is only in the Android app. ' +
        `Available tools: ${NUTRITION_TOOL_NAMES.join(', ')}.`,
    });
    expect(call('meal_planner', {}, snapshot).error).toContain('walk_log');
  });

  it('answers {error} instead of throwing when the walks cannot be read', () => {
    const broken = makeSnapshot({
      walks: { countActive: true, items: [null] } as unknown as CoachSnapshot['walks'],
    });
    expect(call('walk_log', {}, broken)).toEqual({
      error: 'The stored data for this tool could not be read.',
    });
  });
});
