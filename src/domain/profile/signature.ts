// The plan-input key behind the "inputs changed, rebuild" nudge. Editing a plan input never
// recomputes the targets (R01.12); Settings compares this key with the one stored after the last
// rebuild and shows the nudge when they differ. Allergens, the body-fat goal, saved targets and
// locks are not plan inputs, so changing them keeps the key.

import type { Profile } from '../model';

/**
 * The plan inputs written as one string: sex, birth date, height, weight, activity, goal, pace,
 * goal weight and body fat. Numbers are written in their shortest exact form and absent values as
 * null, so 70 and 70.0 give one key while an absent pace differs from 0.
 */
export function planInputsKey(profile: Profile): string {
  return JSON.stringify([
    profile.sex,
    profile.birthDate,
    profile.heightCm,
    profile.weightKg,
    profile.activity,
    profile.goal,
    profile.weeklyKg ?? null,
    profile.goalWeightKg ?? null,
    profile.bodyFat ?? null,
  ]);
}

/** True when the inputs changed since the stored baseline. No baseline: never (R01.12). */
export function needsRebuild(profile: Profile, baseline: string | null | undefined): boolean {
  return typeof baseline === 'string' && baseline !== planInputsKey(profile);
}

/**
 * The key to store when there is no baseline yet, so the nudge stays hidden on first open and
 * shows only after a real change; null when a baseline exists.
 */
export function baselineToSeed(
  profile: Profile,
  baseline: string | null | undefined,
): string | null {
  return typeof baseline === 'string' ? null : planInputsKey(profile);
}
