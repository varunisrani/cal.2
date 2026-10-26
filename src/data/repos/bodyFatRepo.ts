// Body-fat readings (R05.8). Every change is one read-write transaction over the readings, the
// profile and the guard's tables, so the profile's body fat (which picks the lean-mass formula)
// always equals the newest reading by date. Deleting the last reading leaves the profile value as
// it was: the person clears it in Settings when they mean to.

import type { PromiseExtended } from 'dexie';
import { addDays, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import type { BodyFatReading, Profile } from '../../domain/model';
import { withBodyFat } from '../../domain/profile/editRules';
import { latestWeighIn } from '../../domain/trackers/goalCrossing';
import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { decodeBodyFat, decodeProfile } from '../codecs';
import { GUARD_TABLES, decodeRows, readAll, readOne, removeRows, writeOne } from '../guard';
import { PROFILE_KEY, type PlatewiseDb } from '../schema';

/** The profile body fat follows the newest reading only when the two differ by more than this. */
export const BODY_FAT_SYNC = 0.0001;

export interface BodyFatRepoOptions {
  /** Time stamps for kept-aside rows; defaults to the device clock. */
  clock?: Clock;
  newId?: IdSource;
}

export interface BodyFatRepo {
  /** Stores a reading (a fraction) and syncs the profile body fat in one transaction. */
  addReading(reading: { at: number; fraction: number }): Promise<BodyFatReading>;
  /** Deletes a reading; the profile follows the new newest one, or keeps its value if none. */
  deleteReading(id: string): Promise<void>;
  /** The first reading (onboarding), or null without writing when any reading is stored. */
  seedFirst(fraction: number, at: number): Promise<BodyFatReading | null>;
  /** Readings on the local days `firstKey`…`lastKey`, oldest first (charts). */
  between(firstKey: DayKey, lastKey: DayKey): PromiseExtended<BodyFatReading[]>;
  /** Every reading, newest first (the history list). */
  history(): PromiseExtended<BodyFatReading[]>;
  /** The newest reading by date, or null. */
  latest(): PromiseExtended<BodyFatReading | null>;
}

function checkReading(at: number, fraction: number): void {
  if (!Number.isFinite(at)) throw new RangeError(`A reading needs a finite instant, got ${at}`);
  if (!(fraction > 0 && fraction < 1)) {
    throw new RangeError(`Body fat is a fraction between 0 and 1, got ${fraction}`);
  }
}

export function createBodyFatRepo(db: PlatewiseDb, options: BodyFatRepoOptions = {}): BodyFatRepo {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? randomId;
  const tables = [db.bodyFat, db.profile, ...GUARD_TABLES];

  const decode = (rows: readonly unknown[]) =>
    decodeRows(db, 'bodyFat', rows, decodeBodyFat, clock).items;

  // The profile when it can be read; a missing or unreadable one is left alone.
  async function readProfile(): Promise<Profile | null> {
    const stored = await readOne(db, 'profile', PROFILE_KEY, decodeProfile, clock);
    return stored.kind === 'ok' ? stored.value : null;
  }

  // Inside a transaction over `tables`: points the profile body fat at the newest of `readings`.
  // With no readings left, the profile keeps whatever it had.
  async function syncProfile(readings: readonly BodyFatReading[]) {
    const newest = latestWeighIn(readings);
    if (!newest) return;
    const profile = await readProfile();
    if (!profile) return;
    const current = profile.bodyFat;
    if (current !== undefined && Math.abs(current - newest.fraction) <= BODY_FAT_SYNC) return;
    const row = { ...withBodyFat(profile, newest.fraction), id: PROFILE_KEY };
    await writeOne(db, 'profile', row, decodeProfile, clock);
  }

  async function storedReadings(): Promise<BodyFatReading[]> {
    return (await readAll(db, 'bodyFat', decodeBodyFat, clock)).items;
  }

  return {
    async addReading({ at, fraction }) {
      checkReading(at, fraction);
      const entry: BodyFatReading = { id: newId(), at, fraction };
      await db.transaction('rw', tables, async () => {
        const stored = await storedReadings();
        await writeOne(db, 'bodyFat', entry, decodeBodyFat, clock);
        await syncProfile([...stored, entry]);
      });
      return entry;
    },

    async deleteReading(id) {
      await db.transaction('rw', tables, async () => {
        if ((await db.bodyFat.get(id)) === undefined) return;
        await removeRows(db, 'bodyFat', [id], decodeBodyFat, clock);
        await syncProfile(await storedReadings());
      });
    },

    async seedFirst(fraction, at) {
      checkReading(at, fraction);
      return db.transaction('rw', tables, async () => {
        // Any row counts, even one that cannot be read: it is still somebody's history.
        if ((await db.bodyFat.count()) > 0) return null;
        const entry: BodyFatReading = { id: newId(), at, fraction };
        await writeOne(db, 'bodyFat', entry, decodeBodyFat, clock);
        await syncProfile([entry]);
        return entry;
      });
    },

    between(firstKey, lastKey) {
      return db.bodyFat
        .where('at')
        .between(startOfDay(firstKey), startOfDay(addDays(lastKey, 1)), true, false)
        .toArray()
        .then(decode);
    },

    history() {
      return db.bodyFat.orderBy('at').reverse().toArray().then(decode);
    },

    latest() {
      return db.bodyFat
        .toArray()
        .then(decode)
        .then((readings) => latestWeighIn(readings));
    },
  };
}
