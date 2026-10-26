import { describe, expect, it } from 'vitest';
import { ACTIVITIES, type Activity, type Profile } from '../model';
import { inTimeZone } from '../../test/time';
import {
  ACTIVITY_TABLE,
  CUT_PROTEIN_BOOST,
  DEFAULT_PACE_KG,
  FAT_PER_KG,
  KCAL_PER_GRAM,
  KCAL_PER_KG,
  bmr,
  bmrMethod,
  floorMod,
  formulaFat,
  formulaPlan,
  formulaProtein,
  intDiv,
  macroKcal,
  paceAdjustment,
  remainderCarbs,
  tdee,
} from './formulas';
import {
  FIXTURE_TODAY,
  defaultProfile,
  leanMassProfile,
  lose100Profile,
} from './__fixtures__/profiles';

const today = FIXTURE_TODAY;

describe('constants', () => {
  it('uses 7 700 kcal per kg, a 0.5 kg default pace, +0.2 g/kg protein while losing and 0.6 g/kg fat', () => {
    expect(KCAL_PER_KG).toBe(7_700);
    expect(DEFAULT_PACE_KG).toBe(0.5);
    expect(CUT_PROTEIN_BOOST).toBe(0.2);
    expect(FAT_PER_KG).toBe(0.6);
    expect(KCAL_PER_GRAM).toEqual({ protein: 4, carbs: 4, fat: 9 });
  });

  it('gives each level its own factor and protein rate, least active first, with 1.465 for moderate', () => {
    const factors = ACTIVITIES.map((activity) => ACTIVITY_TABLE[activity].factor);
    const protein = ACTIVITIES.map((activity) => ACTIVITY_TABLE[activity].proteinPerKg);
    expect(factors).toEqual([1.2, 1.375, 1.465, 1.55, 1.725, 1.9]);
    expect(protein).toEqual([0.8, 1.2, 1.6, 1.8, 2.0, 2.2]);
    expect(ACTIVITY_TABLE.moderate.factor).not.toBe(1.55);
  });

  it('gives each level a step guide that starts where the one before stops', () => {
    expect(ACTIVITY_TABLE.sedentary.steps).toEqual({ from: 0, below: 5_000 });
    expect(ACTIVITY_TABLE.athlete.steps).toEqual({ from: 15_000, below: null });
    for (let i = 1; i < ACTIVITIES.length; i += 1) {
      const before = ACTIVITY_TABLE[ACTIVITIES[i - 1] as Activity].steps;
      expect(ACTIVITY_TABLE[ACTIVITIES[i] as Activity].steps.from).toBe(before.below);
    }
  });
});

describe('integer maths (R01.9)', () => {
  it('cuts toward zero in integer division', () => {
    expect(intDiv(1626, 4)).toBe(406);
    expect(intDiv(7, 2)).toBe(3);
    expect(intDiv(-7, 2)).toBe(-3);
    expect(Object.is(intDiv(-1, 4), 0)).toBe(true);
  });

  it('keeps a floor-mod in 0…n−1 where % goes negative: floorMod(-1, 4) = 3', () => {
    expect(-1 % 4).toBe(-1);
    expect(floorMod(-1, 4)).toBe(3);
    expect(floorMod(-4, 4)).toBe(0);
    expect(floorMod(-6, 4)).toBe(2);
    expect(floorMod(2001, 4)).toBe(1);
    expect(Object.is(floorMod(-8, 4), 0)).toBe(true);
  });

  it('counts macro energy at 4 / 4 / 9 and fills carbs with whole grams, never below 0', () => {
    expect(macroKcal({ protein: 112, carbs: 406, fat: 42 })).toBe(2450);
    expect(remainderCarbs(2452, 112, 42)).toBe(406);
    expect(remainderCarbs(2000, 150, 60)).toBe(215);
    expect(remainderCarbs(500, 150, 60)).toBe(0);
  });
});

