import { describe, expect, it } from 'vitest';
import { addDays, startOfDay, type DayKey } from '../dates/dayKey';
import {
  barCentre,
  barIndexAt,
  barLabelIndices,
  barLayout,
  barScale,
  bucketLimit,
  downsample,
  isClearlyHorizontal,
  niceStep,
  niceTicks,
  paddedRange,
  timeAxisLabels,
  type SeriesPoint,
} from './chartMath';

const HOUR = 3_600_000;

/** The instant `hour` o'clock on `day`, local time (tests run in New York). */
function at(day: DayKey, hour = 12): number {
  return startOfDay(day) + hour * HOUR;
}

/** One reading a day for `days` days from `first`, valued 0, 1, 2, … */
function daily(first: DayKey, days: number, hour = 8): SeriesPoint[] {
  return Array.from({ length: days }, (_, index) => ({
    at: at(addDays(first, index), hour),
    value: index,
  }));
}

describe('paddedRange', () => {
  it('pads the readings by 15 % of their spread when that is more than the minimum', () => {
    expect(paddedRange([60, 80], { minPad: 2 })).toEqual({ min: 57, max: 83 });
  });

  it('pads by the minimum when the readings are close together', () => {
    expect(paddedRange([70, 71], { minPad: 2 })).toEqual({ min: 68, max: 73 });
  });

  it('takes the goal into the range so its line stays inside', () => {
    // Readings 72–73 with a goal of 65: the spread is 8, so the pad is still the minimum 2.
    expect(paddedRange([72, 73, 65], { minPad: 2 })).toEqual({ min: 63, max: 75 });
  });

  it('pads body fat by at least 1 point and never below 0 %', () => {
    expect(paddedRange([18, 19], { minPad: 1, floor: 0 })).toEqual({ min: 17, max: 20 });
    expect(paddedRange([0.5, 1], { minPad: 1, floor: 0 })).toEqual({ min: 0, max: 2 });
  });

  it('opens a range around a single reading', () => {
    expect(paddedRange([70], { minPad: 2 })).toEqual({ min: 68, max: 72 });
  });

  it('gives no range without a finite value', () => {
    expect(paddedRange([], { minPad: 2 })).toBeNull();
    expect(paddedRange([Number.NaN, Number.POSITIVE_INFINITY], { minPad: 2 })).toBeNull();
  });
});

describe('niceStep', () => {
  it.each([
    [1.2, 1],
    [1.6, 2],
    [2.9, 2],
    [3, 5],
    [6.9, 5],
    [7, 10],
    [0.034, 0.05],
    [2675, 2000],
    [140, 100],
  ])('rounds a rough step of %s to %s', (rough, step) => {
    expect(niceStep(rough)).toBeCloseTo(step, 12);
  });

  it('falls back to 1 for a step that is not positive', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-3)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });
});

