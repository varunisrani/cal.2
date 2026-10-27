import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { startOfDay, type DayKey } from '../../domain/dates/dayKey';
import {
  windowNutrition,
  type WindowNutrition,
  type WindowNutritionInput,
} from '../../domain/progress/averages';
import { DEFAULT_GOAL_VALUES } from '../../domain/nutrients/goalDefaults';
import { makeEntry } from '../../test/factories';
import { runPending, useFakeTime } from '../../test/time';
import { runInSlices, useNutritionStats } from './useNutritionStats';

const HOUR = 3_600_000;

/** A window of the given days, each with one entry of `kcal`. */
function windowOf(days: ReadonlyArray<readonly [DayKey, number]>): WindowNutritionInput {
  const keys = days.map(([day]) => day).sort();
  return {
    entries: days.map(([day, kcal]) =>
      makeEntry({ loggedAt: startOfDay(day) + 12 * HOUR, dayKey: day, kcal }),
    ),
    window: { first: keys[0] ?? '2026-10-20', last: keys.at(-1) ?? '2026-10-26' },
    goals: DEFAULT_GOAL_VALUES,
  };
}

/** Steps that count how far they got. */
function* counted(total: number, progress: { taken: number }): Generator<void, string, void> {
  for (let i = 0; i < total; i++) {
    progress.taken += 1;
    yield;
  }
  return 'finished';
}

describe('runInSlices', () => {
  it('runs nothing at once, then one slice per turn until the steps end', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    const progress = { taken: 0 };
    const onDone = vi.fn();
    runInSlices(counted(5, progress), onDone, { stepsPerSlice: 2 });
    expect(progress.taken).toBe(0);

    runPending();
    expect(progress.taken).toBe(2);
    runPending();
    expect(progress.taken).toBe(4);
    expect(onDone).not.toHaveBeenCalled();
    runPending();
    expect(onDone).toHaveBeenCalledExactlyOnceWith('finished');
  });

  it('stops a cancelled run between slices and never reports it', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    const progress = { taken: 0 };
    const onDone = vi.fn();
    const cancel = runInSlices(counted(10, progress), onDone, { stepsPerSlice: 3 });
    runPending();
    expect(progress.taken).toBe(3);

    cancel();
    vi.runAllTimers();
    expect(progress.taken).toBe(3);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('never starts a run cancelled before its first slice', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    const progress = { taken: 0 };
    const onDone = vi.fn();
    runInSlices(counted(1, progress), onDone)();
    vi.runAllTimers();
    expect(progress.taken).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('useNutritionStats', () => {
  const older = windowOf([
    ['2026-10-20', 1_500],
    ['2026-10-21', 1_700],
  ]);
  const newer = windowOf([
    ['2026-10-22', 1_800],
    ['2026-10-24', 2_200],
  ]);

  it('has nothing to show and starts nothing while the data is still being read', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    const { result } = renderHook(() => useNutritionStats(null));
    act(() => vi.runAllTimers());
    expect(result.current).toEqual({ stats: null, stale: true });
  });

  it('shows the numbers once the run ends', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    const { result } = renderHook(() => useNutritionStats(newer));
    expect(result.current).toEqual({ stats: null, stale: true });

    act(() => vi.runAllTimers());
    expect(result.current.stale).toBe(false);
    expect(result.current.stats?.averageKcal).toBe(2_000);
    expect(result.current.stats).toEqual(windowNutrition(newer));
  });

  it('cancels the older run for a newer input: only the newer numbers ever show', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    const seen: Array<WindowNutrition | null> = [];
    const { result, rerender } = renderHook(
      ({ input }: { input: WindowNutritionInput }) => {
        const view = useNutritionStats(input);
        seen.push(view.stats);
        return view;
      },
      { initialProps: { input: older } },
    );

    rerender({ input: newer });
    act(() => vi.runAllTimers());
    expect(result.current.stats?.averageKcal).toBe(2_000);
    expect(seen.some((stats) => stats?.averageKcal === 1_600)).toBe(false);
  });

  it('keeps the older numbers, marked stale, until the newer run ends', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    const { result, rerender } = renderHook(
      ({ input }: { input: WindowNutritionInput | null }) => useNutritionStats(input),
      { initialProps: { input: older as WindowNutritionInput | null } },
    );
    act(() => vi.runAllTimers());
    expect(result.current.stats?.averageKcal).toBe(1_600);
    expect(result.current.stale).toBe(false);

    // The new window's entries are being read: the old numbers stay, stale.
    rerender({ input: null });
    expect(result.current.stats?.averageKcal).toBe(1_600);
    expect(result.current.stale).toBe(true);

    rerender({ input: newer });
    expect(result.current.stats?.averageKcal).toBe(1_600);
    expect(result.current.stale).toBe(true);

    act(() => vi.runAllTimers());
    expect(result.current.stats?.averageKcal).toBe(2_000);
    expect(result.current.stale).toBe(false);
  });

  it('does not run again when the same input comes back', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    const { result, rerender } = renderHook(
      ({ input }: { input: WindowNutritionInput }) => useNutritionStats(input),
      { initialProps: { input: newer } },
    );
    act(() => vi.runAllTimers());
    const first = result.current.stats;
    rerender({ input: newer });
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.stats).toBe(first);
    expect(result.current.stale).toBe(false);
  });
});
