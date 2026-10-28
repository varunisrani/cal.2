// The recorded walks (P15-02, D-16.96): one row per walk, kept by the walk service once a walk is
// stopped. Reads go through the guard like every table: a row that cannot be read is left out of
// the result and kept aside, never deleted; a write over one copies it aside first.

import type { PromiseExtended } from 'dexie';
import { addDays, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import type { Walk } from '../../domain/walks/model';
import { systemClock, type Clock } from '../../lib/clock';
import { decodeWalk } from '../codecs';
import { decodeRows, readOne, removeRows, writeOne } from '../guard';
import type { PlatewiseDb } from '../schema';

export interface WalkRepo {
  /** Stores a walk under its id, replacing the one stored there. */
  put(walk: Walk): Promise<void>;
  /** One walk, or null when it is missing or cannot be read. */
  get(id: string): Promise<Walk | null>;
  /** Every walk, newest start first. */
  list(): PromiseExtended<Walk[]>;
  /** The walks that started on the local days `firstKey`…`lastKey`, oldest first. */
  between(firstKey: DayKey, lastKey: DayKey): PromiseExtended<Walk[]>;
  /** Removes a walk (a missing one is fine). */
  remove(id: string): Promise<void>;
  /** Marks a stored walk as written to Health Connect; false when it is no longer there. */
  markWritten(id: string): Promise<boolean>;
}

export interface WalkRepoOptions {
  /** Time stamps for kept-aside rows; defaults to the device clock. */
  clock?: Clock;
}

function checkWalk(walk: Walk): void {
  if (!Number.isFinite(walk.startedAt) || !(walk.endedAt >= walk.startedAt)) {
    throw new RangeError(`A walk needs an end at or after its start (walk ${walk.id})`);
  }
}

export function createWalkRepo(db: PlatewiseDb, options: WalkRepoOptions = {}): WalkRepo {
  const clock = options.clock ?? systemClock;
  const decode = (rows: readonly unknown[]) =>
    decodeRows(db, 'walks', rows, decodeWalk, clock).items;

  return {
    async put(walk) {
      checkWalk(walk);
      await writeOne(db, 'walks', walk, decodeWalk, clock);
    },

    async get(id) {
      const stored = await readOne(db, 'walks', id, decodeWalk, clock);
      return stored.kind === 'ok' ? stored.value : null;
    },

    list() {
      return db.walks.orderBy('startedAt').reverse().toArray().then(decode);
    },

    between(firstKey, lastKey) {
      return db.walks
        .where('startedAt')
        .between(startOfDay(firstKey), startOfDay(addDays(lastKey, 1)), true, false)
        .toArray()
        .then(decode);
    },

    async remove(id) {
      await removeRows(db, 'walks', [id], decodeWalk, clock);
    },

    async markWritten(id) {
      return db.transaction('rw', [db.walks, db.quarantine, db.meta], async () => {
        const stored = await readOne(db, 'walks', id, decodeWalk, clock);
        if (stored.kind !== 'ok') return false;
        if (!stored.value.writtenToHealth) {
          await writeOne(
            db,
            'walks',
            { ...stored.value, writtenToHealth: true },
            decodeWalk,
            clock,
          );
        }
        return true;
      });
    },
  };
}
