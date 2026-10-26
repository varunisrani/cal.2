import { describe, expect, it } from 'vitest';
import { inTimeZone } from '../../test/time';
import { addDays, startOfDay, type DayKey } from '../dates/dayKey';
import { FIXTURE_TODAY, defaultProfile } from '../goals/__fixtures__/profiles';
import { tdee } from '../goals/formulas';
import type { Profile, WeighIn } from '../model';
import { daysToGoalWeight, forecastWeight, weeklySlopeKg, type ForecastInput } from './forecast';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TODAY = FIXTURE_TODAY; // 2026-10-26; the food window is 2026-07-28 … 2026-10-25
const ago = (days: number): DayKey => addDays(TODAY, -days);

/** Whole-kcal TDEE of the default profile on the fixture day (2 452.04 cut, P01-12). */
const BURN = 2_452;

const food = (dayKey: DayKey, kcal: number) => ({ dayKey, kcal });

function weighIn(dayKey: DayKey, hour: number, kg: number): Pick<WeighIn, 'at' | 'kg'> {
  return { at: startOfDay(dayKey) + hour * HOUR, kg };
}

function run(input: Partial<ForecastInput>) {
  return forecastWeight({
    profile: defaultProfile,
    entries: [],
    weighIns: [],
    today: TODAY,
    ...input,
  });
}

describe('forecastWeight: average intake', () => {
  it("averages 1 400 two days ago and 1 600 yesterday as 1 500 over 2 days, leaving out today's 300 (R01.16)", () => {
    const forecast = run({
      entries: [food(ago(2), 1_400), food(ago(1), 1_600), food(TODAY, 300)],
      weighIns: [weighIn(ago(2), 7, 70.5), weighIn(ago(1), 7, 70.4), weighIn(TODAY, 7, 70.3)],
    });
    expect(forecast.avgKcal).toBe(1_500);
    expect(forecast.loggedDays).toBe(2);
    expect(forecast.weighInsUsed).toBe(3);
    expect(forecast.enoughData).toBe(true);
  });

  it('divides the total by the logged days with integer division', () => {
    expect(run({ entries: [food(ago(1), 1_000), food(ago(2), 1_001)] }).avgKcal).toBe(1_000);
  });

  it('counts a day with several entries once', () => {
    const forecast = run({
      entries: [food(ago(1), 500), food(ago(1), 700), food(ago(2), 1_200)],
    });
    expect([forecast.loggedDays, forecast.avgKcal]).toEqual([2, 1_200]);
  });

  it('gives 0 without a logged day, so the balance is minus the whole TDEE', () => {
    const forecast = run({});
    expect([forecast.avgKcal, forecast.loggedDays, forecast.balance]).toEqual([0, 0, -BURN]);
    expect(forecast.predictedWeeklyKg).toBeCloseTo((-BURN * 7) / 7_700, 12);
  });

  it('leaves out food from before the window and after today', () => {
    const forecast = run({ entries: [food('2026-07-27', 2_000), food(ago(-1), 2_000)] });
    expect(forecast.loggedDays).toBe(0);
    expect(run({ entries: [food('2026-07-28', 2_000)] }).loggedDays).toBe(1);
  });
});

describe('forecastWeight: prediction', () => {
  it('subtracts the whole-kcal TDEE: 550 kcal a day under it is 0.5 kg a week', () => {
    expect(Math.trunc(tdee(defaultProfile, TODAY))).toBe(BURN);
    const forecast = run({ entries: [food(ago(1), BURN - 550), food(ago(2), BURN - 550)] });
    expect([forecast.tdee, forecast.balance]).toEqual([BURN, -550]);
    expect(forecast.predictedWeeklyKg).toBeCloseTo(-0.5, 12);
  });

  it('projects the weight at 30, 60 and 90 days from the newest weigh-in', () => {
    const forecast = run({
      entries: [food(ago(1), BURN - 550), food(ago(2), BURN - 550)],
      weighIns: [weighIn(ago(9), 7, 81), weighIn(ago(1), 7, 80)],
    });
    expect(forecast.currentKg).toBe(80);
    expect(forecast.expectedKg.in30).toBeCloseTo(80 - (0.5 * 30) / 7, 10);
    expect(forecast.expectedKg.in60).toBeCloseTo(80 - (0.5 * 60) / 7, 10);
    expect(forecast.expectedKg.in90).toBeCloseTo(80 - (0.5 * 90) / 7, 10);
  });
});

