// Water logs: an amount in ml at an instant, filed under the local day of that instant (the
// caller stamps past days with the selected-day rule). Turning water tracking off never touches
// them. The 5 000 ml cap of the entry sheets is theirs (`src/domain/units/water.ts`); here an
// amount only has to be at least 1 ml.

import type { PromiseExtended } from 'dexie';
import { dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import type { WaterLog } from '../../domain/model';
import { WATER_AMOUNT_MIN_ML } from '../../domain/units/water';
import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { decodeWater } from '../codecs';
import { decodeRows, removeRows, writeOne } from '../guard';
import type { PlatewiseDb } from '../schema';

export interface WaterRepoOptions {
  /** Time stamps for kept-aside rows; defaults to the device clock. */
  clock?: Clock;
  newId?: IdSource;
}

export interface WaterRepo {
  /** Stores a log of `ml` (at least 1) at `at`, on that instant's local day. */
  add(log: { at: number; ml: number }): Promise<WaterLog>;
  /** Deletes a log; a missing id does nothing. */
  remove(id: string): Promise<void>;
  /** The logs of one local day, newest first. */
  byDay(dayKey: DayKey): PromiseExtended<WaterLog[]>;
}

export function createWaterRepo(db: PlatewiseDb, options: WaterRepoOptions = {}): WaterRepo {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? randomId;

  return {
    async add({ at, ml }) {
      if (!Number.isFinite(at)) {
        throw new RangeError(`A water log needs a finite instant, got ${at}`);
      }
      if (!Number.isFinite(ml) || ml < WATER_AMOUNT_MIN_ML) {
        throw new RangeError(`A water log needs at least ${WATER_AMOUNT_MIN_ML} ml, got ${ml}`);
      }
      const log: WaterLog = { id: newId(), at, dayKey: dayKeyOf(at), ml };
      await writeOne(db, 'water', log, decodeWater, clock);
      return log;
    },

    async remove(id) {
      await removeRows(db, 'water', [id], decodeWater, clock);
    },

    byDay(dayKey) {
      return db.water
        .where('dayKey')
        .equals(dayKey)
        .toArray()
        .then((rows) =>
          decodeRows(db, 'water', rows, decodeWater, clock).items.sort((a, b) => b.at - a.at),
        );
    },
  };
}
