import { Dexie } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openTestDb } from '../test/db';
import { makeEntry } from '../test/factories';
import { createBus, type BusMessage } from './bus';
import { DbOpenError, installedVersion, openDb } from './db';
import { TABLES, schemaVersion, type UpgradeStep } from './schema';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The native IndexedDB versions in a fake factory, by database name. */
async function nativeVersions(factory: IDBFactory): Promise<Record<string, number>> {
  const list = await factory.databases();
  return Object.fromEntries(list.map((info) => [info.name ?? '', info.version ?? 0]));
}

/**
 * A second connection ("another tab", or a newer build) at a given Dexie version. Its schema
 * drops one of our indexes and adds a table, so Dexie would have something to patch if this
 * build ever opened it.
 */
function otherConnection(factory: IDBFactory, name: string, version: number): Dexie {
  const db = new Dexie(name, { indexedDB: factory, IDBKeyRange });
  db.version(version).stores({
    ...TABLES,
    entries: 'id, dayKey, loggedAt, [dayKey+loggedAt]',
    extras: 'id',
  });
  return db;
}

async function rejection(promise: Promise<unknown>): Promise<DbOpenError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DbOpenError);
  return error as DbOpenError;
}

describe('openDb', () => {
  it('creates the platewise database at the current schema version on a first run', async () => {
    const factory = new IDBFactory();
    const db = await openDb({ indexedDB: factory, IDBKeyRange, bus: createBus({ channel: null }) });
    expect(db.name).toBe('platewise');
    expect(db.verno).toBe(schemaVersion());
    expect(await nativeVersions(factory)).toEqual({ platewise: schemaVersion() * 10 });
    db.close();
  });

  it('keeps rows across a reopen', async () => {
    const { db, factory, name } = await openTestDb();
    const entry = makeEntry();
    await db.entries.put(entry);
    db.close();

    const { db: again } = await openTestDb({ indexedDB: factory, name });
    expect(await again.entries.get(entry.id)).toEqual(entry);
    again.close();
  });

  it('refuses a database a newer version wrote and leaves it exactly as it was (R06.4)', async () => {
    const factory = new IDBFactory();
    const current = schemaVersion();
    const newer = otherConnection(factory, 'platewise', current + 1);
    await newer.open();
    const entry = makeEntry();
    await newer.table('entries').put(entry);
    await newer.table('extras').put({ id: 'kept' });
    newer.close();

    const error = await rejection(
      openDb({ indexedDB: factory, IDBKeyRange, bus: createBus({ channel: null }) }),
    );
    expect(error).toMatchObject({ kind: 'newer', expected: current, found: current + 1 });

    // Not patched, not deleted: the newer build still finds its version and its rows.
    expect(await nativeVersions(factory)).toEqual({ platewise: (current + 1) * 10 });
    const reopened = otherConnection(factory, 'platewise', current + 1);
    expect(await reopened.table('entries').get(entry.id)).toEqual(entry);
    expect(await reopened.table('extras').get('kept')).toEqual({ id: 'kept' });
    reopened.close();
  });

  it('turns a failing upgrade into DbOpenError and keeps version 1 with its rows (R06.4)', async () => {
    const { db, factory, name } = await openTestDb({ steps: [] });
    const entry = makeEntry();
    await db.entries.put(entry);
    db.close();

    const broken: UpgradeStep = {
      version: 2,
      stores: { entries: `${TABLES.entries}, meal` },
      migrate: () => {
        throw new Error('migration bug');
      },
    };
    const error = await rejection(openTestDb({ indexedDB: factory, name, steps: [broken] }));
    expect(error).toMatchObject({ kind: 'upgrade', expected: 2, found: 1 });
    expect((error.cause as Error).message).toBe('migration bug');

    expect(await nativeVersions(factory)).toEqual({ [name]: 10 });
    const { db: again } = await openTestDb({ indexedDB: factory, name, steps: [] });
    expect(await again.entries.get(entry.id)).toEqual(entry);
    again.close();
  });

  it('reports unavailable when the browser has no IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const error = await rejection(openDb({ bus: createBus({ channel: null }) }));
    expect(error.kind).toBe('unavailable');
  });

  it('reports unavailable when the browser refuses to open any database', async () => {
    const factory = new IDBFactory();
    vi.spyOn(factory, 'open').mockImplementation(() => {
      throw new DOMException('A mutation operation was attempted', 'InvalidStateError');
    });
    const error = await rejection(
      openDb({ indexedDB: factory, IDBKeyRange, bus: createBus({ channel: null }) }),
    );
    expect(error.kind).toBe('unavailable');
  });
});

describe('installedVersion', () => {
  it('finds no version and creates nothing when the database is missing', async () => {
    const factory = new IDBFactory();
    expect(await installedVersion(factory, 'platewise')).toBeNull();
    expect(await factory.databases()).toEqual([]);
  });

  it('reads the Dexie version of an existing database', async () => {
    const { factory, name, db } = await openTestDb();
    db.close();
    expect(await installedVersion(factory, name)).toBe(schemaVersion());
  });
});

describe('versionchange', () => {
  it('closes this connection, posts reload-needed here, and lets the other tab upgrade', async () => {
    const bus = createBus({ channel: null });
    const heard: Array<[BusMessage, boolean]> = [];
    bus.subscribe((message, fromOtherTab) => heard.push([message, fromOtherTab]));
    const { db, factory, name } = await openTestDb({ bus });

    const upgrader = otherConnection(factory, name, 2);
    await upgrader.open();

    expect(db.isOpen()).toBe(false);
    expect(heard).toEqual([[{ type: 'reload-needed' }, false]]);
    // Closed for good: no silent reopen into the newer schema.
    await expect(db.entries.count()).rejects.toMatchObject({ name: 'DatabaseClosedError' });
    upgrader.close();
  });

  it('lets another tab delete the database', async () => {
    const bus = createBus({ channel: null });
    const heard: BusMessage[] = [];
    bus.subscribe((message) => heard.push(message));
    const { db, factory, name } = await openTestDb({ bus });

    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });

    expect(db.isOpen()).toBe(false);
    expect(heard).toEqual([{ type: 'reload-needed' }]);
  });
});
