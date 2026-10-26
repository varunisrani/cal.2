import { describe, expect, it } from 'vitest';
import type { Profile } from '../model';
import { weightFromWheel } from '../units/body';
import {
  PACE_PRESETS,
  changeGoal,
  checkGoalWeight,
  goalWeightProblem,
  setBodyFat,
  setGoalWeight,
  setPace,
  withWeight,
} from './editRules';
import { defaultProfile } from './profile';

const base: Profile = { ...defaultProfile('2026-10-26'), saved: { kcal: 2100, protein: 140 } };
const losing: Profile = { ...base, goal: 'lose', weeklyKg: 0.5, goalWeightKg: 65 };
const gaining: Profile = { ...base, goal: 'gain', weeklyKg: 0.25, goalWeightKg: 75 };

describe('PACE_PRESETS', () => {
  it('offers 0.25, 0.5 and 1.0 kg a week', () => {
    expect(PACE_PRESETS.map((pace) => [pace.name, pace.kg])).toEqual([
      ['slow', 0.25],
      ['steady', 0.5],
      ['fast', 1],
    ]);
  });
});

describe('checkGoalWeight', () => {
  it('refuses a lose target at or above the current weight (D-16.11)', () => {
    expect(checkGoalWeight(losing, 70)).toBe('mustBeBelow');
    expect(checkGoalWeight(losing, 72)).toBe('mustBeBelow');
    expect(checkGoalWeight(losing, 69.9)).toBeNull();
  });

  it('refuses a gain target at or below the current weight (D-16.11)', () => {
    expect(checkGoalWeight(gaining, 70)).toBe('mustBeAbove');
    expect(checkGoalWeight(gaining, 65)).toBe('mustBeAbove');
    expect(checkGoalWeight(gaining, 70.1)).toBeNull();
  });

  it('needs no direction to maintain', () => {
    expect(checkGoalWeight(base, 60)).toBeNull();
    expect(checkGoalWeight(base, 80)).toBeNull();
    expect(goalWeightProblem('maintain', 70, 70)).toBeNull();
  });

  it('refuses a target outside 20–250 kg or not a number, and accepts every wheel end', () => {
    expect(checkGoalWeight(losing, 19.9)).toBe('outOfRange');
    expect(checkGoalWeight(gaining, 250.1)).toBe('outOfRange');
    expect(checkGoalWeight(losing, Number.NaN)).toBe('outOfRange');
    expect(checkGoalWeight(gaining, Infinity)).toBe('outOfRange');
    expect(checkGoalWeight(losing, 20)).toBeNull();
    expect(checkGoalWeight({ ...gaining, weightKg: 240 }, 250)).toBeNull();
    const fiftyLb = weightFromWheel({ whole: 50, tenth: 0 }, 'lb');
    const fiveHundredLb = weightFromWheel({ whole: 500, tenth: 0 }, 'lb');
    expect(checkGoalWeight(losing, fiftyLb)).toBeNull();
    expect(checkGoalWeight({ ...gaining, weightKg: 200 }, fiveHundredLb)).toBeNull();
  });
});

describe('setGoalWeight', () => {
  it('saves a target on the right side', () => {
    expect(setGoalWeight(losing, 62)).toEqual({ ok: true, value: { ...losing, goalWeightKg: 62 } });
  });

  it('refuses a target on the wrong side and leaves the profile as it was', () => {
    const before = structuredClone(losing);
    expect(setGoalWeight(losing, 71)).toEqual({ ok: false, error: 'mustBeBelow' });
    expect(losing).toEqual(before);
  });
});

describe('changeGoal', () => {
  it('clears pace and target when switching gain → maintain', () => {
    const profile = changeGoal(gaining, 'maintain');
    expect(profile.goal).toBe('maintain');
    expect('weeklyKg' in profile).toBe(false);
    expect('goalWeightKg' in profile).toBe(false);
  });

  it('sets a 0.5 kg pace when switching to lose or gain without one', () => {
    expect(changeGoal(base, 'lose')).toEqual({ ...base, goal: 'lose', weeklyKg: 0.5 });
    expect(changeGoal(base, 'gain').weeklyKg).toBe(0.5);
  });

  it('keeps a pace that is already set', () => {
    expect(changeGoal(gaining, 'lose').weeklyKg).toBe(0.25);
  });

  it('drops a target on the wrong side of the new direction and keeps one on the right side', () => {
    expect('goalWeightKg' in changeGoal(losing, 'gain')).toBe(false);
    expect('goalWeightKg' in changeGoal(gaining, 'lose')).toBe(false);
    expect(changeGoal({ ...gaining, goal: 'maintain' }, 'gain').goalWeightKg).toBe(75);
    const atCurrent: Profile = { ...base, goalWeightKg: 70 };
    expect('goalWeightKg' in changeGoal(atCurrent, 'lose')).toBe(false);
  });

  it('leaves the targets alone (R01.12)', () => {
    expect(changeGoal(losing, 'gain').saved).toEqual(base.saved);
    expect(changeGoal(gaining, 'maintain').saved).toEqual(base.saved);
  });
});

describe('withWeight', () => {
  it('clears a lose target that a new weigh-in has reached or passed', () => {
    const profile = withWeight(losing, 64.5);
    expect(profile.weightKg).toBe(64.5);
    expect('goalWeightKg' in profile).toBe(false);
    expect('goalWeightKg' in withWeight(losing, 65)).toBe(false);
  });

  it('clears a gain target at or below a new weigh-in', () => {
    expect('goalWeightKg' in withWeight(gaining, 75.2)).toBe(false);
  });

  it('keeps a target the new weight does not contradict, and the targets', () => {
    expect(withWeight(losing, 68)).toEqual({ ...losing, weightKg: 68 });
    expect(withWeight(gaining, 71)).toEqual({ ...gaining, weightKg: 71 });
    expect(withWeight({ ...base, goalWeightKg: 60 }, 55).goalWeightKg).toBe(60);
  });
});

describe('setBodyFat', () => {
  it('clears the body-fat goal when body fat is cleared', () => {
    const withGoal: Profile = { ...base, bodyFat: 0.22, goalBodyFat: 0.18 };
    const cleared = setBodyFat(withGoal, undefined);
    expect('bodyFat' in cleared).toBe(false);
    expect('goalBodyFat' in cleared).toBe(false);
  });

  it('keeps the body-fat goal when body fat changes', () => {
    const withGoal: Profile = { ...base, bodyFat: 0.22, goalBodyFat: 0.18 };
    expect(setBodyFat(withGoal, 0.2)).toEqual({ ...withGoal, bodyFat: 0.2 });
  });
});

describe('setPace', () => {
  it('sets the weekly pace', () => {
    expect(setPace(losing, 1).weeklyKg).toBe(1);
  });
});
