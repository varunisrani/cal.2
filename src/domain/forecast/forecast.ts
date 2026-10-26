// The weight forecast the Coach quotes: plain energy balance, no AI. What the person ate on the
// finished days of the evidence window, against the formula burn, gives a projected pace at
// 7 700 kcal per kg; a least-squares line through the weigh-ins gives the pace the scale shows.
// When both exist and differ by more than 0.3 kg a week, the food log is probably missing
// something (the under-logging hint). Today's food is left out (it is still being logged);
// today's weigh-ins are complete readings and count.

import { addDays, type DayKey } from '../dates/dayKey';
import { inDays } from '../dates/ranges';
import { KCAL_PER_KG, tdee } from '../goals/formulas';
import { div } from '../goals/integers';
import type { DiaryEntry, Profile, WeighIn } from '../model';
import { latestWeighIn } from '../trackers/goalCrossing';
import { completedWindow, inWindow } from './evidence';

/** Logged food days and weigh-ins the forecast needs before the Coach may rely on it. */
export const FORECAST_MIN_FOOD_DAYS = 2;
export const FORECAST_MIN_WEIGH_INS = 2;

/** Projected and observed paces further apart than this (kg a week) suggest under-logging. */
export const DISAGREE_KG_PER_WEEK = 0.3;

const SECONDS_PER_WEEK = 86_400 * 7;

export interface ForecastInput {
  profile: Profile;
  entries: readonly DiaryEntry[];
  weighIns: readonly WeighIn[];
  today: DayKey;
}

/** Weight expected after 30, 60 and 90 days at the projected pace, in kg. */
export interface ExpectedWeights {
  d30: number;
  d60: number;
  d90: number;
}

export interface WeightForecast {
  /** Finished days in the window with at least one entry. */
  daysLogged: number;
  /** Whole kcal: total over those days div their count; 0 when none. */
  avgKcal: number;
  /** The formula burn cut to whole kcal. */
  maintenanceKcal: number;
  /** avgKcal − maintenanceKcal: below 0 is a deficit. */
  balanceKcal: number;
  /** kg a week the balance projects. */
  predictedWeeklyKg: number;
  /** kg a week the weigh-ins show; null with fewer than two or all at one instant. */
  observedWeeklyKg: number | null;
  /** Weigh-ins from the window start through today. */
  weighInsUsed: number;
  /** The newest weigh-in, else the profile weight. */
  currentKg: number;
  expectedKg: ExpectedWeights;
  /** Days until the goal weight at the projected pace; null when it is not being approached. */
  daysToGoal: number | null;
  /** today + daysToGoal on the calendar. */
  goalDay: DayKey | null;
  enoughData: boolean;
  /** Under-logging hint: enough data, an observed pace, and the two paces far apart. */
  trendsDisagree: boolean;
}

/**
 * The slope of the least-squares line of kg against time, in kg a week. Null for fewer than two
 * readings or when they share one instant (no spread in time to fit against).
 */
export function weeklyTrend(readings: readonly Pick<WeighIn, 'at' | 'kg'>[]): number | null {
  const [head] = readings;
  if (readings.length < 2 || head === undefined) return null;
  if (readings.every((reading) => reading.at === head.at)) return null;
  // Seconds measured from the first reading keep the numbers small.
  const xs = readings.map((reading) => (reading.at - head.at) / 1000);
  const ys = readings.map((reading) => reading.kg);
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  let covariance = 0;
  let spread = 0;
  xs.forEach((x, index) => {
    const dx = x - meanX;
    covariance += dx * ((ys[index] ?? meanY) - meanY);
    spread += dx * dx;
  });
  if (spread === 0) return null;
  return (covariance / spread) * SECONDS_PER_WEEK;
}

/**
 * Days until `targetKg` at `weeklyKg`, or null unless the goal is lose or gain and the pace moves
 * toward a target on the right side: lose needs a falling pace and a lower target, gain a rising
 * pace and a higher one.
 */
export function daysToTarget(
  goal: Profile['goal'],
  targetKg: number | undefined,
  currentKg: number,
  weeklyKg: number,
): number | null {
  if (targetKg === undefined || goal === 'maintain' || weeklyKg === 0) return null;
  const remaining = targetKg - currentKg;
  const towards = goal === 'lose' ? weeklyKg < 0 && remaining < 0 : weeklyKg > 0 && remaining > 0;
  if (!towards) return null;
  return Math.round((Math.abs(remaining) * 7) / Math.abs(weeklyKg));
}

/** The forecast on `today`. */
export function forecastWeight(input: ForecastInput): WeightForecast {
  const { profile, today } = input;
  const food = completedWindow(today);

  const loggedDays = new Set<DayKey>();
  let totalKcal = 0;
  for (const entry of input.entries) {
    if (!inWindow(entry.dayKey, food)) continue;
    loggedDays.add(entry.dayKey);
    totalKcal += entry.kcal;
  }
  const daysLogged = loggedDays.size;
  const avgKcal = daysLogged > 0 ? div(totalKcal, daysLogged) : 0;

  const maintenanceKcal = Math.trunc(tdee(profile, today));
  const balanceKcal = avgKcal - maintenanceKcal;
  const predictedWeeklyKg = (balanceKcal * 7) / KCAL_PER_KG;

  const currentKg = latestWeighIn(input.weighIns)?.kg ?? profile.weightKg;
  const used = input.weighIns.filter((reading) => inDays(reading.at, food.first, today));
  const observedWeeklyKg = weeklyTrend(used);

  const expectedAfter = (days: number): number => currentKg + (predictedWeeklyKg * days) / 7;
  const daysToGoal = daysToTarget(profile.goal, profile.goalWeightKg, currentKg, predictedWeeklyKg);
  const enoughData = daysLogged >= FORECAST_MIN_FOOD_DAYS && used.length >= FORECAST_MIN_WEIGH_INS;

  return {
    daysLogged,
    avgKcal,
    maintenanceKcal,
    balanceKcal,
    predictedWeeklyKg,
    observedWeeklyKg,
    weighInsUsed: used.length,
    currentKg,
    expectedKg: { d30: expectedAfter(30), d60: expectedAfter(60), d90: expectedAfter(90) },
    daysToGoal,
    goalDay: daysToGoal === null ? null : addDays(today, daysToGoal),
    enoughData,
    trendsDisagree:
      enoughData &&
      observedWeeklyKg !== null &&
      Math.abs(predictedWeeklyKg - observedWeeklyKg) > DISAGREE_KG_PER_WEEK,
  };
}
