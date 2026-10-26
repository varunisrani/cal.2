import { Dexie } from 'dexie';
import { IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { factories } from '../test/factories';
import { freshDbOptions, openTestDb, type TestDbOptions } from '../test/db';
import { createBus, type AppMessage } from './bus';
import { DbOpenError, openDb, transact } from './db';
import { BASE_STORES, TABLE_NAMES, type UpgradeStep } from './schema';

const make = factories();

/** Writes a version-2 database (one extra table) with a row in `water` and in the new table. */
async function writeNewerDatabase(options: TestDbOptions): Promise<void> {
  const newer = new Dexie(options.name, { indexedDB: options.indexedDB, IDBKeyRange });
  newer.version(1).stores(BASE_STORES);
  newer.version(2).stores({ habits: 'id' });
  await newer.open();
  await newer.table('water').put(make.water({ id: 'water-from-v2' }));
  await newer.table('habits').put({ id: 'habit-1' });
  newer.close();
}

/** Reads a database back at version 2, as the newer build would. */
async function readAsNewer(options: TestDbOptions) {
  const newer = new Dexie(options.name, { indexedDB: options.indexedDB, IDBKeyRange });
  newer.version(1).stores(BASE_STORES);
  newer.version(2).stores({ habits: 'id' });
  const rows = {
    water: await newer.table('water').toArray(),
    habits: await newer.table('habits').toArray(),
  };
  newer.close();
  return rows;
}

async function nativeVersion(options: TestDbOptions): Promise<number | undefined> {
  const found = (await options.indexedDB.databases()).find((info) => info.name === options.name);
  return found?.version;
}

describe('openDb', () => {
  it('creates every table and index on a fresh open', async () => {
    const db = await openTestDb();
    expect(db.tables.map((table) => table.name).sort()).toEqual([...TABLE_NAMES].sort());
    for (const table of db.tables) {
      const declared = [table.schema.primKey, ...table.schema.indexes].map((index) => index.src);
      expect(declared.join(', '), table.name).toBe(
        BASE_STORES[table.name as keyof typeof BASE_STORES],
      );
    }
    expect([...db.backendDB().objectStoreNames].sort()).toEqual([...TABLE_NAMES].sort());
    expect(db.verno).toBe(1);
  });

  it('keeps rows when the database is closed and opened again', async () => {
    const options = freshDbOptions();
    const first = await openDb(options);
    const entry = make.entry();
    await first.entries.put(entry);
    first.close();
    const again = await openTestDb(options);
    expect(await again.entries.get(entry.id)).toEqual(entry);
  });

  it('refuses a database a newer version wrote and leaves its rows and version as they were (R06.4)', async () => {
    const options = freshDbOptions();
    await writeNewerDatabase(options);
    const deleting = vi.spyOn(options.indexedDB, 'deleteDatabase');

    const opening = openDb(options);
    await expect(opening).rejects.toBeInstanceOf(DbOpenError);
    await expect(opening).rejects.toMatchObject({ kind: 'newer-schema' });

    expect(deleting).not.toHaveBeenCalled();
    expect(await nativeVersion(options)).toBe(20);
    const rows = await readAsNewer(options);
    expect(rows.water.map((row: { id: string }) => row.id)).toEqual(['water-from-v2']);
    expect(rows.habits).toEqual([{ id: 'habit-1' }]);
  });

  it('refuses a newer database after opening it when the browser cannot list databases', async () => {
    const options = freshDbOptions();
    await writeNewerDatabase(options);
    vi.spyOn(options.indexedDB, 'databases').mockRejectedValue(new Error('not supported'));

    await expect(openDb(options)).rejects.toMatchObject({ kind: 'newer-schema' });
    const rows = await readAsNewer(options);
    expect(rows.habits).toEqual([{ id: 'habit-1' }]);
  });

  it('reports a failed upgrade and keeps version 1 with its rows (R06.4)', async () => {
    const options = freshDbOptions();
    const v1 = await openDb(options);
    const entry = make.entry();
    await v1.entries.put(entry);
    v1.close();
    const failing: UpgradeStep = {
      version: 2,
      stores: { entries: `${BASE_STORES.entries}, meal` },
      migrate: () => {
        throw new Error('migration bug');
      },
      why: 'a step that fails',
    };
    const deleting = vi.spyOn(options.indexedDB, 'deleteDatabase');

    const opening = openDb({ ...options, steps: [failing] });
    await expect(opening).rejects.toMatchObject({ name: 'DbOpenError', kind: 'upgrade-failed' });

    expect(deleting).not.toHaveBeenCalled();
    expect(await nativeVersion(options)).toBe(10);
    const again = await openTestDb(options);
    expect(await again.entries.toArray()).toEqual([entry]);
  });

  it('upgrades through a step that keeps rows', async () => {
    const options = freshDbOptions();
    const v1 = await openDb(options);
    await v1.entries.bulkPut([make.entry(), make.entry({ meal: 'snack' })]);
    v1.close();
    const indexMeal: UpgradeStep = {
      version: 2,
      stores: { entries: `${BASE_STORES.entries}, meal` },
      why: 'index entries by meal',
    };
    const v2 = await openTestDb({ ...options, steps: [indexMeal] });
    expect(v2.verno).toBe(2);
    expect(await v2.entries.where('meal').equals('snack').count()).toBe(1);
  });

  it('reports unavailable when the browser offers no IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    await expect(openDb({ name: 'nowhere' })).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('versionchange', () => {
  function listen(options: TestDbOptions) {
    const bus = createBus(`bus-${options.name}`);
    const heard: AppMessage[] = [];
    bus.subscribe((message) => heard.push(message));
    onTestFinished(() => bus.close());
    return { bus, heard };
  }

  it('closes the connection and posts reload-needed when another tab upgrades', async () => {
    const options = freshDbOptions();
    const { bus, heard } = listen(options);
    const db = await openDb({ ...options, bus });

    const upgrading = new Dexie(options.name, { indexedDB: options.indexedDB, IDBKeyRange });
    upgrading.version(1).stores(BASE_STORES);
    upgrading.version(2).stores({ habits: 'id' });
    await upgrading.open();
    upgrading.close();

    expect(db.isOpen()).toBe(false);
    expect(heard).toEqual([{ type: 'reload-needed', reason: 'upgrade' }]);
    // Closed for good: no silent reopen at the newer version.
    await expect(db.entries.count()).rejects.toMatchObject({ name: 'DatabaseClosedError' });
  });

  it('posts reload-needed with the reason deleted when another tab deletes the database', async () => {
    const options = freshDbOptions();
    const { bus, heard } = listen(options);
    const db = await openDb({ ...options, bus });

    await new Promise<void>((resolve, reject) => {
      const request = options.indexedDB.deleteDatabase(options.name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    expect(db.isOpen()).toBe(false);
    expect(heard).toEqual([{ type: 'reload-needed', reason: 'deleted' }]);
  });
});

describe('transact', () => {
  it('covers quarantine and meta in every read-write transaction', async () => {
    const db = await openTestDb();
    const writeScope = await transact(db, 'rw', ['entries'], async () =>
      [...Dexie.currentTransaction.storeNames].sort(),
    );
    expect(writeScope).toEqual(['entries', 'meta', 'quarantine']);
    const readScope = await transact(db, 'r', ['entries'], async () => [
      ...Dexie.currentTransaction.storeNames,
    ]);
    expect(readScope).toEqual(['entries']);
  });

  it('rolls every change back when the body throws', async () => {
    const db = await openTestDb();
    const failing = transact(db, 'rw', ['entries', 'water'], async () => {
      await db.entries.put(make.entry());
      await db.water.put(make.water());
      await db.meta.put({ key: 'note', value: 1 });
      throw new Error('half way');
    });
    await expect(failing).rejects.toThrow('half way');
    expect([await db.entries.count(), await db.water.count(), await db.meta.count()]).toEqual([
      0, 0, 0,
    ]);
  });
});