describe('bmr', () => {
  it('gives the default profile 1 673.75 kcal with the standard equation (male, 25 y, 175 cm, 70 kg)', () => {
    expect(bmrMethod(defaultProfile)).toBe('standard');
    expect(bmr(defaultProfile, today)).toBeCloseTo(1673.75, 9);
  });

  it('uses the base equation for female and other: 166 kcal below male', () => {
    const female: Profile = { ...defaultProfile, sex: 'female' };
    const other: Profile = { ...defaultProfile, sex: 'other' };
    expect(bmr(female, today)).toBeCloseTo(1507.75, 9);
    expect(bmr(other, today)).toBe(bmr(female, today));
    expect(bmr(defaultProfile, today) - bmr(female, today)).toBeCloseTo(166, 9);
  });

  it('gives 80 kg at 20 % body fat 1 752.4 kcal with the lean-mass equation, whatever the age', () => {
    expect(bmrMethod(leanMassProfile)).toBe('leanMass');
    expect(bmr(leanMassProfile, today)).toBeCloseTo(1752.4, 9);
    expect(bmr({ ...leanMassProfile, birthDate: '1950-01-01' }, today)).toBe(
      bmr(leanMassProfile, today),
    );
    expect(bmr({ ...leanMassProfile, sex: 'female' }, today)).toBe(bmr(leanMassProfile, today));
  });

  it('treats 0 % body fat as known', () => {
    const zero: Profile = { ...leanMassProfile, bodyFat: 0 };
    expect(bmrMethod(zero)).toBe('leanMass');
    expect(bmr(zero, today)).toBeCloseTo(370 + 21.6 * 80, 9);
  });

  it('takes 5 kcal off for each year of age, from the local birth date', () => {
    const older: Profile = { ...defaultProfile, birthDate: '1991-10-27' };
    expect(bmr(older, today)).toBeCloseTo(1673.75 - 5 * 9, 9);
  });
});

describe('tdee', () => {
  it('gives the default profile 2 452.04 kcal (1 673.75 × 1.465)', () => {
    expect(tdee(defaultProfile, today)).toBeCloseTo(2452.04375, 9);
  });

  it('gives 80 kg at 20 % body fat, sedentary, 2 102.88 kcal', () => {
    expect(tdee(leanMassProfile, today)).toBeCloseTo(2102.88, 9);
  });

  it('multiplies the same BMR by each activity factor', () => {
    for (const activity of ACTIVITIES) {
      const profile: Profile = { ...defaultProfile, activity };
      expect(tdee(profile, today)).toBeCloseTo(1673.75 * ACTIVITY_TABLE[activity].factor, 9);
    }
  });
});

describe('paceAdjustment', () => {
  it('gives 275 / 550 / 1 100 kcal a day for 0.25 / 0.5 / 1.0 kg a week', () => {
    expect(paceAdjustment('gain', 0.25)).toBe(275);
    expect(paceAdjustment('gain', 0.5)).toBe(550);
    expect(paceAdjustment('gain', 1)).toBe(1100);
    expect(paceAdjustment('lose', 0.25)).toBe(-275);
    expect(paceAdjustment('lose', 0.5)).toBe(-550);
    expect(paceAdjustment('lose', 1)).toBe(-1100);
  });

  it('uses 0.5 kg a week when no pace is set, and 0 to maintain whatever the pace', () => {
    expect(paceAdjustment('lose', undefined)).toBe(-550);
    expect(paceAdjustment('gain', undefined)).toBe(550);
    expect(paceAdjustment('maintain', undefined)).toBe(0);
    expect(paceAdjustment('maintain', 1)).toBe(0);
  });

  it('cuts the fraction instead of rounding: 0.123 kg a week gives 135 (135.3)', () => {
    expect(paceAdjustment('gain', 0.3)).toBe(330);
    expect(paceAdjustment('gain', 0.33)).toBe(363);
    expect(paceAdjustment('gain', 0.4)).toBe(440);
    expect(paceAdjustment('lose', 0.35)).toBe(-385);
    // 0.123 × 7 700 ÷ 7 = 135.3: cut, never rounded up.
    expect(paceAdjustment('gain', 0.123)).toBe(135);
    expect(paceAdjustment('gain', 0.1235)).toBe(135);
  });

  it('gives +0, never -0, for a pace of 0', () => {
    expect(Object.is(paceAdjustment('lose', 0), 0)).toBe(true);
    expect(Object.is(paceAdjustment('gain', 0), 0)).toBe(true);
  });
});

