// The goal evidence pack: what a plan request tells the AI about the person's own logging and
// weigh-ins, so it can lean on real data when there is enough and discount it when there is not.
//
// Privacy is structural: the pack is built from numbers and day keys only. No field of an entry
// other than its day, energy, macros and fibre is ever read, so names, notes, photos, ingredient
// lines, product details and ids cannot reach it (R01.16). Food is counted over finished days
// only: today is still being logged and would look like under-eating. A day with nothing logged
// is unknown, never 0 kcal, so it carries no numbers at all.

import {
  addDays,
  dayKeyOf,
  dayNumberOf,
  daysBetween,
  isDayKey,
  type DayKey,
} from '../dates/dayKey';
import { inDays, windowEnding, type DayWindow } from '../dates/ranges';
import { formulaPlan } from '../goals/formulas';
import { div } from '../goals/integers';
import { effectiveTargets } from '../goals/targets';
import type { BodyFatReading, DiaryEntry, Profile, WeighIn } from '../model';

/** Finished days the pack (and the weight forecast) look back over, ending yesterday. */
export const EVIDENCE_DAYS = 90;

/** The rolling spans summarised, shortest first; each ends yesterday. */
export const EVIDENCE_PERIODS = [7, 14, 28, 90] as const;

/** The kcal goal a day is judged against never drops below this, and neither does the bar for a multi-log day. */
export const COVERAGE_FLOOR_KCAL = 800;

/** A day reaching this share of the goal counts as fully logged, whatever its log count. */
export const FULL_DAY_SHARE = 0.85;

/** A day with two or more logs counts as fully logged from this share of the goal. */
export const MULTI_LOG_SHARE = 0.65;

/** Dated weigh-in and body-fat days kept in the pack; older ones are only counted. */
export const RECENT_READING_DAYS = 30;

/** Logged days kept as detail rows; older ones are only counted. */
export const RECENT_LOGGED_DAYS = 45;

/** The span the nutrition confidence looks at, and the most points it can give. */
export const CONFIDENCE_SPAN_DAYS = 28;
export const NUTRITION_POINTS_MAX = 55;

/**
 * How complete a day's food log looks: `none` = nothing logged (intake unknown), `partial` =
 * something logged but probably not everything, `full` = probably the whole day.
 */
export type DayCoverage = 'none' | 'partial' | 'full';

/** A finished day with no entries: intake unknown, so it holds no numbers. */
export interface UnloggedDay {
  day: DayKey;
  coverage: 'none';
}

/** A finished day with at least one entry. */
export interface LoggedDay {
  day: DayKey;
  coverage: 'partial' | 'full';
  /** Entries logged that day. */
  logs: number;
  /** Whole kcal. */
  kcal: number;
  /** Grams, summed, not rounded. */
  protein: number;
  carbs: number;
  fat: number;
  /** Grams summed over the entries that recorded fibre; null when none did. */
  fibre: number | null;
  /** How many of `logs` recorded fibre. */
  fibreLogs: number;
}

export type EvidenceDay = UnloggedDay | LoggedDay;

/** Food over the last `days` finished days. Averages are null when nothing is averaged. */
export interface EvidencePeriod {
  days: number;
  loggedDays: number;
  fullDays: number;
  /** Full days × 100 div `days`. */
  coveragePercent: number;
  logs: number;
  /** Whole kcal over logged days. */
  avgKcal: number | null;
  /** Whole kcal over full days. */
  avgFullKcal: number | null;
  /** Grams over logged days, one decimal. */
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
  /** Grams over the logged days that know fibre, one decimal. */
  avgFibre: number | null;
}

/** Weigh-ins and body fat over exactly the last `days` finished days (today left out). */
export interface SignalPeriod {
  days: number;
  /** Days with a weigh-in. */
  weighIns: number;
  /** Calendar days from the first to the last weigh-in day; null below two. */
  weightSpanDays: number | null;
  /** Last minus first weigh-in in kg; null below two. */
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
  /** Percent (stored fraction × 100). */
  percent: number;
}

