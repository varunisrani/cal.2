import { describe, expect, it } from 'vitest';
import { addDays, startOfDay, type DayKey } from '../dates/dayKey';
import { FIXTURE_TODAY, defaultProfile, profileWith } from '../goals/__fixtures__/profiles';
import type { DiaryEntry, Profile, WeighIn } from '../model';
import {
  daysToTarget,
  forecastWeight,
  weeklyTrend,
  DISAGREE_KG_PER_WEEK,
  FORECAST_MIN_FOOD_DAYS,
  FORECAST_MIN_WEIGH_INS,
  type ForecastInput,
  type WeightForecast,
} from './forecast';

const HOUR = 3_600_000;
const today = FIXTURE_TODAY;
const daysAgo = (n: number): DayKey => addDays(today, -n);
const on = (day: DayKey, hours = 9): number => startOfDay(day) + hours * HOUR;

/** The default profile burns 2 452.04 kcal a day, so maintenance is 2 452. */
const MAINTENANCE = 2452;

let counter = 0;
function entry(day: DayKey, kcal: number): DiaryEntry {
  counter += 1;
  return {
    id: `entry-${counter}`,
    name: 'Rice bowl',
    kcal,
    protein: 20,
    carbs: 60,
    fat: 10,
    nutrients: {},
    extras: {},
    basis: { kind: 'grams', grams: 300 },
    units: [],
    lines: [],
    progressive: false,
    loggedAt: on(day, 12),
    dayKey: day,
    meal: 'lunch',
    source: 'manual',
    photoIds: [],
  };
}

function weighIn(at: number, kg: number): WeighIn {
  counter += 1;
  return { id: `weigh-${counter}`, at, kg };
}

/** Two finished days eating `kcal` each. */
const eating = (kcal: number): DiaryEntry[] => [entry(daysAgo(2), kcal), entry(daysAgo(1), kcal)];

function forecast(changes: Partial<ForecastInput> = {}): WeightForecast {
  return forecastWeight({ profile: defaultProfile, entries: [], weighIns: [], today, ...changes });
}

describe('forecastWeight: intake', () => {
  it('averages 1 500 over 2 days from 1 400 two days ago, 1 600 yesterday and 300 today', () => {
    const result = forecast({
      entries: [entry(daysAgo(2), 1400), entry(daysAgo(1), 1600), entry(today, 300)],
      weighIns: [
        weighIn(on(daysAgo(2)), 82.1),
        weighIn(on(daysAgo(1)), 81.8),
        weighIn(on(today), 81.9),
      ],
    });
    expect(result).toMatchObject({
      avgKcal: 1500,
      daysLogged: 2,
      weighInsUsed: 3,
      enoughData: true,
    });
  });

  it('divides the total by the logged days with integer division', () => {
    const result = forecast({ entries: [entry(daysAgo(2), 1401), entry(daysAgo(1), 1600)] });
    expect(result.avgKcal).toBe(1500);
  });

  it('counts several entries of one day as one logged day', () => {
    const result = forecast({ entries: [entry(daysAgo(1), 700), entry(daysAgo(1), 800)] });
    expect(result).toMatchObject({ daysLogged: 1, avgKcal: 1500 });
  });

  it('gives an average of 0 with no logged days, and ignores food outside the 90 finished days', () => {
    const result = forecast({
      entries: [entry(daysAgo(91), 2000), entry(addDays(today, 1), 2000)],
    });
    expect(result).toMatchObject({ daysLogged: 0, avgKcal: 0 });
  });

  it('balances against the formula burn cut to whole kcal', () => {
    const result = forecast({ entries: eating(1500) });
    expect(result.maintenanceKcal).toBe(MAINTENANCE);
    expect(result.balanceKcal).toBe(1500 - MAINTENANCE);
    expect(result.predictedWeeklyKg).toBeCloseTo((-952 * 7) / 7700, 12);
  });
});

describe('forecastWeight: projection', () => {
  it('projects −0.5 kg a week for 550 kcal under maintenance, at 30, 60 and 90 days', () => {
    const result = forecast({
      entries: eating(MAINTENANCE - 550),
      weighIns: [weighIn(on(daysAgo(3)), 80)],
    });
    expect(result.predictedWeeklyKg).toBeCloseTo(-0.5, 12);
    expect(result.currentKg).toBe(80);
    expect(result.expectedKg.d30).toBeCloseTo(80 - (0.5 * 30) / 7, 10);
    expect(result.expectedKg.d60).toBeCloseTo(80 - (0.5 * 60) / 7, 10);
    expect(result.expectedKg.d90).toBeCloseTo(80 - (0.5 * 90) / 7, 10);
  });

  it('takes the newest weigh-in as the current weight, else the profile weight', () => {
    const readings = [weighIn(on(daysAgo(1)), 79.4), weighIn(on(daysAgo(5)), 80.2)];
    expect(forecast({ weighIns: readings }).currentKg).toBe(79.4);
    expect(forecast().currentKg).toBe(defaultProfile.weightKg);
  });
});

