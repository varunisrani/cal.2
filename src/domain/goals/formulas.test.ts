import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from '../model';
import {
  FIXTURE_TODAY,
  defaultProfile,
  katchProfile,
  lose100Profile,
  profileWith,
} from './__fixtures__/profiles';
import {
  ACTIVITY_FACTORS,
  DEFAULT_WEEKLY_KG,
  KCAL_PER_GRAM,
  KCAL_PER_KG,
  bmr,
  bmrMethod,
  carbsLeft,
  formulaFat,
  formulaPlan,
  formulaProtein,
  paceAdjustment,
  tdee,
} from './formulas';

describe('activity table', () => {
  it('lists multipliers and protein rates from the least active level up', () => {
    expect(ACTIVITIES.map((a) => ACTIVITY_FACTORS[a].multiplier)).toEqual([
      1.2, 1.375, 1.465, 1.55, 1.725, 1.9,
    ]);
    expect(ACTIVITIES.map((a) => ACTIVITY_FACTORS[a].proteinPerKg)).toEqual([
      0.8, 1.2, 1.6, 1.8, 2.0, 2.2,
    ]);
  });

  it('gives each level a steps-a-day band that starts where the previous one ends', () => {
    const bands = ACTIVITIES.map((a) => ACTIVITY_FACTORS[a].steps);
    expect(bands[0]).toEqual({ from: 0, below: 5_000 });
    expect(bands[5]).toEqual({ from: 15_000, below: null });
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i]?.from).toBe(bands[i - 1]?.below);
    }
    expect(ACTIVITY_FACTORS.moderate.steps).toEqual({ from: 7_500, below: 10_000 });
  });

  it('uses 7 700 kcal per kg, 0.5 kg a week by default and 4/4/9 kcal per gram', () => {
    expect(KCAL_PER_KG).toBe(7_700);
    expect(DEFAULT_WEEKLY_KG).toBe(0.5);
    expect(KCAL_PER_GRAM).toEqual({ protein: 4, carbs: 4, fat: 9 });
  });
});

describe('bmr and tdee', () => {
  it('gives the default profile 1 673.75 kcal at rest and about 2 452.04 a day', () => {
    expect(bmrMethod(defaultProfile)).toBe('mifflin');
    expect(bmr(defaultProfile, FIXTURE_TODAY)).toBe(1_673.75);
    expect(tdee(defaultProfile, FIXTURE_TODAY)).toBeCloseTo(2_452.04, 2);
  });

  it('uses the lean-mass equation when body fat is known: 80 kg at 20 % → 1 752.4', () => {
    expect(bmrMethod(katchProfile)).toBe('katch');
    expect(bmr(katchProfile, FIXTURE_TODAY)).toBeCloseTo(1_752.4, 9);
    expect(tdee(katchProfile, FIXTURE_TODAY)).toBeCloseTo(2_102.88, 9);
    const olderAndTaller = { ...katchProfile, birthDate: '1950-01-01', heightCm: 200 };
    expect(bmr(olderAndTaller, FIXTURE_TODAY)).toBe(bmr(katchProfile, FIXTURE_TODAY));
  });

  it('adds 166 for men only; female and other use the shared base', () => {
    expect(bmr(profileWith({ sex: 'female' }), FIXTURE_TODAY)).toBe(1_507.75);
    expect(bmr(profileWith({ sex: 'other' }), FIXTURE_TODAY)).toBe(1_507.75);
  });

  it('takes age from the birth date on the given day', () => {
    expect(bmr(defaultProfile, '2026-10-25')).toBe(1_678.75);
    expect(bmr(defaultProfile, '2027-10-26')).toBe(1_668.75);
  });
});

