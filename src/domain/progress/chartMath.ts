// The maths behind the Progress charts: value ranges and round ticks, averaging long series into
// fewer points, date labels for a time axis, and the layout of the calorie bars. Pure: callers
// pass instants, values and pixel widths; nothing here reads the clock or draws anything.

import { dayKeyOf, dayNumberOf, splitDayKey, type DayKey } from '../dates/dayKey';

/** One reading on a time series: an instant (epoch ms) and a value in the display unit. */
export interface SeriesPoint {
  readonly at: number;
  readonly value: number;
}

/** A closed range of values, `min` ≤ `max`. */
export interface ValueRange {
  readonly min: number;
  readonly max: number;
}

// ---------------------------------------------------------------------------------------------
// Value axis

/** The share of the readings' spread added above and below them. */
const PAD_SHARE = 0.15;

export interface PadOptions {
  /** The least padding on each side, in value units (weight 2, body fat 1). */
  readonly minPad: number;
  /** A lower bound the range never goes below (body fat: 0). */
  readonly floor?: number;
}

/**
 * The value range a line chart shows: the lowest and highest of `values` (pass the goal among
 * them so its line stays inside), widened on both sides by 15 % of their spread or `minPad`,
 * whichever is more, then cut at `floor`. `null` when there is no finite value.
 */
export function paddedRange(values: readonly number[], options: PadOptions): ValueRange | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const lowest = Math.min(...finite);
  const highest = Math.max(...finite);
  const pad = Math.max((highest - lowest) * PAD_SHARE, options.minPad);
  const min = options.floor === undefined ? lowest - pad : Math.max(options.floor, lowest - pad);
  return { min, max: highest + pad };
}

/**
 * Below each bound, a rough step (scaled into [1, 10)) becomes the round step beside it; from
 * the last bound up it becomes 10. The bounds sit between the round steps, so the chosen step is
 * the round one nearest the rough step.
 */
const ROUND_STEPS: ReadonlyArray<readonly [below: number, step: number]> = [
  [1.5, 1],
  [3, 2],
  [7, 5],
];

/** The round step (1, 2, 5 or 10 times a power of ten) nearest to `rough`. */
export function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const scale = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / scale;
  const match = ROUND_STEPS.find(([below]) => scaled < below);
  return (match ? match[1] : 10) * scale;
}

/** Decimals that print every multiple of `step` exactly (0.25 → 2, 5 → 0). */
function decimalsOf(step: number): number {
  for (let digits = 0; digits < 10; digits++) {
    if (Math.abs(Math.round(step * 10 ** digits) - step * 10 ** digits) < 1e-6) return digits;
  }
  return 10;
}

/** `k × step`, rounded to the step's own decimals so 3 × 0.1 reads 0.3. */
function multipleOf(step: number, k: number): number {
  return Number((k * step).toFixed(decimalsOf(step)));
}

/**
 * About `about` round values for the grid lines of `[min, max]`: every multiple of a round step
 * that lies inside the range, lowest first. A range with no width gives just `min`.
 */
export function niceTicks(min: number, max: number, about = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const step = niceStep((max - min) / Math.max(1, about - 1));
  const ticks: number[] = [];
  const tolerance = step * 1e-9;
  for (let k = Math.ceil((min - tolerance) / step); k * step <= max + tolerance; k++) {
    ticks.push(multipleOf(step, k));
  }
  return ticks;
}

/** The value axis of a bar chart: from 0 to `top`, with a grid line at each of `ticks`. */
export interface BarScale {
  readonly top: number;
  readonly ticks: readonly number[];
}

/**
 * The bar chart's axis: 0 up to the first round tick at or above the larger of `peak` (the
 * highest bar) and `goal`, with about `about` ticks. Without anything positive, 0 to 1.
 */
export function barScale(peak: number, goal: number, about = 5): BarScale {
  const highest = Math.max(Number.isFinite(peak) ? peak : 0, Number.isFinite(goal) ? goal : 0);
  if (highest <= 0) return { top: 1, ticks: [0, 1] };
  const step = niceStep(highest / Math.max(1, about - 1));
  const steps = Math.ceil(highest / step - 1e-9);
  const ticks = Array.from({ length: steps + 1 }, (_, k) => multipleOf(step, k));
  return { top: multipleOf(step, steps), ticks };
}

