// Rules that keep a profile consistent when one field changes in Settings or the wizard. None of
// them touches the targets: a changed input only raises the rebuild nudge (R01.12).

import { err, ok, type Result } from '../../lib/result';
import { DEFAULT_PACE_KG } from '../goals/formulas';
import type { GoalKind, Profile } from '../model';
import { WEIGHT_LIMITS } from '../units/body';

/** The three weekly paces offered for lose and gain, in kg a week. */
export const PACE_PRESETS = [
  { name: 'slow', kg: 0.25 },
  { name: 'steady', kg: DEFAULT_PACE_KG },
  { name: 'fast', kg: 1 },
] as const;
export type PaceName = (typeof PACE_PRESETS)[number]['name'];

/** Why a goal weight cannot be saved. */
export type GoalWeightProblem = 'mustBeBelow' | 'mustBeAbove' | 'outOfRange';

type OptionalField = 'bodyFat' | 'goalBodyFat' | 'weeklyKg' | 'goalWeightKg';

/** A copy without the given optional fields (removed, not set to undefined). */
function without(profile: Profile, ...fields: OptionalField[]): Profile {
  const copy = { ...profile };
  for (const field of fields) delete copy[field];
  return copy;
}

/** True when a goal weight points the wrong way: lose needs it below, gain above the weight. */
function contradicts(goal: GoalKind, goalKg: number, currentKg: number): boolean {
  return (goal === 'lose' && goalKg >= currentKg) || (goal === 'gain' && goalKg <= currentKg);
}

/**
 * Why `targetKg` cannot be the goal weight for `goal` at `currentKg`, or null when it can. Lose
 * needs a target below the current weight and gain one above it (D-16.11); maintain needs no
 * direction. A target outside 20–250 kg (the one weight range, D-16.56) is out of range.
 */
export function goalWeightProblem(
  goal: GoalKind,
  targetKg: number,
  currentKg: number,
): GoalWeightProblem | null {
  const { min, max } = WEIGHT_LIMITS.kg;
  if (!Number.isFinite(targetKg) || targetKg < min || targetKg > max) return 'outOfRange';
  if (goal === 'lose' && targetKg >= currentKg) return 'mustBeBelow';
  if (goal === 'gain' && targetKg <= currentKg) return 'mustBeAbove';
  return null;
}

/** The check the wizard and Settings run before saving a goal weight. */
export function checkGoalWeight(profile: Profile, targetKg: number): GoalWeightProblem | null {
  return goalWeightProblem(profile.goal, targetKg, profile.weightKg);
}

/** Saves a goal weight, or refuses it and changes nothing. */
export function setGoalWeight(
  profile: Profile,
  targetKg: number,
): Result<Profile, GoalWeightProblem> {
  const problem = checkGoalWeight(profile, targetKg);
  return problem === null ? ok({ ...profile, goalWeightKg: targetKg }) : err(problem);
}

/**
 * Switches the goal. Maintain drops the pace and the goal weight. Lose and gain keep a set pace
 * (0.5 kg a week when none is set) and drop a goal weight on the wrong side.
 */
export function changeGoal(profile: Profile, goal: GoalKind): Profile {
  if (goal === 'maintain') return { ...without(profile, 'weeklyKg', 'goalWeightKg'), goal };
  const next: Profile = { ...profile, goal, weeklyKg: profile.weeklyKg ?? DEFAULT_PACE_KG };
  const goalKg = next.goalWeightKg;
  return goalKg !== undefined && contradicts(goal, goalKg, next.weightKg)
    ? without(next, 'goalWeightKg')
    : next;
}

/** Sets the weekly pace in kg. */
export function setPace(profile: Profile, kg: number): Profile {
  return { ...profile, weeklyKg: kg };
}

/** A new current weight; a goal weight it now contradicts is dropped. */
export function withWeight(profile: Profile, kg: number): Profile {
  const next: Profile = { ...profile, weightKg: kg };
  const goalKg = next.goalWeightKg;
  return goalKg !== undefined && contradicts(next.goal, goalKg, kg)
    ? without(next, 'goalWeightKg')
    : next;
}

/** Sets body fat as a fraction; undefined removes it and the body-fat goal with it. */
export function setBodyFat(profile: Profile, fraction: number | undefined): Profile {
  if (fraction === undefined) return without(profile, 'bodyFat', 'goalBodyFat');
  return { ...profile, bodyFat: fraction };
}
