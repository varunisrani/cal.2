import { describe, expect, it } from 'vitest';
import type { ActivityDay } from '../../data/hooks';
import { countedBurn, withBurn } from './burn';

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

describe('withBurn', () => {
  it('raises only the energy target', () => {
    const targets = { kcal: 2_000, protein: 120, carbs: 210, fat: 70 };
    expect(withBurn(targets, 350)).toEqual({ ...targets, kcal: 2_350 });
    expect(withBurn(targets, null)).toBe(targets);
  });
});
