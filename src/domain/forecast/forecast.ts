// Where the person's weight is heading, from energy balance and from the scale (01 §3.12). Pure
// maths for the Coach context; Progress does not show it.
//
// Intake is averaged over the days that have entries among the 90 finished days ending
// yesterday: an empty day is unknown, not 0 kcal, and today is still in progress (R01.16). The
// prediction is (average − whole TDEE) × 7 ÷ 7 700 kg a week. The observed trend is a straight
// line fitted through the weigh-ins from the window start through today. When both exist and
// differ by more than 0.3 kg a week, the log probably misses food (the under-logging hint).

import { addDays, type DayKey } from '../dates/dayKey';
import { inDays } from '../dates/ranges';
import { KCAL_PER_KG, intDiv, tdee } from '../goals/formulas';
import type { DiaryEntry, Profile, WeighIn } from '../model';
import { latestByTime } from '../trackers/goalCrossing';
import { finishedDays, keyInWindow } from './evidence';

/** Predicted and observed weekly change may differ by this much (kg) before the hint shows. */
export const DISAGREE_KG_PER_WEEK = 0.3;

/** A forecast needs at least this many logged food days and weigh-ins in the window. */
export const MIN_FOOD_DAYS = 2;
export const MIN_WEIGH_INS = 2;

const MS_PER_DAY = 86_400_000;

export interface ForecastInput {
  profile: Profile;
  entries: readonly Pick<DiaryEntry, 'dayKey' | 'kcal'>[];
  weighIns: readonly Pick<WeighIn, 'at' | 'kg'>[];
  /** The local day the forecast is made on. */
  today: DayKey;
}

export interface WeightForecast {
  /** Whole kcal: total ÷ logged days (integer division), 0 without a logged day. */
  avgKcal: number;
  /** Distinct days with entries in the window. */
  loggedDays: number;
  /** Whole kcal (cut). */
  tdee: number;
  /** avgKcal − tdee; below 0 is a deficit. */
  balance: number;
  /** balance × 7 ÷ 7 700. */
  predictedWeeklyKg: number;
  /** From the fitted line; `null` with fewer than two weigh-ins or all at one instant. */
  observedWeeklyKg: number | null;
  /** Weigh-ins from the window start through today. */
  weighInsUsed: number;
  /** The newest weigh-in, else the profile weight. */
  currentKg: number;
  /** currentKg + predictedWeeklyKg × days ÷ 7. */
  expectedKg: { in30: number; in60: number; in90: number };
  /** Days to the goal weight at the predicted pace; `null` unless heading toward it. */
  daysToGoal: number | null;
  /** today + daysToGoal. */
  goalDay: DayKey | null;
  enoughData: boolean;
  /** Under-logging hint. */
  trendsDisagree: boolean;
}

/**
 * Least-squares slope of weight against time, in kg per week. `null` for fewer than two points or
 * when every point is at the same instant.
 */
export function weeklySlopeKg(points: readonly Pick<WeighIn, 'at' | 'kg'>[]): number | null {
  if (points.length < 2) return null;
  // Time in days, so the slope comes out in kg a day.
  const dayOf = (point: Pick<WeighIn, 'at'>): number => point.at / MS_PER_DAY;
  const dayMean = points.reduce((sum, point) => sum + dayOf(point), 0) / points.length;
  const kgMean = points.reduce((sum, point) => sum + point.kg, 0) / points.length;
  let spread = 0;
  let together = 0;
  for (const point of points) {
    const offset = dayOf(point) - dayMean;
    spread += offset * offset;
    together += offset * (point.kg - kgMean);
  }
  if (spread === 0) return null;
  return (together / spread) * 7;
}

/**
 * Days until `goalKg` at `weeklyKg`, or null: needs lose with a falling prediction and a goal
 * below the current weight, or gain mirrored. Maintain and a zero prediction never qualify.
 */
export function daysToGoalWeight(
  goal: Profile['goal'],
  goalKg: number | undefined,
  currentKg: number,
  weeklyKg: number,
): number | null {
  if (goalKg === undefined || weeklyKg === 0) return null;
  const heading =
    goal === 'lose'
      ? weeklyKg < 0 && goalKg < currentKg
      : goal === 'gain' && weeklyKg > 0 && goalKg > currentKg;
  if (!heading) return null;
  return Math.round((Math.abs(goalKg - currentKg) * 7) / Math.abs(weeklyKg));
}

/** The forecast for `today`. */
export function forecastWeight(input: ForecastInput): WeightForecast {
  const { profile, today } = input;
  const window = finishedDays(today);

  const counted = input.entries.filter((entry) => keyInWindow(entry.dayKey, window));
  const loggedDays = new Set(counted.map((entry) => entry.dayKey)).size;
  const totalKcal = counted.reduce((sum, entry) => sum + entry.kcal, 0);
  const avgKcal = loggedDays > 0 ? intDiv(totalKcal, loggedDays) : 0;

  const burn = Math.trunc(tdee(profile, today));
  const balance = avgKcal - burn;
  const predictedWeeklyKg = (balance * 7) / KCAL_PER_KG;

  const currentKg = latestByTime(input.weighIns)?.kg ?? profile.weightKg;
  const recent = input.weighIns.filter((reading) => inDays(reading.at, window.first, today));
  const observedWeeklyKg = weeklySlopeKg(recent);

  const ahead = (days: number): number => currentKg + (predictedWeeklyKg * days) / 7;
  const daysToGoal = daysToGoalWeight(
    profile.goal,
    profile.goalWeightKg,
    currentKg,
    predictedWeeklyKg,
  );
  const enoughData = loggedDays >= MIN_FOOD_DAYS && recent.length >= MIN_WEIGH_INS;

  return {
    avgKcal,
    loggedDays,
    tdee: burn,
    balance,
    predictedWeeklyKg,
    observedWeeklyKg,
    weighInsUsed: recent.length,
    currentKg,
    expectedKg: { in30: ahead(30), in60: ahead(60), in90: ahead(90) },
    daysToGoal,
    goalDay: daysToGoal === null ? null : addDays(today, daysToGoal),
    enoughData,
    trendsDisagree:
      enoughData &&
      observedWeeklyKg !== null &&
      Math.abs(predictedWeeklyKg - observedWeeklyKg) > DISAGREE_KG_PER_WEEK,
  };
}
