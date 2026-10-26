import { describe, expect, it } from 'vitest';
import { err, ok } from '../../lib/result';
import type { Fast } from '../model';
import {
  DEFAULT_GOAL_MIN,
  MAX_GOAL_MIN,
  MIN_GOAL_MIN,
  activeFast,
  canStart,
  checkEdit,
  clampGoalMin,
  endNow,
  fastLengthMs,
  fastMinutes,
  goalAt,
  isActive,
  overlaps,
  readDefaultGoalMin,
  splitMinutes,
  startFast,
} from './fasting';

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Midnight UTC on 26 October 2026; `clock(8)` is 08:00 that day, `clock(26)` 02:00 the next. */
const MIDNIGHT = Date.UTC(2026, 9, 26);
const clock = (hours: number, minutes = 0): number => MIDNIGHT + hours * HOUR + minutes * MIN;

function fast(id: string, startH: number, endH: number | null, goalMin = 16 * 60): Fast {
  return { id, start: clock(startH), end: endH === null ? null : clock(endH), goalMin };
}

describe('clampGoalMin', () => {
  it('holds a goal of 30 minutes to 60 and one of 20 000 to 10 080', () => {
    expect(clampGoalMin(30)).toBe(60);
    expect(clampGoalMin(20_000)).toBe(10_080);
    expect([MIN_GOAL_MIN, MAX_GOAL_MIN]).toEqual([60, 10_080]);
  });

  it('keeps a goal inside the range and rounds it to whole minutes', () => {
    expect(clampGoalMin(960)).toBe(960);
    expect(clampGoalMin(60)).toBe(60);
    expect(clampGoalMin(10_080)).toBe(10_080);
    expect(clampGoalMin(90.4)).toBe(90);
  });

  it('turns a goal that is not a finite number into the 16 h default', () => {
    expect(clampGoalMin(Number.NaN)).toBe(DEFAULT_GOAL_MIN);
    expect(clampGoalMin(Number.POSITIVE_INFINITY)).toBe(960);
  });
});

describe('readDefaultGoalMin', () => {
  it('clamps a stored default goal when it is read', () => {
    expect(readDefaultGoalMin(30)).toBe(60);
    expect(readDefaultGoalMin(20_000)).toBe(10_080);
    expect(readDefaultGoalMin(12 * 60)).toBe(720);
  });

  it('reads a missing or unreadable default as 16 h', () => {
    expect(readDefaultGoalMin(undefined)).toBe(960);
    expect(readDefaultGoalMin('960')).toBe(960);
    expect(readDefaultGoalMin(null)).toBe(960);
  });
});

describe('fast state and length', () => {
  it('treats a fast without an end as active, and finds it in a list', () => {
    const done = fast('done', 0, 6);
    const running = fast('running', 8, null);
    expect(isActive(running)).toBe(true);
    expect(isActive(done)).toBe(false);
    expect(activeFast([done, running])).toBe(running);
    expect(activeFast([done])).toBeUndefined();
  });

  it('counts a running fast up to now and a completed one up to its end', () => {
    const running = fast('a', 10, null);
    expect(fastLengthMs(running, clock(27))).toBe(17 * HOUR);
    const completed = { ...running, end: clock(26, 30) };
    expect(fastMinutes(completed, clock(40))).toBe(16 * 60 + 30);
  });

  it('never gives a negative length', () => {
    expect(fastLengthMs(fast('a', 10, null), clock(9))).toBe(0);
    expect(fastMinutes({ ...fast('b', 10, 8) }, clock(12))).toBe(0);
  });

  it('floors to whole minutes', () => {
    expect(fastMinutes(fast('a', 10, null), clock(10, 45) + 59_999)).toBe(45);
  });

  it('puts the goal time at start + goal, with the goal clamped when read', () => {
    expect(goalAt(fast('a', 10, null, 16 * 60))).toBe(clock(26));
    expect(goalAt(fast('b', 10, null, 30))).toBe(clock(11));
    expect(goalAt(fast('c', 0, null, 20_000))).toBe(clock(168));
  });
});

