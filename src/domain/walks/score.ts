// The walk score (P15-02, D-16.96): 0 to 100 from four parts, each shown with what it means.
//
// - Brisk share, up to 40: the share of the active minutes that were brisk.
// - Duration, up to 25: active minutes toward 30, the length a session of the weekly 150 aims at.
// - Intensity, up to 20: the walk's METs from 2.3 (a stroll) to 5.5 (a very brisk walk), linear.
// - Pace against the person's own walks, up to 15: this walk's speed over the mean speed of up to
//   the last 10 earlier walks with a speed; full at their average or faster, none at 85 % or
//   slower, linear between.
//
// A part that cannot be measured (no steps and no route for brisk minutes; no speed for intensity;
// no earlier walk for the pace) is left out, and the parts that remain are scaled to 100. Without
// either brisk minutes or intensity nothing about the effort was measured, so there is no score.

import type { SpeedSource, WalkScoreParts } from './model';

export const SCORE_WEIGHTS = { brisk: 40, duration: 25, intensity: 20, pace: 15 } as const;

/** Active minutes that earn the whole duration part. */
export const FULL_DURATION_MINUTES = 30;
/** METs at which the intensity part starts and is full. */
export const INTENSITY_FLOOR_MET = 2.3;
export const INTENSITY_FULL_MET = 5.5;
/** The pace part is empty at this share of the person's average speed, full at 1. */
export const PACE_FLOOR_RATIO = 0.85;
/** How many earlier walks the pace and the comparison look back over. */
export const COMPARED_WALKS = 10;

export interface ScoreInput {
  readonly activeSeconds: number;
  readonly briskMinutes: number;
  readonly briskKnown: boolean;
  readonly speedFrom: SpeedSource;
  readonly speedKmh: number | null;
  readonly met: number;
  /** Speeds (km/h) of the earlier walks to compare with, any order. */
  readonly earlierSpeeds: readonly number[];
}

export interface WalkScore {
  readonly score: number | null;
  readonly parts: WalkScoreParts;
  /** Speed ÷ the earlier walks' mean speed; null when there was nothing to compare. */
  readonly paceRatio: number | null;
}

function share(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Points rounded to one decimal. */
function points(weight: number, fraction: number): number {
  return Math.round(weight * share(fraction) * 10) / 10;
}

/** The mean of the usable speeds, or null. */
function meanSpeed(speeds: readonly number[]): number | null {
  const usable = speeds.filter((speed) => Number.isFinite(speed) && speed > 0);
  if (usable.length === 0) return null;
  return usable.reduce((sum, speed) => sum + speed, 0) / usable.length;
}

/** The score and its parts. */
export function walkScore(input: ScoreInput): WalkScore {
  const minutes = Math.max(0, input.activeSeconds) / 60;
  const brisk = input.briskKnown
    ? points(SCORE_WEIGHTS.brisk, minutes > 0 ? input.briskMinutes / minutes : 0)
    : null;
  const duration = points(SCORE_WEIGHTS.duration, minutes / FULL_DURATION_MINUTES);
  const measured = input.speedFrom !== 'none' && input.speedKmh !== null;
  const intensity = measured
    ? points(
        SCORE_WEIGHTS.intensity,
        (input.met - INTENSITY_FLOOR_MET) / (INTENSITY_FULL_MET - INTENSITY_FLOOR_MET),
      )
    : null;
  const average = meanSpeed(input.earlierSpeeds);
  const paceRatio = measured && average !== null ? input.speedKmh! / average : null;
  const pace =
    paceRatio === null
      ? null
      : points(SCORE_WEIGHTS.pace, (paceRatio - PACE_FLOOR_RATIO) / (1 - PACE_FLOOR_RATIO));

  const parts: WalkScoreParts = { brisk, duration, intensity, pace };
  if (brisk === null && intensity === null) return { score: null, parts, paceRatio };
  let earned = duration;
  let possible: number = SCORE_WEIGHTS.duration;
  for (const key of ['brisk', 'intensity', 'pace'] as const) {
    const part = parts[key];
    if (part === null) continue;
    earned += part;
    possible += SCORE_WEIGHTS[key];
  }
  return { score: Math.round((earned / possible) * 100), parts, paceRatio };
}

/** The effort a MET value stands for (under 3 light, 6 and up vigorous). */
export function effortOf(met: number): 'light' | 'moderate' | 'vigorous' {
  if (met >= 6) return 'vigorous';
  return met >= 3 ? 'moderate' : 'light';
}
