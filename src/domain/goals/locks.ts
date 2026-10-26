// Settings edits of the four targets, with a kcal lock and up to two macro locks. Every edit starts
// by pinning all four effective values at once, computed from the state before the edit: pinning
// them one by one would let each write move the auto values still to come (R01.13). After any
// edit all four values are saved.
//
// The functions take any record holding `saved`, `caloriesLocked` and `lockedMacros` (a whole
// `Profile` fits) and return a copy with only those three fields replaced. `formula` is the
// person's formula plan (`formulaPlan(profile, today)`).

import { MACRO_KEYS, MAX_LOCKED_MACROS, type MacroKey, type Profile, type Targets } from '../model';
import { KCAL_PER_GRAM } from './formulas';
import { div } from './integers';
import { effectiveTargets, macroKcal } from './targets';

/** The profile fields the lock engine reads and writes. */
export type TargetLocks = Pick<Profile, 'saved' | 'caloriesLocked' | 'lockedMacros'>;

/** A typed kcal or gram value as a whole number of at least 0 (anything not finite is 0). */
function wholeAtLeastZero(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function lockedKcal(current: Targets, locked: readonly MacroKey[], skip?: MacroKey): number {
  let total = 0;
  for (const macro of locked) {
    if (macro !== skip) total += current[macro] * KCAL_PER_GRAM[macro];
  }
  return total;
}

/**
 * Spreads `kcal` (below 0 counts as 0) over `macros`, which must be in the order protein, carbs,
 * fat. Each macro's weight is its current energy, or its formula energy (at least 1) when the
 * current one is 0. Every macro but the last gets its share rounded to whole grams; the last one
 * takes the energy still unassigned, rounded, so the group lands on `kcal` as closely as grams
 * allow.
 */
export function distribute(
  kcal: number,
  macros: readonly MacroKey[],
  current: Targets,
  formula: Targets,
): Partial<Record<MacroKey, number>> {
  const target = Math.max(0, kcal);
  const weights = macros.map((macro) => {
    const now = current[macro] * KCAL_PER_GRAM[macro];
    return now > 0 ? now : Math.max(1, formula[macro] * KCAL_PER_GRAM[macro]);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const grams: Partial<Record<MacroKey, number>> = {};
  let assigned = 0;
  macros.forEach((macro, index) => {
    const perGram = KCAL_PER_GRAM[macro];
    if (index === macros.length - 1) {
      grams[macro] = Math.round(Math.max(0, target - assigned) / perGram);
      return;
    }
    const share = (target * (weights[index] ?? 0)) / totalWeight;
    const whole = Math.max(0, Math.round(share / perGram));
    grams[macro] = whole;
    assigned += whole * perGram;
  });
  return grams;
}

/** `state` with all four values saved and the given lock fields replaced. */
function withSaved<S extends TargetLocks>(
  state: S,
  saved: Targets,
  changes: Partial<TargetLocks>,
): S {
  const { kcal, protein, carbs, fat } = saved;
  return { ...state, ...changes, saved: { kcal, protein, carbs, fat } };
}

/**
 * Sets the kcal target to `kcal`. Locked macros keep their grams; the free ones share whatever
 * energy the locked ones leave. kcal is then locked.
 */
export function setKcal<S extends TargetLocks>(state: S, formula: Targets, kcal: number): S {
  const current = effectiveTargets(state.saved, formula);
  const target = wholeAtLeastZero(kcal);
  const free = MACRO_KEYS.filter((macro) => !state.lockedMacros.includes(macro));
  const spread = distribute(
    target - lockedKcal(current, state.lockedMacros),
    free,
    current,
    formula,
  );
  return withSaved(state, { ...current, ...spread, kcal: target }, { caloriesLocked: true });
}

/**
 * Sets one macro to `grams`.
 * - kcal locked: only the other unlocked macros can give or take energy; with none the edit is
 *   refused and `null` comes back. The macro gets at most the energy the other locked macros
 *   leave, and the free ones share the rest; kcal does not move.
 * - kcal unlocked: the macro takes the value and kcal becomes the sum of the three macros.
 * The macro is then locked, unless two macros are locked already.
 */
export function setMacro<S extends TargetLocks>(
  state: S,
  formula: Targets,
  macro: MacroKey,
  grams: number,
): S | null {
  const current = effectiveTargets(state.saved, formula);
  const wanted = wholeAtLeastZero(grams);
  let next: Targets;
  if (state.caloriesLocked) {
    const givers = MACRO_KEYS.filter((m) => m !== macro && !state.lockedMacros.includes(m));
    if (givers.length === 0) return null;
    const room = Math.max(0, current.kcal - lockedKcal(current, state.lockedMacros, macro));
    const ownKcal = Math.min(wanted * KCAL_PER_GRAM[macro], room);
    next = {
      ...current,
      [macro]: div(ownKcal, KCAL_PER_GRAM[macro]),
      ...distribute(room - ownKcal, givers, current, formula),
    };
  } else {
    const changed = { ...current, [macro]: wanted };
    next = { ...changed, kcal: macroKcal(changed) };
  }
  const keepLocks =
    state.lockedMacros.includes(macro) || state.lockedMacros.length >= MAX_LOCKED_MACROS;
  const lockedMacros = keepLocks ? state.lockedMacros : [...state.lockedMacros, macro];
  return withSaved(state, next, { lockedMacros });
}

/** Unlocks kcal and sets it to the energy of the three macros. */
export function resetKcal<S extends TargetLocks>(state: S, formula: Targets): S {
  const current = effectiveTargets(state.saved, formula);
  return withSaved(state, { ...current, kcal: macroKcal(current) }, { caloriesLocked: false });
}

/** Unlocks `macro` and gives it the energy the other two macros leave of the kcal target. */
export function resetMacro<S extends TargetLocks>(state: S, formula: Targets, macro: MacroKey): S {
  const current = effectiveTargets(state.saved, formula);
  const others = macroKcal({ ...current, [macro]: 0 });
  const grams = div(Math.max(0, current.kcal - others), KCAL_PER_GRAM[macro]);
  const lockedMacros = state.lockedMacros.filter((m) => m !== macro);
  return withSaved(state, { ...current, [macro]: grams }, { lockedMacros });
}

/** Drops every lock; the saved values stay. A rebuild, a tune-up and turning the tune-up on do this. */
export function clearLocks<S extends TargetLocks>(state: S): S {
  return { ...state, caloriesLocked: false, lockedMacros: [] };
}
