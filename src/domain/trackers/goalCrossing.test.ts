import { describe, expect, it } from 'vitest';
import type { GoalKind, WeighIn } from '../model';
import { crossesGoal, latestWeighIn } from './goalCrossing';

const DAY = 86_400_000;
/** Instants a day apart, from 2026-10-01 08:00 UTC. */
const day = (n: number): number => Date.UTC(2026, 9, 1, 8) + n * DAY;

function reading(id: string, n: number, kg: number): WeighIn {
  return { id, at: day(n), kg };
}

/** Adds `added` to `stored` the way the weight repository does: compare with the latest first. */
function add(stored: WeighIn[], added: WeighIn, goal: GoalKind, target?: number): boolean {
  const fired = crossesGoal(latestWeighIn(stored), added, goal, target);
  stored.push(added);
  return fired;
}

describe('crossesGoal (R05.7, R01.11)', () => {
  it('fires once for lose 80 → 79 with target 79.5; a later 79 does not (R01.11)', () => {
    const stored = [reading('w1', 0, 80)];
    expect(add(stored, reading('w2', 1, 79), 'lose', 79.5)).toBe(true);
    expect(add(stored, reading('w3', 2, 79), 'lose', 79.5)).toBe(false);
    expect(add(stored, reading('w4', 3, 78.6), 'lose', 79.5)).toBe(false);
  });

  it('never fires for a back-dated 79 under target 79.5 (R05.7)', () => {
    const stored = [reading('w1', 10, 80)];
    expect(add(stored, reading('old', 2, 79), 'lose', 79.5)).toBe(false);
    // The latest is still the 80 of day 10, so a new reading after it does cross.
    expect(add(stored, reading('w2', 11, 79), 'lose', 79.5)).toBe(true);
  });

  it('never fires for back-dated readings past the goal, lose or gain (R05.7)', () => {
    const latest = reading('latest', 0, 92);
    expect(crossesGoal(latest, reading('older', -150, 86), 'lose', 88)).toBe(false);
    expect(crossesGoal(latest, reading('newer', 1, 86), 'lose', 88)).toBe(true);
    expect(crossesGoal(latest, reading('older', -150, 99), 'gain', 95)).toBe(false);
    expect(crossesGoal(latest, reading('newer', 1, 99), 'gain', 95)).toBe(true);
  });

  it('never fires for the first reading (R05.7, R01.11)', () => {
    expect(add([], reading('w1', 0, 70), 'lose', 75)).toBe(false);
    expect(crossesGoal(null, reading('w1', 0, 70), 'lose', 75)).toBe(false);
    expect(crossesGoal(undefined, reading('w1', 0, 90), 'gain', 85)).toBe(false);
  });

  it('never fires for maintain (R05.7, R01.11)', () => {
    expect(crossesGoal(reading('w1', 0, 80), reading('w2', 1, 79), 'maintain', 79.5)).toBe(false);
    expect(crossesGoal(reading('w1', 0, 79), reading('w2', 1, 80), 'maintain', 79.5)).toBe(false);
  });

  it('fires for gain 70 → 72 with target 71, once (R01.11)', () => {
    const stored = [reading('w1', 0, 70)];
    expect(add(stored, reading('w2', 1, 72), 'gain', 71)).toBe(true);
    expect(add(stored, reading('w3', 2, 72.4), 'gain', 71)).toBe(false);
  });

  it('counts landing exactly on the target, and a reading at the same instant as the latest (R01.11)', () => {
    expect(crossesGoal(reading('w1', 0, 80), reading('w2', 1, 79.5), 'lose', 79.5)).toBe(true);
    expect(crossesGoal(reading('w1', 0, 70), reading('w2', 1, 71), 'gain', 71)).toBe(true);
    expect(crossesGoal(reading('w1', 4, 80), reading('w2', 4, 79), 'lose', 79.5)).toBe(true);
  });

  it('does not fire when the previous latest was already at or past the target (R01.11)', () => {
    expect(crossesGoal(reading('w1', 0, 79.5), reading('w2', 1, 79), 'lose', 79.5)).toBe(false);
    expect(crossesGoal(reading('w1', 0, 71), reading('w2', 1, 72), 'gain', 71)).toBe(false);
  });

  it('does not fire for a reading that stays short of the target or moves away (R01.11)', () => {
    expect(crossesGoal(reading('w1', 0, 80), reading('w2', 1, 79.6), 'lose', 79.5)).toBe(false);
    expect(crossesGoal(reading('w1', 0, 80), reading('w2', 1, 81), 'lose', 79.5)).toBe(false);
    expect(crossesGoal(reading('w1', 0, 70), reading('w2', 1, 69), 'gain', 71)).toBe(false);
  });

  it('never fires without a target weight', () => {
    expect(crossesGoal(reading('w1', 0, 80), reading('w2', 1, 70), 'lose', undefined)).toBe(false);
  });
});

describe('latestWeighIn (R05.7)', () => {
  it('picks the latest by date, not the last added (R05.7)', () => {
    const newest = reading('newest', 9, 79);
    expect(latestWeighIn([reading('a', 2, 81), newest, reading('back-dated', 1, 82)])).toBe(newest);
  });

  it('takes the later one in the list for two readings at the same instant', () => {
    const second = reading('second', 3, 80.2);
    expect(latestWeighIn([reading('first', 3, 80), second])).toBe(second);
  });

  it('is null for no readings', () => {
    expect(latestWeighIn([])).toBeNull();
  });
});
