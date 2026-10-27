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
import type { BodyFatRepo } from '../../data/repos/bodyFatRepo';
import type { DiaryRepo } from '../../data/repos/diaryRepo';
import type { FastRepo } from '../../data/repos/fastRepo';
import type { ProfileRepo } from '../../data/repos/profileRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { WaterRepo } from '../../data/repos/waterRepo';
import type { WeightRepo } from '../../data/repos/weightRepo';
import type { Clock } from '../../lib/clock';

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

/** Where a snapshot is read from: the repositories and the clock. */
export interface SnapshotSources {
  readonly profileRepo: Pick<ProfileRepo, 'get'>;
  readonly settingsRepo: Pick<SettingsRepo, 'get'>;
  readonly diaryRepo: Pick<DiaryRepo, 'between'>;
  readonly weightRepo: Pick<WeightRepo, 'history'>;
  readonly bodyFatRepo: Pick<BodyFatRepo, 'history'>;
  readonly fastRepo: Pick<FastRepo, 'list'>;
  readonly waterRepo: Pick<WaterRepo, 'byDay'>;
  readonly clock: Clock;
}

// Day keys sort as text, so these two take in every stored day.
const FIRST_DAY: DayKey = '0000-01-01';
const LAST_DAY: DayKey = '9999-12-31';

/**
 * Copies the data one turn reads out of the stores, as they are now: every entry, weigh-in,
 * body-fat reading and tracked fast, today's water logs, and the unit and water settings. Null
 * when no readable profile is stored (the context cannot be built without one).
 */
export async function takeSnapshot(sources: SnapshotSources): Promise<CoachSnapshot | null> {
  const { settingsRepo } = sources;
  const now = sources.clock.now();
  const profile = await sources.profileRepo.get();
  if (profile.kind !== 'ok') return null;
  const [entries, weighIns, bodyFat, fasts, logs] = await Promise.all([
    sources.diaryRepo.between(FIRST_DAY, LAST_DAY),
    sources.weightRepo.history(),
    sources.bodyFatRepo.history(),
    sources.fastRepo.list(),
    sources.waterRepo.byDay(dayKeyOf(now)),
  ]);
  const [energy, weight, height, on, goalMl, unit] = await Promise.all([
    settingsRepo.get('units.energy'),
    settingsRepo.get('units.weight'),
    settingsRepo.get('units.height'),
    settingsRepo.get('water.on'),
    settingsRepo.get('water.goalMl'),
    settingsRepo.get('water.unit'),
  ]);
  return {
    now,
    timeZone: sources.clock.timeZone(),
    profile: profile.value,
    units: { energy, weight, height },
    entries,
    weighIns,
    bodyFat,
    fasts,
    water: { on, goalMl, unit, logs },
  };
}
