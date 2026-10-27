// The diary file's storage side (P09-10, P09-11). An export reads the entries and water logs of a
// span of days together. An import rewrites the days a file covers in one read-write transaction
// over both tables: the caller's plan sees what is stored on those days and which ids are taken
// anywhere else, and returns what to store and delete, so the merge is worked out inside the write
// and never on a copy read before it (R06.2). Before anything is stored the write is checked
// against the days: nothing outside them is created, replaced or deleted, and a refused write
// rolls the whole transaction back. Rows on these days that cannot be read are left as they are;
// their ids count as taken.

import { Dexie } from 'dexie';
import { dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import type { DiaryEntry, WaterLog } from '../../domain/model';
import { systemClock, type Clock } from '../../lib/clock';
import { decodeEntry, decodeWater } from '../codecs';
import { GUARD_TABLES, decodeRows, removeRows } from '../guard';
import type { PlatewiseDb } from '../schema';
import { toRow } from './diaryRepo';
import { photoIdsOf } from './photoRepo';

/** The entries and water logs of a span of days, each oldest first. */
export interface DaysRead {
  readonly entries: DiaryEntry[];
  readonly water: WaterLog[];
}

/** What a rewrite's plan sees: the readable records of the days and the ids it may not use. */
export interface StoredDays {
  /** The readable entries of the days, oldest first. */
  readonly entries: readonly DiaryEntry[];
  /** The readable water logs of the days, oldest first. */
  readonly water: readonly WaterLog[];
  /** Entry ids stored on other days, or held by unreadable rows on these days. */
  readonly takenEntryIds: ReadonlySet<string>;
  /** Water ids stored on other days, or held by unreadable rows on these days. */
  readonly takenWaterIds: ReadonlySet<string>;
}

/** What a rewrite stores: deletes run first, then the puts. */
export interface DaysWrite {
  /** Entries on the days: new ids, or the id of a readable entry of the days to replace. */
  readonly putEntries: readonly DiaryEntry[];
  /** Readable entries of the days to delete. */
  readonly removeEntryIds: readonly string[];
  readonly putWater: readonly WaterLog[];
  readonly removeWaterIds: readonly string[];
}

export interface RewriteResult {
  /** Photos the replaced and deleted entries held that the stored ones no longer name. */
  readonly releasedPhotoIds: string[];
}

/** A rewrite refused before anything was stored: it reached outside its days or reused an id. */
export class RewriteRefusedError extends RangeError {
  override readonly name = 'RewriteRefusedError';
}

export interface TransferRepo {
  /** The entries and water logs of the days `firstKey`…`lastKey` (both included). */
  read(firstKey: DayKey, lastKey: DayKey): Promise<DaysRead>;
  /** The earliest day with a readable entry or water log, or null when there is none. */
  firstDay(): Promise<DayKey | null>;
  /**
   * Reads the days `firstKey`…`lastKey`, hands them to `plan` and stores the write it returns, all
   * in one transaction. `plan` must be synchronous. Rejects with `RewriteRefusedError` (nothing
   * stored) when the write puts a record on another day, uses a taken id or twice the same id, or
   * deletes a record that is not a readable one of the days.
   */
  rewriteDays(
    firstKey: DayKey,
    lastKey: DayKey,
    plan: (stored: StoredDays) => DaysWrite,
  ): Promise<RewriteResult>;
}

export interface TransferRepoOptions {
  /** Time for quarantine copies; defaults to the device clock. */
  clock?: Clock;
}

const REWRITE_TABLES = ['entries', 'water', ...GUARD_TABLES] as const;

function waterRow(log: WaterLog): WaterLog {
  const row = decodeWater({ ...log, dayKey: dayKeyOf(log.at) });
  if (!row) throw new RewriteRefusedError(`Water log "${log.id}" cannot be read back`);
  return row;
}

/** Every id appears once; none is taken; every day lies inside the span. */
function checkPuts(
  kind: string,
  records: readonly { id: string; dayKey: DayKey }[],
  taken: ReadonlySet<string>,
  firstKey: DayKey,
  lastKey: DayKey,
): void {
  const seen = new Set<string>();
  for (const { id, dayKey } of records) {
    if (seen.has(id)) throw new RewriteRefusedError(`${kind} "${id}" is written twice`);
    if (taken.has(id)) throw new RewriteRefusedError(`${kind} "${id}" is already used elsewhere`);
    // Day keys are zero-padded, so text order is calendar order.
    if (dayKey < firstKey || dayKey > lastKey) {
      throw new RewriteRefusedError(`${kind} "${id}" falls on ${dayKey}, outside the days`);
    }
    seen.add(id);
  }
}

function checkRemovals(kind: string, ids: readonly string[], readable: ReadonlySet<string>): void {
  for (const id of ids) {
    if (!readable.has(id)) {
      throw new RewriteRefusedError(`${kind} "${id}" is not a readable record of the days`);
    }
  }
}

/** All stored keys minus the readable ones of the days. */
function takenIds(allKeys: readonly unknown[], readable: ReadonlySet<string>): Set<string> {
  const taken = new Set<string>();
  for (const key of allKeys) {
    if (typeof key === 'string' && !readable.has(key)) taken.add(key);
  }
  return taken;
}

export function createTransferRepo(
  db: PlatewiseDb,
  options: TransferRepoOptions = {},
): TransferRepo {
  const clock = options.clock ?? systemClock;

  /** Raw entry rows of the days, by day and then time. */
  const entryRows = (firstKey: DayKey, lastKey: DayKey): Promise<unknown[]> =>
    db.entries
      .where('[dayKey+loggedAt]')
      .between([firstKey, Dexie.minKey], [lastKey, Dexie.maxKey], true, true)
      .toArray();

  /** Raw water rows of the days. */
  const waterRows = (firstKey: DayKey, lastKey: DayKey): Promise<unknown[]> =>
    db.water.where('dayKey').between(firstKey, lastKey, true, true).toArray();

  const entriesOf = (rows: readonly unknown[]): DiaryEntry[] =>
    decodeRows(db, 'entries', rows, decodeEntry, clock).items;

  const waterOf = (rows: readonly unknown[]): WaterLog[] =>
    decodeRows(db, 'water', rows, decodeWater, clock).items.sort((a, b) => a.at - b.at);

  return {
    async read(firstKey, lastKey) {
      if (firstKey > lastKey) return { entries: [], water: [] };
      return db.transaction('r', [db.entries, db.water], async () => ({
        entries: entriesOf(await entryRows(firstKey, lastKey)),
        water: waterOf(await waterRows(firstKey, lastKey)),
      }));
    },

    async firstDay() {
      return db.transaction('r', [db.entries, db.water], async () => {
        const entry: unknown = await db.entries
          .orderBy('dayKey')
          .filter((row) => decodeEntry(row) !== null)
          .first();
        const log: unknown = await db.water
          .orderBy('dayKey')
          .filter((row) => decodeWater(row) !== null)
          .first();
        const days = [decodeEntry(entry)?.dayKey, decodeWater(log)?.dayKey].filter(
          (day): day is DayKey => day !== undefined,
        );
        return days.length === 0 ? null : days.reduce((a, b) => (a < b ? a : b));
      });
    },

    async rewriteDays(firstKey, lastKey, plan) {
      if (firstKey > lastKey) throw new RewriteRefusedError(`${firstKey} is after ${lastKey}`);
      return db.transaction('rw', [...REWRITE_TABLES], async () => {
        const entries = entriesOf(await entryRows(firstKey, lastKey));
        const water = waterOf(await waterRows(firstKey, lastKey));
        const readableEntries = new Map(entries.map((entry) => [entry.id, entry]));
        const readableWater = new Set(water.map((log) => log.id));
        const takenEntryIds = takenIds(
          await db.entries.toCollection().primaryKeys(),
          new Set(readableEntries.keys()),
        );
        const takenWaterIds = takenIds(await db.water.toCollection().primaryKeys(), readableWater);

        const write = plan({ entries, water, takenEntryIds, takenWaterIds });

        const entryPuts = write.putEntries.map(toRow);
        const waterPuts = write.putWater.map(waterRow);
        checkPuts('Entry', entryPuts, takenEntryIds, firstKey, lastKey);
        checkPuts('Water log', waterPuts, takenWaterIds, firstKey, lastKey);
        checkRemovals('Entry', write.removeEntryIds, new Set(readableEntries.keys()));
        checkRemovals('Water log', write.removeWaterIds, readableWater);

        // Photos of every entry this write deletes or replaces, less those the new rows name.
        const dropped = new Set<string>();
        const replaced = [...write.removeEntryIds, ...entryPuts.map((row) => row.id)];
        for (const id of replaced) {
          const before = readableEntries.get(id);
          if (before) for (const photo of photoIdsOf(before)) dropped.add(photo);
        }
        for (const row of entryPuts) for (const photo of photoIdsOf(row)) dropped.delete(photo);

        await removeRows(db, 'entries', [...new Set(write.removeEntryIds)], decodeEntry, clock);
        await removeRows(db, 'water', [...new Set(write.removeWaterIds)], decodeWater, clock);
        await db.entries.bulkPut(entryPuts);
        await db.water.bulkPut(waterPuts);
        return { releasedPhotoIds: [...dropped] };
      });
    },
  };
}
