// The goal-reached rule for weigh-ins (R05.7, R01.11).
//
// The dialog is for progress, so it needs a new latest reading that passes the goal weight in the
// goal's direction. "Latest" is by the reading's time, not by when it was typed in: a reading
// dated before the current latest is history and never celebrates, even when it is past the
// goal. Comparing with the previous latest also makes the rule fire once: after the crossing,
// the latest is already past the goal, so later readings past it do not fire again.
//
// The weight repository (P02-08) asks `reachesGoalOnAdd` on every add path, so Progress, the
// Settings weight edit and the Coach all raise the same dialog.

import type { GoalKind, Profile, WeighIn } from '../model';

/** The reading with the greatest time; on a tie, the one that comes later in the list. */
export function latestByTime<T extends { at: number }>(readings: readonly T[]): T | undefined {
  let latest: T | undefined;
  for (const reading of readings) {
    if (latest === undefined || reading.at >= latest.at) latest = reading;
  }
  return latest;
}

/**
 * True when `added` takes over from `previousLatest` across the target: lose needs the previous
 * reading above the target and the new one at or below it, gain the mirror. Never for maintain,
 * without a target, without a previous reading, or when `added` is older than it.
 */
export function crossesGoal(
  previousLatest: Pick<WeighIn, 'at' | 'kg'> | undefined,
  added: Pick<WeighIn, 'at' | 'kg'>,
  goal: GoalKind,
  target: number | undefined,
): boolean {
  if (previousLatest === undefined || target === undefined) return false;
  if (added.at < previousLatest.at) return false;
  switch (goal) {
    case 'lose':
      return previousLatest.kg > target && added.kg <= target;
    case 'gain':
      return previousLatest.kg < target && added.kg >= target;
    case 'maintain':
      return false;
  }
}

/**
 * The check after a weigh-in is saved: `stored` is the list before the add (the new reading, if
 * already in it, is skipped by id), and the profile gives the goal and the goal weight.
 */
export function reachesGoalOnAdd(
  stored: readonly WeighIn[],
  added: WeighIn,
  profile: Pick<Profile, 'goal' | 'goalWeightKg'>,
): boolean {
  const previous = latestByTime(stored.filter((reading) => reading.id !== added.id));
  return crossesGoal(previous, added, profile.goal, profile.goalWeightKg);
}
