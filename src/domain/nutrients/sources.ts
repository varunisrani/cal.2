// Which foods gave a day its amount of one nutrient (D-16.105): Home's Sources sheet lists them,
// largest first, each with its share of the day's total, and puts the total against its goal or
// limit. A food without a figure for the nutrient is unknown, never 0: it stays out of the total
// and the list and is counted apart. A figure of 0 is a figure: it counts toward the total, but a
// food that gave nothing is not listed.

import { isMacroKey, isNutrientKey, type DiaryEntry, type Targets } from '../model';
import { isGoalKey, type CatalogueId } from './catalogue';
import { GOAL_SPECS, type GoalValues, type NutrientGoalKind } from './goalDefaults';
import { figure } from './sugar';

/** What a day's sources can be read for: energy (in kcal) or any id of the catalogue. */
export type SourceNutrient = 'kcal' | CatalogueId;

/** The parts of an entry the sources read. */
export type SourceEntry = Pick<
  DiaryEntry,
  'id' | 'loggedAt' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'nutrients' | 'extras'
>;

/** One food that gave some of the nutrient. */
export interface FoodSource<E extends SourceEntry> {
  readonly entry: E;
  /** What it gave, above 0, in the nutrient's storage unit (kcal for energy). */
  readonly amount: number;
  /** Its part of the day's total, from 0 to 1. */
  readonly share: number;
}

/** A day's sources of one nutrient. */
export interface DaySources<E extends SourceEntry> {
  /** How many food entries the day has. */
  readonly foods: number;
  /** How many of them have no figure for the nutrient. */
  readonly withoutFigure: number;
  /** The sum over the foods with a figure; null when no food has one. */
  readonly total: number | null;
  /** The foods that gave some, largest first; the earlier food first on a tie. */
  readonly sources: readonly FoodSource<E>[];
}

/** The figure an entry carries for `nutrient`, or null when it has none. */
export function figureIn(entry: SourceEntry, nutrient: SourceNutrient): number | null {
  if (nutrient === 'kcal') return figure(entry.kcal);
  if (isMacroKey(nutrient)) return figure(entry[nutrient]);
  if (isNutrientKey(nutrient)) return figure(entry.nutrients[nutrient]);
  return figure(entry.extras[nutrient]);
}

/** Largest first; on a tie the earlier food, then the id, so the order never jumps. */
function byAmount<E extends SourceEntry>(a: FoodSource<E>, b: FoodSource<E>): number {
  if (a.amount !== b.amount) return b.amount - a.amount;
  if (a.entry.loggedAt !== b.entry.loggedAt) return a.entry.loggedAt - b.entry.loggedAt;
  if (a.entry.id === b.entry.id) return 0;
  return a.entry.id < b.entry.id ? -1 : 1;
}

/** The foods of a day that gave `nutrient`, with the total and the foods without a figure. */
export function sourcesOfDay<E extends SourceEntry>(
  entries: readonly E[],
  nutrient: SourceNutrient,
): DaySources<E> {
  let total: number | null = null;
  let withoutFigure = 0;
  const giving: { entry: E; amount: number }[] = [];
  for (const entry of entries) {
    const amount = figureIn(entry, nutrient);
    if (amount === null) {
      withoutFigure += 1;
      continue;
    }
    total = (total ?? 0) + amount;
    if (amount > 0) giving.push({ entry, amount });
  }
  // Only reached with a food that gave some, so the sum is above 0.
  const sum = total ?? 0;
  const sources = giving.map((food) => ({ ...food, share: food.amount / sum })).sort(byAmount);
  return { foods: entries.length, withoutFigure, total, sources };
}

/** A goal the total is read against: an amount to reach, or a limit to stay under. */
export interface SourceGoal {
  /** In the nutrient's storage unit (kcal for energy); above 0. */
  readonly amount: number;
  readonly kind: NutrientGoalKind;
}

/**
 * The goal of `nutrient` for the day: the energy and macro targets in effect (none without a
 * readable profile), the optional goal of Nutrient goals with its kind. Null for a goal of 0 (off)
 * and for the two fats that never have one.
 */
export function sourceGoal(
  nutrient: SourceNutrient,
  targets: Targets | null,
  goals: Readonly<GoalValues>,
): SourceGoal | null {
  let amount = 0;
  let kind: NutrientGoalKind = 'target';
  if (nutrient === 'kcal' || isMacroKey(nutrient)) {
    amount = targets?.[nutrient] ?? 0;
  } else if (isGoalKey(nutrient)) {
    amount = goals[nutrient];
    kind = GOAL_SPECS[nutrient].kind;
  }
  return amount > 0 ? { amount, kind } : null;
}
