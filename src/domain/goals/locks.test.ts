import { describe, expect, it } from 'vitest';
import type { MacroKey, Targets } from '../model';
import { FIXTURE_TODAY, defaultProfile } from './__fixtures__/profiles';
import { formulaPlan } from './formulas';
import {
  clearLocks,
  distribute,
  resetKcal,
  resetMacro,
  setKcal,
  setMacro,
  type TargetLocks,
} from './locks';
import { effectiveTargets, macroKcal } from './targets';

const formula = formulaPlan(defaultProfile, FIXTURE_TODAY);

function locks(
  saved: TargetLocks['saved'],
  caloriesLocked = false,
  lockedMacros: readonly MacroKey[] = [],
): TargetLocks {
  return { saved, caloriesLocked, lockedMacros };
}

const plan2000: Targets = { kcal: 2_000, protein: 150, carbs: 215, fat: 60 };

describe('setKcal', () => {
  it('spreads a new kcal over free macros by their current energy and locks kcal', () => {
    const result = setKcal(locks({}), formula, 2_452);
    expect(result.saved).toEqual({ kcal: 2_452, protein: 112, carbs: 406, fat: 42 });
    expect(result.caloriesLocked).toBe(true);
    expect(result.lockedMacros).toEqual([]);
  });

  it('keeps locked macros and gives the free ones what is left', () => {
    const result = setKcal(locks(plan2000, false, ['protein']), formula, 2_400);
    expect(result.saved).toEqual({ kcal: 2_400, protein: 150, carbs: 276, fat: 77 });
  });

  it('gives free macros 0 when the locked ones already pass the new kcal', () => {
    const result = setKcal(locks(plan2000, false, ['protein', 'fat']), formula, 1_000);
    expect(result.saved).toEqual({ kcal: 1_000, protein: 150, carbs: 0, fat: 60 });
  });

  it('reads a negative or broken kcal as 0 and a fractional one as whole', () => {
    expect(setKcal(locks(plan2000), formula, -300).saved).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(setKcal(locks(plan2000), formula, Number.NaN).saved.kcal).toBe(0);
    expect(setKcal(locks(plan2000), formula, 1_999.6).saved.kcal).toBe(2_000);
  });
});

describe('setMacro', () => {
  it('keeps a locked 2 452 kcal plan at 2 452 when protein goes to 150: carbs 376, fat 39', () => {
    const locked = setKcal(locks({}), formula, 2_452);
    const result = setMacro(locked, formula, 'protein', 150);
    expect(result?.saved).toEqual({ kcal: 2_452, protein: 150, carbs: 376, fat: 39 });
    expect(result?.caloriesLocked).toBe(true);
    expect(result?.lockedMacros).toEqual(['protein']);
  });

  it('pins all three macros from the state before the edit (R01.13)', () => {
    const start = locks({ kcal: 1_500 });
    expect(effectiveTargets(start.saved, formula)).toEqual({
      kcal: 1_500,
      protein: 68,
      carbs: 248,
      fat: 25,
    });
    const result = setMacro(start, formula, 'protein', 68);
    expect(result?.saved).toEqual({ kcal: 1_489, protein: 68, carbs: 248, fat: 25 });
    // Writing protein first and re-deriving the rest would have given carbs 249.
    expect(effectiveTargets({ kcal: 1_500, protein: 68 }, formula).carbs).toBe(249);
  });

  it('refuses an edit nothing can absorb and changes nothing (R01.13)', () => {
    const start = locks({ ...plan2000 }, true, ['carbs', 'fat']);
    const before = structuredClone(start);
    expect(setMacro(start, formula, 'protein', 200)).toBeNull();
    expect(start).toEqual(before);
  });

  it('does not add a third macro lock, while the edit still applies (R01.13, ACC-C6-2)', () => {
    const result = setMacro(locks(plan2000, false, ['protein', 'carbs']), formula, 'fat', 50);
    expect(result?.lockedMacros).toEqual(['protein', 'carbs']);
    expect(result?.saved).toEqual({ kcal: 1_910, protein: 150, carbs: 215, fat: 50 });
  });

  it('lets kcal follow the macro sum when kcal is not locked', () => {
    const result = setMacro(locks(plan2000), formula, 'carbs', 300);
    expect(result?.saved).toEqual({ kcal: 2_340, protein: 150, carbs: 300, fat: 60 });
    expect(result?.caloriesLocked).toBe(false);
    expect(result?.lockedMacros).toEqual(['carbs']);
  });

  it('takes energy only from unlocked macros when kcal is locked', () => {
    const result = setMacro(locks(plan2000, true, ['protein']), formula, 'fat', 80);
    expect(result?.saved).toEqual({ kcal: 2_000, protein: 150, carbs: 170, fat: 80 });
    expect(result?.lockedMacros).toEqual(['protein', 'fat']);
  });

  it('caps the macro at the energy the other locked macros leave', () => {
    const result = setMacro(locks(plan2000, true, ['protein']), formula, 'carbs', 1_000);
    expect(result?.saved).toEqual({ kcal: 2_000, protein: 150, carbs: 350, fat: 0 });
  });

  it('keeps an already locked macro locked without adding it twice', () => {
    const result = setMacro(locks(plan2000, false, ['fat']), formula, 'fat', 70);
    expect(result?.lockedMacros).toEqual(['fat']);
  });

  it('works on a whole profile and leaves the input untouched', () => {
    const before = structuredClone(defaultProfile);
    const result = setMacro(defaultProfile, formula, 'protein', 150);
    expect(result).toMatchObject({ sex: 'male', weightKg: 70, lockedMacros: ['protein'] });
    expect(result?.saved).toEqual({ kcal: 2_602, protein: 150, carbs: 406, fat: 42 });
    expect(defaultProfile).toEqual(before);
  });
});

