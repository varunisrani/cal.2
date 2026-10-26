// The diary: logged food rows, and the only way to change them.
//
// Every change is one read-write transaction that reads what its rule needs, decides and writes
// (R06.2, R02.24), so no other write can land between the read and the write. A write that
// creates a food row reads the fasts in that same transaction and refuses with FastActiveError
// before writing anything while a fast is running (R05.1, R02.12): the rule lives here, so every
// caller is covered. Rows that cannot be read are left out of reads and kept aside by the guard;
// no write replaces them. Photos a change drops are released in the same transaction, through the
// photo store's owner check (R02.8).

import { Dexie } from 'dexie';
import { dayKeyOf, splitDayKey, type DayKey } from '../../domain/dates/dayKey';
import type { DiaryEntry, Fast } from '../../domain/model';
import { activeFast, endNow } from '../../domain/trackers/fasting';
import { decodeEntry, decodeFast } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { guardKey, readAll, readOne, type ReadOptions } from '../guard';
import { live, type LiveFeed } from '../live';
import type { EntryRow, TableName } from '../schema';
import { PHOTO_RELEASE_TABLES, photoIdsOf, releaseIfUnused } from './photoRepo';

/** Food was not written because a fast is running (D-16.35: the dialog offers End fast and log). */
export class FastActiveError extends Error {
  override readonly name = 'FastActiveError';

  constructor(readonly fastId: string) {
    super(`Fast ${fastId} is running: food is not logged until it ends`);
  }
}

export type UpdateOutcome =
  | 'updated'
  /** No row with that id (deleted elsewhere). */
  | 'missing'
  /** The stored row cannot be read; it was kept aside and left as it was. */
  | 'unreadable';

/** `stale`: an original is gone or cannot be read, so the combined row would be wrong. */
export type CombineOutcome = 'combined' | 'stale';

export interface EndFastAndAddResult {
  entry: DiaryEntry;
  /** The fast that was ended, or null when none was running any more. */
  endedFast: Fast | null;
}

/** Tables of a write that creates food rows. */
const FOOD_TABLES: readonly TableName[] = ['entries', 'fasts'];

/**
 * The form a barcode is compared in: trimmed; a code of digits loses its leading zeros (so a
 * UPC-A and its EAN-13 form match), keeping "0" when nothing else is left; any other code is
 * lower-cased. Undefined for a blank code.
 */
// P06-17 lands the shared comparison key in src/domain/food/barcode.ts; this should then use it.
export function barcodeKeyOf(code: string): string | undefined {
  const trimmed = code.trim();
  if (trimmed === '') return undefined;
  if (/^\d+$/.test(trimmed)) return trimmed.replace(/^0+/, '') || '0';
  return trimmed.toLowerCase();
}

// ---- Rows -------------------------------------------------------------------------------------

/** The row to store: day key and barcode key worked out here, never trusted from the caller. */
function rowOf(entry: DiaryEntry, dayKey: DayKey = dayKeyOf(entry.loggedAt)): EntryRow {
  if (decodeEntry(entry) === null) {
    throw new TypeError(`Refusing to store entry ${String(entry.id)}: it would not read back`);
  }
  const { barcodeKey: _stale, ...fields } = entry as EntryRow;
  const barcodeKey = entry.product ? barcodeKeyOf(entry.product.barcode) : undefined;
  return barcodeKey ? { ...fields, dayKey, barcodeKey } : { ...fields, dayKey };
}

/** The entry as reads return it (without the derived barcode key). */
function entryOf(row: EntryRow): DiaryEntry {
  const { barcodeKey: _key, ...entry } = row;
  return entry;
}

/** Throws FastActiveError when a fast is running. Reads in the current transaction. */
async function refuseDuringFast(db: PlatewiseDb): Promise<void> {
  const running = activeFast((await readAll(db, 'fasts', decodeFast)).items);
  if (running) throw new FastActiveError(running.id);
}

