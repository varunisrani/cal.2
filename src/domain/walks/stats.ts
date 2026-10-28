// A walk's figures from what the recorder measured (P15-02, D-16.96): distance, pace (overall
// and over the last minute), steps and cadence, per-minute splits, brisk minutes, speed, METs
// and energy. The same function serves the live screen (up to now) and the stopped walk.
//
// Active time is the recorder's own count, pauses left out. Splits are wall-clock minutes from
// the start: a paused minute simply holds no steps and no metres. A minute is brisk at 100 steps
// a minute or more when steps were allowed; without steps, at 4.8 km/h or more along the route.
// Speed comes from the route once it holds 50 m, else from the steps and a step length of
// 0.414 × height, else there is none. Energy is MET × kg × active hours; active energy leaves
// the resting 1 MET out: (MET − 1) × kg × hours.

import { countedMoves, usableFixes, type Move } from './geo';
import { metForSpeed, UNMEASURED_WALK_MET } from './mets';
import type { RoutePoint, SpeedSource, StepCount, WalkSplits } from './model';

/** Steps a minute from which a minute is brisk. */
export const BRISK_CADENCE = 100;
/** km/h from which a minute is brisk when there are no steps (3 mph). */
export const BRISK_KMH = 4.8;
/** Step length as a share of height (a common estimate for walking). */
export const STEP_LENGTH_PER_HEIGHT = 0.414;
/** The route gives the speed once it holds this many metres. */
export const ROUTE_SPEED_MIN_M = 50;
/** The window the recent pace looks back over. */
export const RECENT_WINDOW_MS = 60_000;
/** The most minutes a walk's splits hold (10 hours). */
export const MAX_SPLITS = 600;

const MINUTE_MS = 60_000;
/** The recorder's step sampling interval, and the gap past which two samples span a pause. */
const STEP_SAMPLE_MS = 10_000;
const STEP_GAP_MS = 30_000;
/** The recent pace needs at least this much movement in its window. */
const RECENT_MIN_M = 20;
const RECENT_MIN_MS = 15_000;

export interface WalkInput {
  readonly startedAt: number;
  /** The end: `endedAt` of a stopped walk, or now for a live one. */
  readonly endAt: number;
  /** The recorder's active time, pauses left out. */
  readonly activeSeconds: number;
  readonly points: readonly RoutePoint[];
  readonly steps: readonly StepCount[];
  /** Location was allowed (a route is expected). */
  readonly locationGranted: boolean;
  /** The step sensor was allowed. */
  readonly stepsGranted: boolean;
  readonly heightCm: number;
  readonly weightKg: number;
}

export interface WalkStats {
  readonly activeSeconds: number;
  /** Null without location. */
  readonly distanceM: number | null;
  /** Seconds per km over the active time; null without a route speed. */
  readonly paceSecPerKm: number | null;
  /** Seconds per km over the last minute of moves; null when it moved too little. */
  readonly recentPaceSecPerKm: number | null;
  /** Null without the step sensor. */
  readonly steps: number | null;
  /** Steps per minute over the active time; null without steps or under 30 s. */
  readonly cadence: number | null;
  readonly splits: WalkSplits;
  readonly briskMinutes: number;
  readonly briskKnown: boolean;
  readonly speedFrom: SpeedSource;
  readonly speedKmh: number | null;
  readonly met: number;
  readonly kcal: number;
  readonly activeKcal: number;
}

/** The step counts with times, oldest first, never going down (a reset keeps the highest). */
function stepLine(samples: readonly StepCount[], startedAt: number): StepCount[] {
  const line: StepCount[] = [{ at: startedAt, steps: 0 }];
  let highest = 0;
  const sorted = samples
    .filter((sample) => Number.isFinite(sample.at) && Number.isFinite(sample.steps))
    .sort((a, b) => a.at - b.at);
  for (const sample of sorted) {
    if (sample.at < startedAt) continue;
    highest = Math.max(highest, sample.steps);
    line.push({ at: sample.at, steps: highest });
  }
  return line;
}

/**
 * Steps counted up to `at`: linear between samples, flat after the last. Across a gap longer than
 * `STEP_GAP_MS` (a pause: the recorder samples every 10 s while it counts) the steps of the later
 * sample are put in the 10 s before it, so a pause holds none.
 */
function stepsAt(line: readonly StepCount[], at: number): number {
  let before = line[0]!;
  for (const sample of line) {
    if (sample.at > at) {
      const from = sample.at - before.at > STEP_GAP_MS ? sample.at - STEP_SAMPLE_MS : before.at;
      if (at <= from) return before.steps;
      const span = sample.at - from;
      if (span <= 0) return before.steps;
      return before.steps + ((sample.steps - before.steps) * (at - from)) / span;
    }
    before = sample;
  }
  return before.steps;
}

