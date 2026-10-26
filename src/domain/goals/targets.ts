// Effective targets: the four numbers Home tracks against. Saved values win; whatever is not saved
// is derived. A macro with a saved value is pinned; the energy the pinned macros leave goes to the
// free ones, split by their formula energy with whole-number division at every step (R01.9), so a
// few kcal can go unassigned.

import { MACRO_KEYS, type MacroKey, type SavedTargets, type Targets } from '../model';
import { KCAL_PER_GRAM } from './formulas';
import { div } from './integers';

/** Energy of the three macros: 4 kcal per gram of protein and carbs, 9 per gram of fat. */
export function macroKcal(grams: Pick<Targets, MacroKey>): number {
  let total = 0;
  for (const macro of MACRO_KEYS) total += grams[macro] * KCAL_PER_GRAM[macro];
  return total;
}

/**
 * The targets in effect for `saved` over the formula plan. kcal is the saved one, else the
 * formula's. Pinned macros keep their grams. The energy left (never below 0) goes whole to a
 * single free macro; several free macros split it in proportion to their formula energy, or take
 * their formula grams when that energy is 0.
 */
export function effectiveTargets(saved: SavedTargets, formula: Targets): Targets {
  const result: Targets = { ...formula, kcal: saved.kcal ?? formula.kcal };
  const free: MacroKey[] = [];
  let pinnedKcal = 0;
  for (const macro of MACRO_KEYS) {
    const grams = saved[macro];
    if (grams === undefined) {
      free.push(macro);
    } else {
      result[macro] = grams;
      pinnedKcal += grams * KCAL_PER_GRAM[macro];
    }
  }
  const left = Math.max(0, result.kcal - pinnedKcal);
  const [only] = free;
  if (free.length === 1 && only !== undefined) {
    result[only] = div(left, KCAL_PER_GRAM[only]);
    return result;
  }
  let weight = 0;
  for (const macro of free) weight += formula[macro] * KCAL_PER_GRAM[macro];
  if (weight <= 0) return result;
  for (const macro of free) {
    const share = div(left * formula[macro] * KCAL_PER_GRAM[macro], weight);
    result[macro] = div(share, KCAL_PER_GRAM[macro]);
  }
  return result;
}