describe('weeklySlopeKg', () => {
  const line = (perWeek: number) =>
    Array.from({ length: 22 }, (_, d) => ({
      at: startOfDay(ago(21)) + d * DAY,
      kg: 70 + (perWeek * d) / 7,
    }));

  it('gives 0.5 for a straight line rising 0.5 kg a week', () => {
    expect(weeklySlopeKg(line(0.5))).toBeCloseTo(0.5, 10);
  });

  it('gives -0.5 for a falling line, whatever the order of the points', () => {
    expect(weeklySlopeKg([...line(-0.5)].reverse())).toBeCloseTo(-0.5, 10);
  });

  it('gives null for one point or for points at one instant', () => {
    const at = startOfDay(ago(3));
    expect(weeklySlopeKg([])).toBeNull();
    expect(weeklySlopeKg([{ at, kg: 80 }])).toBeNull();
    expect(
      weeklySlopeKg([
        { at, kg: 80 },
        { at, kg: 81 },
      ]),
    ).toBeNull();
  });
});

describe('forecastWeight: observed trend and current weight', () => {
  it('fits only the weigh-ins from the window start through today', () => {
    const forecast = run({
      weighIns: [
        weighIn('2026-07-01', 7, 120),
        weighIn(ago(14), 7, 81),
        weighIn(ago(7), 7, 80.5),
        weighIn(TODAY, 7, 80),
      ],
    });
    expect(forecast.weighInsUsed).toBe(3);
    expect(forecast.observedWeeklyKg).toBeCloseTo(-0.5, 10);
  });

  it('takes the newest weigh-in as the current weight, even one older than the window', () => {
    const forecast = run({
      weighIns: [weighIn('2026-05-01', 7, 90), weighIn('2026-04-01', 7, 91)],
    });
    expect(forecast.currentKg).toBe(90);
    expect(forecast.weighInsUsed).toBe(0);
    expect(forecast.observedWeeklyKg).toBeNull();
  });

  it('falls back to the profile weight without weigh-ins', () => {
    expect(run({}).currentKg).toBe(70);
  });
});

describe('forecastWeight: days to goal', () => {
  const losing: Profile = { ...defaultProfile, goal: 'lose', weeklyKg: 0.5, goalWeightKg: 75 };
  const burn = Math.trunc(tdee(losing, TODAY));
  const deficit = [food(ago(1), burn - 550), food(ago(2), burn - 550)];

  it('gives 70 days for 5 kg to lose at -0.5 kg a week, and the day that lands on', () => {
    const forecast = run({ profile: losing, entries: deficit, weighIns: [weighIn(ago(1), 7, 80)] });
    expect(forecast.predictedWeeklyKg).toBeCloseTo(-0.5, 12);
    expect(forecast.daysToGoal).toBe(70);
    expect(forecast.goalDay).toBe('2027-01-04');
  });

  it('gives none when the prediction moves away from the goal', () => {
    const surplus = [food(ago(1), burn + 550), food(ago(2), burn + 550)];
    const up = run({ profile: losing, entries: surplus, weighIns: [weighIn(ago(1), 7, 80)] });
    expect([up.daysToGoal, up.goalDay]).toEqual([null, null]);
    const below = run({ profile: losing, entries: deficit, weighIns: [weighIn(ago(1), 7, 74)] });
    expect(below.daysToGoal).toBeNull();
  });

  it('gives none for maintain, without a goal weight, or at a zero prediction', () => {
    const scale = [weighIn(ago(1), 7, 80)];
    const maintaining = { ...losing, goal: 'maintain' as const };
    const noTarget: Profile = { ...losing, goalWeightKg: undefined };
    expect(run({ profile: maintaining, entries: deficit, weighIns: scale }).daysToGoal).toBeNull();
    expect(run({ profile: noTarget, entries: deficit, weighIns: scale }).daysToGoal).toBeNull();
    const even = [food(ago(1), burn), food(ago(2), burn)];
    expect(run({ profile: losing, entries: even, weighIns: scale }).daysToGoal).toBeNull();
  });

  it('mirrors lose for gain', () => {
    expect(daysToGoalWeight('gain', 75, 70, 0.5)).toBe(70);
    expect(daysToGoalWeight('gain', 75, 70, -0.5)).toBeNull();
    expect(daysToGoalWeight('gain', 65, 70, 0.5)).toBeNull();
    expect(daysToGoalWeight('lose', 75, 70, -0.5)).toBeNull();
  });

  it('rounds to the nearest whole day', () => {
    expect(daysToGoalWeight('lose', 79, 80, -0.3)).toBe(23);
    expect(daysToGoalWeight('lose', 79, 80, -0.4)).toBe(18);
  });
});

