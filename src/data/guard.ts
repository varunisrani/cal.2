// Reading and writing records that may not be readable (R06.1, R05.6).
//
// A stored value that a codec cannot read is left out of results but never deleted or replaced
// unseen: its raw value is copied into `quarantine` (once per distinct value) and the `meta` flag
// `unreadableData` is set for the "some data could not be read" banner (K9). A write over a key
// whose stored value cannot be read copies that value first, in the same transaction; when the
// copy fails, the write is refused and nothing changes.

import { Dexie, type IndexableType, type Table, type Transaction } from 'dexie';
import { systemClock, type Clock } from '../lib/clock';
import { GUARD_TABLES, transact, type PlatewiseDb } from './db';
import type { QuarantineRow, Rows, TableName } from './schema';
import { fingerprint, stableText } from './values';

/** Turns a stored value into a record, or null when it cannot be read. */
export type Codec<T> = (raw: unknown) => T | null;

/** The `meta` key of the flag the unreadable-data banner reads. */
export const UNREADABLE_FLAG = 'unreadableData';

export interface ReadAllResult<T> {
  items: T[];
  /** How many rows could not be read (and were kept aside). */
  dropped: number;
}

export type ReadOneResult<T> =
  { kind: 'missing' } | { kind: 'ok'; value: T } | { kind: 'corrupt'; raw: unknown };

/** A stored value that could not be read, and where it lives. */
export interface Unreadable {
  table: TableName;
  key: IndexableType;
  raw: unknown;
}

export interface GuardOptions {
  /** Stamps quarantine rows; the device clock by default. */
  clock?: Clock;
}

export interface ReadOptions extends GuardOptions {
  /** Picks the rows to read (an index query); the whole table by default. */
  select?: (table: Table<unknown, IndexableType>) => Promise<unknown[]>;
}

/** A write refused because the unreadable value it would replace could not be kept aside. */
export class WriteBlockedError extends Error {
  override readonly name = 'WriteBlockedError';

  constructor(
    readonly table: TableName,
    readonly key: IndexableType,
    options?: { cause?: unknown },
  ) {
    super(
      `Not writing ${table} ${String(key)}: its unreadable value could not be kept aside`,
      options,
    );
  }
}

// ---- Keeping values aside ---------------------------------------------------------------------

/** Per connection: values whose copy has committed, so live re-runs do not copy them again. */
const committed = new WeakMap<Dexie, Set<string>>();

/** Copies that had to wait for a fresh task (found inside a live query or read-only transaction). */
const waiting = new Set<Promise<void>>();

function memoFor(db: Dexie): Set<string> {
  let memo = committed.get(db);
  if (!memo) {
    memo = new Set();
    committed.set(db, memo);
  }
  return memo;
}

function signature({ table, key, raw }: Unreadable): string {
  return `${table}\u0000${stableText(key)}\u0000${stableText(raw)}`;
}

function currentTx(): Transaction | null {
  // Typed as always present, but it is null outside a transaction.
  return (Dexie.currentTransaction as Transaction | null | undefined) ?? null;
}

/** True inside a read-write transaction that covers `tables` and the quarantine tables. */
function inWriteTx(tables: readonly TableName[]): boolean {
  const tx = currentTx();
  return (
    tx !== null &&
    tx.mode === 'readwrite' &&
    [...tables, ...GUARD_TABLES].every((name) => tx.storeNames.includes(name))
  );
}

function keyOf(db: PlatewiseDb, table: TableName, row: unknown): IndexableType {
  const { keyPath } = db.table(table).schema.primKey;
  const isObject = typeof row === 'object' && row !== null;
  const key: unknown = keyPath && isObject ? Dexie.getByKeyPath(row, keyPath) : undefined;
  // Inline keys: a stored row always holds its key. The fallback only keeps the types honest.
  return (key ?? '') as IndexableType;
}

/** Writes the copies that are not in the quarantine yet, then raises the flag. Needs `transact`. */
async function copyAside(db: PlatewiseDb, found: readonly Unreadable[], clock: Clock) {
  const tables = new Set(found.map((item) => item.table));
  for (const table of tables) {
    const earlier: QuarantineRow[] = await db.quarantine.where('table').equals(table).toArray();
    for (const item of found) {
      if (item.table !== table) continue;
      const hash = fingerprint(item.raw);
      const keyText = stableText(item.key);
      const rawText = stableText(item.raw);
      // The hash only narrows the search; the full text decides, so a collision never skips a copy.
      const known = earlier.some(
        (row) =>
          row.hash === hash && stableText(row.key) === keyText && stableText(row.raw) === rawText,
      );
      if (known) continue;
      const row: QuarantineRow = { table, key: item.key, at: clock.now(), raw: item.raw, hash };
      await db.quarantine.add(row);
      earlier.push(row);
    }
  }
  const flag = await db.meta.get(UNREADABLE_FLAG);
  if (flag?.value !== true) await db.meta.put({ key: UNREADABLE_FLAG, value: true });
}

function isReadOnlyContext(error: unknown): boolean {
  return error instanceof Error && error.name === 'ReadOnlyError';
}

