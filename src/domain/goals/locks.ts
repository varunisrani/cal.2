// The lock layer Settings edits through. kcal can be locked, and at most two macros, so one macro
// is always free to absorb a change.
//
// Every edit first writes all four effective values into the saved targets. They are computed in
// one go from the same snapshot: writing one macro first would move how the other auto macros
// split (R01.13). After any edit everything is pinned. Profiles are values: each function returns
// a new profile and leaves its argument alone.

import type { DayKey } from '../dates/dayKey';
import { MACRO_KEYS, MAX_LOCKED_MACROS, type MacroKey, type Profile, type Targets } from '../model';
import { err, ok, type Result } from '../../lib/result';
import { KCAL_PER_GRAM, formulaPlan, intDiv, macroKcal } from './formulas';
import { effectiveTargets } from './targets';

/** Why a macro edit was refused: kcal is locked and both other macros are locked too. */
export type LockRefusal = 'nothingToAbsorb';

type MacroGrams = Partial<Record<MacroKey, number>>;

/** Whole, non-negative input from a picker. */
function wholeAtLeastZero(value: number): number {
  return Math.max(0, Math.round(value));
}

function isLocked(profile: Profile, macro: MacroKey): boolean {
  return profile.lockedMacros.includes(macro);
}

/** Locked macros in the fixed order protein, carbs, fat. */
function lockList(locked: ReadonlySet<MacroKey>): MacroKey[] {
  return MACRO_KEYS.filter((macro) => locked.has(macro));
}

/** Adds `macro` to the locks unless two are locked already. */
function lockAdded(profile: Profile, macro: MacroKey): readonly MacroKey[] {
  if (isLocked(profile, macro) || profile.lockedMacros.length >= MAX_LOCKED_MACROS) {
    return profile.lockedMacros;
  }
  return lockList(new Set([...profile.lockedMacros, macro]));
}

/** The profile with all four effective values written as saved targets. */
export function materialise(profile: Profile, today: DayKey): Profile {
  return { ...profile, saved: { ...effectiveTargets(profile, today) } };
}

/**
 * Spreads `kcal` (below 0 counts as 0) over `macros` in proportion to each one's current energy,
 * or its formula energy (at least 1) when the current energy is 0. Every macro but the last one
 * given gets its share rounded to whole grams; the last gets what is left, rounded. Grams are never
 * below 0. Callers pass the macros in the fixed order protein, carbs, fat.
 */