describe('splitMinutes', () => {
  it('splits 990, 960 and 45 minutes the way formatDuration prints "16h 30m", "16h" and "45m"', () => {
    expect(splitMinutes(990)).toEqual({ hours: 16, minutes: 30 });
    expect(splitMinutes(960)).toEqual({ hours: 16, minutes: 0 });
    expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
  });

  it('floors fractions and reads negative or non-finite lengths as 0', () => {
    expect(splitMinutes(65.9)).toEqual({ hours: 1, minutes: 5 });
    expect(splitMinutes(-5)).toEqual({ hours: 0, minutes: 0 });
    expect(splitMinutes(Number.NaN)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('overlaps', () => {
  it('does not count [08:00–10:00] and [10:00–12:00] as overlapping', () => {
    const morning = fast('a', 8, 10);
    const noon = fast('b', 10, 12);
    expect(overlaps(morning, noon)).toBe(false);
    expect(overlaps(noon, morning)).toBe(false);
  });

  it('counts any shared time, either way round', () => {
    expect(overlaps(fast('a', 8, 11), fast('b', 10, 12))).toBe(true);
    expect(overlaps(fast('b', 10, 12), fast('a', 8, 11))).toBe(true);
    expect(overlaps(fast('a', 8, 12), fast('b', 9, 10))).toBe(true);
  });

  it('treats a running fast as reaching to infinity', () => {
    const running = fast('a', 8, null);
    expect(overlaps(running, fast('b', 100, 120))).toBe(true);
    expect(overlaps(running, fast('c', 2, 8))).toBe(false);
    expect(overlaps(running, fast('d', 2, 9))).toBe(true);
    expect(overlaps(running, fast('e', 50, null))).toBe(true);
  });
});

describe('canStart and startFast', () => {
  it('refuses a start while a fast is active', () => {
    const stored = [fast('a', 0, 6), fast('b', 8, null)];
    expect(canStart(stored, clock(20))).toEqual(err('active'));
    expect(startFast(stored, 'new', 960, clock(20))).toEqual(err('active'));
  });

  it('refuses a start that would run into a stored fast ending later', () => {
    const stored = [fast('a', 8, 30)];
    expect(canStart(stored, clock(20))).toEqual(err('overlap'));
  });

  it('starts right at the end of the last fast', () => {
    const stored = [fast('a', 8, 20)];
    expect(canStart(stored, clock(20))).toEqual(ok(true));
    expect(startFast(stored, 'new', 960, clock(20))).toEqual(
      ok({ id: 'new', start: clock(20), end: null, goalMin: 960 }),
    );
  });

  it('clamps the goal of a new fast', () => {
    const short = startFast([], 'a', 30, clock(8));
    const long = startFast([], 'b', 20_000, clock(8));
    expect(short.ok && short.value.goalMin).toBe(60);
    expect(long.ok && long.value.goalMin).toBe(10_080);
  });
});

describe('checkEdit', () => {
  const earlier = fast('earlier', 0, 6);
  const later = fast('later', 8, 20);
  const stored = [earlier, later];

  it("refuses editing a completed fast into another's span, and stores nothing (R05.3)", () => {
    const moved = { ...later, start: clock(5) };
    expect(checkEdit(stored, moved)).toEqual(err('overlap'));
  });

  it('accepts a start moved back to the end of the fast before it', () => {
    const moved = { ...later, start: clock(6) };
    expect(checkEdit(stored, moved)).toEqual(ok(moved));
  });

  it('refuses an edit of a fast that is no longer stored', () => {
    expect(checkEdit([earlier], { ...later, goalMin: 720 })).toEqual(err('missing'));
  });

  it('refuses reopening a completed fast while another one runs', () => {
    const running = fast('running', 22, null);
    const reopened = { ...earlier, end: null };
    expect(checkEdit([earlier, running], reopened)).toEqual(err('active'));
  });

  it('lets a running fast stay running when its start or goal changes', () => {
    const running = fast('running', 22, null);
    const edited = { ...running, start: clock(21), goalMin: 18 * 60 };
    expect(checkEdit([...stored, running], edited)).toEqual(ok(edited));
  });

  it('clamps an end before the start to the start', () => {
    const backwards = { ...later, end: clock(7) };
    expect(checkEdit(stored, backwards)).toEqual(ok({ ...later, end: clock(8) }));
  });

  it('clamps the goal of an edited fast', () => {
    expect(checkEdit(stored, { ...later, goalMin: 30 })).toEqual(ok({ ...later, goalMin: 60 }));
    expect(checkEdit(stored, { ...later, goalMin: 20_000 })).toEqual(
      ok({ ...later, goalMin: 10_080 }),
    );
  });
});

describe('endNow', () => {
  const earlier = fast('earlier', 0, 6);
  const running = fast('running', 8, null, 16 * 60);
  const stored = [earlier, running];

  it('applies the edited start and goal and the end in one record (R05.3)', () => {
    const result = endNow(stored, 'running', { start: clock(7), goalMin: 18 * 60 }, clock(25));
    expect(result).toEqual(ok({ id: 'running', start: clock(7), end: clock(25), goalMin: 1080 }));
  });

  it('ends at now with the stored start and goal when nothing was edited', () => {
    expect(endNow(stored, 'running', {}, clock(24))).toEqual(ok({ ...running, end: clock(24) }));
  });

  it('refuses a start edited into an earlier fast, so neither the edit nor the end happens', () => {
    expect(endNow(stored, 'running', { start: clock(5) }, clock(24))).toEqual(err('overlap'));
    expect(stored[1]).toEqual(running);
  });

  it('refuses a fast that already ended or is no longer stored', () => {
    expect(endNow(stored, 'earlier', {}, clock(24))).toEqual(err('ended'));
    expect(endNow([earlier], 'running', {}, clock(24))).toEqual(err('missing'));
  });

  it('never ends before the start, and clamps the goal', () => {
    const result = endNow(stored, 'running', { start: clock(30), goalMin: 20_000 }, clock(24));
    expect(result).toEqual(
      ok({ id: 'running', start: clock(30), end: clock(30), goalMin: 10_080 }),
    );
  });
});
