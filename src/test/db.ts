/**
 * A database of its own for each test: a fresh fake IndexedDB and a name no other test uses.
 * Dexie keeps its live-query cache per database name across instances, so sharing a name between
 * tests could hand one test another test's rows.
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { onTestFinished } from 'vitest';
import { openDb, type OpenOptions, type PlatewiseDb } from '../data/db';

export type TestDbOptions = OpenOptions & { name: string; indexedDB: IDBFactory };

let opened = 0;

/** Options naming a new database in a new fake IndexedDB. Open them twice for two "tabs". */
export function freshDbOptions(): TestDbOptions {
  opened += 1;
  return { name: `platewise-test-${opened}`, indexedDB: new IDBFactory(), IDBKeyRange };
}

/** Opens a database for the running test and closes it when the test ends. */
export async function openTestDb(options: OpenOptions = freshDbOptions()): Promise<PlatewiseDb> {
  const db = await openDb(options);
  onTestFinished(() => db.close());
  return db;
}
