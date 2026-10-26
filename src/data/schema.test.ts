import { Dexie } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openTestDb } from '../test/db';
import {
  makeBodyFat,
  makeCoachMessage,
  makeEntry,
  makeFast,
  makeProfileRow,
  makeSavedMeal,
  makeWater,
  makeWeighIn,
} from '../test/factories';
import {
  DB_NAME,
  TABLES,
  TABLE_NAMES,
  UPGRADES,
  checkSteps,
  declareSchema,
  schemaVersion,
  type PlatewiseDb,
  type UpgradeStep,
} from './schema';

/** Key path, auto-increment and sorted index names of every object store, read from IndexedDB. */
function storeLayout(db: PlatewiseDb) {
  const idb = db.backendDB();
  const names = Array.from(idb.objectStoreNames);
  const tx = idb.transaction(names, 'readonly');
  return Object.fromEntries(
    names.map((name) => {
      const store = tx.objectStore(name);
      return [
        name,
        {
          key: store.keyPath,
          autoIncrement: store.autoIncrement,
          indexes: Array.from(store.indexNames).sort(),
        },
      ];
    }),
  );
}

describe('schema version 1', () => {
  it('names the database platewise and declares fourteen tables', () => {
    expect(DB_NAME).toBe('platewise');
    expect(TABLE_NAMES).toHaveLength(14);
    expect(schemaVersion()).toBe(1);
  });

  it('creates every table with its key and indexes on a fresh open', async () => {
    const { db } = await openTestDb();
    expect(storeLayout(db)).toEqual({
      profile: { key: 'id', autoIncrement: false, indexes: [] },
      entries: {
        key: 'id',
        autoIncrement: false,
        indexes: ['[dayKey+loggedAt]', 'barcodeKey', 'dayKey', 'loggedAt'],
      },
      photos: { key: 'id', autoIncrement: false, indexes: [] },
      savedMeals: { key: 'id', autoIncrement: false, indexes: ['order', 'originEntryId'] },
      weighIns: { key: 'id', autoIncrement: false, indexes: ['at'] },
      bodyFat: { key: 'id', autoIncrement: false, indexes: ['at'] },
      water: { key: 'id', autoIncrement: false, indexes: ['at', 'dayKey'] },
      fasts: { key: 'id', autoIncrement: false, indexes: ['end', 'start'] },
      coachMessages: { key: 'id', autoIncrement: false, indexes: ['at'] },
      settings: { key: 'key', autoIncrement: false, indexes: [] },
      secrets: { key: 'id', autoIncrement: false, indexes: [] },
      drafts: { key: 'id', autoIncrement: false, indexes: [] },
      quarantine: { key: 'seq', autoIncrement: true, indexes: ['at', 'table'] },
      meta: { key: 'key', autoIncrement: false, indexes: [] },
    });
    const dayIndex = db.backendDB().transaction('entries').objectStore('entries');
    expect(dayIndex.index('[dayKey+loggedAt]').keyPath).toEqual(['dayKey', 'loggedAt']);
    db.close();
  });

  it('lists the same tables in TABLES as the database holds', async () => {
    const { db } = await openTestDb();
    expect(Array.from(db.backendDB().objectStoreNames).sort()).toEqual(Object.keys(TABLES).sort());
    db.close();
  });
});

describe('upgrade registry', () => {
  it('is empty and usable today', () => {
    expect(UPGRADES).toEqual([]);
    expect(checkSteps(UPGRADES)).toEqual([]);
  });

  it('flags steps out of order, at version 1 or below, and deletes without a move', () => {
    const steps: UpgradeStep[] = [
      { version: 3, stores: {} },
      { version: 2, stores: {} },
      { version: 4, stores: { drafts: null } },
    ];
    expect(checkSteps(steps)).toEqual([
      'version 2 must be a whole number above 3',
      'version 4 deletes drafts without moving its rows',
    ]);
    expect(checkSteps([{ version: 1, stores: {} }])).toEqual([
      'version 1 must be a whole number above 1',
    ]);
  });

  it('refuses to declare bad steps', () => {
    const db = new Dexie('bad-steps', { indexedDB: new IDBFactory(), IDBKeyRange });
    expect(() => declareSchema(db, [{ version: 1.5, stores: {} }])).toThrow(RangeError);
  });

  it('reports the version the last step leads to', () => {
    expect(
      schemaVersion([
        { version: 2, stores: {} },
        { version: 5, stores: {} },
      ]),
    ).toBe(5);
  });
});

