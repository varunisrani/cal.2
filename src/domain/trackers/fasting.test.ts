import { describe, expect, it } from 'vitest';
import { isOk } from '../../lib/result';
import type { Fast } from '../model';
import {
  activeFast,
  canStart,
  checkEdit,
  clampFastGoal,
  decodeFastGoal,
  endNow,
  fastDuration,
  formatFast,
  goalAt,
  isActive,
  newFast,
  overlaps,
  DEFAULT_FAST_GOAL_MINUTES,
  FAST_GOAL_MAX_MINUTES,
  FAST_GOAL_MIN_MINUTES,
} from './fasting';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Local time on 2026-10-20 (or `day` of October). */
const at = (hours: number, minutes = 0, day = 20): number =>
  new Date(2026, 9, day, hours, minutes).getTime();

function fast(id: string, start: number, end: number | null, goalMin = 960): Fast {
  return { id, start, end, goalMin };
}

/** A copy that a test can compare against after a refused change. */
const snapshot = (fasts: readonly Fast[]): Fast[] => fasts.map((item) => ({ ...item }));

describe('goal minutes', () => {
  it.each([
    [30, 60],
    [60, 60],
    [960, 960],
    [10_080, 10_080],
    [20_000, 10_080],
    [59.6, 60],
    [90.4, 90],
    [-5, 60],
    [Number.NaN, 960],
  ])('clamps %d to %d', (minutes, expected) => {
    expect(clampFastGoal(minutes)).toBe(expected);
  });

  it('is an hour to a week, 16 hours by default', () => {
    expect(FAST_GOAL_MIN_MINUTES).toBe(60);
    expect(FAST_GOAL_MAX_MINUTES).toBe(7 * 24 * 60);
    expect(DEFAULT_FAST_GOAL_MINUTES).toBe(16 * 60);
  });

  it('reads the stored default goal clamped, and anything that is not a number as 16 hours', () => {
    expect(decodeFastGoal(30)).toBe(60);
    expect(decodeFastGoal(20_000)).toBe(10_080);
    expect(decodeFastGoal(720)).toBe(720);
    for (const junk of ['720', null, undefined, {}, true]) {
      expect(decodeFastGoal(junk)).toBe(960);
    }
  });
});

describe('a fast', () => {
  it('is active while it has no end', () => {
    expect(isActive(fast('a', at(10), null))).toBe(true);
    expect(isActive(fast('a', at(10), at(12)))).toBe(false);
  });

  it('reaches its goal at start + the goal', () => {
    expect(goalAt(fast('a', at(19), null, 720))).toBe(at(19) + 12 * HOUR);
    expect(goalAt(fast('a', at(19), null, 20))).toBe(at(19) + HOUR);
  });

  it('measures to now while active and to its end once ended', () => {
    expect(fastDuration(fast('a', at(6), null), at(19, 20))).toBe(13 * HOUR + 20 * MINUTE);
    expect(fastDuration(fast('a', at(6), at(8, 30)), at(23))).toBe(2.5 * HOUR);
  });

  it('never has a negative length', () => {
    expect(fastDuration(fast('a', at(10), null), at(9))).toBe(0);
    expect(fastDuration(fast('a', at(10), at(9)), at(11))).toBe(0);
  });

  it('starts now, running, with a clamped goal', () => {
    expect(newFast('f1', 30, at(20))).toEqual({ id: 'f1', start: at(20), end: null, goalMin: 60 });
    expect(newFast('f2', 20_000, at(20)).goalMin).toBe(10_080);
  });

  it('finds the running fast', () => {
    const running = fast('b', at(12), null);
    expect(activeFast([fast('a', at(8), at(10)), running])).toBe(running);
    expect(activeFast([fast('a', at(8), at(10))])).toBeNull();
    expect(activeFast([])).toBeNull();
  });
});

describe('formatFast', () => {
  it.each([
    [990, '16h 30m'],
    [960, '16h'],
    [45, '45m'],
    [61, '1h 1m'],
    [10_080, '168h'],
    [0, '0m'],
    [59.9, '59m'],
    [990.99, '16h 30m'],
    [-5, '0m'],
    [Number.NaN, '0m'],
  ])('%d minutes → %s', (minutes, text) => {
    expect(formatFast(minutes)).toBe(text);
  });

  it('formats a measured duration in whole minutes', () => {
    const done = fast('a', at(7, 15), at(7, 15) + 16 * HOUR + 30 * MINUTE + 59_000);
    expect(formatFast(fastDuration(done, at(23)) / MINUTE)).toBe('16h 30m');
  });
});

describe('overlaps (R05.3)', () => {
  it('lets [08:00–10:00] and [10:00–12:00] touch without overlapping (R05.3)', () => {
    const morning = fast('a', at(8), at(10));
    const noon = fast('b', at(10), at(12));
    expect(overlaps(morning, noon)).toBe(false);
    expect(overlaps(noon, morning)).toBe(false);
  });

  it('overlaps once the spans share a minute, either way round (R05.3)', () => {
    const morning = fast('a', at(8), at(10, 1));
    const noon = fast('b', at(10), at(12));
    expect(overlaps(morning, noon)).toBe(true);
    expect(overlaps(noon, morning)).toBe(true);
    expect(overlaps(fast('c', at(9), at(13)), noon)).toBe(true);
  });

  it('treats a running fast as never ending (R05.3)', () => {
    const running = fast('a', at(9), null);
    expect(overlaps(running, fast('b', at(20), at(22), 960))).toBe(true);
    expect(overlaps(running, fast('c', at(8), at(9, 30)))).toBe(true);
    expect(overlaps(running, fast('d', at(7), at(9)))).toBe(false);
    expect(overlaps(running, fast('e', at(23), null))).toBe(true);
  });
});

