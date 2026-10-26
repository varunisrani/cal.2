import { describe, expect, it } from 'vitest';
import type { Profile, WeighIn } from '../model';
import { crossesGoal, latestByTime, reachesGoalOnAdd } from './goalCrossing';

/** 08:00 UTC on the given day of October 2026. */
const october = (day: number): number => Date.UTC(2026, 9, day, 8);

function weighIn(id: string, day: number, kg: number): WeighIn {
  return { id, at: october(day), kg };
}

type GoalFields = Pick<Profile, 'goal' | 'goalWeightKg'>;
const losing: GoalFields = { goal: 'lose', goalWeightKg: 79.5 };

describe('crossesGoal', () => {
  it('fires when a lose goal goes from 80 to 79 with the target at 79.5', () => {
    expect(crossesGoal(weighIn('a', 1, 80), weighIn('b', 2, 79), 'lose', 79.5)).toBe(true);
  });

  it('does not fire for a later 79 once the latest is already past the target', () => {
    expect(crossesGoal(weighIn('b', 2, 79), weighIn('c', 3, 79), 'lose', 79.5)).toBe(false);
  });

  it('never fires for a back-dated reading, even one past the target (R05.7)', () => {
    expect(crossesGoal(weighIn('a', 10, 80), weighIn('old', 5, 79), 'lose', 79.5)).toBe(false);
    expect(crossesGoal(weighIn('a', 10, 70), weighIn('old', 5, 76), 'gain', 75)).toBe(false);
  });

  it('counts a reading at the same instant as the previous latest as not older', () => {
    const previous = weighIn('a', 4, 80);
    expect(crossesGoal(previous, { at: previous.at, kg: 79 }, 'lose', 79.5)).toBe(true);
  });

  it('counts reaching the target exactly, but not starting at it', () => {
    expect(crossesGoal(weighIn('a', 1, 80), weighIn('b', 2, 79.5), 'lose', 79.5)).toBe(true);
    expect(crossesGoal(weighIn('a', 1, 79.5), weighIn('b', 2, 79), 'lose', 79.5)).toBe(false);
  });

  it('fires for gain when the weight rises to or past the target', () => {
    expect(crossesGoal(weighIn('a', 1, 64), weighIn('b', 2, 65), 'gain', 65)).toBe(true);
    expect(crossesGoal(weighIn('a', 1, 64), weighIn('b', 2, 64.9), 'gain', 65)).toBe(false);
    expect(crossesGoal(weighIn('a', 1, 66), weighIn('b', 2, 67), 'gain', 65)).toBe(false);
  });

  it('never fires for maintain', () => {
    expect(crossesGoal(weighIn('a', 1, 80), weighIn('b', 2, 79), 'maintain', 79.5)).toBe(false);
    expect(crossesGoal(weighIn('a', 1, 64), weighIn('b', 2, 66), 'maintain', 65)).toBe(false);
  });

  it('never fires for the first weigh-in or without a target', () => {
    expect(crossesGoal(undefined, weighIn('b', 2, 79), 'lose', 79.5)).toBe(false);
    expect(crossesGoal(weighIn('a', 1, 80), weighIn('b', 2, 79), 'lose', undefined)).toBe(false);
  });
});

describe('latestByTime', () => {
  it('picks the reading with the greatest time, not the last one in the list', () => {
    const readings = [weighIn('b', 5, 81), weighIn('c', 9, 80), weighIn('a', 2, 82)];
    expect(latestByTime(readings)?.id).toBe('c');
  });

  it('gives a tie to the later one in the list, and nothing for an empty list', () => {
    expect(latestByTime([weighIn('a', 3, 80), weighIn('b', 3, 79)])?.id).toBe('b');
    expect(latestByTime([])).toBeUndefined();
  });
});

describe('reachesGoalOnAdd', () => {
  it('fires once as a lose series passes 79.5, then never again (R05.7, R01.11)', () => {
    const series = [
      weighIn('d1', 1, 81),
      weighIn('d2', 2, 80),
      weighIn('d3', 3, 79),
      weighIn('d4', 4, 79),
      weighIn('d5', 5, 78.5),
    ];
    const fired = series.map((added, i) => reachesGoalOnAdd(series.slice(0, i), added, losing));
    expect(fired).toEqual([false, false, true, false, false]);
  });

  it('never fires for a back-dated 79 while the latest is above the target', () => {
    const stored = [weighIn('a', 1, 81), weighIn('b', 10, 80)];
    expect(reachesGoalOnAdd(stored, weighIn('old', 5, 79), losing)).toBe(false);
  });

  it('takes the previous latest by date, whatever order the list is in', () => {
    const stored = [weighIn('newest', 10, 80), weighIn('older', 2, 79)];
    expect(reachesGoalOnAdd(stored, weighIn('next', 11, 79), losing)).toBe(true);
  });

  it('skips the added reading when the list already holds it', () => {
    const added = weighIn('new', 11, 79);
    const stored = [weighIn('a', 10, 80), added];
    expect(reachesGoalOnAdd(stored, added, losing)).toBe(true);
  });

  it('never fires for the first weigh-in, for maintain or without a goal weight', () => {
    expect(reachesGoalOnAdd([], weighIn('first', 1, 79), losing)).toBe(false);
    const stored = [weighIn('a', 1, 80)];
    const maintaining: GoalFields = { goal: 'maintain', goalWeightKg: 79.5 };
    expect(reachesGoalOnAdd(stored, weighIn('b', 2, 79), maintaining)).toBe(false);
    expect(reachesGoalOnAdd(stored, weighIn('b', 2, 79), { goal: 'lose' })).toBe(false);
  });
});