export function distribute(
  kcal: number,
  macros: readonly MacroKey[],
  current: Targets,
  formula: Targets,
): MacroGrams {
  const target = Math.max(0, kcal);
  const weights = macros.map((macro) => {
    const now = current[macro] * KCAL_PER_GRAM[macro];
    return now > 0 ? now : Math.max(1, formula[macro] * KCAL_PER_GRAM[macro]);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const grams: MacroGrams = {};
  let assigned = 0;
  macros.forEach((macro, index) => {
    const perGram = KCAL_PER_GRAM[macro];
    if (index === macros.length - 1) {
      grams[macro] = Math.max(0, Math.round(Math.max(0, target - assigned) / perGram));
      return;
    }
    const share = (target * (weights[index] ?? 0)) / totalWeight;
    const value = Math.max(0, Math.round(share / perGram));
    grams[macro] = value;
    assigned += value * perGram;
  });
  return grams;
}

/**
 * Sets the kcal target: locked macros keep their grams, the free ones share what is left, and kcal
 * becomes locked.
 */
export function setKcal(profile: Profile, kcal: number, today: DayKey): Profile {
  const base = effectiveTargets(profile, today);
  const target = wholeAtLeastZero(kcal);
  const free = MACRO_KEYS.filter((macro) => !isLocked(profile, macro));
  const lockedKcal = MACRO_KEYS.filter((macro) => isLocked(profile, macro)).reduce(
    (sum, macro) => sum + base[macro] * KCAL_PER_GRAM[macro],
    0,
  );
  const spread = distribute(target - lockedKcal, free, base, formulaPlan(profile, today));
  return {
    ...profile,
    saved: { ...base, ...spread, kcal: target },
    caloriesLocked: true,
  };
}

/**
 * Sets one macro. With kcal locked the total stays: the other free macros absorb the change, and
 * the edit is refused (nothing changes) when there is none. With kcal free the macro takes the
 * value and kcal becomes the sum of the macros. The edited macro then becomes locked, unless two
 * macros are locked already.
 */
export function setMacro(
  profile: Profile,
  macro: MacroKey,
  grams: number,
  today: DayKey,
): Result<Profile, LockRefusal> {
  const base = effectiveTargets(profile, today);
  const requested = wholeAtLeastZero(grams);
  const perGram = KCAL_PER_GRAM[macro];
  let saved: Targets;
  if (profile.caloriesLocked) {
    const others = MACRO_KEYS.filter((other) => other !== macro);
    const absorbers = others.filter((other) => !isLocked(profile, other));
    if (absorbers.length === 0) return err('nothingToAbsorb');
    const otherLockedKcal = others
      .filter((other) => isLocked(profile, other))
      .reduce((sum, other) => sum + base[other] * KCAL_PER_GRAM[other], 0);
    const available = Math.max(0, base.kcal - otherLockedKcal);
    const macroEnergy = Math.min(requested * perGram, available);
    const spread = distribute(
      available - macroEnergy,
      absorbers,
      base,
      formulaPlan(profile, today),
    );
    saved = { ...base, [macro]: intDiv(macroEnergy, perGram), ...spread };
  } else {
    const edited = { ...base, [macro]: requested };
    saved = { ...edited, kcal: macroKcal(edited) };
  }
  return ok({ ...profile, saved, lockedMacros: lockAdded(profile, macro) });
}

/** Unlocks kcal and sets it to the energy of the current macros. */
export function resetKcal(profile: Profile, today: DayKey): Profile {
  const base = effectiveTargets(profile, today);
  return { ...profile, saved: { ...base, kcal: macroKcal(base) }, caloriesLocked: false };
}

/** Unlocks `macro` and sets it to what kcal leaves after the other two, in whole grams. */
export function resetMacro(profile: Profile, macro: MacroKey, today: DayKey): Profile {
  const base = effectiveTargets(profile, today);
  const othersKcal = MACRO_KEYS.filter((other) => other !== macro).reduce(
    (sum, other) => sum + base[other] * KCAL_PER_GRAM[other],
    0,
  );
  const grams = intDiv(Math.max(0, base.kcal - othersKcal), KCAL_PER_GRAM[macro]);
  return {
    ...profile,
    saved: { ...base, [macro]: grams },
    lockedMacros: profile.lockedMacros.filter((locked) => locked !== macro),
  };
}

export function toggleKcalLock(profile: Profile): Profile {
  return { ...profile, caloriesLocked: !profile.caloriesLocked };
}

/** Locks or unlocks a macro. A third lock is not added: the same profile comes back. */
export function toggleMacroLock(profile: Profile, macro: MacroKey): Profile {
  if (isLocked(profile, macro)) {
    return { ...profile, lockedMacros: profile.lockedMacros.filter((locked) => locked !== macro) };
  }
  const lockedMacros = lockAdded(profile, macro);
  return lockedMacros === profile.lockedMacros ? profile : { ...profile, lockedMacros };
}

export function clearLocks(profile: Profile): Profile {
  return { ...profile, caloriesLocked: false, lockedMacros: [] };
}

/** Saves a whole plan (a rebuild or a tune-up result): all four targets, every lock cleared. */
export function applyPlan(profile: Profile, plan: Targets): Profile {
  const { kcal, protein, carbs, fat } = plan;
  return { ...clearLocks(profile), saved: { kcal, protein, carbs, fat } };
}