describe('canStart (R05.3)', () => {
  it('refuses a start while one is active (R05.3)', () => {
    expect(canStart([fast('a', at(8), null)], at(20))).toBe('active');
  });

  it('refuses a start before a stored fast ends (R05.3)', () => {
    // A completed fast edited to end in the future still blocks a fast starting now.
    expect(canStart([fast('a', at(8), at(22))], at(20))).toBe('overlap');
  });

  it('allows a start exactly when the last fast ended, or with no fasts', () => {
    expect(canStart([fast('a', at(8), at(20))], at(20))).toBeNull();
    expect(canStart([], at(20))).toBeNull();
  });
});

describe('checkEdit (R05.3)', () => {
  const stored = [fast('a', at(8), at(10)), fast('b', at(12), at(14))];

  it("refuses editing a completed fast into another's span and changes nothing (R05.3)", () => {
    const before = snapshot(stored);
    const result = checkEdit(stored, fast('b', at(9), at(14)));
    expect(result).toEqual({ ok: false, error: 'overlap' });
    expect(stored).toEqual(before);
  });

  it('clamps an end before the start up to the start (R05.3)', () => {
    const result = checkEdit(stored, fast('b', at(12), at(11)));
    expect(result).toEqual({ ok: true, value: fast('b', at(12), at(12)) });
  });

  it('clamps the goal on an edit (R05.3)', () => {
    const short = checkEdit(stored, fast('b', at(12), at(14), 30));
    const long = checkEdit(stored, fast('b', at(12), at(14), 20_000));
    expect(isOk(short) && short.value.goalMin).toBe(60);
    expect(isOk(long) && long.value.goalMin).toBe(10_080);
  });

  it('refuses an edit of a fast that is no longer stored (R05.3)', () => {
    expect(checkEdit(stored, fast('gone', at(16), at(18)))).toEqual({
      ok: false,
      error: 'missing',
    });
  });

  it('refuses reopening a completed fast while another runs (R05.3)', () => {
    const withRunning = [fast('a', at(8), at(10)), fast('b', at(12), null)];
    expect(checkEdit(withRunning, fast('a', at(8), null))).toEqual({
      ok: false,
      error: 'active',
    });
  });

  it('refuses reopening a fast that a later fast follows (R05.3)', () => {
    expect(checkEdit(stored, fast('a', at(8), null))).toEqual({ ok: false, error: 'overlap' });
  });

  it('accepts an edit that keeps a fast where it was; it never meets itself', () => {
    expect(checkEdit(stored, fast('a', at(8), at(10), 720))).toEqual({
      ok: true,
      value: fast('a', at(8), at(10), 720),
    });
  });

  it('keeps a running fast running when its start moves (R05.3)', () => {
    const withRunning = [fast('a', at(8), at(10)), fast('b', at(12), null)];
    expect(checkEdit(withRunning, fast('b', at(11), null))).toEqual({
      ok: true,
      value: fast('b', at(11), null),
    });
    expect(checkEdit(withRunning, fast('b', at(9), null))).toEqual({
      ok: false,
      error: 'overlap',
    });
  });

  it('writes only the fields of a fast', () => {
    const edited = { ...fast('b', at(12), at(14)), note: 'not stored' } as Fast;
    const result = checkEdit(stored, edited);
    expect(isOk(result) && Object.keys(result.value).sort()).toEqual([
      'end',
      'goalMin',
      'id',
      'start',
    ]);
  });
});

describe('endNow (R05.3)', () => {
  const stored = [fast('a', at(8), at(10)), fast('b', at(12), null)];

  it('applies the edited start and goal and the end in one result (R05.3)', () => {
    expect(endNow(stored, 'b', { start: at(11), goalMin: 720 }, at(20))).toEqual({
      ok: true,
      value: fast('b', at(11), at(20), 720),
    });
  });

  it('refuses both changes when the edited start overlaps another fast (R05.3)', () => {
    const before = snapshot(stored);
    expect(endNow(stored, 'b', { start: at(9) }, at(20))).toEqual({
      ok: false,
      error: 'overlap',
    });
    expect(stored).toEqual(before);
  });

  it('ends without edits at now, keeping the start and goal', () => {
    expect(endNow(stored, 'b', {}, at(20))).toEqual({ ok: true, value: fast('b', at(12), at(20)) });
  });

  it('never ends before the start (R05.3)', () => {
    expect(endNow(stored, 'b', {}, at(11))).toEqual({ ok: true, value: fast('b', at(12), at(12)) });
    expect(endNow(stored, 'b', { start: at(21) }, at(20))).toEqual({
      ok: true,
      value: fast('b', at(21), at(21)),
    });
  });

  it('clamps the edited goal', () => {
    const result = endNow(stored, 'b', { goalMin: 20 }, at(20));
    expect(isOk(result) && result.value.goalMin).toBe(60);
  });

  it('refuses a completed or missing fast (R05.3)', () => {
    expect(endNow(stored, 'a', {}, at(20))).toEqual({ ok: false, error: 'notActive' });
    expect(endNow(stored, 'gone', {}, at(20))).toEqual({ ok: false, error: 'missing' });
  });
});
