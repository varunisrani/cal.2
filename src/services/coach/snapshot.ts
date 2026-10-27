// The data one Coach turn reads (04 §3.9, R04.22). The session copies it out of the stores once,
// when the person presses Send; the context block and every tool call of that turn then read only
// this object, so a meal logged while the reply is pending shows up on the next question, and the
// tools never disagree with the counts the context gave. In the Android app, while Health Connect
// is connected, it also copies the activity days and the "Count active calories" switch (D-16.94).
// Weights in the Coach are kg whatever was chosen before (D-16.91).

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
import type { HealthRepo } from '../../data/repos/healthRepo';
import type { ProfileRepo } from '../../data/repos/profileRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { WaterRepo } from '../../data/repos/waterRepo';
import type { WeightRepo } from '../../data/repos/weightRepo';
import type { ActivityRow } from '../../data/schema';
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

/** Health Connect's activity copy and the counting switch, as they stand at send time. */
export interface CoachActivity {
  /** "Count active calories" is on (setting `health.countActiveCalories`). */
  readonly countActive: boolean;
  /** Every stored day, in any order. */
  readonly days: readonly ActivityRow[];
}

export interface CoachSnapshot {
  /** The instant the snapshot was taken, epoch ms: "today" and running fasts are read from it. */
  readonly now: number;
  /** The IANA zone id local days follow, e.g. "Europe/Berlin" (the clock's `timeZone()`). */
  readonly timeZone: string;
  readonly profile: Profile;
  /** How the person reads energy and height (settings `units.*`); weight is always kg (D-16.91). */
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
  /** Null on the web, and in the Android app while Health Connect is not connected. */
  readonly activity: CoachActivity | null;
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
  /** Health Connect's activity copy: only the Android app has one. */
  readonly activityRepo?: Pick<HealthRepo, 'between'>;
  readonly clock: Clock;
}

// Day keys sort as text, so these two take in every stored day.
const FIRST_DAY: DayKey = '0000-01-01';
const LAST_DAY: DayKey = '9999-12-31';

/**
 * The activity copy and the switch, or null: without the copy (the web), while Health Connect is
 * not connected, and when the copy cannot be read (a failed health read never stops the Coach).
 */
async function activityOf(sources: SnapshotSources): Promise<CoachActivity | null> {
  const { activityRepo, settingsRepo } = sources;
  if (activityRepo === undefined) return null;
  try {
    const [connected, countActive] = await Promise.all([
      settingsRepo.get('health.connected'),
      settingsRepo.get('health.countActiveCalories'),
    ]);
    if (!connected) return null;
    return { countActive, days: await activityRepo.between(FIRST_DAY, LAST_DAY) };
  } catch {
    return null;
  }
}

/**
 * Copies the data one turn reads out of the stores, as they are now: every entry, weigh-in,
 * body-fat reading and tracked fast, today's water logs, the unit and water settings, and the
 * activity days when Health Connect is connected. Null when no readable profile is stored (the
 * context cannot be built without one).
 */
export async function takeSnapshot(sources: SnapshotSources): Promise<CoachSnapshot | null> {
  const { settingsRepo } = sources;
  const now = sources.clock.now();
  const profile = await sources.profileRepo.get();
  if (profile.kind !== 'ok') return null;
  const [entries, weighIns, bodyFat, fasts, logs, activity] = await Promise.all([
    sources.diaryRepo.between(FIRST_DAY, LAST_DAY),
    sources.weightRepo.history(),
    sources.bodyFatRepo.history(),
    sources.fastRepo.list(),
    sources.waterRepo.byDay(dayKeyOf(now)),
    activityOf(sources),
  ]);
  const [energy, height, on, goalMl, unit] = await Promise.all([
    settingsRepo.get('units.energy'),
    settingsRepo.get('units.height'),
    settingsRepo.get('water.on'),
    settingsRepo.get('water.goalMl'),
    settingsRepo.get('water.unit'),
  ]);
  return {
    now,
    timeZone: sources.clock.timeZone(),
    profile: profile.value,
    units: { energy, weight: 'kg', height },
    entries,
    weighIns,
    bodyFat,
    fasts,
    water: { on, goalMl, unit, logs },
    activity,
  };
}
