import { describe, expect, it } from 'vitest';
import type { ActivityDay } from '../../data/hooks';
import { burnSource, countedBurn, walkBurn, withBurn } from './burn';

function day(activeKcal: number | null): ActivityDay {
  return {
    day: '2026-10-26',
    steps: 8_000,
    activeKcal,
    totalKcal: 2_400,
    distanceM: null,
    sessions: [],
    syncedAt: 0,
  };
}

describe('countedBurn', () => {
  it("adds the day's active calories, rounded to whole kcal", () => {
    expect(countedBurn(2_000, day(349.6))).toBe(350);
  });

  it('adds nothing without active calories, for 0 or less, without a day or without a goal', () => {
    expect(countedBurn(2_000, day(null))).toBeNull();
    expect(countedBurn(2_000, day(0.4))).toBeNull();
    expect(countedBurn(2_000, null)).toBeNull();
    expect(countedBurn(0, day(300))).toBeNull();
  });
});

describe('walkBurn (P15-03)', () => {
  it("adds the active calories of the day's recorded walks, rounded to whole kcal", () => {
    expect(walkBurn(2_000, [{ activeKcal: 90.4 }, { activeKcal: 60.3 }])).toBe(151);
  });

  it('adds nothing without walks, for 0 or less, or without a goal', () => {
    expect(walkBurn(2_000, [])).toBeNull();
    expect(walkBurn(2_000, [{ activeKcal: 0.2 }])).toBeNull();
    expect(walkBurn(0, [{ activeKcal: 120 }])).toBeNull();
  });
});

describe('burnSource (D-16.96)', () => {
  it("counts Health Connect's day whenever it is connected, never the walks on top", () => {
    expect(burnSource(true, true)).toBe('health');
    expect(burnSource(true, false)).toBe('health');
  });

  it('counts the recorded walks without Health Connect, and nothing on the web', () => {
    expect(burnSource(false, true)).toBe('walks');
    expect(burnSource(false, false)).toBe('none');
  });
});

describe('withBurn', () => {
  it('raises only the energy target', () => {
    const targets = { kcal: 2_000, protein: 120, carbs: 210, fat: 70 };
    expect(withBurn(targets, 350)).toEqual({ ...targets, kcal: 2_350 });
    expect(withBurn(targets, null)).toBe(targets);
  });
});
