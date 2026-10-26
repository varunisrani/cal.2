// The evidence pack sent with a plan request: what the person ate and weighed, as numbers and
// dates only (01 §3.8). P03-16 turns it into prompt text.
//
// Rules worth knowing (R01.16):
// - food is read over the 90 finished days ending yesterday; today's diary is still being filled
//   in and would look like under-eating, so it never counts;
// - a day without entries is unknown, not a zero-kcal day: its row has no numbers at all;
// - nothing that identifies a food (name, note, photo, ingredient, product) is copied into the
//   pack, and v1 has no workout input, so no burn estimate can feed back into a plan.
//
// Weigh-ins and body-fat readings are moments in time, so their dated lists may include today;
// the per-period signal counts cover exactly N finished days and leave today out.
//
// Later phases bring workouts, body measurements and measured energy as optional fields of
// `EvidenceInput`; until then the energy share of the confidence score is 0.

import { addDays, dayKeyOf, daysBetween, type DayKey } from '../dates/dayKey';
import { inDays, windowEnding, type DayWindow } from '../dates/ranges';
import { effectiveTargets } from '../goals/targets';
import type { BodyFatReading, DiaryEntry, Profile, WeighIn } from '../model';

/** Finished days of food the pack and the forecast look at. */
export const LOOKBACK_DAYS = 90;

/** The summary periods, in days. */
export const EVIDENCE_PERIODS = [7, 14, 28, 90] as const;

/** Coverage never measures a day against less than this many kcal. */
export const COVERAGE_FLOOR_KCAL = 800;

/** Days the nutrition share of the confidence score looks back over, and its top score. */
const CONFIDENCE_DAYS = 28;
const NUTRITION_POINTS = 55;

/** How many rows the dated detail keeps (newest), with a count of the older ones. */
const LOGGED_DAY_ROWS = 45;
const READING_ROWS = 30;

/** Whether a day's log looks complete. `none` means no entries: intake unknown. */
export type DayCoverage = 'none' | 'partial' | 'full';

/** The fields of an entry the pack reads. A full `DiaryEntry` fits; only numbers are copied. */
export type EvidenceFood = Pick<DiaryEntry, 'dayKey' | 'kcal' | 'protein' | 'carbs' | 'fat'> & {
  nutrients: Pick<DiaryEntry['nutrients'], 'fibre'>;
};

export interface EvidenceInput {
  profile: Profile;
  entries: readonly EvidenceFood[];
  weighIns: readonly Pick<WeighIn, 'at' | 'kg'>[];
  bodyFat: readonly Pick<BodyFatReading, 'at' | 'fraction'>[];
  /** The local day the request is made on. */
  today: DayKey;
}

/** A day with no entries. It has no numbers on purpose: nothing can read it as 0 kcal. */
export interface UnloggedDay {
  day: DayKey;
  coverage: 'none';
}

/** A day with at least one entry. */
export interface LoggedDay {
  day: DayKey;
  coverage: 'partial' | 'full';
  kcal: number;
  /** Grams, summed and not rounded (as are carbs and fat). */
  protein: number;
  carbs: number;
  fat: number;
  /** Fibre summed over the entries that recorded it; `null` when none did. */
  fibre: number | null;
  /** Entries that recorded fibre ("known in fibreLogs of logs"). */
  fibreLogs: number;
  logs: number;
}

export type EvidenceDay = UnloggedDay | LoggedDay;

export interface NutritionPeriod {
  days: number;
  loggedDays: number;
  fullDays: number;
  /** fullDays × 100 ÷ days, whole percent (cut). */
  coveragePct: number;
  logs: number;
  /** Mean kcal of logged days, rounded; `null` without one (as for every average here). */
  avgKcal: number | null;
  /** Mean kcal of full days, rounded. */
  avgFullKcal: number | null;
  /** Mean grams over logged days, not rounded. */
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
  /** Mean fibre over logged days whose fibre is known, not rounded. */
  avgFibre: number | null;
}

/** Weigh-ins and body fat over exactly `days` finished days (today left out). */
export interface SignalPeriod {
  days: number;
  /** Days with a weigh-in. */
  weighIns: number;
  /** Days from the first to the last weigh-in, with at least two. */
  weightSpanDays: number | null;
  /** Last minus first weigh-in in kg, with at least two. */
  weightChangeKg: number | null;
  /** Days with a body-fat reading. */
  bodyFatReadings: number;
}

export interface DatedWeight {
  day: DayKey;
  kg: number;
}

export interface DatedBodyFat {
  day: DayKey;
  /** Fraction (0.2 = 20 %). */
  fraction: number;
}

/** The newest rows of a list, oldest first, and how many older rows were left out. */
export interface Recent<T> {
  rows: readonly T[];
  older: number;
}

export type ConfidenceLabel = 'low' | 'medium' | 'high';

