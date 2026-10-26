import { describe, expect, it } from 'vitest';
import { FIXTURE_TODAY, defaultProfile } from './__fixtures__/profiles';
import { formulaPlan } from './formulas';
import { effectiveTargets, macroKcal } from './targets';

const formula = formulaPlan(defaultProfile, FIXTURE_TODAY);

describe('effectiveTargets', () => {
  it('gives the formula plan when nothing is saved', () => {
    expect(effectiveTargets({}, formula)).toEqual(formula);
  });

  it('auto-balances carbs 283 g and fat 29 g for saved 2 000 kcal and 150 g protein (ACC-C2-1)', () => {
    const targets = effectiveTargets({ kcal: 2_000, protein: 150 }, formula);
    expect(targets).toEqual({ kcal: 2_000, protein: 150, carbs: 283, fat: 29 });
    // Integer division at each step leaves 7 kcal unassigned, as the rule says.
    expect(macroKcal(targets)).toBe(1_993);
  });

  it('splits a saved kcal over three free macros by their formula energy', () => {
    expect(effectiveTargets({ kcal: 1_500 }, formula)).toEqual({
      kcal: 1_500,
      protein: 68,
      carbs: 248,
      fat: 25,
    });
  });

  it('gives a single free macro all the energy left, by integer division', () => {
    expect(effectiveTargets({ kcal: 2_000, protein: 150, fat: 60 }, formula).carbs).toBe(215);
    expect(effectiveTargets({ kcal: 2_000, protein: 150, carbs: 212 }, formula).fat).toBe(61);
  });

  it('uses the formula kcal when only macros are saved', () => {
    expect(effectiveTargets({ protein: 150 }, formula)).toMatchObject({
      kcal: 2_452,
      protein: 150,
    });
  });

  it('keeps every saved value when all four are saved', () => {
    const saved = { kcal: 1_800, protein: 100, carbs: 200, fat: 50 };
    expect(effectiveTargets(saved, formula)).toEqual(saved);
  });

  it('leaves 0 for free macros when pinned macros already pass the kcal target', () => {
    expect(effectiveTargets({ kcal: 1_000, protein: 200, carbs: 100 }, formula).fat).toBe(0);
    expect(effectiveTargets({ kcal: 1_000, protein: 300 }, formula)).toMatchObject({
      carbs: 0,
      fat: 0,
    });
  });

  it('falls back to the formula grams when the free macros have no formula energy', () => {
    const empty = { kcal: 300, protein: 50, carbs: 0, fat: 0 };
    expect(effectiveTargets({ protein: 50 }, empty)).toEqual(empty);
  });
});

describe('macroKcal', () => {
  it('counts 4 kcal per gram of protein and carbs and 9 per gram of fat', () => {
    expect(macroKcal({ protein: 150, carbs: 215, fat: 60 })).toBe(2_000);
  });
});
