import { describe, expect, it } from 'vitest';
import { startOfDay, type DayKey } from '../dates/dayKey';
import {
  buildRecap,
  hasActivity,
  highlightsFor,
  MAX_HIGHLIGHTS,
  nearCalorieGoal,
  recapSpan,
  recapWeek,
  tallyWeek,
  type RecapEntry,
  type RecapGoals,
  type RecapWeighIn,
  type WeekTally,
} from './recap';

const HOUR = 3_600_000;
// Saturday 13 June 2026: Monday weeks run 8–14 June, Sunday weeks 7–13 June.
const SATURDAY = '2026-06-13';
const GOALS: RecapGoals = { kcal: 2_000, protein: 150 };

const meal = (dayKey: DayKey, kcal: number, protein = 0): RecapEntry => ({ dayKey, kcal, protein });

/** A weigh-in at `hour` (fractions for minutes) local time on `dayKey`. */
const weighIn = (dayKey: DayKey, hour: number, kg: number): RecapWeighIn => ({
  at: startOfDay(dayKey) + hour * HOUR,
  kg,
});

const EMPTY: WeekTally = {
  loggedDays: 0,
  nearGoalDays: 0,
  proteinDays: 0,
  averageKcal: null,
  weighIns: 0,
  weightChangeKg: null,
  longestRun: 0,
};

const tally = (overrides: Partial<WeekTally>): WeekTally => ({ ...EMPTY, ...overrides });

describe('recapWeek', () => {
  it('recaps the last week that has ended, by the week start setting (R05.19)', () => {
    expect(recapWeek(SATURDAY, 'mon', 0)).toEqual({ first: '2026-06-01', last: '2026-06-07' });
    expect(recapWeek(SATURDAY, 'sun', 0)).toEqual({ first: '2026-05-31', last: '2026-06-06' });
    expect(recapWeek(SATURDAY, 'mon', 1)).toEqual({ first: '2026-05-25', last: '2026-05-31' });
  });

  it('never recaps the current week, even on its last day (R05.19)', () => {
    // Sunday 14 June ends the Monday week of 8–14 June: still the week before.
    expect(recapWeek('2026-06-14', 'mon', 0).first).toBe('2026-06-01');
    expect(recapWeek('2026-06-15', 'mon', 0).first).toBe('2026-06-08');
    // Saturday 13 June ends the Sunday week of 7–13 June.
    expect(recapWeek(SATURDAY, 'sun', 0).first).toBe('2026-05-31');
    expect(recapWeek('2026-06-14', 'sun', 0).first).toBe('2026-06-07');
  });

  it('treats a negative or fractional offset as whole weeks back from the last ended one', () => {
    expect(recapWeek(SATURDAY, 'mon', -2)).toEqual(recapWeek(SATURDAY, 'mon', 0));
    expect(recapWeek(SATURDAY, 'mon', 1.8)).toEqual(recapWeek(SATURDAY, 'mon', 1));
    expect(recapWeek(SATURDAY, 'mon', Number.NaN)).toEqual(recapWeek(SATURDAY, 'mon', 0));
  });

  it('reads the recapped week and the one before it', () => {
    expect(recapSpan(SATURDAY, 'mon', 0)).toEqual({ first: '2026-05-25', last: '2026-06-07' });
    expect(recapSpan(SATURDAY, 'sun', 2)).toEqual({ first: '2026-05-10', last: '2026-05-23' });
  });
});

describe('nearCalorieGoal', () => {
  it('takes 10 % either side of the goal: 1 800 and 2 200 count, 1 799 does not (R05.19)', () => {
    expect(nearCalorieGoal(1_800, 2_000)).toBe(true);
    expect(nearCalorieGoal(2_200, 2_000)).toBe(true);
    expect(nearCalorieGoal(1_799, 2_000)).toBe(false);
    expect(nearCalorieGoal(2_201, 2_000)).toBe(false);
  });

  it('counts nothing without a calorie goal', () => {
    expect(nearCalorieGoal(0, 0)).toBe(false);
    expect(nearCalorieGoal(1_900, 0)).toBe(false);
  });
});