export interface EvidenceConfidence {
  /** 0–55 from full days in the last 28. */
  nutrition: number;
  /** 0, 10, 18 or 25 from weigh-in days and their span. */
  weight: number;
  /** Measured energy; 0 in v1 (no source). */
  energy: number;
  /** The sum, at most 100. */
  score: number;
  label: ConfidenceLabel;
  /** The counts behind the three parts, for the reason lines. */
  fullDays28: number;
  weighIns: number;
  weighInSpanDays: number;
  energyDays: number;
}

export interface EvidencePack {
  /** First and last day of the food window (today − 90 … today − 1). */
  first: DayKey;
  last: DayKey;
  today: DayKey;
  /** The kcal goal coverage is measured against: max(800, effective kcal). */
  kcalGoal: number;
  /** One row per day of the window, oldest first. */
  days: readonly EvidenceDay[];
  periods: readonly NutritionPeriod[];
  signals: readonly SignalPeriod[];
  /** The last 45 logged days. */
  nutrition: Recent<LoggedDay>;
  /** Latest weigh-in of each day from the window start through today. */
  weights: Recent<DatedWeight>;
  /** Latest body-fat reading of each day from the window start through today. */
  bodyFat: Recent<DatedBodyFat>;
  confidence: EvidenceConfidence;
}

/** The 90 finished days ending yesterday. */
export function finishedDays(today: DayKey): DayWindow {
  return windowEnding(addDays(today, -1), LOOKBACK_DAYS);
}

/** True for a day key inside the window, ends included (keys of one shape sort as dates). */
export function keyInWindow(key: DayKey, window: DayWindow): boolean {
  return key >= window.first && key <= window.last;
}

/**
 * Coverage of a logged day against `goalKcal` (already floored at 800): full at 85 % of the
 * goal, or with two or more entries at 65 % and at least 800 kcal; otherwise partial.
 */
function loggedCoverage(kcal: number, logs: number, goalKcal: number): LoggedDay['coverage'] {
  if (kcal >= Math.round(goalKcal * 0.85)) return 'full';
  const busyDayBar = Math.max(COVERAGE_FLOOR_KCAL, Math.round(goalKcal * 0.65));
  return logs >= 2 && kcal >= busyDayBar ? 'full' : 'partial';
}

/** Coverage of a day with `logs` entries; none without entries (intake unknown). */
export function dayCoverage(kcal: number, logs: number, goalKcal: number): DayCoverage {
  return logs === 0 ? 'none' : loggedCoverage(kcal, logs, goalKcal);
}

function isLogged(day: EvidenceDay): day is LoggedDay {
  return day.coverage !== 'none';
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundedMean(values: readonly number[]): number | null {
  const value = mean(values);
  return value === null ? null : Math.round(value);
}

function newest<T>(rows: readonly T[], keep: number): Recent<T> {
  const kept = rows.slice(Math.max(0, rows.length - keep));
  return { rows: kept, older: rows.length - kept.length };
}

function dailyRows(
  entries: readonly EvidenceFood[],
  window: DayWindow,
  goalKcal: number,
): EvidenceDay[] {
  const byDay = new Map<DayKey, EvidenceFood[]>();
  for (const entry of entries) {
    if (!keyInWindow(entry.dayKey, window)) continue;
    const list = byDay.get(entry.dayKey);
    if (list) list.push(entry);
    else byDay.set(entry.dayKey, [entry]);
  }

  const rows: EvidenceDay[] = [];
  for (let offset = 0; offset < LOOKBACK_DAYS; offset += 1) {
    const day = addDays(window.first, offset);
    const logged = byDay.get(day);
    if (!logged) {
      rows.push({ day, coverage: 'none' });
      continue;
    }
    const total = (pick: (entry: EvidenceFood) => number): number =>
      logged.reduce((sum, entry) => sum + pick(entry), 0);
    const fibres = logged.flatMap((entry) =>
      entry.nutrients.fibre === undefined ? [] : [entry.nutrients.fibre],
    );
    const kcal = total((entry) => entry.kcal);
    rows.push({
      day,
      coverage: loggedCoverage(kcal, logged.length, goalKcal),
      kcal,
      protein: total((entry) => entry.protein),
      carbs: total((entry) => entry.carbs),
      fat: total((entry) => entry.fat),
      fibre: fibres.length === 0 ? null : fibres.reduce((sum, value) => sum + value, 0),
      fibreLogs: fibres.length,
      logs: logged.length,
    });
  }
  return rows;
}

function nutritionPeriod(rows: readonly EvidenceDay[], days: number): NutritionPeriod {
  const span = rows.slice(-days);
  const logged = span.filter(isLogged);
  const full = logged.filter((day) => day.coverage === 'full');
  const knownFibre = logged.flatMap((day) => (day.fibre === null ? [] : [day.fibre]));
  return {
    days,
    loggedDays: logged.length,
    fullDays: full.length,
    coveragePct: Math.floor((full.length * 100) / days),
    logs: logged.reduce((sum, day) => sum + day.logs, 0),
    avgKcal: roundedMean(logged.map((day) => day.kcal)),
    avgFullKcal: roundedMean(full.map((day) => day.kcal)),
    avgProtein: mean(logged.map((day) => day.protein)),
    avgCarbs: mean(logged.map((day) => day.carbs)),
    avgFat: mean(logged.map((day) => day.fat)),
    avgFibre: mean(knownFibre),
  };
}

/** The latest reading of each local day between `first` and `last`, oldest day first. */
function latestEachDay<T extends { at: number }>(
  readings: readonly T[],
  first: DayKey,
  last: DayKey,
): { day: DayKey; reading: T }[] {
  const byDay = new Map<DayKey, T>();
  for (const reading of readings) {
    if (!inDays(reading.at, first, last)) continue;
    const day = dayKeyOf(reading.at);
    const held = byDay.get(day);
    if (held === undefined || reading.at >= held.at) byDay.set(day, reading);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, reading]) => ({ day, reading }));
}

