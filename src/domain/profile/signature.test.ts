import { describe, expect, it } from 'vitest';
import type { Profile } from '../model';
import { setMacro } from '../goals/locks';
import { changeGoal, withWeight } from './editRules';
import { defaultProfile } from './profile';
import { baselineToSeed, needsRebuild, planInputsKey } from './signature';

const today = '2026-10-26';
const base: Profile = {
  ...defaultProfile(today),
  goal: 'lose',
  weeklyKg: 0.5,
  goalWeightKg: 65,
  bodyFat: 0.22,
  goalBodyFat: 0.18,
  allergens: ['peanut'],
};

describe('planInputsKey', () => {
  it('stays equal when allergens, the body-fat goal, targets or locks change', () => {
    const key = planInputsKey(base);
    const unchanged: Profile[] = [
      { ...base, allergens: ['peanut', 'sesame'] },
      { ...base, allergens: [] },
      { ...base, goalBodyFat: 0.15 },
      { ...base, goalBodyFat: undefined },
      { ...base, saved: { kcal: 1800, protein: 160, carbs: 150, fat: 60 } },
      { ...base, caloriesLocked: true, lockedMacros: ['protein', 'fat'] },
    ];
    for (const profile of unchanged) expect(planInputsKey(profile)).toBe(key);
    const locked = setMacro(base, 'protein', 160, today);
    expect(locked.ok && planInputsKey(locked.value)).toBe(key);
  });

  it('changes when the weight changes', () => {
    expect(planInputsKey({ ...base, weightKg: 70.1 })).not.toBe(planInputsKey(base));
  });

  it('changes with every plan input', () => {
    const key = planInputsKey(base);
    const changed: Profile[] = [
      { ...base, sex: 'female' },
      { ...base, birthDate: '2001-10-27' },
      { ...base, heightCm: 176 },
      { ...base, weightKg: 69 },
      { ...base, activity: 'light' },
      { ...base, goal: 'gain' },
      { ...base, weeklyKg: 0.25 },
      { ...base, weeklyKg: undefined },
      { ...base, goalWeightKg: 64 },
      { ...base, goalWeightKg: undefined },
      { ...base, bodyFat: 0.21 },
      { ...base, bodyFat: undefined },
    ];
    const keys = changed.map(planInputsKey);
    for (const other of keys) expect(other).not.toBe(key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('writes the same number one way and tells an absent pace from 0', () => {
    expect(planInputsKey({ ...base, weightKg: 70.0 })).toBe(
      planInputsKey({ ...base, weightKg: 70 }),
    );
    expect(planInputsKey({ ...base, weeklyKg: 0 })).not.toBe(
      planInputsKey({ ...base, weeklyKg: undefined }),
    );
  });
});

describe('needsRebuild', () => {
  it('shows no nudge when there is no baseline yet, and seeds one silently (R01.12)', () => {
    expect(needsRebuild(base, undefined)).toBe(false);
    expect(needsRebuild(base, null)).toBe(false);
    const seed = baselineToSeed(base, undefined);
    expect(seed).toBe(planInputsKey(base));
    expect(needsRebuild(base, seed)).toBe(false);
  });

  it('seeds nothing when a baseline exists', () => {
    expect(baselineToSeed(base, planInputsKey(base))).toBeNull();
    expect(baselineToSeed(base, 'older')).toBeNull();
  });

  it('nudges after a new weigh-in or a goal change, and not after a target or lock edit', () => {
    const baseline = planInputsKey(base);
    expect(needsRebuild(withWeight(base, 68.4), baseline)).toBe(true);
    expect(needsRebuild(changeGoal(base, 'maintain'), baseline)).toBe(true);
    const edited = setMacro(base, 'fat', 70, today);
    expect(edited.ok && needsRebuild(edited.value, baseline)).toBe(false);
  });

  it('clears once the baseline is stored again after a rebuild', () => {
    const heavier = withWeight(base, 71);
    expect(needsRebuild(heavier, planInputsKey(base))).toBe(true);
    expect(needsRebuild(heavier, planInputsKey(heavier))).toBe(false);
  });
});
