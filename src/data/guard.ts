// The record guard (R06.1, R05.6): an unreadable row is never mistaken for "nothing there" and
// never overwritten or deleted while it is the only copy. Reads drop unreadable rows from their
// results but leave them in their table and copy them into `quarantine`; a write or delete over an
// unreadable record copies it first, in the same transaction, and is refused when that copy fails.
// Whenever a raw value is newly kept aside, `meta.unreadableData` is set for the notice (K9); the
// notice's Dismiss clears it, and reading the same damaged row again does not set it again.

import { systemClock, type Clock } from '../lib/clock';
import { isBlobLike, type Codec } from './codecs';
import type { PlatewiseDb, StoreName } from './schema';

/** The `meta` key of the "some data could not be read" flag. */
export const UNREADABLE_FLAG = 'unreadableData';

/** Tables a caller's own transaction must include when it calls `keepAside` or `writeOne`. */
export const GUARD_TABLES = ['quarantine', 'meta'] as const;

/** Tables whose rows are decoded by a codec (the quarantine itself is never decoded). */
export type GuardedTable = Exclude<StoreName, 'quarantine'>;

export interface ReadAllResult<T> {
  items: T[];
  /** How many rows could not be read; they stay in their table and are kept aside. */
  dropped: number;
}

export type ReadOneResult<T> =
  { kind: 'missing' } | { kind: 'ok'; value: T } | { kind: 'corrupt'; raw: unknown };

/**
 * A write or delete refused because the unreadable record it would replace or remove could not
 * be kept aside first.
 */
export class WriteBlockedError extends Error {
  override readonly name = 'WriteBlockedError';
  readonly table: string;
  readonly key: string;

  constructor(table: string, key: string, cause: unknown) {
    super(`Refused: the unreadable ${table} record "${key}" could not be kept aside`, { cause });
    this.table = table;
    this.key = key;
  }
}

// ---- Fingerprints ---------------------------------------------------------------------------------

// Writes a canonical text form of a stored value: object keys sorted, types tagged, cycles cut.
// Blobs are described by size and type because their bytes cannot be read inside a transaction.
function describe(value: unknown, out: string[], ancestors: Set<object>): void {
  switch (typeof value) {
    case 'undefined':
      out.push('U');
      return;
    case 'boolean':
      out.push(value ? 'T' : 'F');
      return;
    case 'number':
      out.push(`n${Object.is(value, -0) ? '-0' : String(value)};`);
      return;
    case 'bigint':
      out.push(`i${value};`);
      return;
    case 'string':
      out.push(`s${value.length}:${value}`);
      return;
    case 'object':
      break;
    default:
      out.push(`?${typeof value};`);
      return;
  }
  if (value === null) {
    out.push('N');
    return;
  }
  if (ancestors.has(value)) {
    out.push('^');
    return;
  }
  ancestors.add(value);
  if (value instanceof Date) {
    out.push(`d${value.getTime()};`);
  } else if (isBlobLike(value)) {
    out.push(`b${value.size}:${value.type};`);
  } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : new Uint8Array(value);
    out.push(`x${bytes.length}:${Array.from(bytes, (byte) => byte.toString(16)).join(',')};`);
  } else if (value instanceof Map) {
    out.push(`m${value.size}[`);
    for (const [key, item] of value) {
      describe(key, out, ancestors);
      describe(item, out, ancestors);
    }
    out.push(']');
  } else if (value instanceof Set) {
    out.push(`t${value.size}[`);
    for (const item of value) describe(item, out, ancestors);
    out.push(']');
  } else if (Array.isArray(value)) {
    out.push(`a${value.length}[`);
    for (const item of value) describe(item, out, ancestors);
    out.push(']');
  } else {
    const fields = value as Record<string, unknown>;
    const keys = Object.keys(fields).sort();
    out.push(`o${keys.length}{`);
    for (const key of keys) {
      out.push(`s${key.length}:${key}`);
      describe(fields[key], out, ancestors);
    }
    out.push('}');
  }
  ancestors.delete(value);
}

