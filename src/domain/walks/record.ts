// The stored walk from what the recorder kept (P15-02, D-16.96): every figure, the score against
// the person's earlier walks, the thinned route and the heart rate, in one record.

import { earlierWalks } from './compare';
import type { RoutePoint, StepCount, Walk, WalkHeartRate } from './model';
import { encodeRoute, routeFixes } from './route';
import { walkScore } from './score';
import { walkStats } from './stats';

/** A stopped walk as the recorder hands it over (times in epoch ms). */
export interface RecordedWalk {
  readonly id: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly activeSeconds: number;
  readonly points: readonly RoutePoint[];
  readonly steps: readonly StepCount[];
  readonly locationGranted: boolean;
  readonly stepsGranted: boolean;
}

export interface WalkContext {
  readonly heightCm: number;
  readonly weightKg: number;
  /** The walks stored before this one, any order (the last 10 before it are compared). */
  readonly stored: readonly Walk[];
  readonly heartRate: WalkHeartRate | null;
}

/** Whole numbers for counts, one decimal for the rest, so stored figures stay short. */
function tenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function tenthOrNull(value: number | null): number | null {
  return value === null ? null : tenth(value);
}

/** The walk to store. */
export function buildWalk(recorded: RecordedWalk, context: WalkContext): Walk {
  const endedAt = Math.max(recorded.endedAt, recorded.startedAt);
  const stats = walkStats({
    startedAt: recorded.startedAt,
    endAt: endedAt,
    activeSeconds: recorded.activeSeconds,
    points: recorded.points,
    steps: recorded.steps,
    locationGranted: recorded.locationGranted,
    stepsGranted: recorded.stepsGranted,
    heightCm: context.heightCm,
    weightKg: context.weightKg,
  });
  const earlier = earlierWalks({ id: recorded.id, startedAt: recorded.startedAt }, context.stored);
  const scored = walkScore({
    activeSeconds: stats.activeSeconds,
    briskMinutes: stats.briskMinutes,
    briskKnown: stats.briskKnown,
    speedFrom: stats.speedFrom,
    speedKmh: stats.speedKmh,
    met: stats.met,
    earlierSpeeds: earlier.flatMap((walk) => (walk.speedKmh === null ? [] : [walk.speedKmh])),
  });
  return {
    id: recorded.id,
    startedAt: recorded.startedAt,
    endedAt,
    activeSeconds: Math.round(stats.activeSeconds),
    distanceM: stats.distanceM === null ? null : Math.round(stats.distanceM),
    steps: stats.steps,
    speedFrom: stats.speedFrom,
    speedKmh: tenthOrNull(stats.speedKmh),
    cadence: stats.cadence === null ? null : Math.round(stats.cadence),
    briskMinutes: stats.briskMinutes,
    briskKnown: stats.briskKnown,
    met: stats.met,
    weightKg: context.weightKg,
    kcal: Math.round(stats.kcal),
    activeKcal: Math.round(stats.activeKcal),
    score: scored.score,
    parts: scored.parts,
    paceRatio: scored.paceRatio === null ? null : Math.round(scored.paceRatio * 100) / 100,
    splits: stats.splits,
    route: encodeRoute(routeFixes(recorded.points, recorded.startedAt)),
    heartRate: context.heartRate,
    writtenToHealth: false,
  };
}
