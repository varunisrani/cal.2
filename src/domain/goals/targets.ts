// The four values the app tracks against, from the saved targets and the formula plan.
//
// kcal is the saved value, else the formula value. A macro with a saved value is pinned and keeps
// it. The macros without one are auto: they share the kcal the pinned macros leave, in proportion
// to their formula energy, by whole-number division (a lone auto macro takes all of it). The
// division truncates, so a few kcal can go unassigned (R01.9).

import type { DayKey } from '../dates/dayKey';
import { MACRO_KEYS, type MacroKey, type Profile, type SavedTargets, type Targets } from '../model';
import { KCAL_PER_GRAM, formulaPlan, intDiv } from './formulas';

/** True when the macro has a saved value (it is pinned, not auto-balanced). */
export function isPinned(saved: SavedTargets, macro: MacroKey): boolean {
  return saved[macro] !== undefined;
}

/** Effective targets for saved values over a formula plan. */
export function autoBalance(saved: SavedTargets, formula: Targets): Targets {
  const kcal = saved.kcal ?? formula.kcal;
  let pinnedKcal = 0;
  const auto: MacroKey[] = [];
  for (const macro of MACRO_KEYS) {
    const grams = saved[macro];
    if (grams === undefined) auto.push(macro);
    else pinnedKcal += grams * KCAL_PER_GRAM[macro];
  }
  const left = Math.max(0, kcal - pinnedKcal);
  const formulaKcal = (macro: MacroKey): number => formula[macro] * KCAL_PER_GRAM[macro];
  const autoFormulaKcal = auto.reduce((sum, macro) => sum + formulaKcal(macro), 0);

  const gramsOf = (macro: MacroKey): number => {
    const grams = saved[macro];
    if (grams !== undefined) return grams;
    if (auto.length === 1) return intDiv(left, KCAL_PER_GRAM[macro]);
    if (autoFormulaKcal <= 0) return formula[macro];
    const share = intDiv(left * formulaKcal(macro), autoFormulaKcal);
    return intDiv(share, KCAL_PER_GRAM[macro]);
  };
  return { kcal, protein: gramsOf('protein'), carbs: gramsOf('carbs'), fat: gramsOf('fat') };
}

/** The four targets the app shows and tracks for this profile today. */
export function effectiveTargets(profile: Profile, today: DayKey): Targets {
  return autoBalance(profile.saved, formulaPlan(profile, today));
}