function signalPeriod(
  weights: readonly DatedWeight[],
  bodyFat: readonly DatedBodyFat[],
  today: DayKey,
  days: number,
): SignalPeriod {
  const window: DayWindow = { first: addDays(today, -days), last: addDays(today, -1) };
  const inside = weights.filter((row) => keyInWindow(row.day, window));
  const ends = outerPair(inside);
  return {
    days,
    weighIns: inside.length,
    weightSpanDays: ends ? daysBetween(ends[0].day, ends[1].day) : null,
    weightChangeKg: ends ? ends[1].kg - ends[0].kg : null,
    bodyFatReadings: bodyFat.filter((row) => keyInWindow(row.day, window)).length,
  };
}

/** The first and last rows of a list with at least two rows, else null. */
function outerPair<T>(rows: readonly T[]): readonly [T, T] | null {
  const head = rows[0];
  const tail = rows[rows.length - 1];
  return rows.length >= 2 && head !== undefined && tail !== undefined ? [head, tail] : null;
}

/** Weight points: 25 for ≥ 6 days over ≥ 28, 18 for ≥ 3 over ≥ 14, 10 for ≥ 2, else 0. */
export function weightPoints(weighInDays: number, spanDays: number): number {
  if (weighInDays >= 6 && spanDays >= 28) return 25;
  if (weighInDays >= 3 && spanDays >= 14) return 18;
  return weighInDays >= 2 ? 10 : 0;
}

/** Nutrition points: full days in the last 28 as a share of 55, rounded, at most 55. */
export function nutritionPoints(fullDays: number): number {
  return Math.min(NUTRITION_POINTS, Math.round((fullDays / CONFIDENCE_DAYS) * NUTRITION_POINTS));
}

export function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 70) return 'high';
  return score >= 40 ? 'medium' : 'low';
}

function confidenceOf(
  rows: readonly EvidenceDay[],
  weights: readonly DatedWeight[],
): EvidenceConfidence {
  const fullDays28 = rows.slice(-CONFIDENCE_DAYS).filter((day) => day.coverage === 'full').length;
  const ends = outerPair(weights);
  const weighInSpanDays = ends ? daysBetween(ends[0].day, ends[1].day) : 0;
  const nutrition = nutritionPoints(fullDays28);
  const weight = weightPoints(weights.length, weighInSpanDays);
  const energy = 0;
  const score = Math.min(100, nutrition + weight + energy);
  return {
    nutrition,
    weight,
    energy,
    score,
    label: confidenceLabel(score),
    fullDays28,
    weighIns: weights.length,
    weighInSpanDays,
    energyDays: 0,
  };
}

/** Builds the pack for a plan request made on `today`. Pure: numbers and day keys only. */
export function buildEvidence(input: EvidenceInput): EvidencePack {
  const { profile, today } = input;
  const window = finishedDays(today);
  const kcalGoal = Math.max(COVERAGE_FLOOR_KCAL, effectiveTargets(profile, today).kcal);
  const days = dailyRows(input.entries, window, kcalGoal);

  const weights = latestEachDay(input.weighIns, window.first, today).map(
    ({ day, reading }): DatedWeight => ({ day, kg: reading.kg }),
  );
  const bodyFat = latestEachDay(input.bodyFat, window.first, today).map(
    ({ day, reading }): DatedBodyFat => ({ day, fraction: reading.fraction }),
  );

  return {
    first: window.first,
    last: window.last,
    today,
    kcalGoal,
    days,
    periods: EVIDENCE_PERIODS.map((period) => nutritionPeriod(days, period)),
    signals: EVIDENCE_PERIODS.map((period) => signalPeriod(weights, bodyFat, today, period)),
    nutrition: newest(days.filter(isLogged), LOGGED_DAY_ROWS),
    weights: newest(weights, READING_ROWS),
    bodyFat: newest(bodyFat, READING_ROWS),
    confidence: confidenceOf(days, weights),
  };
}
