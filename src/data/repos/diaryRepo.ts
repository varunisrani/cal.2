// The diary: every logged food entry (R02.24, R06.2). Each change is one read-write transaction
// that reads what it needs, changes it and writes it, so two tabs or two quick taps never lose
// each other's work and an unreadable row is never replaced by a list rebuilt without it.
//
// Food is refused while a fast is running, at the store (R05.1, R02.12): every write that creates
// an entry reads the fasts inside its own transaction and throws `FastActiveError` before writing
// anything. "End fast and log" (D-16.35) ends the fast and adds the entry in one transaction.
//
// Each stored row carries two keys derived on write: `dayKey`, the local day of `loggedAt`, and
// `barcodeKey`, the comparison key of the product's barcode (for the saved-label lookup). Writes
// that drop photos return their ids; the caller hands them to the photo repository, which keeps
// any photo another owner still uses.

import { Dexie } from 'dexie';
import { dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import type { CombinedEntry } from '../../domain/food/combine';
import type { DiaryEntry, Fast } from '../../domain/model';
import { activeFast, endNow } from '../../domain/trackers/fasting';
import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { barcodeKey } from '../barcodeKey';
import { decodeEntry, decodeFast } from '../codecs';
import { GUARD_TABLES, decodeRows, removeRows, writeOne } from '../guard';
import type { EntryRow, PlatewiseDb } from '../schema';
import { photoIdsOf } from './photoRepo';

/** A food write refused because a fast is running. */
export class FastActiveError extends Error {
  override readonly name = 'FastActiveError';
  /** The running fast, for the "End fast and log" dialog. */
  readonly fast: Fast;

  constructor(fast: Fast) {
    super('Food cannot be logged while a fast is running');
    this.fast = fast;
  }
}

/** A combine refused because some of the entries it replaces are no longer stored. */
export class MissingEntriesError extends Error {
  override readonly name = 'MissingEntriesError';
  readonly ids: readonly string[];

  constructor(ids: readonly string[]) {
    super(`Entries no longer stored: ${ids.join(', ')}`);
    this.ids = ids;
  }
}

export type UpdateResult =
  { kind: 'updated'; entry: DiaryEntry; releasedPhotoIds: string[] } | { kind: 'missing' };

export interface CombineResult {
  entry: DiaryEntry;
  /** Photos the originals held that the combined entry does not. */
  releasedPhotoIds: string[];
}

export interface EndFastAndAddResult {
  entry: DiaryEntry;
  /** The fast this call ended, or null when none was running any more. */
  endedFast: Fast | null;
}

export interface DiaryRepo {
  /** Adds a new entry (its id must be new). */
  add(entry: DiaryEntry): Promise<DiaryEntry>;
  /** Adds several new entries: all of them or none. */
  addMany(entries: readonly DiaryEntry[]): Promise<DiaryEntry[]>;
  /** Replaces a stored entry; never brings back one that was deleted meanwhile. */
  update(entry: DiaryEntry): Promise<UpdateResult>;
  /** Deletes an entry; returns the photos it held (empty when nothing was deleted). */
  remove(id: string): Promise<string[]>;
  /**
   * Adds the entry `combineEntries` built and deletes the entries it replaces (at least two, all
   * still stored).
   */
  combine(newEntry: CombinedEntry, removedIds: readonly string[]): Promise<CombineResult>;
  /** Ends the running fast at `now` and adds the entry, both or neither. */
  endFastAndAdd(entry: DiaryEntry, now: number): Promise<EndFastAndAddResult>;
  /** The entries of one local day, newest first. */
  byDay(dayKey: DayKey): Promise<DiaryEntry[]>;
  /** The entries from `firstKey` to `lastKey` (both included), oldest first. */
  between(firstKey: DayKey, lastKey: DayKey): Promise<DiaryEntry[]>;
  /** The entries logged at or after `ms`, newest first. */
  since(ms: number): Promise<DiaryEntry[]>;
  /** The newest label-sourced entry whose barcode matches `code` once normalised, or null. */
  latestLabelFor(code: string): Promise<DiaryEntry | null>;
  /** Stored entries, readable or not. */
  count(): Promise<number>;
}

export interface DiaryRepoOptions {
  /** Time for quarantine copies; defaults to the device clock. */
  clock?: Clock;
  /** Ids for combined entries; defaults to random UUIDs. */
  newId?: IdSource;
}

/** Tables of a change that may create food: the entries, the fasts it checks, the guard's. */
const FOOD_WRITE_TABLES = ['entries', 'fasts', ...GUARD_TABLES] as const;
const ENTRY_WRITE_TABLES = ['entries', ...GUARD_TABLES] as const;

/**
 * The row to store: the codec's own reading of the entry (so it reads back the same) with the day
 * of its instant and its barcode key. Throws a TypeError for an entry the codec cannot read.
 */
function toRow(entry: DiaryEntry): EntryRow {
  const clean = decodeEntry({ ...entry, dayKey: dayKeyOf(entry.loggedAt) });
  if (!clean) throw new TypeError(`Refusing to store entry "${entry.id}": it cannot be read back`);
  const key = clean.product ? barcodeKey(clean.product.barcode) : undefined;
  return key === undefined ? clean : { ...clean, barcodeKey: key };
}

/** The stored entry as reads return it, without the derived barcode key. */
function asEntry(row: EntryRow): DiaryEntry {
  const { barcodeKey: _derived, ...entry } = row;
  return entry;
}

function without(ids: readonly string[], kept: readonly string[]): string[] {
  const keep = new Set(kept);
  return ids.filter((id) => !keep.has(id));
}

export function createDiaryRepo(db: PlatewiseDb, options: DiaryRepoOptions = {}): DiaryRepo {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? randomId;

  /** The readable fasts as stored now; called inside the writing transaction. */
  async function storedFasts(): Promise<Fast[]> {
    return decodeRows(db, 'fasts', await db.fasts.toArray(), decodeFast, clock).items;
  }

  async function refuseDuringFast(): Promise<void> {
    const running = activeFast(await storedFasts());
    if (running) throw new FastActiveError(running);
  }

  function decoded(rows: readonly unknown[]): DiaryEntry[] {
    return decodeRows(db, 'entries', rows, decodeEntry, clock).items;
  }

  return {
    async add(entry) {
      const row = toRow(entry);
      return db.transaction('rw', [...FOOD_WRITE_TABLES], async () => {
        await refuseDuringFast();
        await db.entries.add(row);
        return asEntry(row);
      });
    },

    async addMany(entries) {
      const rows = entries.map(toRow);
      return db.transaction('rw', [...FOOD_WRITE_TABLES], async () => {
        await refuseDuringFast();
        await db.entries.bulkAdd(rows);
        return rows.map(asEntry);
      });
    },

    async update(entry) {
      const row = toRow(entry);
      return db.transaction('rw', [...ENTRY_WRITE_TABLES], async (): Promise<UpdateResult> => {
        const stored: unknown = await db.entries.get(row.id);
        if (stored === undefined) return { kind: 'missing' };
        // Over an unreadable row the guard keeps the raw value aside first, or refuses.
        await writeOne(db, 'entries', row, decodeEntry, clock);
        const previous = decodeEntry(stored);
        const released = previous ? without(photoIdsOf(previous), photoIdsOf(row)) : [];
        return { kind: 'updated', entry: asEntry(row), releasedPhotoIds: released };
      });
    },

    async remove(id) {
      return db.transaction('rw', [...ENTRY_WRITE_TABLES], async () => {
        const stored: unknown = await db.entries.get(id);
        if (stored === undefined) return [];
        await removeRows(db, 'entries', [id], decodeEntry, clock);
        const previous = decodeEntry(stored);
        return previous ? photoIdsOf(previous) : [];
      });
    },

    async combine(newEntry, removedIds) {
      const originals = [...new Set(removedIds)];
      if (originals.length < 2) throw new RangeError('A combined entry replaces at least two');
      const row = toRow({ ...newEntry, id: newId() });
      return db.transaction('rw', [...FOOD_WRITE_TABLES], async () => {
        await refuseDuringFast();
        const stored: unknown[] = await db.entries.bulkGet(originals);
        const gone = originals.filter((_, index) => stored[index] === undefined);
        if (gone.length > 0) throw new MissingEntriesError(gone);
        await removeRows(db, 'entries', originals, decodeEntry, clock);
        await db.entries.add(row);
        const dropped = decoded(stored).flatMap(photoIdsOf);
        return {
          entry: asEntry(row),
          releasedPhotoIds: without([...new Set(dropped)], photoIdsOf(row)),
        };
      });
    },

    async endFastAndAdd(entry, now) {
      const row = toRow(entry);
      return db.transaction('rw', [...FOOD_WRITE_TABLES], async () => {
        const fasts = await storedFasts();
        const running = activeFast(fasts);
        let endedFast: Fast | null = null;
        if (running) {
          const ended = endNow(fasts, running.id, {}, now);
          // Ending at `now` cannot meet another fast unless the stored list is already broken.
          if (!ended.ok) throw new FastActiveError(running);
          await db.fasts.put(ended.value);
          endedFast = ended.value;
        }
        await db.entries.add(row);
        return { entry: asEntry(row), endedFast };
      });
    },

    // Reads return Dexie's own promise chain, which a live query takes over without delay.
    byDay: (dayKey) =>
      db.entries
        .where('[dayKey+loggedAt]')
        .between([dayKey, Dexie.minKey], [dayKey, Dexie.maxKey])
        .reverse()
        .toArray()
        .then(decoded),

    between: (firstKey, lastKey) =>
      firstKey > lastKey
        ? Dexie.Promise.resolve([])
        : db.entries
            .where('[dayKey+loggedAt]')
            .between([firstKey, Dexie.minKey], [lastKey, Dexie.maxKey], true, true)
            .toArray()
            .then(decoded),

    since: (ms) => db.entries.where('loggedAt').aboveOrEqual(ms).reverse().toArray().then(decoded),

    latestLabelFor(code) {
      const key = barcodeKey(code);
      if (key === undefined) return Dexie.Promise.resolve(null);
      return db.entries
        .where('barcodeKey')
        .equals(key)
        .toArray()
        .then((rows) => {
          let latest: DiaryEntry | null = null;
          for (const entry of decoded(rows)) {
            if (entry.source !== 'label') continue;
            if (latest === null || entry.loggedAt > latest.loggedAt) latest = entry;
          }
          return latest;
        });
    },

    count: () => db.entries.count(),
  };
}