describe('tallyWeek', () => {
  const week = [
    // Monday: 10 % under counts; 149.6 g shows as 150 g and meets 150.
    meal('2026-06-01', 1_800, 149.6),
    // Tuesday: two meals, 10 % over together; 149.4 g is 149 g.
    meal('2026-06-02', 1_200, 70),
    meal('2026-06-02', 1_000, 79.4),
    meal('2026-06-03', 2_201, 160),
    meal('2026-06-05', 1_799, 150),
    meal('2026-06-06', 1_503, 90),
    // The days on either side of the week.
    meal('2026-05-31', 2_000, 150),
    meal('2026-06-08', 2_000, 150),
  ];

  it('counts logged days, days near the goal and protein days, 149.6 g meeting 150 (R05.19)', () => {
    const counted = tallyWeek('2026-06-01', week, [], GOALS);
    expect(counted.loggedDays).toBe(5);
    expect(counted.nearGoalDays).toBe(2);
    expect(counted.proteinDays).toBe(3);
  });

  it('averages over the logged days to the whole kcal, and finds the longest run', () => {
    const counted = tallyWeek('2026-06-01', week, [], GOALS);
    // 9 503 kcal over five days.
    expect(counted.averageKcal).toBe(1_901);
    // Monday to Wednesday; Thursday breaks the run.
    expect(counted.longestRun).toBe(3);
  });

  it('counts no day near a goal of 0 and no protein day for a protein goal of 0', () => {
    const counted = tallyWeek('2026-06-01', week, [], { kcal: 0, protein: 0 });
    expect(counted.loggedDays).toBe(5);
    expect(counted.nearGoalDays).toBe(0);
    expect(counted.proteinDays).toBe(0);
  });

  it('gives an empty week no average, no change and nothing to show', () => {
    const counted = tallyWeek('2026-06-01', [meal('2026-06-08', 2_000)], [], GOALS);
    expect(counted).toEqual(EMPTY);
    expect(hasActivity(counted)).toBe(false);
  });

  it('counts a day logged at 0 kcal as logged', () => {
    const counted = tallyWeek('2026-06-01', [meal('2026-06-04', 0)], [], GOALS);
    expect(counted.loggedDays).toBe(1);
    expect(counted.averageKcal).toBe(0);
    expect(hasActivity(counted)).toBe(true);
  });

  it('takes the weight change from the first weigh-in to the last, in time order', () => {
    const readings = [
      // Late on the last day is still in the week (R05.5).
      weighIn('2026-06-07', 23.5, 71.4),
      weighIn('2026-06-01', 7, 72),
      weighIn('2026-06-04', 7, 71.9),
      weighIn('2026-05-31', 23, 80),
      weighIn('2026-06-08', 0.25, 60),
    ];
    const counted = tallyWeek('2026-06-01', [], readings, GOALS);
    expect(counted.weighIns).toBe(3);
    expect(counted.weightChangeKg).toBeCloseTo(-0.6, 9);
    expect(hasActivity(counted)).toBe(true);
  });

  it('gives no change for a single weigh-in', () => {
    const counted = tallyWeek('2026-06-01', [], [weighIn('2026-06-03', 8, 72)], GOALS);
    expect(counted.weighIns).toBe(1);
    expect(counted.weightChangeKg).toBeNull();
  });
});

