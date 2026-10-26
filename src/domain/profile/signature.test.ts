import { describe, expect, it } from 'vitest';
import type { Profile } from '../model';
import { withGoal, withWeight } from './editRules';
import { profileDefaults } from './profile';
import { baselineToSeed, needsRebuild, planInputsKey } from './signature';

const base: Profile = {
  ...profileDefaults('2026-10-26'),
  goal: 'lose',
  weeklyKg: 0.5,
  goalWeightKg: 65,
  bodyFat: 0.22,
  goalBodyFat: 0.18,
  saved: { kcal: 2000, protein: 140, carbs: 200, fat: 70 },
  allergens: ['peanut'],
};

describe('planInputsKey', () => {
  it('stays equal when allergens, goal body fat, targets or locks change', () => {
    const key = planInputsKey(base);
    const unrelated: Array<Partial<Profile>> = [
      { allergens: ['peanut', 'sesame'] },
      { allergens: [] },
      { goalBodyFat: 0.15 },
      { saved: { kcal: 1800 } },
      { saved: {} },
      { caloriesLocked: true },
      { lockedMacros: ['protein', 'fat'] },
    ];
    for (const edit of unrelated) {
      expect(planInputsKey({ ...base, ...edit }), JSON.stringify(edit)).toBe(key);
    }
  });

  it('changes when any plan input changes', () => {
    const key = planInputsKey(base);
    const inputs: Array<Partial<Profile>> = [
      { sex: 'female' },
      { birthDate: '2001-10-27' },
      { heightCm: 175.5 },
      { weightKg: 69.8 },
      { activity: 'light' },
      { goal: 'gain' },
      { weeklyKg: 0.25 },
      { goalWeightKg: 64 },
      { bodyFat: 0.21 },
    ];
    for (const edit of inputs) {
      expect(planInputsKey({ ...base, ...edit }), JSON.stringify(edit)).not.toBe(key);
    }
  });

  it('tells an absent optional input from a set one', () => {
    const withoutBodyFat: Profile = { ...base };
    delete withoutBodyFat.bodyFat;
    expect(planInputsKey(withoutBodyFat)).not.toBe(planInputsKey(base));
    expect(planInputsKey({ ...base, goalWeightKg: undefined })).toBe(
      planInputsKey({ ...base, goalWeightKg: undefined, weeklyKg: 0.5 }),
    );
  });
});

describe('needsRebuild', () => {
  const baseline = planInputsKey(base);

  it('shows no nudge right after a rebuild', () => {
    expect(needsRebuild(base, baseline)).toBe(false);
  });

  it('shows the nudge after a weight, activity, goal or pace edit, without touching targets (R01.12)', () => {
    const edits: Profile[] = [
      withWeight(base, 69.4),
      { ...base, activity: 'active' },
      withGoal(base, 'maintain'),
      { ...base, weeklyKg: 1 },
    ];
    for (const edited of edits) {
      expect(needsRebuild(edited, baseline)).toBe(true);
      expect(edited.saved).toStrictEqual(base.saved);
    }
  });

  it('shows no nudge after an allergen or goal body fat edit', () => {
    expect(needsRebuild({ ...base, allergens: [] }, baseline)).toBe(false);
    expect(needsRebuild({ ...base, goalBodyFat: 0.12 }, baseline)).toBe(false);
  });

  it('shows no nudge on first open when no baseline is stored (R01.12)', () => {
    expect(needsRebuild(base, undefined)).toBe(false);
    expect(needsRebuild(base, null)).toBe(false);
  });

  it('shows no nudge for a baseline it cannot use', () => {
    for (const stored of ['', 42, 'male|1990-01-01|175', '[0,"male"]', { key: baseline }]) {
      expect(needsRebuild(base, stored)).toBe(false);
    }
  });
});

describe('baselineToSeed', () => {
  it('seeds a missing baseline silently with the current key (R01.12)', () => {
    const seed = baselineToSeed(base, undefined);
    expect(seed).toBe(planInputsKey(base));
    expect(needsRebuild(base, seed)).toBe(false);
  });

  it('seeds over a baseline it cannot use', () => {
    expect(baselineToSeed(base, '')).toBe(planInputsKey(base));
    expect(baselineToSeed(base, 'male|1990-01-01|175')).toBe(planInputsKey(base));
  });

  it('keeps a usable baseline, even an outdated one', () => {
    const old = planInputsKey({ ...base, weightKg: 72 });
    expect(baselineToSeed(base, old)).toBeNull();
    expect(baselineToSeed(base, planInputsKey(base))).toBeNull();
  });

  it('raises the nudge for an edit made after the silent seed (R01.12)', () => {
    const seed = baselineToSeed(base, undefined);
    expect(needsRebuild(withWeight(base, 68), seed)).toBe(true);
  });
});
