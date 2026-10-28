// Scripted walks for the walk tests: fixes along a line north at a steady speed and cumulative
// step counts at a steady cadence, from a fixed start. Not part of the app.

import type { RoutePoint, StepCount } from '../model';

/** 2026-10-26 08:00 UTC. */
export const WALK_START = Date.UTC(2026, 9, 26, 8, 0, 0);
/** Metres in one degree of latitude on the mean Earth radius. */
export const METRES_PER_DEGREE = (Math.PI * 6_371_008.8) / 180;

export interface Leg {
  /** Seconds the leg lasts. */
  readonly seconds: number;
  /** Metres a second (0 standing). */
  readonly speed: number;
  /** Steps a minute. */
  readonly cadence: number;
}

export interface Script {
  readonly points: RoutePoint[];
  readonly steps: StepCount[];
  /** Where the script ends. */
  readonly endAt: number;
  readonly metres: number;
}

/** Fixes every 2 s and step counts every 10 s over the legs, walking north from Berlin. */
export function scriptWalk(
  legs: readonly Leg[],
  options: { start?: number; accuracyM?: number } = {},
): Script {
  const start = options.start ?? WALK_START;
  const accuracyM = options.accuracyM ?? 5;
  const points: RoutePoint[] = [{ at: start, lat: 52.52, lon: 13.405, accuracyM }];
  const steps: StepCount[] = [];
  let at = start;
  let metres = 0;
  let stepped = 0;
  for (const leg of legs) {
    for (let second = 1; second <= leg.seconds; second++) {
      at += 1000;
      metres += leg.speed;
      stepped += leg.cadence / 60;
      if (second % 2 === 0) {
        points.push({ at, lat: 52.52 + metres / METRES_PER_DEGREE, lon: 13.405, accuracyM });
      }
      if ((at - start) % 10_000 === 0) steps.push({ at, steps: Math.round(stepped) });
    }
  }
  return { points, steps, endAt: at, metres };
}