describe('buildRecap', () => {
  it('puts a late-Sunday meal in different weeks for Monday and Sunday weeks (R05.19)', () => {
    // Sunday 31 May ends a Monday week and starts a Sunday one.
    const entries = [meal('2026-05-31', 1_950, 120)];
    const input = { todayKey: SATURDAY, offset: 0, entries, weighIns: [], goals: GOALS };

    const mondays = buildRecap({ ...input, weekStart: 'mon' });
    expect(mondays.week).toEqual({ first: '2026-06-01', last: '2026-06-07' });
    expect(mondays.tally.loggedDays).toBe(0);
    expect(mondays.before.loggedDays).toBe(1);

    const sundays = buildRecap({ ...input, weekStart: 'sun' });
    expect(sundays.week).toEqual({ first: '2026-05-31', last: '2026-06-06' });
    expect(sundays.tally.loggedDays).toBe(1);
    expect(sundays.before.loggedDays).toBe(0);
  });

  it('sets an earlier week against the one before it and names nothing for a quieter week', () => {
    const recap = buildRecap({
      todayKey: SATURDAY,
      weekStart: 'mon',
      offset: 1,
      entries: [
        meal('2026-05-26', 2_000, 150),
        meal('2026-05-19', 2_000, 150),
        meal('2026-05-20', 2_000, 150),
      ],
      weighIns: [],
      goals: GOALS,
    });
    expect(recap.week).toEqual({ first: '2026-05-25', last: '2026-05-31' });
    expect(recap.tally.loggedDays).toBe(1);
    expect(recap.before.loggedDays).toBe(2);
    expect(recap.highlights).toEqual([]);
  });

  it('counts an average of 1 850 kcal near a 2 000 kcal goal on every day', () => {
    const recap = buildRecap({
      todayKey: SATURDAY,
      weekStart: 'mon',
      offset: 0,
      entries: ['2026-06-02', '2026-06-03', '2026-06-04'].map((day) => meal(day, 1_850)),
      weighIns: [],
      goals: { kcal: 2_000, protein: 0 },
    });
    expect(recap.tally.nearGoalDays).toBe(3);
    expect(recap.tally.averageKcal).toBe(1_850);
    expect(recap.highlights).toEqual([
      { kind: 'run', days: 3 },
      { kind: 'moreNearGoal', more: 3 },
      { kind: 'averageNearGoal' },
    ]);
  });
});

describe('highlightsFor', () => {
  it('names a full week first and leaves out more logged days, which it already says', () => {
    const week = tally({
      loggedDays: 7,
      longestRun: 7,
      nearGoalDays: 6,
      proteinDays: 5,
      averageKcal: 1_980,
    });
    const before = tally({ loggedDays: 4, longestRun: 4, nearGoalDays: 2, proteinDays: 5 });
    expect(highlightsFor(week, before, 2_000)).toEqual([
      { kind: 'everyDay' },
      { kind: 'moreNearGoal', more: 4 },
      { kind: 'averageNearGoal' },
    ]);
  });

  it('keeps the first three in their order when more improved (R05.19, ACC-G8-2)', () => {
    const week = tally({
      loggedDays: 6,
      longestRun: 4,
      nearGoalDays: 4,
      proteinDays: 3,
      averageKcal: 2_050,
    });
    const before = tally({ loggedDays: 2, longestRun: 1, nearGoalDays: 1, proteinDays: 1 });
    const lines = highlightsFor(week, before, 2_000);
    expect(lines).toHaveLength(MAX_HIGHLIGHTS);
    expect(lines).toEqual([
      { kind: 'run', days: 4 },
      { kind: 'moreNearGoal', more: 3 },
      { kind: 'moreProtein', more: 2 },
    ]);
  });

  it('names a run, an average near the goal and more logged days without a full week', () => {
    const week = tally({ loggedDays: 4, longestRun: 3, averageKcal: 2_150 });
    const before = tally({ loggedDays: 3, longestRun: 3 });
    expect(highlightsFor(week, before, 2_000)).toEqual([
      { kind: 'run', days: 3 },
      { kind: 'averageNearGoal' },
      { kind: 'moreLogged', more: 1 },
    ]);
  });

  it('needs three logged days for the average and a run of three (R05.19)', () => {
    const week = tally({ loggedDays: 2, longestRun: 2, averageKcal: 2_000 });
    expect(highlightsFor(week, week, 2_000)).toEqual([]);
  });

  it('never names a step back (ACC-G8-2)', () => {
    const week = tally({
      loggedDays: 3,
      longestRun: 1,
      nearGoalDays: 1,
      proteinDays: 0,
      averageKcal: 2_600,
    });
    const before = tally({ loggedDays: 5, longestRun: 5, nearGoalDays: 3, proteinDays: 2 });
    expect(highlightsFor(week, before, 2_000)).toEqual([]);
  });

  it('calls no average near a goal of 0', () => {
    const week = tally({ loggedDays: 3, longestRun: 1, averageKcal: 0 });
    expect(highlightsFor(week, week, 0)).toEqual([]);
  });
});
