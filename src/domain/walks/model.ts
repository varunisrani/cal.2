// The walk records (P15-02, D-16.96): what a walk recorder measured, in the shapes the walk
// functions take, and the walk Platewise stores once a walk is stopped. Instants are epoch ms.

/** One GPS fix of a walk. */
export interface RoutePoint {
  readonly at: number;
  readonly lat: number;
  readonly lon: number;
  /** Metres, as the phone estimated it. */
  readonly accuracyM: number;
}

/** Steps counted from the start of the walk up to `at`. */
export interface StepCount {
  readonly at: number;
  readonly steps: number;
}

/** Where a walk's speed came from: its route, its steps and the person's height, or nothing. */
export type SpeedSource = 'route' | 'steps' | 'none';

/**
 * The walk score's parts in points (0 up to each part's weight), or null for a part that could
 * not be measured (it is then left out and the others are scaled to 100).
 */
export interface WalkScoreParts {
  /** Brisk minutes ÷ active minutes, up to 40. */
  readonly brisk: number | null;
  /** Active minutes toward 30, up to 25. */
  readonly duration: number;
  /** METs from the speed, up to 20. */
  readonly intensity: number | null;
  /** Speed against the person's average walk, up to 15. */
  readonly pace: number | null;
}

/** Heart rate during a walk, as Health Connect held it. */
export interface WalkHeartRate {
  readonly avgBpm: number;
  readonly maxBpm: number;
  /** 220 − age, the top the zones are taken from. */
  readonly maxHr: number;
  /** Seconds in zones 1 to 5 (50, 60, 70, 80 and 90 % of `maxHr` and up). */
  readonly zoneSeconds: readonly number[];
}

/** What each minute of a walk held, minute 0 first; null where it was not measured. */
export interface WalkSplits {
  readonly metres: readonly number[] | null;
  readonly steps: readonly number[] | null;
}

/** A recorded walk as Platewise keeps it. */
export interface Walk {
  /** The recorder's id of the walk; also its client id in Health Connect. */
  readonly id: string;
  readonly startedAt: number;
  readonly endedAt: number;
  /** Time walked, pauses left out. */
  readonly activeSeconds: number;
  /** Metres along the route; null without location. */
  readonly distanceM: number | null;
  /** Null without the step sensor. */
  readonly steps: number | null;
  readonly speedFrom: SpeedSource;
  /** Mean speed over the active time, km/h; null when `speedFrom` is `none`. */
  readonly speedKmh: number | null;
  /** Steps per minute over the active time; null without steps. */
  readonly cadence: number | null;
  readonly briskMinutes: number;
  /** Brisk minutes could be measured (steps or a route). */
  readonly briskKnown: boolean;
  readonly met: number;
  /** The weight the energy was worked out with, kg. */
  readonly weightKg: number;
  /** MET × kg × hours. */
  readonly kcal: number;
  /** (MET − 1) × kg × hours: the part counted in "goal + burned". */
  readonly activeKcal: number;
  /** 0–100; null when neither brisk minutes nor intensity could be measured. */
  readonly score: number | null;
  readonly parts: WalkScoreParts;
  /** This walk's speed ÷ the mean of the earlier walks it was compared with; null without. */
  readonly paceRatio: number | null;
  readonly splits: WalkSplits;
  /** The thinned route in `encodeRoute`'s text; empty without one. */
  readonly route: string;
  readonly heartRate: WalkHeartRate | null;
  /** Written to Health Connect (exercise session, distance, active calories). */
  readonly writtenToHealth: boolean;
}