// 32-bit FNV-1a over UTF-16 units, forwards or backwards; two directions give 64 bits.
function fnv(textValue: string, backwards: boolean): string {
  let hash = 0x811c9dc5;
  for (let step = 0; step < textValue.length; step++) {
    const index = backwards ? textValue.length - 1 - step : step;
    hash ^= textValue.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** A short, stable hash of a stored value; equal values (in any key order) hash alike. */
export function fingerprint(raw: unknown): string {
  const out: string[] = [];
  describe(raw, out, new Set());
  const canonical = out.join('');
  return fnv(canonical, false) + fnv(canonical, true);
}

// ---- Keeping raw values aside ------------------------------------------------------------------

function keyOf(db: PlatewiseDb, table: GuardedTable, raw: unknown): string {
  const path = db.table(table).schema.primKey.keyPath;
  if (typeof path !== 'string' || typeof raw !== 'object' || raw === null) return '';
  return String((raw as Record<string, unknown>)[path]);
}

async function raiseFlag(db: PlatewiseDb): Promise<void> {
  const row = await db.meta.get(UNREADABLE_FLAG);
  if (row?.value !== true) await db.meta.put({ key: UNREADABLE_FLAG, value: true });
}

// Must run inside a read-write transaction over `quarantine` and `meta`.
async function copyAside(
  db: PlatewiseDb,
  table: GuardedTable,
  key: string,
  raw: unknown,
  at: number,
): Promise<void> {
  const hash = fingerprint(raw);
  const copies = await db.quarantine
    .where('table')
    .equals(table)
    .filter((row) => row.key === key && row.hash === hash)
    .count();
  if (copies > 0) return;
  await db.quarantine.add({ table, key, at, raw, hash });
  await raiseFlag(db);
}

/**
 * Copies an unreadable raw value into `quarantine` once per value, setting the flag when the copy
 * is new. Joins the caller's read-write transaction when there is one; it must include
 * `GUARD_TABLES`.
 */
export function keepAside(
  db: PlatewiseDb,
  table: GuardedTable,
  key: string,
  raw: unknown,
  clock: Clock = systemClock,
): Promise<void> {
  return db.transaction('rw', db.quarantine, db.meta, () =>
    copyAside(db, table, key, raw, clock.now()),
  );
}

const scheduled = new WeakMap<PlatewiseDb, Set<Promise<void>>>();

// Reads run inside live queries and read-only transactions, which may not write. So the copy
// runs later, on a fresh task outside any of them. A failed copy loses nothing: a read never
// deletes the row, and the next read schedules the copy again.
function keepAsideLater(
  db: PlatewiseDb,
  table: GuardedTable,
  rows: readonly { key: string; raw: unknown }[],
  at: number,
): void {
  const tasks = scheduled.get(db) ?? new Set<Promise<void>>();
  scheduled.set(db, tasks);
  const task = new Promise<void>((resolve) => {
    setTimeout(() => {
      db.transaction('rw', db.quarantine, db.meta, async () => {
        for (const row of rows) await copyAside(db, table, row.key, row.raw, at);
      })
        .catch(() => undefined)
        .finally(() => {
          tasks.delete(task);
          resolve();
        });
    }, 0);
  });
  tasks.add(task);
}

/** Resolves once every copy that earlier reads scheduled has been written (or has failed). */
export async function settleQuarantine(db: PlatewiseDb): Promise<void> {
  const tasks = scheduled.get(db);
  if (tasks) await Promise.all([...tasks]);
}

// ---- Reads and writes ---------------------------------------------------------------------------

/**
 * Decodes rows a repository has queried itself: unreadable ones are dropped from the result and
 * kept aside, never deleted.
 */
export function decodeRows<T>(
  db: PlatewiseDb,
  table: GuardedTable,
  rows: readonly unknown[],
  codec: Codec<T>,
  clock: Clock = systemClock,
): ReadAllResult<T> {
  const items: T[] = [];
  const unreadable: { key: string; raw: unknown }[] = [];
  for (const raw of rows) {
    const value = codec(raw);
    if (value === null) unreadable.push({ key: keyOf(db, table, raw), raw });
    else items.push(value);
  }
  if (unreadable.length > 0) keepAsideLater(db, table, unreadable, clock.now());
  return { items, dropped: unreadable.length };
}

/** Every readable row of a table, in key order. */
export async function readAll<T>(
  db: PlatewiseDb,
  table: GuardedTable,
  codec: Codec<T>,
  clock: Clock = systemClock,
): Promise<ReadAllResult<T>> {
  const rows: unknown[] = await db.table(table).toArray();
  return decodeRows(db, table, rows, codec, clock);
}

/** One record: missing, readable, or corrupt (with the raw value, which is kept aside). */
export async function readOne<T>(
  db: PlatewiseDb,
  table: GuardedTable,
  key: string,
  codec: Codec<T>,
  clock: Clock = systemClock,
): Promise<ReadOneResult<T>> {
  const raw: unknown = await db.table(table).get(key);
  if (raw === undefined) return { kind: 'missing' };
  const value = codec(raw);
  if (value !== null) return { kind: 'ok', value };
  keepAsideLater(db, table, [{ key, raw }], clock.now());
  return { kind: 'corrupt', raw };
}

// Inside a read-write transaction over `table`, `quarantine` and `meta`: keeps `stored` aside when
// it is unreadable, or throws WriteBlockedError, which rolls the whole transaction back.
async function keepAsideOrBlock<T>(
  db: PlatewiseDb,
  table: GuardedTable,
  key: string,
  stored: unknown,
  codec: Codec<T>,
  at: number,
): Promise<void> {
  if (stored === undefined || codec(stored) !== null) return;
  try {
    await copyAside(db, table, key, stored, at);
  } catch (cause) {
    throw new WriteBlockedError(table, key, cause);
  }
}

/**
 * Stores one row (its key inside it). When the stored record under that key cannot be read, its
 * raw value goes into `quarantine` first, in the same transaction; if that copy fails nothing is
 * written and the promise rejects with `WriteBlockedError`. A row the codec itself cannot read
 * is refused with a TypeError: it would vanish from every read.
 */
export async function writeOne<T>(
  db: PlatewiseDb,
  table: GuardedTable,
  row: object,
  codec: Codec<T>,
  clock: Clock = systemClock,
): Promise<void> {
  if (codec(row) === null) {
    throw new TypeError(`Refusing to store a ${table} row that cannot be read back`);
  }
  const store = db.table(table);
  const key = keyOf(db, table, row);
  await db.transaction('rw', [store, db.quarantine, db.meta], async () => {
    const stored: unknown = await store.get(key);
    await keepAsideOrBlock(db, table, key, stored, codec, clock.now());
    await store.put(row);
  });
}

/**
 * Deletes rows by key (missing keys are skipped). Any of them that cannot be read is kept aside
 * first, in the same transaction; if a copy fails nothing is deleted and the promise rejects with
 * `WriteBlockedError`. Clearing a table is this with every key.
 */
export async function removeRows<T>(
  db: PlatewiseDb,
  table: GuardedTable,
  keys: readonly string[],
  codec: Codec<T>,
  clock: Clock = systemClock,
): Promise<void> {
  const store = db.table(table);
  await db.transaction('rw', [store, db.quarantine, db.meta], async () => {
    const stored: unknown[] = await store.bulkGet([...keys]);
    const at = clock.now();
    for (const [index, key] of keys.entries()) {
      await keepAsideOrBlock(db, table, key, stored[index], codec, at);
    }
    await store.bulkDelete([...keys]);
  });
}

/** True once anything has been kept aside, until `clearUnreadableFlag`. */
export async function hasUnreadableData(db: PlatewiseDb): Promise<boolean> {
  const row = await db.meta.get(UNREADABLE_FLAG);
  return row?.value === true;
}

/**
 * Lowers the flag once the person has seen the notice. The damaged rows stay in their tables and
 * their copies in `quarantine`; only a value not kept aside before raises the flag again.
 */
export async function clearUnreadableFlag(db: PlatewiseDb): Promise<void> {
  await db.meta.delete(UNREADABLE_FLAG);
}
