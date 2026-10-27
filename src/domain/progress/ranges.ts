// The Progress tab's windows (P07-09): the ranges and how many days each covers, which local days
// a range shows at each period offset, the nutrition window that can leave today out, the body
// metrics the switch offers, and what the readings of one window add up to on a card (P07-12,
// P07-13). Pure: callers pass today's day key; nothing here reads the clock.

import { addDays, type DayKey } from '../dates/dayKey';
import { inDays, windowEnding, type DayWindow } from '../dates/ranges';
import type { SeriesPoint } from './chartMath';

// ---------------------------------------------------------------------------------------------
// Ranges and periods

/** The ranges of the Progress tab, shortest first. */
export const PROGRESS_RANGES = ['week', 'month', 'quarter', 'half', 'year', 'all'] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number];

/** How many local days a range covers. "All" is ten years. */
export const RANGE_DAYS: Readonly<Record<ProgressRange, number>> = {
  week: 7,
  month: 30,
  quarter: 90,
  half: 180,
  year: 365,
  all: 3650,
};

/** The range the tab opens on. It is never stored. */
export const DEFAULT_RANGE: ProgressRange = 'week';

/**
 * The first day the page reads weigh-ins and body-fat readings from: every reading, in practice.
 * The Log weight date never goes before it, so nothing logged there is out of sight.
 */
export const FIRST_READABLE_DAY: DayKey = '1900-01-01';

/** What the page shows: a range, and how many whole windows back from the current one. */
export interface PeriodView {
  readonly range: ProgressRange;
  /** 0 is the window ending today; 1 the one just before it, and so on. */
  readonly offset: number;
}

/** The current week. */
export const FIRST_VIEW: PeriodView = { range: DEFAULT_RANGE, offset: 0 };

/** True when the range has earlier periods to step to: every range but "all". */
export function hasPeriods(range: ProgressRange): boolean {
  return range !== 'all';
}

function steps(offset: number): number {
  return Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
}

/** Another range always opens on its current window; the same range keeps the view. */
export function withRange(view: PeriodView, range: ProgressRange): PeriodView {
  return range === view.range ? view : { range, offset: 0 };
}

/** One whole window further back. "All" has no earlier window. */
export function earlier(view: PeriodView): PeriodView {
  return hasPeriods(view.range) ? { ...view, offset: steps(view.offset) + 1 } : view;
}

/** One whole window nearer today, never past the current one. */
export function later(view: PeriodView): PeriodView {
  return { ...view, offset: Math.max(0, steps(view.offset) - 1) };
}

/** The forward arrow works only on a past window. */
export function canGoLater(view: PeriodView): boolean {
  return hasPeriods(view.range) && steps(view.offset) > 0;
}

function windowFrom(view: PeriodView, lastDay: DayKey): DayWindow {
  const days = RANGE_DAYS[view.range];
  const offset = hasPeriods(view.range) ? steps(view.offset) : 0;
  return windowEnding(addDays(lastDay, -days * offset), days);
}

/**
 * The days the weight and body-fat cards cover: the range's days ending today, moved back by
 * whole windows, so the periods follow one another without a gap or an overlap.
 */
export function periodWindow(view: PeriodView, todayKey: DayKey): DayWindow {
  return windowFrom(view, todayKey);
}

/**
 * The days the calorie chart and the averages cover. With today counted it is the period window;
 * without, everything moves back one day, the current window ending yesterday and each past one a
 * day earlier too, so a half-logged today never pulls the numbers down and the periods still meet.
 */
export function nutritionWindow(
  view: PeriodView,
  todayKey: DayKey,
  countToday: boolean,
): DayWindow {
  return windowFrom(view, countToday ? todayKey : addDays(todayKey, -1));
}

/** The readings on the window's days, oldest first. A reading late on the last day is in (R05.5). */
export function readingsIn<T extends { readonly at: number }>(
  readings: readonly T[],
  window: DayWindow,
): T[] {
  return readings
    .filter((reading) => inDays(reading.at, window.first, window.last))
    .sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------------------------
// Body metrics

/** The metrics the switch can offer, in the order it lists them. */
export const BODY_METRICS = ['weight', 'bodyFat'] as const;
export type BodyMetric = (typeof BODY_METRICS)[number];

/** What decides whether body fat has anything to show. */
export interface BodyFatFacts {
  /** How many body-fat readings are stored. */
  readonly readings: number;
  /** The profile's current body fat, if set. */
  readonly profileValue?: number;
  /** The profile's goal body fat, if set. */
  readonly goal?: number;
}

/**
 * The metrics on offer, always in the same order: weight, then body fat once there is a reading,
 * a body fat in the profile or a body-fat goal.
 */
export function availableMetrics(facts: BodyFatFacts): BodyMetric[] {
  const bodyFat =
    facts.readings > 0 || facts.profileValue !== undefined || facts.goal !== undefined;
  return bodyFat ? ['weight', 'bodyFat'] : ['weight'];
}

/** The metric to show: the chosen one while it is on offer, otherwise weight. */
export function shownMetric(chosen: BodyMetric, available: readonly BodyMetric[]): BodyMetric {
  return available.includes(chosen) ? chosen : 'weight';
}

// ---------------------------------------------------------------------------------------------
// A window's readings on a card

/** What a body card says about the readings of one window. */
export interface WindowSummary {
  /** The last reading minus the first (0 for a single reading). */
  readonly change: number;
  /** The mean of the readings. */
  readonly average: number;
}

/** The change and the mean of `points`, or null when there are none. Order does not matter. */
export function summarise(points: readonly SeriesPoint[]): WindowSummary | null {
  if (points.length === 0) return null;
  let first = points[0] as SeriesPoint;
  let last = first;
  let total = 0;
  for (const point of points) {
    if (point.at < first.at) first = point;
    if (point.at >= last.at) last = point;
    total += point.value;
  }
  return { change: last.value - first.value, average: total / points.length };
}

/**
 * A change as a card writes it, to one decimal: anything closer to zero than 0.05 is 0 (never
 * −0, so it reads without a sign), the rest rounds half away from zero (−0.05 → −0.1).
 */
export function changeToTenth(change: number): number {
  if (!Number.isFinite(change) || Math.abs(change) < 0.05) return 0;
  return (Math.sign(change) * Math.round(Math.abs(change) * 10)) / 10;
}