/** The photo ids of `before` that `kept` no longer holds. */
function dropped(before: readonly string[], kept: ReadonlySet<string>): string[] {
  return before.filter((id) => !kept.has(id));
}

/** Stores new rows, keeping aside any unreadable row under the same id first. */
async function putNew(db: PlatewiseDb, rows: readonly EntryRow[]): Promise<void> {
  for (const row of rows) await guardKey(db, 'entries', row.id, decodeEntry);
  await db.entries.bulkPut([...rows]);
}

// ---- Writes -----------------------------------------------------------------------------------

/** Logs one entry. Throws FastActiveError, writing nothing, while a fast is running. */
export async function add(db: PlatewiseDb, entry: DiaryEntry): Promise<DiaryEntry> {
  const row = rowOf(entry);
  await transact(db, 'rw', FOOD_TABLES, async () => {
    await refuseDuringFast(db);
    await putNew(db, [row]);
  });
  return entryOf(row);
}

/** Logs several entries in one transaction (Copy a day): all of them, or none during a fast. */
export async function addMany(
  db: PlatewiseDb,
  entries: readonly DiaryEntry[],
): Promise<DiaryEntry[]> {
  const rows = entries.map((entry) => rowOf(entry));
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new RangeError('addMany: two entries share an id');
  }
  if (rows.length === 0) return [];
  await transact(db, 'rw', FOOD_TABLES, async () => {
    await refuseDuringFast(db);
    await putNew(db, rows);
  });
  return rows.map(entryOf);
}

/**
 * Replaces a logged entry (no fast check: nothing new is logged). Its day stays as stored unless
 * the time changed. Photos the edit dropped are released when nothing else uses them.
 */
export async function update(db: PlatewiseDb, entry: DiaryEntry): Promise<UpdateOutcome> {
  const kept = new Set(photoIdsOf(entry));
  return transact(db, 'rw', ['entries', ...PHOTO_RELEASE_TABLES], async () => {
    const stored = await readOne(db, 'entries', entry.id, decodeEntry);
    if (stored.kind === 'missing') return 'missing';
    if (stored.kind === 'corrupt') return 'unreadable';
    const before = stored.value;
    const sameTime = before.loggedAt === entry.loggedAt;
    await db.entries.put(sameTime ? rowOf(entry, before.dayKey) : rowOf(entry));
    await releaseIfUnused(db, dropped(photoIdsOf(before), kept));
    return 'updated';
  });
}

/** Deletes an entry and releases its photos that nothing else uses. False when no readable row. */
export function remove(db: PlatewiseDb, id: string): Promise<boolean> {
  return transact(db, 'rw', ['entries', ...PHOTO_RELEASE_TABLES], async () => {
    const stored = await readOne(db, 'entries', id, decodeEntry);
    if (stored.kind !== 'ok') return false;
    await db.entries.delete(id);
    await releaseIfUnused(db, photoIdsOf(stored.value));
    return true;
  });
}

/**
 * Replaces the originals with one combined entry (built with the domain's combineEntries) in one
 * transaction. Throws FastActiveError while a fast is running; `stale` when an original is gone.
 */
export async function combine(
  db: PlatewiseDb,
  newEntry: DiaryEntry,
  removedIds: readonly string[],
): Promise<CombineOutcome> {
  const row = rowOf(newEntry);
  const kept = new Set(photoIdsOf(newEntry));
  return transact(db, 'rw', [...FOOD_TABLES, ...PHOTO_RELEASE_TABLES], async () => {
    await refuseDuringFast(db);
    const originals: DiaryEntry[] = [];
    for (const id of new Set(removedIds)) {
      const read = await readOne(db, 'entries', id, decodeEntry);
      if (read.kind !== 'ok') return 'stale';
      originals.push(read.value);
    }
    await db.entries.bulkDelete(originals.map((original) => original.id));
    await putNew(db, [row]);
    await releaseIfUnused(db, dropped(originals.flatMap(photoIdsOf), kept));
    return 'combined';
  });
}

