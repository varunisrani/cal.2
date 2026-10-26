import { describe, expect, it } from 'vitest';
import { isOk, type Result } from '../../lib/result';
import type { Profile, Targets } from '../model';
import { formulaPlan, macroKcal } from './formulas';
import {
  applyPlan,
  clearLocks,
  distribute,
  materialise,
  resetKcal,
  resetMacro,
  setKcal,
  setMacro,
  toggleKcalLock,
  toggleMacroLock,
  type LockRefusal,
} from './locks';
import { autoBalance, effectiveTargets } from './targets';
import { FIXTURE_TODAY, defaultProfile } from './__fixtures__/profiles';

const today = FIXTURE_TODAY;
const formula = formulaPlan(defaultProfile, today);

function accepted(result: Result<Profile, LockRefusal>): Profile {
  if (!isOk(result)) throw new Error(`edit refused: ${result.error}`);
  return result.value;
}

/** The default plan with kcal locked at 2 452. */
const lockedAt2452 = setKcal(defaultProfile, 2452, today);

describe('materialise', () => {
  it('writes all four effective values as saved targets', () => {
    const profile: Profile = { ...defaultProfile, saved: { kcal: 2000 } };
    expect(materialise(profile, today).saved).toEqual({
      kcal: 2000,
      protein: 91,
      carbs: 331,
      fat: 34,
    });
    expect(materialise(defaultProfile, today).saved).toEqual(formula);
  });

  it('takes all three macros from one snapshot instead of writing them one by one (R01.13)', () => {
    // Writing one macro at a time re-balances the ones still auto after each write, which can
    // move them. Find saved kcal values where that happens and check ours does not.
    let shifted = 0;
    for (let kcal = 1200; kcal <= 3200; kcal += 1) {
      const profile: Profile = { ...defaultProfile, saved: { kcal } };
      const snapshot = effectiveTargets(profile, today);
      expect(materialise(profile, today).saved).toEqual(snapshot);
      let oneByOne: Partial<Targets> = { kcal };
      for (const macro of ['fat', 'carbs', 'protein'] as const) {
        oneByOne = { ...oneByOne, [macro]: autoBalance(oneByOne, formula)[macro] };
      }
      if (JSON.stringify(autoBalance(oneByOne, formula)) !== JSON.stringify(snapshot)) {
        shifted += 1;
      }
    }
    expect(shifted).toBeGreaterThan(0);
  });
});