describe('paceAdjustment', () => {
  it('turns 0.25 / 0.5 / 1.0 kg a week into 275 / 550 / 1 100 kcal a day', () => {
    for (const [weeklyKg, kcal] of [
      [0.25, 275],
      [0.5, 550],
      [1, 1_100],
    ] as const) {
      expect(paceAdjustment({ goal: 'gain', weeklyKg })).toBe(kcal);
      expect(paceAdjustment({ goal: 'lose', weeklyKg })).toBe(-kcal);
    }
  });

  it('uses 0.5 kg when no pace is set, and 0 for maintain whatever is stored', () => {
    expect(paceAdjustment({ goal: 'lose' })).toBe(-550);
    expect(paceAdjustment({ goal: 'gain' })).toBe(550);
    expect(paceAdjustment({ goal: 'maintain', weeklyKg: 1 })).toBe(0);
  });

  it('gives a plain 0, never −0, for a zero pace while losing', () => {
    expect(Object.is(paceAdjustment({ goal: 'lose', weeklyKg: 0 }), 0)).toBe(true);
  });
});

describe('formulaPlan', () => {
  it('gives the default profile 2 452 kcal, 112 g protein, 406 g carbs, 42 g fat (ACC-C1-1)', () => {
    expect(formulaPlan(defaultProfile, FIXTURE_TODAY)).toEqual({
      kcal: 2_452,
      protein: 112,
      carbs: 406,
      fat: 42,
    });
  });

  it('cuts the 80 kg lean-mass profile to 2 102 kcal', () => {
    expect(formulaPlan(katchProfile, FIXTURE_TODAY).kcal).toBe(2_102);
  });

  it('adds the pace change to the truncated daily burn', () => {
    const losing = profileWith({ goal: 'lose', weeklyKg: 0.5 });
    const gaining = profileWith({ goal: 'gain', weeklyKg: 0.25 });
    expect(formulaPlan(losing, FIXTURE_TODAY).kcal).toBe(2_452 - 550);
    expect(formulaPlan(gaining, FIXTURE_TODAY).kcal).toBe(2_452 + 275);
  });

  it('keeps protein on full body weight: 100 kg at 30 % fat, losing → 180 g either way', () => {
    const noBodyFat = { ...lose100Profile, bodyFat: undefined };
    expect(formulaProtein(lose100Profile)).toBe(180);
    expect(formulaProtein(noBodyFat)).toBe(180);
    expect(formulaPlan(lose100Profile, FIXTURE_TODAY).protein).toBe(180);
    expect(formulaPlan(noBodyFat, FIXTURE_TODAY).protein).toBe(180);
  });

  it('adds 0.2 g/kg of protein only while losing', () => {
    expect(formulaProtein({ activity: 'athlete', goal: 'lose', weightKg: 100 })).toBe(240);
    expect(formulaProtein({ activity: 'athlete', goal: 'gain', weightKg: 100 })).toBe(220);
    expect(formulaProtein({ activity: 'sedentary', goal: 'maintain', weightKg: 70 })).toBe(56);
  });

  it('has no kcal floor and never gives negative carbs', () => {
    const small = profileWith({
      sex: 'female',
      birthDate: '1966-10-26',
      heightCm: 150,
      weightKg: 40,
      activity: 'sedentary',
      goal: 'lose',
      weeklyKg: 1,
    });
    const plan = formulaPlan(small, FIXTURE_TODAY);
    expect(plan.kcal).toBe(-49);
    expect(plan.carbs).toBe(0);
    expect(carbsLeft(100, 50, 10)).toBe(0);
  });

  it('truncates every step instead of rounding (R01.9)', () => {
    // Each case would come out one higher (or one lower for lose) with Math.round.
    expect(Math.trunc(tdee(katchProfile, FIXTURE_TODAY))).toBe(2_102);
    expect(paceAdjustment({ goal: 'lose', weeklyKg: 0.2345 })).toBe(-257);
    expect(paceAdjustment({ goal: 'gain', weeklyKg: 0.2345 })).toBe(257);
    expect(formulaProtein({ activity: 'moderate', goal: 'maintain', weightKg: 71.6 })).toBe(114);
    expect(formulaFat({ weightKg: 71.6 })).toBe(42);
    expect(carbsLeft(2_452, 112, 42)).toBe(406);
  });
});