describe('forecastWeight: observed pace', () => {
  it('fits the slope of a straight 0.5 kg/week line', () => {
    const rising = [
      weighIn(on(daysAgo(14)), 80),
      weighIn(on(daysAgo(7)), 80.5),
      weighIn(on(today), 81),
    ];
    expect(forecast({ weighIns: rising }).observedWeeklyKg).toBeCloseTo(0.5, 10);
    const falling = rising.map((reading, index) => ({ ...reading, kg: 81 - index * 0.5 }));
    expect(forecast({ weighIns: falling }).observedWeeklyKg).toBeCloseTo(-0.5, 10);
  });

  it('fits a least-squares line through scattered readings', () => {
    // Days 0, 7, 14 at 80.0, 80.2, 79.4: slope −0.3 kg a week.
    const readings = [
      weighIn(on(daysAgo(14)), 80),
      weighIn(on(daysAgo(7)), 80.2),
      weighIn(on(today), 79.4),
    ];
    expect(weeklyTrend(readings)).toBeCloseTo(-0.3, 10);
  });

  it('has no observed pace with one weigh-in or with two at the same instant', () => {
    expect(forecast({ weighIns: [weighIn(on(daysAgo(2)), 80)] }).observedWeeklyKg).toBeNull();
    const at = on(daysAgo(2));
    expect(weeklyTrend([weighIn(at, 80), weighIn(at, 81)])).toBeNull();
    expect(weeklyTrend([])).toBeNull();
  });

  it('uses weigh-ins from the window start through the end of today only', () => {
    const result = forecast({
      weighIns: [
        weighIn(on(daysAgo(91)), 90),
        weighIn(on(daysAgo(90)), 80),
        weighIn(on(today, 23), 79),
        weighIn(on(addDays(today, 1)), 60),
      ],
    });
    expect(result.weighInsUsed).toBe(2);
    expect(result.observedWeeklyKg).toBeLessThan(0);
    expect(result.observedWeeklyKg).toBeGreaterThan(-0.1);
  });
});

describe('forecastWeight: days to goal', () => {
  const losing = (goalWeightKg?: number): Profile =>
    profileWith({ goal: 'lose', weeklyKg: 0.5, ...(goalWeightKg ? { goalWeightKg } : {}) });
  const at80 = [weighIn(on(daysAgo(1)), 80)];

  it('counts the days for lose moving down: 5 kg at 0.5 kg a week is 70 days', () => {
    const result = forecast({
      profile: losing(75),
      entries: eating(MAINTENANCE - 550),
      weighIns: at80,
    });
    expect(result.daysToGoal).toBe(70);
    expect(result.goalDay).toBe('2027-01-04');
  });

  it('counts the days for gain moving up', () => {
    const gaining = profileWith({ goal: 'gain', weeklyKg: 0.5, goalWeightKg: 82 });
    const result = forecast({
      profile: gaining,
      entries: eating(MAINTENANCE + 550),
      weighIns: at80,
    });
    expect(result.daysToGoal).toBe(28);
    expect(result.goalDay).toBe(addDays(today, 28));
  });

  it('has none when the pace moves away from the goal', () => {
    const away = forecast({
      profile: losing(75),
      entries: eating(MAINTENANCE + 550),
      weighIns: at80,
    });
    expect(away.daysToGoal).toBeNull();
    expect(away.goalDay).toBeNull();
  });

  it('has none for a target on the wrong side, maintain, no target, or an even balance', () => {
    expect(daysToTarget('lose', 85, 80, -0.5)).toBeNull();
    expect(daysToTarget('gain', 75, 80, 0.5)).toBeNull();
    expect(daysToTarget('maintain', 75, 80, -0.5)).toBeNull();
    expect(daysToTarget('lose', undefined, 80, -0.5)).toBeNull();
    expect(daysToTarget('lose', 75, 80, 0)).toBeNull();
    expect(daysToTarget('lose', 75, 80, -0.5)).toBe(70);
  });

  it('rounds to whole days', () => {
    // 1 kg at 0.3 kg a week is 23.33 days.
    expect(daysToTarget('lose', 79, 80, -0.3)).toBe(23);
    // 1 kg at 0.4 kg a week is 17.5 days.
    expect(daysToTarget('gain', 81, 80, 0.4)).toBe(18);
  });
});

describe('forecastWeight: enough data', () => {
  it(`needs ${FORECAST_MIN_FOOD_DAYS} logged days and ${FORECAST_MIN_WEIGH_INS} weigh-ins`, () => {
    const two = [weighIn(on(daysAgo(7)), 80), weighIn(on(daysAgo(1)), 79.8)];
    expect(forecast({ entries: eating(2000), weighIns: two }).enoughData).toBe(true);
    expect(forecast({ entries: eating(2000), weighIns: two.slice(1) }).enoughData).toBe(false);
    expect(forecast({ entries: [entry(daysAgo(1), 2000)], weighIns: two }).enoughData).toBe(false);
  });
});

describe('forecastWeight: under-logging hint', () => {
  /** Eating at maintenance (projected pace 0) with a scale rising by `kg` over one week. */
  const rising = (kg: number, entries = eating(MAINTENANCE)): WeightForecast =>
    forecast({ entries, weighIns: [weighIn(on(daysAgo(7)), 80), weighIn(on(today), 80 + kg)] });

  it(`flags paces ${DISAGREE_KG_PER_WEEK} kg a week apart: at 0.31 but not at 0.29`, () => {
    expect(rising(0.31).predictedWeeklyKg).toBe(0);
    expect(rising(0.31).observedWeeklyKg).toBeCloseTo(0.31, 10);
    expect(rising(0.31).trendsDisagree).toBe(true);
    expect(rising(0.29).trendsDisagree).toBe(false);
  });

  it('never flags without enough data', () => {
    expect(rising(1, [entry(daysAgo(1), MAINTENANCE)]).trendsDisagree).toBe(false);
    const single = forecast({ entries: eating(1000), weighIns: [weighIn(on(today), 80)] });
    expect(single.trendsDisagree).toBe(false);
  });
});