// ---------------------------------------------------------------------------------------------
// Long series

/**
 * How many points a series spanning `spanDays` calendar days may plot: 60 up to 45 days, 48 up
 * to 100, 36 up to 200, 30 up to 400, then 24. Long windows get fewer points so the line stays
 * readable and a scrub has few targets (R05.16).
 */
export function bucketLimit(spanDays: number): number {
  if (spanDays <= 45) return 60;
  if (spanDays <= 100) return 48;
  if (spanDays <= 200) return 36;
  if (spanDays <= 400) return 30;
  return 24;
}

function dayNumberAt(ms: number): number {
  return dayNumberOf(dayKeyOf(ms));
}

/**
 * The points a line chart plots, oldest first. A series within its limit (`bucketLimit` of its
 * span in local calendar days) comes back as it is, sorted. A longer one is cut into `limit`
 * equal runs of calendar days, and each run that holds readings becomes one point at the mean
 * of their instants and the mean of their values.
 */
export function downsample(points: readonly SeriesPoint[]): SeriesPoint[] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];
  if (!oldest || !newest || sorted.length < 2) return sorted;

  const firstDay = dayNumberAt(oldest.at);
  const coveredDays = dayNumberAt(newest.at) - firstDay + 1;
  const limit = bucketLimit(Math.max(1, coveredDays - 1));
  if (sorted.length <= limit) return sorted;

  // Points arrive oldest first, so runs are opened (and the map is ordered) oldest first too.
  const runs = new Map<number, { atSum: number; valueSum: number; count: number }>();
  for (const point of sorted) {
    const offset = dayNumberAt(point.at) - firstDay;
    const run = Math.min(limit - 1, Math.floor((offset * limit) / coveredDays));
    const sums = runs.get(run) ?? { atSum: 0, valueSum: 0, count: 0 };
    sums.atSum += point.at;
    sums.valueSum += point.value;
    sums.count += 1;
    runs.set(run, sums);
  }
  return [...runs.values()].map((sums) => ({
    at: sums.atSum / sums.count,
    value: sums.valueSum / sums.count,
  }));
}

// ---------------------------------------------------------------------------------------------
// Time axis

/** How the dates under a time axis are written: day and month, or month and year. */
export type AxisDateStyle = 'day' | 'monthYear';

export interface AxisDate {
  /** The instant the label stands for. */
  readonly at: number;
  /** Its local day, for formatting. */
  readonly day: DayKey;
  /** Where it sits along the axis, 0 (first reading) to 1 (last). */
  readonly share: number;
}

export interface TimeAxis {
  readonly style: AxisDateStyle;
  readonly labels: readonly AxisDate[];
}

/** Spans longer than this many days that cross New Year label month and year. */
const YEAR_LABEL_SPAN = 150;

/**
 * The date labels under a time axis from `firstAt` to `lastAt`. Normally five, evenly spaced, a
 * label naming the same day as the one before it dropped. When the span is over 150 days and the
 * two ends lie in different years, three (first, middle, last) written with month and year. One
 * reading (no span) gets a single label in the middle.
 */
export function timeAxisLabels(firstAt: number, lastAt: number): TimeAxis {
  if (!(lastAt > firstAt)) {
    return { style: 'day', labels: [{ at: firstAt, day: dayKeyOf(firstAt), share: 0.5 }] };
  }
  const firstDay = dayKeyOf(firstAt);
  const lastDay = dayKeyOf(lastAt);
  const span = dayNumberOf(lastDay) - dayNumberOf(firstDay);
  const crossesYear = splitDayKey(firstDay).year !== splitDayKey(lastDay).year;
  const style: AxisDateStyle = span > YEAR_LABEL_SPAN && crossesYear ? 'monthYear' : 'day';
  const shares = style === 'monthYear' ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];

  const labels: AxisDate[] = [];
  for (const share of shares) {
    const at = firstAt + (lastAt - firstAt) * share;
    const day = dayKeyOf(at);
    if (labels[labels.length - 1]?.day === day) continue;
    labels.push({ at, day, share });
  }
  return { style, labels };
}