describe('niceTicks', () => {
  it('gives 68, 70 … 76 for weigh-ins from 68.2 to 74.9 kg', () => {
    const range = paddedRange([68.2, 74.9], { minPad: 2 });
    expect(range?.min).toBeCloseTo(66.2, 10);
    expect(range?.max).toBeCloseTo(76.9, 10);
    expect(niceTicks(range?.min ?? 0, range?.max ?? 0)).toEqual([68, 70, 72, 74, 76]);
  });

  it('keeps every tick inside the range, about five of them', () => {
    for (const [min, max] of [
      [17, 20],
      [0, 2],
      [140.3, 162.8],
      [63, 75],
    ] as const) {
      const ticks = niceTicks(min, max);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.length).toBeLessThanOrEqual(7);
      for (const tick of ticks) {
        expect(tick).toBeGreaterThanOrEqual(min);
        expect(tick).toBeLessThanOrEqual(max);
      }
    }
  });

  it('prints decimal steps exactly', () => {
    expect(niceTicks(0, 1, 11)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('gives the bound itself for a range with no width', () => {
    expect(niceTicks(70, 70)).toEqual([70]);
  });
});

describe('barScale', () => {
  it('ends on the first round tick above the highest day', () => {
    expect(barScale(2350, 2000)).toEqual({ top: 2500, ticks: [0, 500, 1000, 1500, 2000, 2500] });
  });

  it('reaches the goal when the goal is above every day', () => {
    expect(barScale(1500, 2200).top).toBe(2500);
  });

  it('ends on the value itself when it is a round tick', () => {
    expect(barScale(2000, 0)).toEqual({ top: 2000, ticks: [0, 500, 1000, 1500, 2000] });
  });

  it('keeps an axis of 0 to 1 when nothing is positive', () => {
    expect(barScale(0, 0)).toEqual({ top: 1, ticks: [0, 1] });
  });
});

describe('bucketLimit', () => {
  it.each([
    [1, 60],
    [45, 60],
    [46, 48],
    [100, 48],
    [101, 36],
    [200, 36],
    [201, 30],
    [400, 30],
    [401, 24],
    [3650, 24],
  ])('lets a %s-day span plot %s points', (span, limit) => {
    expect(bucketLimit(span)).toBe(limit);
  });
});

describe('downsample', () => {
  it('keeps a series within its limit as it is, oldest first', () => {
    const points = [
      { at: at('2026-04-03'), value: 71 },
      { at: at('2026-04-01'), value: 72 },
      { at: at('2026-04-02'), value: 71.5 },
    ];
    expect(downsample(points)).toEqual([points[1], points[2], points[0]]);
    expect(downsample([])).toEqual([]);
  });

  it('turns 365 daily readings into 30 points averaged in time and value (R05.16)', () => {
    const points = downsample(daily('2026-01-05', 365));
    expect(points).toHaveLength(30);
    // The first run is the 13 days 0–12: their mean is day 6 at the same hour, value 6.
    expect(points[0]).toEqual({ at: at(addDays('2026-01-05', 6), 8), value: 6 });
    // The last run is the 12 days 353–364: halfway between days 358 and 359.
    expect(points[29]?.value).toBe(358.5);
    expect(points[29]?.at).toBe(at(addDays('2026-01-05', 358), 8) + 12 * HOUR);
    for (let index = 1; index < points.length; index++) {
      expect(points[index]?.at).toBeGreaterThan(points[index - 1]?.at ?? Infinity);
    }
  });

  it('averages the readings of one day into one point when the series is dense', () => {
    // Two readings a day for 46 days: a 45-day span may plot 60, so each day becomes a point.
    const points: SeriesPoint[] = [];
    for (let index = 0; index < 46; index++) {
      const day = addDays('2026-04-01', index);
      points.push({ at: at(day, 7), value: 70 }, { at: at(day, 19), value: 71 });
    }
    const plotted = downsample(points);
    expect(plotted).toHaveLength(46);
    expect(plotted[10]).toEqual({ at: at(addDays('2026-04-01', 10), 13), value: 70.5 });
  });

  it('puts many readings of a single day into one point', () => {
    const points = Array.from({ length: 70 }, (_, index) => ({
      at: at('2026-04-01', 0) + index * 60_000,
      value: index,
    }));
    expect(downsample(points)).toEqual([{ at: at('2026-04-01', 0) + 69 * 30_000, value: 34.5 }]);
  });
});

describe('timeAxisLabels', () => {
  it('puts one label in the middle for a single reading', () => {
    expect(timeAxisLabels(at('2026-04-01'), at('2026-04-01'))).toEqual({
      style: 'day',
      labels: [{ at: at('2026-04-01'), day: '2026-04-01', share: 0.5 }],
    });
  });

  it('spaces five dates evenly over a month', () => {
    const axis = timeAxisLabels(at('2026-04-01'), at('2026-04-29'));
    expect(axis.style).toBe('day');
    expect(axis.labels.map((label) => label.day)).toEqual([
      '2026-04-01',
      '2026-04-08',
      '2026-04-15',
      '2026-04-22',
      '2026-04-29',
    ]);
    expect(axis.labels.map((label) => label.share)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('drops a label that repeats the day before it', () => {
    const axis = timeAxisLabels(at('2026-04-01', 8), at('2026-04-02', 8));
    expect(axis.labels.map((label) => [label.day, label.share])).toEqual([
      ['2026-04-01', 0],
      ['2026-04-02', 0.75],
    ]);
  });

  it('writes month and year at the first, middle and last date for 200 days across New Year', () => {
    const axis = timeAxisLabels(at('2025-09-15'), at(addDays('2025-09-15', 200)));
    expect(axis.style).toBe('monthYear');
    expect(axis.labels.map((label) => label.day)).toEqual([
      '2025-09-15',
      addDays('2025-09-15', 100),
      addDays('2025-09-15', 200),
    ]);
    expect(axis.labels.map((label) => label.share)).toEqual([0, 0.5, 1]);
  });

  it('keeps five day labels for 200 days inside one year', () => {
    const axis = timeAxisLabels(at('2026-01-10'), at(addDays('2026-01-10', 200)));
    expect(axis.style).toBe('day');
    expect(axis.labels).toHaveLength(5);
  });

  it('needs more than 150 days before New Year switches to month and year', () => {
    expect(timeAxisLabels(at('2025-12-20'), at('2026-01-10')).style).toBe('day');
    expect(timeAxisLabels(at('2025-10-01'), at(addDays('2025-10-01', 150))).style).toBe('day');
    expect(timeAxisLabels(at('2025-10-01'), at(addDays('2025-10-01', 151))).style).toBe(
      'monthYear',
    );
  });
});

describe('isClearlyHorizontal', () => {
  it('lets only drags well over half again as wide as they are tall scrub (R05.16)', () => {
    expect(isClearlyHorizontal(30, 10)).toBe(true);
    expect(isClearlyHorizontal(-24, 15)).toBe(true);
    expect(isClearlyHorizontal(12, 8)).toBe(false);
    expect(isClearlyHorizontal(6, -40)).toBe(false);
    expect(isClearlyHorizontal(0, 0)).toBe(false);
  });
});

describe('barLayout', () => {
  it('caps a week of bars at 60 px with 4 px gaps, centred', () => {
    // 7 × 60 + 6 × 4 = 444 px used of 500: 28 px on each side.
    expect(barLayout(500, 7)).toEqual({ start: 28, bar: 60, gap: 4 });
  });

  it('caps a single bar at 60 px in the middle', () => {
    expect(barLayout(360, 1)).toEqual({ start: 150, bar: 60, gap: 4 });
  });

  it('shares the width between bars under 60 px with 4 px gaps', () => {
    const layout = barLayout(360, 30);
    expect(layout.gap).toBe(4);
    expect(layout.bar).toBeCloseTo((360 - 29 * 4) / 30, 10);
    expect(layout.start).toBeCloseTo(0, 10);
  });

  it('keeps 2 px bars and narrows the gaps once 4 px gaps no longer fit', () => {
    const layout = barLayout(360, 100);
    expect(layout.bar).toBe(2);
    expect(layout.gap).toBeCloseTo(160 / 99, 10);
  });

  it('shrinks bar and gap together at 2 : 1 once the gaps would drop under 1 px', () => {
    const layout = barLayout(360, 365);
    expect(layout.gap).toBeCloseTo(360 / 1094, 10);
    expect(layout.bar).toBeCloseTo(2 * layout.gap, 10);
    expect(layout.start).toBeCloseTo(0, 10);
  });

  it('passes from narrowing gaps to shrinking bars without a jump', () => {
    // 50 bars: 2 px bars with 1 px gaps need exactly 149 px.
    expect(barLayout(149, 50)).toEqual({ start: 0, bar: 2, gap: 1 });
    const tighter = barLayout(148.9, 50);
    expect(tighter.bar).toBeCloseTo(2, 2);
    expect(tighter.gap).toBeCloseTo(1, 2);
  });

  it('fits every bar inside the plot so the newest day stays reachable (R05.15)', () => {
    for (const width of [360, 900]) {
      for (const count of [1, 7, 30, 90, 150, 151, 180, 299, 365, 1000, 3650]) {
        const layout = barLayout(width, count);
        const rightEdge = layout.start + count * layout.bar + (count - 1) * layout.gap;
        expect(layout.start).toBeGreaterThanOrEqual(0);
        expect(rightEdge).toBeLessThanOrEqual(width + 1e-6);
        expect(barIndexAt(layout, count, barCentre(layout, count - 1))).toBe(count - 1);
        expect(barIndexAt(layout, count, width)).toBe(count - 1);
        expect(barIndexAt(layout, count, 0)).toBe(0);
      }
    }
  });
});

describe('barIndexAt', () => {
  // Centres at 12, 28 and 44.
  const layout = { start: 6, bar: 12, gap: 4 };

  it('picks the bar with the nearest centre and clamps past either end', () => {
    expect(barIndexAt(layout, 3, -50)).toBe(0);
    expect(barIndexAt(layout, 3, 19.9)).toBe(0);
    expect(barIndexAt(layout, 3, 20.1)).toBe(1);
    expect(barIndexAt(layout, 3, 44)).toBe(2);
    expect(barIndexAt(layout, 3, 999)).toBe(2);
  });

  it('finds nothing without bars', () => {
    expect(barIndexAt(layout, 0, 20)).toBeNull();
  });
});

describe('barLabelIndices', () => {
  it('labels every bar while each slot is 40 px or wider', () => {
    expect(barLabelIndices(barLayout(500, 7), 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('thins the labels to 40 px each, counting back from the newest day', () => {
    for (const [width, count] of [
      [360, 30],
      [360, 90],
      [360, 365],
      [900, 365],
    ] as const) {
      const layout = barLayout(width, count);
      const picked = barLabelIndices(layout, count);
      expect(picked[picked.length - 1]).toBe(count - 1);
      for (let index = 1; index < picked.length; index++) {
        const apart =
          barCentre(layout, picked[index] ?? 0) - barCentre(layout, picked[index - 1] ?? 0);
        expect(apart).toBeGreaterThanOrEqual(40 - 1e-9);
      }
    }
    expect(barLabelIndices(barLayout(360, 30), 30)).toEqual([1, 5, 9, 13, 17, 21, 25, 29]);
  });

  it('labels nothing without bars', () => {
    expect(barLabelIndices(barLayout(360, 0), 0)).toEqual([]);
  });
});