function later(db: PlatewiseDb, found: readonly Unreadable[], clock: Clock): void {
  const run = new Promise<void>((resolve) => {
    // A new task runs outside the live query or transaction that found the values.
    setTimeout(() => {
      void copyInOwnTx(db, found, clock, false).finally(resolve);
    }, 0);
  });
  waiting.add(run);
  void run.finally(() => waiting.delete(run));
}

async function copyInOwnTx(
  db: PlatewiseDb,
  found: readonly Unreadable[],
  clock: Clock,
  mayWait: boolean,
): Promise<void> {
  try {
    await transact(db, 'rw', [], () => copyAside(db, found, clock));
    const memo = memoFor(db);
    for (const item of found) memo.add(signature(item));
  } catch (error) {
    // A live query may not write: try again on a fresh task. Any other failure leaves the values
    // where they are, in their own tables, and every write over them is guarded (guardKey).
    if (mayWait && isReadOnlyContext(error)) later(db, found, clock);
  }
}

/**
 * Copies unreadable values into the quarantine (each distinct value once) and sets the flag.
 * Best effort and never rejects: inside a read-write transaction from `transact` the copy joins
 * it; inside a live query or another transaction it waits for a fresh task (`keptAside`).
 */
export async function keepAside(
  db: PlatewiseDb,
  found: readonly Unreadable[],
  options: GuardOptions = {},
): Promise<void> {
  const memo = memoFor(db);
  const fresh = found.filter((item) => !memo.has(signature(item)));
  if (fresh.length === 0) return;
  const clock = options.clock ?? systemClock;
  const tx = currentTx();
  if (tx === null) return copyInOwnTx(db, fresh, clock, true);
  if (!inWriteTx([])) return later(db, fresh, clock);
  try {
    await copyAside(db, fresh, clock);
    tx.on('complete', () => {
      for (const item of fresh) memo.add(signature(item));
    });
  } catch {
    // The value stays in its table; writes over it are guarded.
  }
}

/** Resolves once every copy that had to wait for a fresh task has been written (or failed). */
export async function keptAside(): Promise<void> {
  while (waiting.size > 0) await Promise.all([...waiting]);
}

/** True when an unreadable value has been found since the flag was last cleared. */
export async function hasUnreadableData(db: PlatewiseDb): Promise<boolean> {
  return (await db.meta.get(UNREADABLE_FLAG))?.value === true;
}

// ---- Reading ----------------------------------------------------------------------------------

/** Reads rows through `codec`; unreadable rows are left out, counted and kept aside. */
export async function readAll<T>(
  db: PlatewiseDb,
  table: TableName,
  codec: Codec<T>,
  options: ReadOptions = {},
): Promise<ReadAllResult<T>> {
  const source = db.table(table) as Table<unknown, IndexableType>;
  const rows = await (options.select ? options.select(source) : source.toArray());
  const items: T[] = [];
  const unreadable: Unreadable[] = [];
  for (const raw of rows) {
    const value = codec(raw);
    if (value === null) unreadable.push({ table, key: keyOf(db, table, raw), raw });
    else items.push(value);
  }
  if (unreadable.length > 0) await keepAside(db, unreadable, options);
  return { items, dropped: unreadable.length };
}

/** Reads one row: missing, readable, or corrupt (then kept aside, and its raw value returned). */
export async function readOne<T>(
  db: PlatewiseDb,
  table: TableName,
  key: IndexableType,
  codec: Codec<T>,
  options: GuardOptions = {},
): Promise<ReadOneResult<T>> {
  const raw: unknown = await db.table(table).get(key);
  if (raw === undefined) return { kind: 'missing' };
  const value = codec(raw);
  if (value !== null) return { kind: 'ok', value };
  await keepAside(db, [{ table, key, raw }], options);
  return { kind: 'corrupt', raw };
}

// ---- Writing ----------------------------------------------------------------------------------

/**
 * Makes it safe to replace or delete the row at `key`: an unreadable stored value is copied into
 * the quarantine first. Call it inside the read-write transaction (from `transact`) that then
 * changes the row. Throws WriteBlockedError when the copy fails; the transaction then rolls back.
 */
export async function guardKey(
  db: PlatewiseDb,
  table: TableName,
  key: IndexableType,
  codec: Codec<unknown>,
  options: GuardOptions = {},
): Promise<void> {
  if (!inWriteTx([table])) {
    throw new Error(`guardKey(${table}) must run inside transact(db, 'rw', ['${table}'], …)`);
  }
  const stored: unknown = await db.table(table).get(key);
  if (stored === undefined || codec(stored) !== null) return;
  try {
    await copyAside(db, [{ table, key, raw: stored }], options.clock ?? systemClock);
  } catch (cause) {
    throw new WriteBlockedError(table, key, { cause });
  }
}

/**
 * Puts `row` into `table` in one transaction, keeping an unreadable value under the same key
 * aside first (WriteBlockedError when it cannot). Refuses a row its own codec cannot read.
 */
export async function writeOne<N extends TableName>(
  db: PlatewiseDb,
  table: N,
  row: Rows[N],
  codec: Codec<unknown>,
  options: GuardOptions = {},
): Promise<void> {
  if (codec(row) === null) {
    throw new TypeError(`Refusing to store a ${table} row that would not read back`);
  }
  const key = keyOf(db, table, row);
  await transact(db, 'rw', [table], async () => {
    await guardKey(db, table, key, codec, options);
    await db.table(table).put(row);
  });
}
