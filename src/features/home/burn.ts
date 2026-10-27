// The day's energy target with Health Connect's burn counted in (P11-04, D-16.89): while counting
// is on, the target is the goal plus the day's active calories. Only the target on show changes;
// the stored goal and every macro target stay as they are.

import type { ActivityDay } from '../../data/hooks';
import type { Targets } from '../../domain/model';

/** The whole kcal of active energy the day adds to its target, or null when nothing is added. */
export function countedBurn(goalKcal: number, day: ActivityDay | null): number | null {
  if (!(goalKcal > 0) || day === null || day.activeKcal === null) return null;
  const burned = Math.round(day.activeKcal);
  return burned > 0 ? burned : null;
}

/** `targets` with the burn added to the energy target. */
export function withBurn(targets: Targets, burnedKcal: number | null): Targets {
  return burnedKcal === null ? targets : { ...targets, kcal: targets.kcal + burnedKcal };
}
