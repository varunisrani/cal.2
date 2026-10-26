// Body-fat readings, and the profile body fat that follows the latest one (R05.8).
//
// The profile's body fat chooses the lean-mass energy formula, so it is kept on the latest reading
// by date: each add and delete changes the reading and the profile in one transaction. Deleting
// the last reading leaves the profile value alone; dropping it would quietly switch the formula.

import { addDays, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import type { BodyFatReading, Profile } from '../../domain/model';
import { latestByTime } from '../../domain/trackers/goalCrossing';
import { newId, type IdSource } from '../../lib/ids';
import { decodeBodyFat, decodeProfile } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { guardKey, readAll, readOne, type GuardOptions, type ReadOptions } from '../guard';
import { live, type LiveFeed } from '../live';
import type { TableName } from '../schema';

/** The profile body fat is rewritten only when the latest reading differs by more than this. */
export const PROFILE_BODY_FAT_TOLERANCE = 0.0001;

const PROFILE_ID = 'me';
const TABLES: readonly TableName[] = ['bodyFat', 'profile'];

export interface BodyFatInput {
  /** When the reading was taken (epoch ms). */
  at: number;
  /** Fraction (0.2 = 20 %). */
  fraction: number;
}

export interface BodyFatRepoOptions extends GuardOptions {
  ids?: IdSource;
}

export interface BodyFatRepo {
  /**
   * Stores a reading and moves the profile body fat to the latest reading, in one transaction.
   * Throws a RangeError, before writing anything, for a fraction outside 0–1 (exclusive) or a
   * time that is not an instant.
   */
  addReading(input: BodyFatInput): Promise<BodyFatReading>;
  /** Deletes a reading; the profile follows the new latest, and keeps its value when none is left. */
  deleteReading(id: string): Promise<boolean>;
  /** Adds the first reading (from onboarding) unless the history has rows already. */
  seedFirst(fraction: number, at: number): Promise<BodyFatReading | null>;
  /** Readings on the local days `firstKey`…`lastKey`, oldest first. */
  between(firstKey: DayKey, lastKey: DayKey): Promise<BodyFatReading[]>;
  /** Every reading, newest first. */
  history(): Promise<BodyFatReading[]>;
  /** The latest reading by time, whatever the window. */
  latest(): Promise<BodyFatReading | undefined>;
  liveBetween(firstKey: DayKey, lastKey: DayKey): LiveFeed<BodyFatReading[]>;
  liveHistory(): LiveFeed<BodyFatReading[]>;
  liveLatest(): LiveFeed<BodyFatReading | undefined>;
}

function checkedReading(id: string, { at, fraction }: BodyFatInput): BodyFatReading {
  const reading: BodyFatReading = { id, at, fraction };
  if (decodeBodyFat(reading) === null) {
    throw new RangeError(`Not a body-fat reading: ${fraction} at ${at}`);
  }
  return reading;
}

export function createBodyFatRepo(db: PlatewiseDb, options: BodyFatRepoOptions = {}): BodyFatRepo {
  const ids = options.ids ?? newId;

  const readSome = async (select: ReadOptions['select']): Promise<BodyFatReading[]> =>
    (await readAll(db, 'bodyFat', decodeBodyFat, { ...options, select })).items;

  const history = (): Promise<BodyFatReading[]> =>
    readSome((table) => table.orderBy('at').reverse().toArray());

  const between = (firstKey: DayKey, lastKey: DayKey): Promise<BodyFatReading[]> => {
    // Half-open on instants, so a reading late on the last day is inside (R05.5).
    const from = startOfDay(firstKey);
    const to = startOfDay(addDays(lastKey, 1));
    return readSome((table) => table.where('at').between(from, to, true, false).toArray());
  };

  const latest = async (): Promise<BodyFatReading | undefined> => (await history())[0];

  /** Moves the profile body fat to `newest` when it is absent or off by more than the tolerance. */
  const follow = async (profile: Profile, newest: BodyFatReading | undefined): Promise<void> => {
    if (newest === undefined) return;
    const current = profile.bodyFat;
    if (
      current !== undefined &&
      Math.abs(current - newest.fraction) <= PROFILE_BODY_FAT_TOLERANCE
    ) {
      return;
    }
    await db.profile.update(PROFILE_ID, { bodyFat: newest.fraction });
  };

  /** Re-reads the readings and the profile and syncs; inside a transaction over both tables. */
  const syncProfile = async (): Promise<void> => {
    // Missing or unreadable profile: left exactly as it is (the guard keeps an unreadable one aside).
    const profile = await readOne(db, 'profile', PROFILE_ID, decodeProfile, options);
    if (profile.kind !== 'ok') return;
    const { items } = await readAll(db, 'bodyFat', decodeBodyFat, options);
    await follow(profile.value, latestByTime(items));
  };

  const addInTx = async (reading: BodyFatReading): Promise<void> => {
    await db.bodyFat.add(reading);
    await syncProfile();
  };

  return {
    async addReading(input) {
      const reading = checkedReading(ids(), input);
      // An async body, so Dexie keeps the transaction open across the helper's awaits.
      await transact(db, 'rw', TABLES, async () => await addInTx(reading));
      return reading;
    },

    deleteReading: (id) =>
      transact(db, 'rw', TABLES, async () => {
        if ((await db.bodyFat.get(id)) === undefined) return false;
        await guardKey(db, 'bodyFat', id, decodeBodyFat, options);
        await db.bodyFat.delete(id);
        await syncProfile();
        return true;
      }),

    async seedFirst(fraction, at) {
      const reading = checkedReading(ids(), { at, fraction });
      return transact(db, 'rw', TABLES, async () => {
        if ((await db.bodyFat.count()) > 0) return null;
        await addInTx(reading);
        return reading;
      });
    },

    between,
    history,
    latest,
    liveBetween: (firstKey, lastKey) => live(() => between(firstKey, lastKey)),
    liveHistory: () => live(history),
    liveLatest: () => live(latest),
  };
}
