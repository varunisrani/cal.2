import { describe, expect, it } from 'vitest';
import type { Profile, Targets } from '../model';
import { formulaPlan, macroKcal } from './formulas';
import { autoBalance, effectiveTargets, isPinned } from './targets';
import { FIXTURE_TODAY, defaultProfile } from './__fixtures__/profiles';

const today = FIXTURE_TODAY;
const formula = formulaPlan(defaultProfile, today);

describe('isPinned', () => {
  it('pins a macro that has a saved value, 0 included', () => {
    expect(isPinned({ protein: 150 }, 'protein')).toBe(true);
    expect(isPinned({ protein: 0 }, 'protein')).toBe(true);
    expect(isPinned({ protein: 150 }, 'carbs')).toBe(false);
    expect(isPinned({}, 'fat')).toBe(false);
  });
});

describe('autoBalance', () => {
  it('gives the formula plan back when nothing is saved', () => {
    expect(autoBalance({}, formula)).toEqual(formula);
  });

  it('gives saved 2 000 kcal and 150 g protein carbs 283 g and fat 29 g (ACC-C2-1)', () => {
    const targets = autoBalance({ kcal: 2000, protein: 150 }, formula);
    expect(targets).toEqual({ kcal: 2000, protein: 150, carbs: 283, fat: 29 });
    // The whole-number shares leave 7 kcal unassigned.
    expect(targets.kcal - macroKcal(targets)).toBe(7);
  });

  it('shares what is left by formula energy with integer division at each step (R01.9)', () => {
    // 1 400 kcal left; carbs 1 624 and fat 378 formula kcal: 1 400 × 1 624 div 2 002 = 1 135 → 283 g.
    const targets = autoBalance({ kcal: 2000, protein: 150 }, formula);
    expect(targets.carbs).toBe(Math.trunc(Math.trunc((1400 * 1624) / 2002) / 4));
    expect(targets.fat).toBe(Math.trunc(Math.trunc((1400 * 378) / 2002) / 9));
  });

  it('gives a lone auto macro everything the pinned ones leave', () => {
    expect(autoBalance({ kcal: 2000, protein: 150, fat: 60 }, formula)).toEqual({
      kcal: 2000,
      protein: 150,
      carbs: 215,
      fat: 60,
    });
    expect(autoBalance({ kcal: 2001, protein: 150, carbs: 215 }, formula).fat).toBe(60);
  });

  it('splits saved kcal over all three auto macros by their formula energy', () => {
    const targets = autoBalance({ kcal: 2000 }, formula);
    expect(targets).toEqual({ kcal: 2000, protein: 91, carbs: 331, fat: 34 });
    expect(macroKcal(targets)).toBeLessThanOrEqual(2000);
  });

  it('uses the formula kcal when no kcal is saved', () => {
    expect(autoBalance({ protein: 150 }, formula)).toEqual({
      kcal: 2452,
      protein: 150,
      carbs: 375,
      fat: 38,
    });
  });

  it('gives auto macros 0 when the pinned ones already pass the kcal target', () => {
    expect(autoBalance({ kcal: 1000, protein: 200, fat: 100 }, formula)).toEqual({
      kcal: 1000,
      protein: 200,
      carbs: 0,
      fat: 100,
    });
    expect(autoBalance({ kcal: 500, protein: 200 }, formula)).toEqual({
      kcal: 500,
      protein: 200,
      carbs: 0,
      fat: 0,
    });
  });

  it('falls back to the formula grams when the auto macros have no formula energy', () => {
    const empty: Targets = { kcal: 800, protein: 150, carbs: 0, fat: 0 };
    expect(autoBalance({ protein: 150 }, empty)).toEqual({
      kcal: 800,
      protein: 150,
      carbs: 0,
      fat: 0,
    });
  });

  it('keeps every pinned value as saved', () => {
    const saved = { kcal: 1800, protein: 140, carbs: 180, fat: 55 };
    expect(autoBalance(saved, formula)).toEqual(saved);
  });
});

describe('effectiveTargets', () => {
  it('balances the profile’s saved targets over its formula plan for today', () => {
    expect(effectiveTargets(defaultProfile, today)).toEqual(formula);
    const saved: Profile = { ...defaultProfile, saved: { kcal: 2000, protein: 150 } };
    expect(effectiveTargets(saved, today)).toEqual({
      kcal: 2000,
      protein: 150,
      carbs: 283,
      fat: 29,
    });
  });
});
