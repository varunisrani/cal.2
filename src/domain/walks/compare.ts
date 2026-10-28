// "Compared with your walks" (P15-02, D-16.96): a walk set against the person's recent walks, the
// same ones its pace part was scored against.

import type { Walk } from './model';
import { COMPARED_WALKS } from './score';

export interface WalkAverages {
  readonly count: number;
  /** Active minutes. */
  readonly minutes: number;
  /** Null when none of them had a route. */
  readonly distanceM: number | null;
  /** Null when none of them had a speed. */
  readonly speedKmh: number | null;
  /** Null when none of them had a score. */
  readonly score: number | null;
}

/** Up to the last 10 walks that ended before `walk` started, newest first. */
export function earlierWalks<T extends Pick<Walk, 'id' | 'startedAt' | 'endedAt'>>(
  walk: Pick<Walk, 'id' | 'startedAt'>,
  all: readonly T[],
): T[] {
  return all
    .filter((other) => other.id !== walk.id && other.endedAt <= walk.startedAt)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, COMPARED_WALKS);
}

function mean(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0) / known.length;
}

/** The means of `walks`, or null for none. */
export function walkAverages(
  walks: readonly Pick<Walk, 'activeSeconds' | 'distanceM' | 'speedKmh' | 'score'>[],
): WalkAverages | null {
  if (walks.length === 0) return null;
  return {
    count: walks.length,
    minutes: mean(walks.map((walk) => walk.activeSeconds / 60)) ?? 0,
    distanceM: mean(walks.map((walk) => walk.distanceM)),
    speedKmh: mean(walks.map((walk) => walk.speedKmh)),
    score: mean(walks.map((walk) => walk.score)),
  };
}
