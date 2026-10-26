// Water logs: an amount in whole ml at an instant, filed under that instant's local day. Logs are
// kept whatever the water switch says (R05.9) and never count towards nutrition (R05.4).

import { dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import type { WaterLog } from '../../domain/model';
import { waterAmountMl } from '../../domain/units/water';
import { newId, type IdSource } from '../../lib/ids';
import { decodeWater } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { guardKey, readAll, type GuardOptions } from '../guard';
import { live, type LiveFeed } from '../live';

export interface WaterInput {
  /** When it was drunk (epoch ms); for a past day, stamp it with `stampForDay`. */
  at: number;
  /** The amount in ml; rounded to whole ml, at least 1, at most 5 000 (D-16.39). */
  ml: number;
}

export interface WaterRepoOptions extends GuardOptions {
  ids?: IdSource;
}

export interface WaterRepo {
  /** Stores a log. Throws a RangeError, before writing, for an amount or time it cannot take. */
  add(input: WaterInput): Promise<WaterLog>;
  /** Deletes a log; false when there was none with that id. */
  remove(id: string): Promise<boolean>;
  /** The logs of one local day, newest first. */
  byDay(dayKey: DayKey): Promise<WaterLog[]>;
  liveDay(dayKey: DayKey): LiveFeed<WaterLog[]>;
}

export function createWaterRepo(db: PlatewiseDb, options: WaterRepoOptions = {}): WaterRepo {
  const ids = options.ids ?? newId;

  const byDay = async (dayKey: DayKey): Promise<WaterLog[]> => {
    const { items } = await readAll(db, 'water', decodeWater, {
      ...options,
      select: (table) => table.where('dayKey').equals(dayKey).toArray(),
    });
    return items.sort((a, b) => b.at - a.at);
  };

  return {
    async add({ at, ml }) {
      const amount = waterAmountMl(ml, 'ml');
      if (amount === null) throw new RangeError(`A water amount must be 1–5000 ml, not ${ml}`);
      const log: WaterLog = { id: ids(), at, dayKey: dayKeyOf(at), ml: amount };
      if (decodeWater(log) === null) throw new RangeError(`Not a time for a water log: ${at}`);
      await transact(db, 'rw', ['water'], async () => {
        await db.water.add(log);
      });
      return log;
    },

    remove: (id) =>
      transact(db, 'rw', ['water'], async () => {
        if ((await db.water.get(id)) === undefined) return false;
        await guardKey(db, 'water', id, decodeWater, options);
        await db.water.delete(id);
        return true;
      }),

    byDay,
    liveDay: (dayKey) => live(() => byDay(dayKey)),
  };
}
