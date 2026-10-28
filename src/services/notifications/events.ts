// When an event notice is due (P17-02, D-16.101). Pure.

import type { DiaryEntry } from '../../domain/model';
import { MODERATE_GOAL_MINUTES } from '../../domain/walks/week';

/** The day's calories have passed the target when they are more than 110 % of it. */
export const CALORIES_OVER_SHARE = 1.1;

/**
 * The sugar of the day's foods that carry a sugar figure, in grams; null when none does. Foods
 * without a figure are left out: a sum of the known ones that passed the limit has passed it.
 */
export function sugarTotal(entries: readonly Pick<DiaryEntry, 'nutrients'>[]): number | null {
  let total: number | null = null;
  for (const entry of entries) {
    const sugar = entry.nutrients.sugar;
    if (sugar !== undefined && Number.isFinite(sugar)) total = (total ?? 0) + sugar;
  }
  return total;
}

/** The sugar limit (from Nutrient goals; 0 = no limit) was passed. */
export function sugarPassed(total: number | null, limitG: number): boolean {
  return total !== null && limitG > 0 && total > limitG;
}

/** The day's calories passed the day's target (goal + burned) by more than 10 %. */
export function caloriesPassed(eatenKcal: number, targetKcal: number): boolean {
  return targetKcal > 0 && eatenKcal > targetKcal * CALORIES_OVER_SHARE;
}

/** The day's protein reached its target. */
export function proteinReached(eatenG: number, goalG: number): boolean {
  return goalG > 0 && eatenG >= goalG;
}

/** The week's moderate minutes reached the WHO's 150. */
export function weekReached(minutes: number): boolean {
  return minutes >= MODERATE_GOAL_MINUTES;
}