/** Metres of `moves` that fall between `from` and `to`, each shared by time. */
function metresWithin(moves: readonly Move[], from: number, to: number): number {
  let metres = 0;
  for (const move of moves) {
    const span = move.toAt - move.fromAt;
    const overlap = Math.min(to, move.toAt) - Math.max(from, move.fromAt);
    if (overlap > 0 && span > 0) metres += (move.metres * overlap) / span;
  }
  return metres;
}

/** Seconds per km of `metres` covered in `seconds`, or null. */
function paceOf(metres: number, seconds: number): number | null {
  if (!(metres > 0) || !(seconds > 0)) return null;
  return seconds / (metres / 1000);
}

/** Seconds per km over the moves of the last minute before the route's last fix. */
function recentPace(moves: readonly Move[]): number | null {
  const last = moves[moves.length - 1];
  if (!last) return null;
  const from = last.toAt - RECENT_WINDOW_MS;
  const metres = metresWithin(moves, from, last.toAt);
  const first = moves.find((move) => move.toAt > from);
  const span = last.toAt - Math.max(from, first?.fromAt ?? from);
  if (metres < RECENT_MIN_M || span < RECENT_MIN_MS) return null;
  return paceOf(metres, span / 1000);
}

/** Every figure of a walk from what was measured up to `endAt`. */
export function walkStats(input: WalkInput): WalkStats {
  const { startedAt, weightKg } = input;
  const endAt = Math.max(input.endAt, startedAt);
  const activeSeconds = Math.max(0, input.activeSeconds);
  const activeMinutes = activeSeconds / 60;

  const moves = countedMoves(input.points);
  const hasRoute = input.locationGranted || usableFixes(input.points).length > 0;
  const distanceM = hasRoute ? moves.reduce((sum, move) => sum + move.metres, 0) : null;

  const line = stepLine(input.steps, startedAt);
  const hasSteps = input.stepsGranted || input.steps.length > 0;
  const steps = hasSteps ? Math.round(line[line.length - 1]!.steps) : null;
  const cadence = steps !== null && activeSeconds >= 30 ? steps / activeMinutes : null;

  // Wall-clock minutes from the start.
  const count = Math.min(MAX_SPLITS, Math.ceil((endAt - startedAt) / MINUTE_MS));
  const splitMetres: number[] = [];
  const splitSteps: number[] = [];
  let briskMs = 0;
  for (let index = 0; index < count; index++) {
    const from = startedAt + index * MINUTE_MS;
    const to = Math.min(endAt, from + MINUTE_MS);
    const length = to - from;
    const metres = metresWithin(moves, from, to);
    const stepped = stepsAt(line, to) - stepsAt(line, from);
    splitMetres.push(Math.round(metres));
    splitSteps.push(Math.round(stepped));
    if (length <= 0) continue;
    const brisk = hasSteps
      ? stepped / (length / MINUTE_MS) >= BRISK_CADENCE
      : distanceM !== null && (metres / (length / 1000)) * 3.6 >= BRISK_KMH;
    if (brisk) briskMs += length;
  }
  const briskKnown = hasSteps || distanceM !== null;
  const briskMinutes = Math.round(Math.min(briskMs / MINUTE_MS, activeMinutes));

  let speedFrom: SpeedSource = 'none';
  let speedKmh: number | null = null;
  if (activeSeconds > 0 && distanceM !== null && distanceM >= ROUTE_SPEED_MIN_M) {
    speedFrom = 'route';
    speedKmh = (distanceM / activeSeconds) * 3.6;
  } else if (cadence !== null && steps !== null && steps > 0 && input.heightCm > 0) {
    speedFrom = 'steps';
    const stepMetres = (STEP_LENGTH_PER_HEIGHT * input.heightCm) / 100;
    speedKmh = (cadence * stepMetres * 60) / 1000;
  }
  const met = speedKmh === null ? UNMEASURED_WALK_MET : metForSpeed(speedKmh);
  const hours = activeSeconds / 3600;
  const kg = weightKg > 0 ? weightKg : 0;

  return {
    activeSeconds,
    distanceM,
    paceSecPerKm:
      speedFrom === 'route' && distanceM !== null ? paceOf(distanceM, activeSeconds) : null,
    recentPaceSecPerKm: recentPace(moves),
    steps,
    cadence,
    splits: {
      metres: distanceM === null ? null : splitMetres,
      steps: hasSteps ? splitSteps : null,
    },
    briskMinutes,
    briskKnown,
    speedFrom,
    speedKmh,
    met,
    kcal: met * kg * hours,
    activeKcal: Math.max(0, met - 1) * kg * hours,
  };
}
