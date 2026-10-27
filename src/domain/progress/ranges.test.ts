import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, startOfDay } from '../dates/dayKey';
import {
  availableMetrics,
  canGoLater,
  changeToTenth,
  earlier,
  FIRST_VIEW,
  hasPeriods,
  later,
  nutritionWindow,
  periodWindow,
  PROGRESS_RANGES,
  RANGE_DAYS,
  readingsIn,
  shownMetric,
  summarise,
  withRange,
  type PeriodView,
} from './ranges';

const HOUR = 3_600_000;
const TODAY = '2026-10-26';

const view = (range: PeriodView['range'], offset = 0): PeriodView => ({ range, offset });

describe('ranges and periods', () => {
  it('covers 7, 30, 90, 180, 365 and 3 650 days, opening on the week', () => {
    expect(PROGRESS_RANGES.map((range) => RANGE_DAYS[range])).toEqual([7, 30, 90, 180, 365, 3650]);
    expect(FIRST_VIEW).toEqual({ range: 'week', offset: 0 });
    expect(periodWindow(FIRST_VIEW, TODAY)).toEqual({ first: '2026-10-20', last: TODAY });
  });

  it('ends the 1M window one step back 30 days before today', () => {
    expect(periodWindow(view('month', 1), TODAY)).toEqual({
      first: '2026-08-28',
      last: '2026-09-26',
    });
    expect(daysBetween('2026-09-26', TODAY)).toBe(30);
  });

  it('gives every range its day count and contiguous windows as the offset grows', () => {
    for (const range of PROGRESS_RANGES.filter(hasPeriods)) {
      for (let offset = 0; offset <= 3; offset++) {
        const window = periodWindow(view(range, offset), TODAY);
        const before = periodWindow(view(range, offset + 1), TODAY);
        expect(daysBetween(window.first, window.last) + 1).toBe(RANGE_DAYS[range]);
        expect(before.last).toBe(addDays(window.first, -1));
      }
    }
  });

  it('starts a new range on its current window and keeps the view for the same range', () => {
    const backTwice = earlier(earlier(view('month')));
    expect(backTwice.offset).toBe(2);
    expect(withRange(backTwice, 'quarter')).toEqual({ range: 'quarter', offset: 0 });
    expect(withRange(backTwice, 'month')).toBe(backTwice);
  });

  it('steps forward only from a past window, and never past the current one', () => {
    const current = view('week');
    expect(canGoLater(current)).toBe(false);
    expect(later(current)).toEqual(current);
    const past = earlier(current);
    expect(canGoLater(past)).toBe(true);
    expect(later(past)).toEqual(current);
  });

  it('has no periods for All: the arrows change nothing and the window ends today', () => {
    expect(PROGRESS_RANGES.filter((range) => !hasPeriods(range))).toEqual(['all']);
    const all = view('all');
    expect(earlier(all)).toBe(all);
    expect(canGoLater(view('all', 2))).toBe(false);
    expect(periodWindow(view('all', 2), TODAY)).toEqual({ first: '2016-10-29', last: TODAY });
  });

  it('treats a negative or fractional offset as whole windows back from today', () => {
    expect(periodWindow(view('week', -3), TODAY)).toEqual(periodWindow(view('week'), TODAY));
    expect(periodWindow(view('week', 1.7), TODAY)).toEqual(periodWindow(view('week', 1), TODAY));
  });
});

describe('nutritionWindow', () => {
  it('is the period window while today counts', () => {
    expect(nutritionWindow(view('week', 1), TODAY, true)).toEqual(
      periodWindow(view('week', 1), TODAY),
    );
  });

  it('ends yesterday when today does not count, and moves past periods back by the same day', () => {
    expect(nutritionWindow(view('week'), TODAY, false)).toEqual({
      first: '2026-10-19',
      last: '2026-10-25',
    });
    expect(nutritionWindow(view('week', 1), TODAY, false)).toEqual({
      first: '2026-10-12',
      last: '2026-10-18',
    });
    expect(nutritionWindow(view('month', 1), TODAY, false).last).toBe('2026-09-25');
  });
});

describe('readingsIn', () => {
  const window = periodWindow(view('week'), TODAY);

  it('keeps a reading logged at 21:00 on the last day and leaves out the day before the first (R05.5)', () => {
    const late = { id: 'late', at: startOfDay(TODAY) + 21 * HOUR };
    const early = { id: 'early', at: startOfDay(window.first) + 7 * HOUR };
    const before = { id: 'before', at: startOfDay(window.first) - 1 };
    expect(readingsIn([late, before, early], window).map((reading) => reading.id)).toEqual([
      'early',
      'late',
    ]);
  });
});

describe('metrics', () => {
  it('offers only weight with no body-fat reading, profile value or goal', () => {
    expect(availableMetrics({ readings: 0 })).toEqual(['weight']);
  });

  it('offers body fat after weight for a reading, a profile value or only a goal', () => {
    expect(availableMetrics({ readings: 1 })).toEqual(['weight', 'bodyFat']);
    expect(availableMetrics({ readings: 0, profileValue: 0.22 })).toEqual(['weight', 'bodyFat']);
    expect(availableMetrics({ readings: 0, goal: 0.18 })).toEqual(['weight', 'bodyFat']);
  });

  it('shows the chosen metric while offered and falls back to weight when it goes', () => {
    expect(shownMetric('bodyFat', ['weight', 'bodyFat'])).toBe('bodyFat');
    expect(shownMetric('bodyFat', ['weight'])).toBe('weight');
    expect(shownMetric('weight', ['weight'])).toBe('weight');
  });
});

describe('summarise', () => {
  it('takes the last minus the first reading by time, and the mean', () => {
    const points = [
      { at: 3 * HOUR, value: 71.2 },
      { at: 1 * HOUR, value: 72 },
      { at: 2 * HOUR, value: 71.6 },
    ];
    const summary = summarise(points);
    expect(summary?.change).toBeCloseTo(-0.8, 9);
    expect(summary?.average).toBeCloseTo(71.6, 9);
  });

  it('gives a change of 0 for one reading and nothing for none', () => {
    expect(summarise([{ at: 0, value: 70 }])).toEqual({ change: 0, average: 70 });
    expect(summarise([])).toBeNull();
  });
});

describe('changeToTenth', () => {
  it('reads a change closer to zero than 0.05 as 0, never −0 (ACC-G3-2)', () => {
    expect(Object.is(changeToTenth(-0.04), 0)).toBe(true);
    expect(Object.is(changeToTenth(0.049), 0)).toBe(true);
    expect(changeToTenth(Number.NaN)).toBe(0);
  });

  it('rounds the rest half away from zero to one decimal', () => {
    expect(changeToTenth(0.05)).toBe(0.1);
    expect(changeToTenth(-0.05)).toBe(-0.1);
    expect(changeToTenth(1.94)).toBe(1.9);
    expect(changeToTenth(-1.15)).toBe(-1.2);
  });
});