/** The newest rows of a longer list, oldest first, and how many older rows were left out. */
export interface RecentRows<T> {
  rows: T[];
  older: number;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

/** How far the AI may trust the pack, with the counts behind each part. */
export interface EvidenceConfidence {
  /** 0–100: the three parts added, capped at 100. */
  score: number;
  level: ConfidenceLevel;
  /** 0–55, from full days in the latest 28. */
  nutritionPoints: number;
  /** 0, 10, 18 or 25, from weigh-in days and their span. */
  weightPoints: number;
  /** Measured energy from a health source: none in v1, so always 0. */
  energyPoints: number;
  fullDaysInSpan: number;
  /** Days with a weigh-in from the window start through today. */
  weighInDays: number;
  /** Calendar days from the first to the last of them; 0 below two. */
  weighInSpanDays: number;
  /** Days with measured energy: none in v1. */
  energyDays: number;
}

export interface EvidencePack {
  /** First and last finished day of the food window (yesterday is last). */
  first: DayKey;
  last: DayKey;
  /** The kcal goal days were judged against: max(800, effective kcal). */
  goalKcal: number;
  /** One row per finished day, oldest first. */
  days: EvidenceDay[];
  /** One per span of `EVIDENCE_PERIODS`, in that order. */
  periods: EvidencePeriod[];
  signals: SignalPeriod[];
  /** The latest weigh-in of each day from the window start through today. */
  weights: RecentRows<DatedWeight>;
  /** The latest body-fat reading of each day from the window start through today. */
  bodyFat: RecentRows<DatedBodyFat>;
  /** Detail rows for the most recent logged days. */
  loggedDays: RecentRows<LoggedDay>;
  confidence: EvidenceConfidence;
}

/**
 * What the pack is built from. Workouts, tape measurements and measured energy are later
 * phases: they will arrive as more optional fields here, so callers do not change.
 */
export interface EvidenceInput {
  profile: Profile;
  entries: readonly DiaryEntry[];
  weighIns: readonly WeighIn[];
  bodyFat: readonly BodyFatReading[];
  today: DayKey;
}

/** The `EVIDENCE_DAYS` finished days before `today`, both ends included. */
export function completedWindow(today: DayKey): DayWindow {
  return windowEnding(addDays(today, -1), EVIDENCE_DAYS);
}

/** True when `day` is a real day key from `range.first` through `range.last`. */
export function inWindow(day: DayKey, range: DayWindow): boolean {
  if (!isDayKey(day)) return false;
  const at = dayNumberOf(day);
  return at >= dayNumberOf(range.first) && at <= dayNumberOf(range.last);
}

/**
 * Judges one day's log. With the goal floored at 800 kcal: full from 85 % of the goal, or, with
 * two or more logs, from 65 % of it (never below 800 kcal); partial below that; none without logs.
 */
export function dayCoverage(kcal: number, logs: number, goalKcal: number): DayCoverage {
  if (logs <= 0) return 'none';
  const goal = Math.max(COVERAGE_FLOOR_KCAL, goalKcal);
  const fullBar = Math.round(goal * FULL_DAY_SHARE);
  const multiLogBar = Math.max(COVERAGE_FLOOR_KCAL, Math.round(goal * MULTI_LOG_SHARE));
  return kcal >= fullBar || (logs >= 2 && kcal >= multiLogBar) ? 'full' : 'partial';
}

/** The weight part of the confidence for a number of weigh-in days spanning `spanDays`. */
export function weightPoints(weighInDays: number, spanDays: number): number {
  if (weighInDays >= 6 && spanDays >= 28) return 25;
  if (weighInDays >= 3 && spanDays >= 14) return 18;
  return weighInDays >= 2 ? 10 : 0;
}

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 70) return 'high';
  return score >= 40 ? 'medium' : 'low';
}

// ---- Building ---------------------------------------------------------------------------------

interface DayTally {
  logs: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  fibreLogs: number;
}

function tallyByDay(entries: readonly DiaryEntry[]): Map<DayKey, DayTally> {
  const tallies = new Map<DayKey, DayTally>();
  for (const entry of entries) {
    let tally = tallies.get(entry.dayKey);
    if (!tally) {
      tally = { logs: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, fibreLogs: 0 };
      tallies.set(entry.dayKey, tally);
    }
    tally.logs += 1;
    tally.kcal += entry.kcal;
    tally.protein += entry.protein;
    tally.carbs += entry.carbs;
    tally.fat += entry.fat;
    const fibre = entry.nutrients.fibre;
    if (fibre !== undefined && Number.isFinite(fibre)) {
      tally.fibre += fibre;
      tally.fibreLogs += 1;
    }
  }
  return tallies;
}

function dayRow(day: DayKey, tally: DayTally | undefined, goalKcal: number): EvidenceDay {
  if (!tally || tally.logs === 0) return { day, coverage: 'none' };
  const coverage = dayCoverage(tally.kcal, tally.logs, goalKcal);
  return {
    day,
    coverage: coverage === 'full' ? 'full' : 'partial',
    logs: tally.logs,
    kcal: tally.kcal,
    protein: tally.protein,
    carbs: tally.carbs,
    fat: tally.fat,
    fibre: tally.fibreLogs > 0 ? tally.fibre : null,
    fibreLogs: tally.fibreLogs,
  };
}

