// METs of walking from its speed (P15-02, D-16.96): the level-ground walking codes of the 2024
// Adult Compendium of Physical Activities (Herrmann et al., J Sport Health Sci 2024; the walking
// table at pacompendium.com). The Compendium gives speed bands in mph with small gaps between
// them; here each code's band starts at its lower speed and runs up to the next code's, so every
// speed reads one value. Speeds are km/h (1 mph = 1.609344 km/h).

const KMH_PER_MPH = 1.609344;

export interface WalkingMet {
  /** The Compendium's activity code. */
  readonly code: string;
  /** The lowest speed of the band, km/h. */
  readonly fromKmh: number;
  readonly met: number;
}

/** The bands, slowest first. */
export const WALKING_METS: readonly WalkingMet[] = [
  // Less than 2.0 mph, strolling, very slow.
  { code: '17151', fromKmh: 0, met: 2.3 },
  // 2.0 to 2.4 mph, slow pace.
  { code: '17152', fromKmh: 2.0 * KMH_PER_MPH, met: 2.8 },
  // 2.5 mph.
  { code: '17170', fromKmh: 2.5 * KMH_PER_MPH, met: 3.0 },
  // 2.8 to 3.4 mph, moderate pace.
  { code: '17190', fromKmh: 2.8 * KMH_PER_MPH, met: 3.8 },
  // 3.5 to 3.9 mph, brisk, walking for exercise.
  { code: '17200', fromKmh: 3.5 * KMH_PER_MPH, met: 4.8 },
  // 4.0 to 4.4 mph, very brisk.
  { code: '17220', fromKmh: 4.0 * KMH_PER_MPH, met: 5.5 },
  // 4.5 to 4.9 mph, very, very brisk.
  { code: '17230', fromKmh: 4.5 * KMH_PER_MPH, met: 7.0 },
  // 5.0 to 5.5 mph (and faster: the table's top).
  { code: '17231', fromKmh: 5.0 * KMH_PER_MPH, met: 8.5 },
];

/** METs of a walk with no measured speed: 17170, an ordinary walk. */
export const UNMEASURED_WALK_MET = 3.0;

/** The band a speed falls in (the slowest for anything not a positive number). */
export function walkingBand(kmh: number): WalkingMet {
  let band = WALKING_METS[0]!;
  if (!Number.isFinite(kmh)) return band;
  for (const candidate of WALKING_METS) if (kmh >= candidate.fromKmh) band = candidate;
  return band;
}

/** The METs of walking at `kmh`. */
export function metForSpeed(kmh: number): number {
  return walkingBand(kmh).met;
}