describe('distribute', () => {
  it('weights by current energy and lets the last macro take what is left', () => {
    const current = { kcal: 2_452, protein: 112, carbs: 406, fat: 42 };
    expect(distribute(1_852, ['carbs', 'fat'], current, formula)).toEqual({ carbs: 376, fat: 39 });
  });

  it('weights a macro at 0 by its formula energy', () => {
    const empty = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const grams = distribute(2_000, ['protein', 'carbs', 'fat'], empty, formula);
    expect(grams).toEqual({ protein: 91, carbs: 331, fat: 35 });
  });

  it('gives equal weight to macros with no current or formula energy', () => {
    const empty = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    expect(distribute(800, ['carbs', 'fat'], empty, empty)).toEqual({ carbs: 100, fat: 44 });
  });

  it('gives every macro 0 for a target at or below 0', () => {
    expect(distribute(-140, ['carbs'], plan2000, formula)).toEqual({ carbs: 0 });
    expect(distribute(0, ['protein', 'fat'], plan2000, formula)).toEqual({ protein: 0, fat: 0 });
  });

  it('rounds each share rather than cutting it (R01.9)', () => {
    const grams = distribute(
      1_852,
      ['carbs', 'fat'],
      { ...plan2000, carbs: 406, fat: 42 },
      formula,
    );
    // 375.57 g of carbs rounds to 376; truncation would give 375.
    expect(grams.carbs).toBe(376);
  });
});

describe('resetKcal', () => {
  it('unlocks kcal and sets it to the macro energy', () => {
    const result = resetKcal(locks({ ...plan2000, carbs: 200 }, true, ['protein']), formula);
    expect(result.saved).toEqual({ kcal: 1_940, protein: 150, carbs: 200, fat: 60 });
    expect(result.caloriesLocked).toBe(false);
    expect(result.lockedMacros).toEqual(['protein']);
  });

  it('pins every value even when nothing was saved', () => {
    const result = resetKcal(locks({}), formula);
    expect(result.saved).toEqual({ ...formula, kcal: macroKcal(formula) });
  });
});

describe('resetMacro', () => {
  it('unlocks the macro and gives it the energy the other two leave', () => {
    const start = locks({ ...plan2000, carbs: 200 }, false, ['carbs', 'protein']);
    const result = resetMacro(start, formula, 'carbs');
    expect(result.saved).toEqual(plan2000);
    expect(result.lockedMacros).toEqual(['protein']);
  });

  it('gives 0 when the other macros already pass the kcal target', () => {
    const result = resetMacro(
      locks({ kcal: 800, protein: 150, carbs: 100, fat: 60 }),
      formula,
      'carbs',
    );
    expect(result.saved.carbs).toBe(0);
  });

  it('divides the remaining energy as a whole number', () => {
    const result = resetMacro(locks({ ...plan2000, fat: 10 }), formula, 'fat');
    expect(result.saved.fat).toBe(60);
    const odd = resetMacro(locks({ ...plan2000, kcal: 2_008 }), formula, 'fat');
    expect(odd.saved.fat).toBe(60);
  });
});

describe('clearLocks', () => {
  it('drops every lock and keeps the saved values', () => {
    const result = clearLocks({
      ...defaultProfile,
      saved: plan2000,
      caloriesLocked: true,
      lockedMacros: ['fat'],
    });
    expect(result.caloriesLocked).toBe(false);
    expect(result.lockedMacros).toEqual([]);
    expect(result.saved).toEqual(plan2000);
    expect(result.sex).toBe('male');
  });
});