/**
 * End fast and log (D-16.35): ends the running fast at `now` and logs the entry in one
 * transaction, so both happen or neither. With no fast running it only logs.
 */
export async function endFastAndAdd(
  db: PlatewiseDb,
  entry: DiaryEntry,
  now: number,
): Promise<EndFastAndAddResult> {
  const row = rowOf(entry);
  return transact(db, 'rw', FOOD_TABLES, async () => {
    const { items: fasts } = await readAll(db, 'fasts', decodeFast);
    const running = activeFast(fasts);
    let endedFast: Fast | null = null;
    if (running) {
      const ended = endNow(fasts, running.id, {}, now);
      if (!ended.ok) throw new FastActiveError(running.id);
      endedFast = ended.value;
      await db.fasts.put(endedFast);
    }
    await refuseDuringFast(db);
    await putNew(db, [row]);
    return { entry: entryOf(row), endedFast };
  });
}

// ---- Reads ------------------------------------------------------------------------------------

type Select = NonNullable<ReadOptions['select']>;

async function readEntries(db: PlatewiseDb, select: Select): Promise<DiaryEntry[]> {
  return (await readAll(db, 'entries', decodeEntry, { select })).items;
}

/** One day's entries, newest first. */
export async function byDay(db: PlatewiseDb, dayKey: DayKey): Promise<DiaryEntry[]> {
  splitDayKey(dayKey);
  return readEntries(db, (table) =>
    table
      .where('[dayKey+loggedAt]')
      .between([dayKey, Dexie.minKey], [dayKey, Dexie.maxKey])
      .reverse()
      .toArray(),
  );
}

/** Entries of the days `firstKey` to `lastKey` (both included), oldest first. */
export async function between(
  db: PlatewiseDb,
  firstKey: DayKey,
  lastKey: DayKey,
): Promise<DiaryEntry[]> {
  splitDayKey(firstKey);
  splitDayKey(lastKey);
  if (firstKey > lastKey) return [];
  return readEntries(db, (table) =>
    table
      .where('[dayKey+loggedAt]')
      .between([firstKey, Dexie.minKey], [lastKey, Dexie.maxKey])
      .toArray(),
  );
}

/** Entries logged at or after `ms`, newest first (Recent, Often eaten). */
export function since(db: PlatewiseDb, ms: number): Promise<DiaryEntry[]> {
  return readEntries(db, (table) => table.where('loggedAt').aboveOrEqual(ms).reverse().toArray());
}

/** The newest label-sourced entry for this barcode (compared as `barcodeKeyOf`), if any. */
export async function latestLabelFor(
  db: PlatewiseDb,
  barcode: string,
): Promise<DiaryEntry | undefined> {
  const key = barcodeKeyOf(barcode);
  if (key === undefined) return undefined;
  const found = await readEntries(db, (table) => table.where('barcodeKey').equals(key).toArray());
  return found
    .filter((entry) => entry.source === 'label')
    .reduce<DiaryEntry | undefined>(
      (newest, entry) => (newest && newest.loggedAt >= entry.loggedAt ? newest : entry),
      undefined,
    );
}

/** How many entries can be read. */
export async function count(db: PlatewiseDb): Promise<number> {
  return (await readAll(db, 'entries', decodeEntry)).items.length;
}

/** `byDay` as a live feed. */
export function liveByDay(db: PlatewiseDb, dayKey: DayKey): LiveFeed<DiaryEntry[]> {
  return live(() => byDay(db, dayKey));
}

/** `between` as a live feed. */
export function liveBetween(
  db: PlatewiseDb,
  firstKey: DayKey,
  lastKey: DayKey,
): LiveFeed<DiaryEntry[]> {
  return live(() => between(db, firstKey, lastKey));
}
