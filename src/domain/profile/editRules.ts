// What a profile field edit carries with it. Each updater returns a new profile and never touches
// the saved targets or the locks: editing body data or the goal does not recompute the plan; the
// person rebuilds it when the "inputs changed" nudge asks (R01.12). A removed field is a removed
// key, never a key holding `undefined`.

import { err, ok, type Result } from '../../lib/result';
import type { GoalKind, Profile } from '../model';

export const PACE_IDS = ['slow', 'steady', 'fast'] as const;
/** The three pace choices for lose and gain. */
export type PaceId = (typeof PACE_IDS)[number];

/** Kilograms a week for each pace choice. */
export const PACE_PRESETS: Readonly<Record<PaceId, number>> = { slow: 0.25, steady: 0.5, fast: 1 };

/** The pace a lose or gain goal starts with when none is set. */
export const DEFAULT_WEEKLY_KG = PACE_PRESETS.steady;

/** The pace choice for a stored pace, or null when it matches none of them exactly. */
export function paceIdOf(kgPerWeek: number | undefined): PaceId | null {
  return PACE_IDS.find((id) => PACE_PRESETS[id] === kgPerWeek) ?? null;
}

/** Why a target weight is refused: a lose target must be lower, a gain target higher. */
export type GoalWeightProblem = 'notBelowCurrent' | 'notAboveCurrent';

/**
 * Checks a target weight against the goal and the current weight: losing needs a target below
 * the current weight, gaining one above it; equal is refused for both. Maintaining accepts any
 * target. Settings and the wizard use the same check (D-16.11).
 */
export function checkGoalWeight(
  body: Pick<Profile, 'goal' | 'weightKg'>,
  goalWeightKg: number,
): GoalWeightProblem | null {
  if (body.goal === 'lose') return goalWeightKg < body.weightKg ? null : 'notBelowCurrent';
  if (body.goal === 'gain') return goalWeightKg > body.weightKg ? null : 'notAboveCurrent';
  return null;
}

/** Drops the target weight when the goal and current weight make it impossible. */
function withoutContradictedTarget(profile: Profile): Profile {
  const target = profile.goalWeightKg;
  if (target === undefined || checkGoalWeight(profile, target) === null) return profile;
  const next = { ...profile };
  delete next.goalWeightKg;
  return next;
}

/**
 * Changes the goal. Maintain drops the pace and the target weight. Lose and gain keep a set pace
 * or start at 0.5 kg a week, and drop a target on the wrong side of the current weight.
 */
export function withGoal(profile: Profile, goal: GoalKind): Profile {
  const next: Profile = { ...profile, goal };
  if (goal === 'maintain') {
    delete next.weeklyKg;
    delete next.goalWeightKg;
    return next;
  }
  next.weeklyKg = profile.weeklyKg ?? DEFAULT_WEEKLY_KG;
  return withoutContradictedTarget(next);
}

/** Sets the target weight, or refuses (changing nothing) when it is on the wrong side. */
export function withGoalWeight(
  profile: Profile,
  goalWeightKg: number,
): Result<Profile, GoalWeightProblem> {
  const problem = checkGoalWeight(profile, goalWeightKg);
  return problem === null ? ok({ ...profile, goalWeightKg }) : err(problem);
}

/**
 * Sets the current weight (a new weigh-in), dropping a target the new weight contradicts: a lose
 * target at or above it, or a gain target at or below it.
 */
export function withWeight(profile: Profile, weightKg: number): Profile {
  return withoutContradictedTarget({ ...profile, weightKg });
}

/** Sets body fat (a fraction), or clears it together with goal body fat when `null`. */
export function withBodyFat(profile: Profile, fraction: number | null): Profile {
  const next = { ...profile };
  if (fraction === null) {
    delete next.bodyFat;
    delete next.goalBodyFat;
  } else {
    next.bodyFat = fraction;
  }
  return next;
}

/**
 * Sets goal body fat (a fraction), or clears it when `null`. Goal body fat exists only next to a
 * body fat value, so without one the result has none.
 */
export function withGoalBodyFat(profile: Profile, fraction: number | null): Profile {
  const next = { ...profile };
  if (fraction === null || profile.bodyFat === undefined) {
    delete next.goalBodyFat;
  } else {
    next.goalBodyFat = fraction;
  }
  return next;
}