// ---------------------------------------------------------------------------------------------
// Gestures

/** A drag scrubs a chart only when its sideways travel is over 1.5 × its vertical travel. */
export function isClearlyHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > 1.5 * Math.abs(dy);
}

// ---------------------------------------------------------------------------------------------
// Bars

/** Where a row of bars sits in a plot: the first bar's left edge, each bar's width, each gap. */
export interface BarLayout {
  readonly start: number;
  readonly bar: number;
  readonly gap: number;
}

/** The widest a bar gets, in px. */
export const MAX_BAR_WIDTH = 60;
/** The gap between bars while there is room for it. */
const ROOMY_GAP = 4;
/** The thinnest bar kept before the gaps give way. */
const THIN_BAR = 2;
/** The narrowest gap kept before bar and gap shrink together. */
const THIN_GAP = 1;

/**
 * Lays `count` bars across a plot `width` px wide, centred, always inside it (R05.15):
 * 1. bars share the width left after 4 px gaps, each at most `maxBar` wide, while that gives
 *    bars of at least 2 px;
 * 2. otherwise bars stay 2 px and the gaps take what is left, while that is at least 1 px;
 * 3. otherwise bar and gap shrink together, bar = 2 × gap, filling the width exactly.
 */
export function barLayout(width: number, count: number, maxBar = MAX_BAR_WIDTH): BarLayout {
  const room = Number.isFinite(width) && width > 0 ? width : 0;
  const bars = Math.max(1, Math.trunc(count));
  const gaps = bars - 1;

  let bar: number;
  let gap: number;
  const sharedBar = (room - ROOMY_GAP * gaps) / bars;
  const sharedGap = gaps > 0 ? (room - THIN_BAR * bars) / gaps : 0;
  if (sharedBar >= THIN_BAR) {
    bar = Math.min(sharedBar, maxBar);
    gap = ROOMY_GAP;
  } else if (gaps > 0 && sharedGap >= THIN_GAP) {
    bar = THIN_BAR;
    gap = sharedGap;
  } else {
    // n bars of 2g and n − 1 gaps of g: 2gn + g(n − 1) = width.
    gap = room / (3 * bars - 1);
    bar = 2 * gap;
  }
  const used = bar * bars + gap * gaps;
  return { start: Math.max(0, (room - used) / 2), bar, gap };
}

/** The x of bar `index`'s centre. */
export function barCentre(layout: BarLayout, index: number): number {
  return layout.start + index * (layout.bar + layout.gap) + layout.bar / 2;
}

/**
 * The bar whose centre is nearest to `x`, clamped to the first and the last, so a press past
 * either end of the row picks the end bar. `null` when there are no bars.
 */
export function barIndexAt(layout: BarLayout, count: number, x: number): number | null {
  if (count <= 0) return null;
  const pitch = layout.bar + layout.gap;
  if (!(pitch > 0)) return 0;
  const nearest = Math.round((x - barCentre(layout, 0)) / pitch);
  return Math.min(count - 1, Math.max(0, nearest));
}

/** The width a date label under a bar needs, in px. */
export const MIN_LABEL_WIDTH = 40;

/**
 * Which bars get a date label, oldest first: every bar while each has `minWidth` px, otherwise
 * every k-th bar counted back from the newest, with k the fewest bars that make `minWidth`. The
 * newest bar is always labelled.
 */
export function barLabelIndices(
  layout: BarLayout,
  count: number,
  minWidth = MIN_LABEL_WIDTH,
): number[] {
  if (count <= 0) return [];
  const pitch = layout.bar + layout.gap;
  const every = pitch >= minWidth || !(pitch > 0) ? 1 : Math.ceil(minWidth / pitch);
  const picked: number[] = [];
  for (let index = count - 1; index >= 0; index -= every) picked.push(index);
  return picked.reverse();
}
