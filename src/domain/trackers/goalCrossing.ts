// Goal reached: whether a newly added weigh-in earns the congratulation. Only progress counts: the
// reading must be at least as recent as the latest one already stored (a back-dated reading is
// history, R05.7) and must carry the weight from the far side of the target to it or past it, in
// the direction the goal asks for. Once a reading has crossed, the next one starts from the near
// side, so the dialog shows once per crossing (R01.11). The weight repository (P02-08) runs this
// for every add path, before a new weight may clear a target it contradicts.

import type { GoalKind, WeighIn } from '../model';

/** A weigh-in as far as the goal rule cares: when, and how heavy. */
export type Reading = Pick<WeighIn, 'at' | 'kg'>;

/** +1 when the goal wants the weight to rise, −1 to fall, 0 when no direction counts. */
const GOAL_DIRECTION: Readonly<Record<GoalKind, number>> = { lose: -1, maintain: 0, gain: 1 };

/**
 * The most recent reading by instant, whatever order the list is in ("latest" is by date, never
 * by insertion, R05.7). Of readings at the same instant, the later one in the list. Null when
 * the list is empty.
 */
export function latestWeighIn<T extends Pick<WeighIn, 'at'>>(readings: readonly T[]): T | null {
  let latest: T | null = null;
  for (const reading of readings) {
    if (latest === null || reading.at >= latest.at) latest = reading;
  }
  return latest;
}

/**
 * True when `added` reaches the target weight for the first time since `previousLatest`, the
 * latest reading stored before it. False for the very first reading (no previous), a reading
 * older than the previous latest, a maintain goal, or no target. Lose: previous above the target
 * and the new one at or below it. Gain: previous below and the new one at or above.
 */
export function crossesGoal(
  previousLatest: Reading | null | undefined,
  added: Reading,
  goal: GoalKind,
  target: number | undefined,
): boolean {
  if (!previousLatest || target === undefined) return false;
  if (added.at < previousLatest.at) return false;
  const direction = GOAL_DIRECTION[goal];
  if (direction === 0) return false;
  // Distances to the target measured along the goal's direction: below 0 is short of it.
  const before = (previousLatest.kg - target) * direction;
  const after = (added.kg - target) * direction;
  return before < 0 && after >= 0;
}
