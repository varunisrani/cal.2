// Weigh-ins (R05.8, R01.11). Every change is one read-write transaction over the weigh-ins, the
// profile and the guard's tables, so the profile weight always equals the newest reading by date,
// never the last one typed in. Adding a reading decides, before anything is written, whether it
// carried the weight across the goal weight; whoever calls (Progress, the Settings weight sheet,
// Coach) gets the answer and the app hears `goal-reached` on the bus. A weigh-in only moves the
// weight: dropping a target weight it contradicts is the Settings weight save's job (`withWeight`).

import type { PromiseExtended } from 'dexie';
import { addDays, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import type { Profile, WeighIn } from '../../domain/model';
import { crossesGoal, latestWeighIn } from '../../domain/trackers/goalCrossing';
import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { appBus, type Bus } from '../bus';
import { decodeProfile, decodeWeighIn } from '../codecs';
import { GUARD_TABLES, decodeRows, readAll, readOne, removeRows, writeOne } from '../guard';
import { PROFILE_KEY, type PlatewiseDb } from '../schema';

/** The profile weight follows the newest weigh-in only when the two differ by more than this. */
export const WEIGHT_SYNC_KG = 0.01;

export interface WeightRepoOptions {
  /** Time stamps for kept-aside rows; defaults to the device clock. */
  clock?: Clock;
  newId?: IdSource;
  /** Where `goal-reached` goes; defaults to the app bus. */
  bus?: Bus;
}

export interface AddedWeighIn {
  entry: WeighIn;
  /** The reading crossed the goal weight (R01.11); `goal-reached` has been posted. */
  goalReached: boolean;
}

export interface WeightRepo {
  /** Stores a reading, syncs the profile weight and checks the goal in one transaction. */
  addWeighIn(reading: { at: number; kg: number }): Promise<AddedWeighIn>;
  /** Deletes a reading; the profile weight moves to the new newest one, if any remain. */
  deleteWeighIn(id: string): Promise<void>;
  /** The first reading (onboarding), or null without writing when any reading is stored. */
  seedFirst(kg: number, at: number): Promise<WeighIn | null>;
  /** Readings on the local days `firstKey`…`lastKey`, oldest first (charts). */
  between(firstKey: DayKey, lastKey: DayKey): PromiseExtended<WeighIn[]>;
  /** Every reading, newest first (the history list). */
  history(): PromiseExtended<WeighIn[]>;
  /** The newest reading by date, or null. */
  latest(): PromiseExtended<WeighIn | null>;
}

/**
 * Inside a read-write transaction over the weigh-ins, the profile and the guard's tables: points
 * the profile weight at the newest of the stored readings. For writers of weigh-ins outside this
 * repository (the Health Connect import, P11-03), so the profile follows every reading however it
 * arrived. A missing or unreadable profile is left alone.
 */
export async function followNewestWeighIn(
  db: PlatewiseDb,
  clock: Clock = systemClock,
): Promise<void> {
  const stored = await readOne(db, 'profile', PROFILE_KEY, decodeProfile, clock);
  if (stored.kind !== 'ok') return;
  const readings = (await readAll(db, 'weighIns', decodeWeighIn, clock)).items;
  await pointProfileAt(db, stored.value, readings, clock);
}

// Inside a transaction over the weigh-ins, the profile and the guard's tables: points the profile
// weight at the newest of `readings`.
async function pointProfileAt(
  db: PlatewiseDb,
  profile: Profile | null,
  readings: readonly WeighIn[],
  clock: Clock,
): Promise<void> {
  const newest = latestWeighIn(readings);
  if (!profile || !newest || Math.abs(profile.weightKg - newest.kg) <= WEIGHT_SYNC_KG) return;
  const row = { ...profile, weightKg: newest.kg, id: PROFILE_KEY };
  await writeOne(db, 'profile', row, decodeProfile, clock);
}

function checkReading(at: number, kg: number): void {
  if (!Number.isFinite(at)) throw new RangeError(`A weigh-in needs a finite instant, got ${at}`);
  if (!Number.isFinite(kg) || kg <= 0) {
    throw new RangeError(`A weigh-in needs a weight above 0 kg, got ${kg}`);
  }
}

export function createWeightRepo(db: PlatewiseDb, options: WeightRepoOptions = {}): WeightRepo {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? randomId;
  const bus = options.bus ?? appBus();
  const tables = [db.weighIns, db.profile, ...GUARD_TABLES];

  const decode = (rows: readonly unknown[]) =>
    decodeRows(db, 'weighIns', rows, decodeWeighIn, clock).items;

  // The profile when it can be read. A missing one (before onboarding saved it) or an unreadable
  // one (kept aside by the read) is left alone.
  async function readProfile(): Promise<Profile | null> {
    const stored = await readOne(db, 'profile', PROFILE_KEY, decodeProfile, clock);
    return stored.kind === 'ok' ? stored.value : null;
  }

  // Inside a transaction over `tables`: points the profile weight at the newest of `readings`.
  const syncProfile = (profile: Profile | null, readings: readonly WeighIn[]) =>
    pointProfileAt(db, profile, readings, clock);

  async function storedReadings(): Promise<WeighIn[]> {
    return (await readAll(db, 'weighIns', decodeWeighIn, clock)).items;
  }

  return {
    async addWeighIn({ at, kg }) {
      checkReading(at, kg);
      const entry: WeighIn = { id: newId(), at, kg };
      const goalReached = await db.transaction('rw', tables, async () => {
        const stored = await storedReadings();
        const profile = await readProfile();
        // Decided against what was stored before this reading, before anything is written.
        const reached =
          profile !== null &&
          crossesGoal(latestWeighIn(stored), entry, profile.goal, profile.goalWeightKg);
        await writeOne(db, 'weighIns', entry, decodeWeighIn, clock);
        await syncProfile(profile, [...stored, entry]);
        return reached;
      });
      // Only after the commit, so a rolled-back reading never raises the dialog.
      if (goalReached) bus.post({ type: 'goal-reached', kg: entry.kg }, 'this-tab');
      return { entry, goalReached };
    },

    async deleteWeighIn(id) {
      await db.transaction('rw', tables, async () => {
        if ((await db.weighIns.get(id)) === undefined) return;
        await removeRows(db, 'weighIns', [id], decodeWeighIn, clock);
        await syncProfile(await readProfile(), await storedReadings());
      });
    },

    async seedFirst(kg, at) {
      checkReading(at, kg);
      return db.transaction('rw', tables, async () => {
        // Any row counts, even one that cannot be read: it is still somebody's history.
        if ((await db.weighIns.count()) > 0) return null;
        const entry: WeighIn = { id: newId(), at, kg };
        await writeOne(db, 'weighIns', entry, decodeWeighIn, clock);
        await syncProfile(await readProfile(), [entry]);
        return entry;
      });
    },

    between(firstKey, lastKey) {
      return db.weighIns
        .where('at')
        .between(startOfDay(firstKey), startOfDay(addDays(lastKey, 1)), true, false)
        .toArray()
        .then(decode);
    },

    history() {
      return db.weighIns.orderBy('at').reverse().toArray().then(decode);
    },

    latest() {
      return db.weighIns
        .toArray()
        .then(decode)
        .then((readings) => latestWeighIn(readings));
    },
  };
}
