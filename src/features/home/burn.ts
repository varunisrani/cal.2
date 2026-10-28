// The day's energy target with the day's burn counted in (P11-04, D-16.89; P15-03, D-16.96): while
// "Count active calories" is on, the target is the goal plus the day's active calories. Only the
// target on show changes; the stored goal and every macro target stay as they are.
//
// Where the burn comes from is told apart by Health Connect alone: with the Health Connect service
// present and `health.connected` on, it is Health Connect's day (`countedBurn`), which already
// holds the walks recorded here (they are written there) merged with every other app's data, so
// nothing is added on top. Without it, the active calories of the walks recorded that day count
// (`walkBurn`). Never both.

import type { ActivityDay } from '../../data/hooks';
import type { Targets } from '../../domain/model';
import type { Walk } from '../../domain/walks/model';

/** The whole kcal of active energy the day adds to its target, or null when nothing is added. */
export function countedBurn(goalKcal: number, day: ActivityDay | null): number | null {
  if (!(goalKcal > 0) || day === null || day.activeKcal === null) return null;
  const burned = Math.round(day.activeKcal);
  return burned > 0 ? burned : null;
}

/**
 * The whole kcal of the day's recorded walks' active energy, for when Health Connect is not
 * connected, or null when nothing is added.
 */
export function walkBurn(
  goalKcal: number,
  walks: readonly Pick<Walk, 'activeKcal'>[],
): number | null {
  if (!(goalKcal > 0)) return null;
  const burned = Math.round(walks.reduce((sum, walk) => sum + Math.max(0, walk.activeKcal), 0));
  return burned > 0 ? burned : null;
}

/** Where the day's burn comes from (see above). */
export type BurnSource = 'health' | 'walks' | 'none';

/** Health Connect when it is connected; else the recorded walks where the app records them. */
export function burnSource(healthConnected: boolean, recordsWalks: boolean): BurnSource {
  if (healthConnected) return 'health';
  return recordsWalks ? 'walks' : 'none';
}

/** `targets` with the burn added to the energy target. */
export function withBurn(targets: Targets, burnedKcal: number | null): Targets {
  return burnedKcal === null ? targets : { ...targets, kcal: targets.kcal + burnedKcal };
}