describe('forecastWeight: enough data and the under-logging hint', () => {
  const twoDays = [food(ago(1), BURN), food(ago(2), BURN)];

  it('is not enough data with one weigh-in', () => {
    const forecast = run({ entries: twoDays, weighIns: [weighIn(ago(1), 7, 80)] });
    expect([forecast.enoughData, forecast.trendsDisagree]).toEqual([false, false]);
  });

  it('is not enough data with one food day', () => {
    const scale = [weighIn(ago(7), 7, 80), weighIn(TODAY, 7, 79)];
    const forecast = run({ entries: [food(ago(1), BURN)], weighIns: scale });
    expect([forecast.enoughData, forecast.trendsDisagree]).toEqual([false, false]);
  });

  it('flags trends 0.31 kg a week apart but not 0.29', () => {
    const scale = (gain: number) => [weighIn(ago(7), 7, 70), weighIn(TODAY, 7, 70 + gain)];
    const apart = run({ entries: twoDays, weighIns: scale(0.31) });
    expect(apart.predictedWeeklyKg).toBe(0);
    expect(apart.observedWeeklyKg).toBeCloseTo(0.31, 10);
    expect(apart.trendsDisagree).toBe(true);
    const close = run({ entries: twoDays, weighIns: scale(0.29) });
    expect(close.observedWeeklyKg).toBeCloseTo(0.29, 10);
    expect(close.trendsDisagree).toBe(false);
  });

  it('gives no hint without an observed trend', () => {
    const at = startOfDay(ago(1)) + 7 * HOUR;
    const sameInstant = [
      { at, kg: 70 },
      { at, kg: 72 },
    ];
    const forecast = run({ entries: twoDays, weighIns: sameInstant });
    expect([forecast.enoughData, forecast.observedWeeklyKg]).toEqual([true, null]);
    expect(forecast.trendsDisagree).toBe(false);
  });
});

describe('forecastWeight: day boundaries', () => {
  for (const zone of ['America/New_York', 'Asia/Tokyo']) {
    it(`fits weigh-ins from the first window day through the end of today in ${zone}`, () => {
      inTimeZone(zone, () => {
        const opens = startOfDay('2026-07-28');
        const closes = startOfDay(ago(-1));
        const forecast = run({
          entries: [food(ago(1), 2_000), food('2026-07-28', 1_000), food(TODAY, 300)],
          weighIns: [
            { at: opens - 1, kg: 90 },
            { at: opens, kg: 82 },
            { at: closes - 1, kg: 80 },
            { at: closes, kg: 60 },
          ],
        });
        expect([forecast.loggedDays, forecast.avgKcal]).toEqual([2, 1_500]);
        expect(forecast.weighInsUsed).toBe(2);
        expect(forecast.currentKg).toBe(60);
      });
    });
  }
});