describe('formulaPlan', () => {
  it('gives the default profile 2 452 kcal, 112 g protein, 406 g carbs and 42 g fat (ACC-C1-1)', () => {
    expect(formulaPlan(defaultProfile, today)).toEqual({
      kcal: 2452,
      protein: 112,
      carbs: 406,
      fat: 42,
    });
  });

  it('gives 80 kg at 20 % body fat, sedentary, 2 102 kcal (TDEE 2 102.88 cut)', () => {
    const plan = formulaPlan(leanMassProfile, today);
    expect(plan.kcal).toBe(2102);
    expect(plan.protein).toBe(64);
    expect(plan.fat).toBe(48);
    expect(plan.carbs).toBe(353);
  });

  it('gives 100 kg, 30 % body fat, moderate, lose 180 g protein with or without body fat', () => {
    expect(formulaProtein(lose100Profile)).toBe(180);
    const withoutBodyFat: Profile = { ...lose100Profile, bodyFat: undefined };
    expect(formulaProtein(withoutBodyFat)).toBe(180);
    expect(formulaPlan(lose100Profile, today).protein).toBe(180);
  });

  it('adds 0.2 g/kg protein only while losing', () => {
    expect(formulaProtein({ ...defaultProfile, goal: 'lose' })).toBe(126);
    expect(formulaProtein({ ...defaultProfile, goal: 'gain' })).toBe(112);
    expect(formulaProtein({ ...defaultProfile, activity: 'sedentary', goal: 'lose' })).toBe(70);
  });

  it('cuts protein and fat instead of rounding them (R01.9)', () => {
    // 1.6 × 70.9 = 113.44 and 0.6 × 70.9 = 42.54: rounding would give 113 and 43.
    const heavier: Profile = { ...defaultProfile, weightKg: 70.9 };
    expect(formulaProtein(heavier)).toBe(113);
    expect(formulaFat(heavier)).toBe(42);
    // 2.2 + 0.2 = 2.4000000000000004, so 2.4 g/kg × 50 kg is 120.00000000000001 → 120.
    expect(
      formulaProtein({ ...defaultProfile, activity: 'athlete', goal: 'lose', weightKg: 50 }),
    ).toBe(120);
  });

  it('cuts TDEE before adding the pace and has no kcal floor', () => {
    const losing: Profile = { ...defaultProfile, goal: 'lose', weeklyKg: 1 };
    expect(formulaPlan(losing, today).kcal).toBe(2452 - 1100);
    const tiny: Profile = {
      ...defaultProfile,
      sex: 'female',
      weightKg: 40,
      heightCm: 145,
      activity: 'sedentary',
      goal: 'lose',
      weeklyKg: 1,
    };
    expect(formulaPlan(tiny, today).kcal).toBeLessThan(1200);
    expect(formulaPlan(tiny, today).kcal).toBe(Math.trunc(tdee(tiny, today)) - 1100);
  });

  it('never gives negative carbs', () => {
    const tiny: Profile = {
      ...defaultProfile,
      sex: 'female',
      weightKg: 40,
      heightCm: 145,
      activity: 'athlete',
      goal: 'lose',
      weeklyKg: 1,
      birthDate: '1940-01-01',
    };
    const plan = formulaPlan(tiny, today);
    expect(plan.carbs).toBeGreaterThanOrEqual(0);
  });

  it('gives whole numbers that fit inside the kcal for every weight from 40 to 160 kg', () => {
    for (let tenths = 400; tenths <= 1600; tenths += 7) {
      for (const goal of ['lose', 'maintain', 'gain'] as const) {
        const profile: Profile = { ...defaultProfile, weightKg: tenths / 10, goal };
        const plan = formulaPlan(profile, today);
        for (const value of Object.values(plan)) expect(Number.isInteger(value)).toBe(true);
        expect(plan.protein).toBe(Math.floor(plan.protein));
        expect(macroKcal(plan)).toBeLessThanOrEqual(plan.kcal);
        expect(plan.kcal - macroKcal(plan)).toBeLessThan(4);
      }
    }
  });

  it('gives the same plan in Asia/Tokyo: age comes from day keys', () => {
    const inNewYork = formulaPlan(defaultProfile, today);
    const onBirthday = formulaPlan({ ...defaultProfile, birthDate: '2001-10-27' }, today);
    const inTokyo = inTimeZone('Asia/Tokyo', () => [
      formulaPlan(defaultProfile, today),
      formulaPlan({ ...defaultProfile, birthDate: '2001-10-27' }, today),
    ]);
    expect(inTokyo).toEqual([inNewYork, onBirthday]);
    // One day before the 25th birthday the person is 24, so BMR is 5 kcal higher.
    expect(onBirthday.kcal).toBe(Math.trunc((1673.75 + 5) * 1.465));
  });
});