describe('distribute', () => {
  it('weights by current energy, rounds all but the last macro and gives the last the rest', () => {
    const grams = distribute(1852, ['carbs', 'fat'], formula, formula);
    // carbs: round(1 852 × 1 624 ÷ 2 002 ÷ 4) = 376; fat: round((1 852 − 1 504) ÷ 9) = 39.
    expect(grams).toEqual({ carbs: 376, fat: 39 });
  });

  it('falls back to formula energy (at least 1) when a macro is at 0', () => {
    const zero: Targets = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    expect(distribute(2450, ['protein', 'carbs', 'fat'], zero, formula)).toEqual({
      protein: 112,
      carbs: 406,
      fat: 42,
    });
    expect(distribute(900, ['protein', 'carbs', 'fat'], zero, zero)).toEqual({
      protein: 75,
      carbs: 75,
      fat: 33,
    });
  });

  it('gives every macro 0 g when nothing or less than nothing is left', () => {
    expect(distribute(0, ['carbs', 'fat'], formula, formula)).toEqual({ carbs: 0, fat: 0 });
    expect(distribute(-300, ['protein', 'carbs', 'fat'], formula, formula)).toEqual({
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  it('gives a lone macro all of it, rounded', () => {
    expect(distribute(652, ['fat'], formula, formula)).toEqual({ fat: 72 });
    expect(distribute(1850, ['carbs'], formula, formula)).toEqual({ carbs: 463 });
  });
});

describe('setKcal', () => {
  it('spreads a new total over free macros, the last one absorbing rounding, and locks kcal', () => {
    const profile = setKcal(defaultProfile, 2000, today);
    // protein round(91.43) = 91, carbs round(331.43) = 331, fat round((2 000 − 1 688) ÷ 9) = 35.
    expect(profile.saved).toEqual({ kcal: 2000, protein: 91, carbs: 331, fat: 35 });
    expect(profile.caloriesLocked).toBe(true);
    expect(profile.lockedMacros).toEqual([]);
  });

  it('keeps locked macros and spreads the rest over the free ones', () => {
    const proteinAt150 = accepted(setMacro(defaultProfile, 'protein', 150, today));
    expect(proteinAt150.lockedMacros).toEqual(['protein']);
    const profile = setKcal(proteinAt150, 2000, today);
    expect(profile.saved).toEqual({ kcal: 2000, protein: 150, carbs: 284, fat: 29 });
  });

  it('locks the default plan at 2 452 kcal without moving its macros', () => {
    expect(lockedAt2452.saved).toEqual({ kcal: 2452, protein: 112, carbs: 406, fat: 42 });
    expect(lockedAt2452.caloriesLocked).toBe(true);
  });

  it('counts kcal below 0 as 0 and leaves free macros at 0 g', () => {
    const profile = setKcal(defaultProfile, -100, today);
    expect(profile.saved).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('gives free macros 0 g when locked ones already use more than the new total', () => {
    const twoLocked: Profile = {
      ...defaultProfile,
      saved: { kcal: 2452, protein: 200, carbs: 300, fat: 40 },
      lockedMacros: ['protein', 'carbs'],
    };
    expect(setKcal(twoLocked, 1500, today).saved).toEqual({
      kcal: 1500,
      protein: 200,
      carbs: 300,
      fat: 0,
    });
  });
});

describe('setMacro', () => {
  it('locks the default plan at 2 452 kcal, sets protein to 150 → carbs 376, fat 39', () => {
    const profile = accepted(setMacro(lockedAt2452, 'protein', 150, today));
    expect(profile.saved).toEqual({ kcal: 2452, protein: 150, carbs: 376, fat: 39 });
    expect(profile.caloriesLocked).toBe(true);
    expect(profile.lockedMacros).toEqual(['protein']);
  });

  it('refuses a macro edit when kcal and both other macros are locked, and nothing changes (R01.13)', () => {
    const locked: Profile = {
      ...defaultProfile,
      saved: { kcal: 2452, protein: 112, carbs: 406, fat: 42 },
      caloriesLocked: true,
      lockedMacros: ['carbs', 'fat'],
    };
    const before = structuredClone(locked);
    const result = setMacro(locked, 'protein', 150, today);
    expect(result).toEqual({ ok: false, error: 'nothingToAbsorb' });
    expect(locked).toEqual(before);
  });

  it('lets the one free macro absorb the change when the other is locked', () => {
    const proteinLocked = accepted(setMacro(lockedAt2452, 'protein', 150, today));
    const profile = accepted(setMacro(proteinLocked, 'carbs', 300, today));
    expect(profile.saved).toEqual({ kcal: 2452, protein: 150, carbs: 300, fat: 72 });
    expect(profile.lockedMacros).toEqual(['protein', 'carbs']);
  });

  it('does not add a third macro lock when two are locked (ACC-C6-2)', () => {
    const twoLocked: Profile = {
      ...defaultProfile,
      saved: { kcal: 2452, protein: 150, carbs: 300, fat: 72 },
      lockedMacros: ['protein', 'carbs'],
    };
    const profile = accepted(setMacro(twoLocked, 'fat', 60, today));
    expect(profile.saved.fat).toBe(60);
    expect(profile.lockedMacros).toEqual(['protein', 'carbs']);
  });

  it('lets kcal float to the macro sum when kcal is not locked', () => {
    const profile = accepted(setMacro(defaultProfile, 'fat', 60, today));
    expect(profile.saved).toEqual({ kcal: 2612, protein: 112, carbs: 406, fat: 60 });
    expect(profile.caloriesLocked).toBe(false);
    expect(profile.lockedMacros).toEqual(['fat']);
  });

  it('gives the macro only what is available when it asks for more than kcal allows', () => {
    const profile = accepted(setMacro(lockedAt2452, 'protein', 700, today));
    expect(profile.saved).toEqual({ kcal: 2452, protein: 613, carbs: 0, fat: 0 });
  });

  it('counts grams below 0 as 0', () => {
    const profile = accepted(setMacro(defaultProfile, 'carbs', -20, today));
    expect(profile.saved).toEqual({ kcal: 826, protein: 112, carbs: 0, fat: 42 });
  });

  it('materialises auto macros before the edit, so the untouched ones keep their values', () => {
    const saved2000: Profile = { ...defaultProfile, saved: { kcal: 2000 } };
    const profile = accepted(setMacro(saved2000, 'fat', 50, today));
    expect(profile.saved).toEqual({ kcal: 2138, protein: 91, carbs: 331, fat: 50 });
  });
});

describe('resetKcal', () => {
  it('unlocks kcal and sets it to the energy of the macros', () => {
    const edited = accepted(setMacro(lockedAt2452, 'protein', 150, today));
    const profile = resetKcal(edited, today);
    expect(profile.caloriesLocked).toBe(false);
    expect(profile.saved).toEqual({ kcal: 2455, protein: 150, carbs: 376, fat: 39 });
    expect(profile.lockedMacros).toEqual(['protein']);
  });
});

describe('resetMacro', () => {
  it('resets a macro to auto: unlocked and set to what kcal leaves after the others', () => {
    const proteinLocked = accepted(setMacro(lockedAt2452, 'protein', 150, today));
    const twoLocked = accepted(setMacro(proteinLocked, 'carbs', 300, today));
    const profile = resetMacro(twoLocked, 'protein', today);
    // (2 452 − 4 × 300 − 9 × 72) div 4 = 151.
    expect(profile.saved).toEqual({ kcal: 2452, protein: 151, carbs: 300, fat: 72 });
    expect(profile.lockedMacros).toEqual(['carbs']);
    expect(profile.caloriesLocked).toBe(true);
  });

  it('gives 0 g when the other macros already pass kcal', () => {
    const over: Profile = {
      ...defaultProfile,
      saved: { kcal: 1000, protein: 200, carbs: 100, fat: 50 },
      lockedMacros: ['fat'],
    };
    expect(resetMacro(over, 'fat', today).saved).toEqual({
      kcal: 1000,
      protein: 200,
      carbs: 100,
      fat: 0,
    });
  });
});

describe('lock toggles', () => {
  it('locks and unlocks kcal', () => {
    expect(toggleKcalLock(defaultProfile).caloriesLocked).toBe(true);
    expect(toggleKcalLock(toggleKcalLock(defaultProfile)).caloriesLocked).toBe(false);
  });

  it('locks up to two macros in the order protein, carbs, fat and unlocks any of them', () => {
    const fat = toggleMacroLock(defaultProfile, 'fat');
    const fatAndProtein = toggleMacroLock(fat, 'protein');
    expect(fatAndProtein.lockedMacros).toEqual(['protein', 'fat']);
    expect(toggleMacroLock(fatAndProtein, 'fat').lockedMacros).toEqual(['protein']);
  });

  it('does not add a third macro lock: the same profile comes back (ACC-C6-2)', () => {
    const two = toggleMacroLock(toggleMacroLock(defaultProfile, 'protein'), 'carbs');
    expect(toggleMacroLock(two, 'fat')).toBe(two);
    expect(two.lockedMacros).toEqual(['protein', 'carbs']);
  });

  it('clears every lock', () => {
    const locked: Profile = { ...defaultProfile, caloriesLocked: true, lockedMacros: ['fat'] };
    expect(clearLocks(locked)).toMatchObject({ caloriesLocked: false, lockedMacros: [] });
  });
});

describe('applyPlan', () => {
  it('saves all four targets and clears every lock', () => {
    const locked: Profile = {
      ...defaultProfile,
      saved: { kcal: 1800 },
      caloriesLocked: true,
      lockedMacros: ['protein', 'fat'],
    };
    const plan = { kcal: 2000, protein: 150, carbs: 215, fat: 60 };
    const profile = applyPlan(locked, plan);
    expect(profile.saved).toEqual(plan);
    expect(profile.caloriesLocked).toBe(false);
    expect(profile.lockedMacros).toEqual([]);
    expect(macroKcal(profile.saved as Targets)).toBe(2000);
  });
});