// ---- Every step keeps data -------------------------------------------------------------------

/** One row in every table of version 1. */
async function seedEveryTable(db: PlatewiseDb): Promise<void> {
  await db.profile.put(makeProfileRow());
  await db.entries.bulkPut([makeEntry(), makeEntry({ meal: 'dinner' })]);
  await db.photos.put({
    id: 'photo-1',
    blob: new Blob(['jpeg']),
    width: 1,
    height: 1,
    bytes: 4,
    createdAt: 0,
  });
  await db.savedMeals.put(makeSavedMeal());
  await db.weighIns.put(makeWeighIn());
  await db.bodyFat.put(makeBodyFat());
  await db.water.put(makeWater());
  await db.fasts.bulkPut([makeFast(), makeFast({ end: null })]);
  await db.coachMessages.put(makeCoachMessage());
  await db.settings.put({ key: 'display.accent', value: 'basil' });
  await db.secrets.put({ id: 'openai', iv: new Uint8Array(12), data: new Uint8Array(4) });
  await db.drafts.put({ id: 'capture', photoIds: [], note: '' });
  await db.quarantine.add({ table: 'entries', key: 'x', at: 0, raw: '{', hash: 'h' });
  await db.meta.put({ key: 'coachGeneration', value: 1 });
}

/** Primary keys per table. */
async function keysByTable(db: Dexie): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const table of db.tables)
    out[table.name] = (await table.toCollection().primaryKeys()).map(String);
  return out;
}

function connect(factory: IDBFactory, steps: readonly UpgradeStep[]): PlatewiseDb {
  const db = new Dexie('upgrade-check', { indexedDB: factory, IDBKeyRange }) as PlatewiseDb;
  declareSchema(db, steps);
  return db;
}

/**
 * Seeds the schema just before `steps[index]`, runs that step, and checks that every table that
 * still exists kept every key and that no rows were lost overall.
 */
async function expectStepKeepsRows(steps: readonly UpgradeStep[], index: number): Promise<void> {
  const factory = new IDBFactory();
  const before = connect(factory, steps.slice(0, index));
  await before.open();
  await seedEveryTable(before);
  const seeded = await keysByTable(before);
  before.close();

  const after = connect(factory, steps.slice(0, index + 1));
  await after.open();
  const kept = await keysByTable(after);
  after.close();

  for (const [table, keys] of Object.entries(seeded)) {
    if (kept[table]) expect(kept[table], table).toEqual(expect.arrayContaining(keys));
  }
  const count = (byTable: Record<string, string[]>) =>
    Object.values(byTable).reduce((sum, keys) => sum + keys.length, 0);
  expect(count(kept)).toBeGreaterThanOrEqual(count(seeded));
}

describe('upgrade steps keep data', () => {
  it('runs every registered step without losing a row', async () => {
    let checked = 0;
    for (const index of UPGRADES.keys()) {
      await expectStepKeepsRows(UPGRADES, index);
      checked++;
    }
    expect(checked).toBe(UPGRADES.length);
  });

  it('keeps every row through a sample step that adds an index and a table and moves data', async () => {
    const sample: UpgradeStep = {
      version: 2,
      stores: { entries: `${TABLES.entries}, meal`, notes: 'id' },
      async migrate(tx) {
        const drafts = await tx.table('drafts').toArray();
        await tx.table('notes').bulkAdd(drafts.map((draft: { id: string }) => ({ id: draft.id })));
      },
    };
    await expectStepKeepsRows([sample], 0);
  });

  it('catches a step that deletes a table and moves nothing', async () => {
    const careless: UpgradeStep = {
      version: 2,
      stores: { drafts: null },
      migrate: () => undefined,
    };
    await expect(expectStepKeepsRows([careless], 0)).rejects.toMatchObject({
      name: 'AssertionError',
    });
  });
});
