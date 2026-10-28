// Heart-rate zones of a walk (P15-02, D-16.96), from the samples Health Connect holds for its time
// (a watch, a chest strap). The top is 220 − age; zones 1 to 5 start at 50, 60, 70, 80 and 90 %
// of it, and time under 50 % is in no zone. Each sample stands for the time up to the next one,
// at most 30 s, so a gap in the recording is not filled with a guess.

import type { WalkHeartRate } from './model';

export interface HeartSample {
  readonly at: number;
  readonly bpm: number;
}

/** Where each zone starts, as a share of 220 − age. */
export const ZONE_FLOORS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;
/** The longest time one sample stands for. */
export const MAX_SAMPLE_MS = 30_000;
const MIN_BPM = 25;
const MAX_BPM = 250;

/** 220 − age, never below 100. */
export function maxHeartRate(ageYears: number): number {
  return Math.max(100, 220 - Math.max(0, Math.floor(ageYears)));
}

/** The zone (1–5) of a heart rate, or 0 under zone 1. */
export function zoneOf(bpm: number, maxHr: number): number {
  const share = bpm / maxHr;
  let zone = 0;
  ZONE_FLOORS.forEach((floor, index) => {
    if (share >= floor) zone = index + 1;
  });
  return zone;
}

/** The walk's heart rate, or null when no usable sample falls in it. */
export function heartRateSummary(
  samples: readonly HeartSample[],
  startedAt: number,
  endedAt: number,
  ageYears: number,
): WalkHeartRate | null {
  const usable = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.at) &&
        sample.at >= startedAt &&
        sample.at <= endedAt &&
        Number.isFinite(sample.bpm) &&
        sample.bpm >= MIN_BPM &&
        sample.bpm <= MAX_BPM,
    )
    .sort((a, b) => a.at - b.at);
  if (usable.length === 0) return null;
  const maxHr = maxHeartRate(ageYears);
  const zoneMs = [0, 0, 0, 0, 0];
  let weighted = 0;
  let weight = 0;
  let maxBpm = 0;
  usable.forEach((sample, index) => {
    const next = usable[index + 1]?.at ?? endedAt;
    const span = Math.min(MAX_SAMPLE_MS, Math.max(0, next - sample.at));
    const zone = zoneOf(sample.bpm, maxHr);
    if (zone > 0) zoneMs[zone - 1]! += span;
    weighted += sample.bpm * span;
    weight += span;
    maxBpm = Math.max(maxBpm, sample.bpm);
  });
  const mean =
    weight > 0 ? weighted / weight : usable.reduce((sum, s) => sum + s.bpm, 0) / usable.length;
  return {
    avgBpm: Math.round(mean),
    maxBpm: Math.round(maxBpm),
    maxHr,
    zoneSeconds: zoneMs.map((ms) => Math.round(ms / 1000)),
  };
}