function isLogged(day: EvidenceDay): day is LoggedDay {
  return day.coverage !== 'none';
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function wholeOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function tenthOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

function summarise(days: readonly EvidenceDay[]): EvidencePeriod {
  const logged = days.filter(isLogged);
  const full = logged.filter((day) => day.coverage === 'full');
  const knownFibre: number[] = [];
  let logs = 0;
  for (const day of logged) {
    logs += day.logs;
    if (day.fibre !== null) knownFibre.push(day.fibre);
  }
  return {
    days: days.length,
    loggedDays: logged.length,
    fullDays: full.length,
    coveragePercent: days.length === 0 ? 0 : div(full.length * 100, days.length),
    logs,
    avgKcal: wholeOrNull(mean(logged.map((day) => day.kcal))),
    avgFullKcal: wholeOrNull(mean(full.map((day) => day.kcal))),
    avgProtein: tenthOrNull(mean(logged.map((day) => day.protein))),
    avgCarbs: tenthOrNull(mean(logged.map((day) => day.carbs))),
    avgFat: tenthOrNull(mean(logged.map((day) => day.fat))),
    avgFibre: tenthOrNull(mean(knownFibre)),
  };
}

/**
 * The latest reading of each local day from `first` through `last`, oldest day first. Of two
 * readings at the same instant the later one in the list wins.
 */
function latestEachDay<T extends { at: number }>(
  readings: readonly T[],
  first: DayKey,
  last: DayKey,
): { day: DayKey; reading: T }[] {
  const byDay = new Map<DayKey, T>();
  for (const reading of readings) {
    if (!inDays(reading.at, first, last)) continue;
    const day = dayKeyOf(reading.at);
    const kept = byDay.get(day);
    if (kept === undefined || reading.at >= kept.at) byDay.set(day, reading);
  }
  return [...byDay.entries()]
    .map(([day, reading]) => ({ day, reading }))
    .sort((a, b) => dayNumberOf(a.day) - dayNumberOf(b.day));
}

function newest<T>(rows: readonly T[], keep: number): RecentRows<T> {
  const cut = Math.max(0, rows.length - keep);
  return { rows: rows.slice(cut), older: cut };
}

function onDays<T extends { day: DayKey }>(rows: readonly T[], range: DayWindow): T[] {
  return rows.filter((row) => inWindow(row.day, range));
}

function signalsOver(
  days: number,
  today: DayKey,
  weights: readonly DatedWeight[],
  bodyFat: readonly DatedBodyFat[],
): SignalPeriod {
  const span: DayWindow = { first: addDays(today, -days), last: addDays(today, -1) };
  const inSpan = onDays(weights, span);
  const earliest = inSpan[0];
  const latest = inSpan[inSpan.length - 1];
  const two = inSpan.length >= 2 && earliest !== undefined && latest !== undefined;
  return {
    days,
    weighIns: inSpan.length,
    weightSpanDays: two ? daysBetween(earliest.day, latest.day) : null,
    weightChangeKg: two ? latest.kg - earliest.kg : null,
    bodyFatReadings: onDays(bodyFat, span).length,
  };
}

function confidenceOf(
  days: readonly EvidenceDay[],
  weights: readonly DatedWeight[],
): EvidenceConfidence {
  const span = days.slice(-CONFIDENCE_SPAN_DAYS);
  const fullDaysInSpan = span.filter((day) => day.coverage === 'full').length;
  const nutritionPoints = Math.min(
    NUTRITION_POINTS_MAX,
    Math.round((fullDaysInSpan / CONFIDENCE_SPAN_DAYS) * NUTRITION_POINTS_MAX),
  );
  const earliest = weights[0];
  const latest = weights[weights.length - 1];
  const weighInSpanDays =
    weights.length >= 2 && earliest !== undefined && latest !== undefined
      ? daysBetween(earliest.day, latest.day)
      : 0;
  const points = weightPoints(weights.length, weighInSpanDays);
  const energyPoints = 0;
  const score = Math.min(100, nutritionPoints + points + energyPoints);
  return {
    score,
    level: confidenceLevel(score),
    nutritionPoints,
    weightPoints: points,
    energyPoints,
    fullDaysInSpan,
    weighInDays: weights.length,
    weighInSpanDays,
    energyDays: 0,
  };
}

/** Builds the pack for a plan request made on `today`. */
export function buildEvidence(input: EvidenceInput): EvidencePack {
  const { profile, today } = input;
  const { first, last } = completedWindow(today);
  const goalKcal = Math.max(
    COVERAGE_FLOOR_KCAL,
    effectiveTargets(profile.saved, formulaPlan(profile, today)).kcal,
  );

  const tallies = tallyByDay(input.entries);
  const days: EvidenceDay[] = [];
  for (let offset = 0; offset < EVIDENCE_DAYS; offset += 1) {
    const day = addDays(first, offset);
    days.push(dayRow(day, tallies.get(day), goalKcal));
  }

  const weights: DatedWeight[] = latestEachDay(input.weighIns, first, today).map(
    ({ day, reading }) => ({ day, kg: reading.kg }),
  );
  const bodyFat: DatedBodyFat[] = latestEachDay(input.bodyFat, first, today).map(
    ({ day, reading }) => ({ day, percent: reading.fraction * 100 }),
  );

  return {
    first,
    last,
    goalKcal,
    days,
    periods: EVIDENCE_PERIODS.map((span) => summarise(days.slice(-span))),
    signals: EVIDENCE_PERIODS.map((span) => signalsOver(span, today, weights, bodyFat)),
    weights: newest(weights, RECENT_READING_DAYS),
    bodyFat: newest(bodyFat, RECENT_READING_DAYS),
    loggedDays: newest(days.filter(isLogged), RECENT_LOGGED_DAYS),
    confidence: confidenceOf(days, weights),
  };
}
