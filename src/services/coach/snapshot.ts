// The data one Coach turn reads (04 §3.9, R04.22). The session copies it out of the stores once,
// when the person presses Send; the context block and every tool call of that turn then read only
// this object, so a meal logged while the reply is pending shows up on the next question, and the
// tools never disagree with the counts the context gave.

import { dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import type {
  BodyFatReading,
  DiaryEntry,
  Fast,
  Profile,
  WaterLog,
  WeighIn,
} from '../../domain/model';
import type { WaterDisplayUnit } from '../../domain/units/water';
import type { DisplayUnits } from '../../ai/prompts/shared';

/** Water as the settings and the log stand at send time. */
export interface CoachWater {
  /** Water tracking is switched on (setting `water.on`). */
  readonly on: boolean;
  /** The daily goal in ml (setting `water.goalMl`). */
  readonly goalMl: number;
  /** How the person reads water amounts (setting `water.unit`). */
  readonly unit: WaterDisplayUnit;
  /** Water logs; only those on today's day key count. */
  readonly logs: readonly WaterLog[];
}

export interface CoachSnapshot {
  /** The instant the snapshot was taken, epoch ms: "today" and running fasts are read from it. */
  readonly now: number;
  /** The IANA zone id local days follow, e.g. "Europe/Berlin" (the clock's `timeZone()`). */
  readonly timeZone: string;
  readonly profile: Profile;
  /** How the person reads energy, weight and height (settings `units.*`). */
  readonly units: DisplayUnits;
  /** Every diary entry, in any order. */
  readonly entries: readonly DiaryEntry[];
  /** Every weigh-in, in any order. */
  readonly weighIns: readonly WeighIn[];
  /** Every body-fat reading, in any order. */
  readonly bodyFat: readonly BodyFatReading[];
  /** Every fast tracked with the fasting timer, the running one included. */
  readonly fasts: readonly Fast[];
  readonly water: CoachWater;
}

/** The local day the snapshot was taken on. */
export function snapshotDay(snapshot: Pick<CoachSnapshot, 'now'>): DayKey {
  return dayKeyOf(snapshot.now);
}
