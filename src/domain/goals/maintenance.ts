// The maintenance estimate row: how the kcal target the person follows compares with the formula's
// daily burn. Maintenance is the daily burn cut to whole kcal, the same cut the formula plan uses,
// so a formula target differs from it by exactly the pace adjustment. Within ±50 kcal it reads as
// close to maintenance: the formula is far less exact than that, so an AI-tuned maintain target
// should not show as a tiny deficit.

import type { DayKey } from '../dates/dayKey';
import type { Profile } from '../model';
import { tdee } from './formulas';
import { effectiveTargets } from './targets';

/** A gap smaller than this (in kcal a day) reads as close to maintenance. */
export const MAINTENANCE_TOLERANCE = 50;

export type EnergyBalance = 'deficit' | 'close' | 'surplus';

export interface MaintenanceEstimate {
  /** trunc(TDEE), whole kcal a day. */
  maintenance: number;
  /** The effective kcal target. */
  target: number;
  /** target − maintenance: negative is a deficit, positive a surplus. */
  difference: number;
  balance: EnergyBalance;
}

/** Labels a gap: deficit at −50 or lower, surplus at +50 or higher, otherwise close. */
export function balanceOf(difference: number): EnergyBalance {
  if (difference <= -MAINTENANCE_TOLERANCE) return 'deficit';
  if (difference >= MAINTENANCE_TOLERANCE) return 'surplus';
  return 'close';
}

export function compareToMaintenance(maintenance: number, target: number): MaintenanceEstimate {
  const difference = target - maintenance;
  return { maintenance, target, difference, balance: balanceOf(difference) };
}

/** The estimate for a profile today: trunc(TDEE) against the effective kcal target. */
export function maintenanceEstimate(profile: Profile, today: DayKey): MaintenanceEstimate {
  return compareToMaintenance(
    Math.trunc(tdee(profile, today)),
    effectiveTargets(profile, today).kcal,
  );
}
