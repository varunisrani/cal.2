// The maintenance estimate shown in Settings: the formula's daily burn next to the target the
// person follows. It is an estimate from the formulas, never measured burn, so small gaps read as
// "close" rather than as a tiny deficit or surplus.

import type { DayKey } from '../dates/dayKey';
import { tdee, type FormulaInputs } from './formulas';

/** Gaps smaller than this many kcal either way read as close to maintenance. */
export const MAINTENANCE_BAND = 50;

/** How the followed target sits against the estimated burn. */
export type EnergyBalance = 'deficit' | 'close' | 'surplus';

export interface MaintenanceEstimate {
  /** The daily burn cut to whole kcal, the same figure the formula plan starts from. */
  readonly maintenanceKcal: number;
  /** The effective kcal target. */
  readonly targetKcal: number;
  /** target − maintenance: below 0 eats under the estimate, above 0 over it. */
  readonly difference: number;
  readonly balance: EnergyBalance;
}

/** −50 or lower is a deficit, +50 or higher a surplus, anything between is close. */
export function balanceOf(difference: number): EnergyBalance {
  if (difference <= -MAINTENANCE_BAND) return 'deficit';
  if (difference >= MAINTENANCE_BAND) return 'surplus';
  return 'close';
}

/**
 * Compares `targetKcal` (the effective target) with the formula burn. For a formula target the
 * difference is exactly the pace adjustment, because both start from the same truncated burn.
 */
export function estimateMaintenance(
  inputs: FormulaInputs,
  today: DayKey,
  targetKcal: number,
): MaintenanceEstimate {
  const maintenanceKcal = Math.trunc(tdee(inputs, today));
  const difference = targetKcal - maintenanceKcal;
  return { maintenanceKcal, targetKcal, difference, balance: balanceOf(difference) };
}
