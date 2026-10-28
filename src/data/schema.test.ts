import { Dexie } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { FIRST_CHAT_ID } from '../domain/coach/chats';
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
  ADDED_TABLES,
  DB_NAME,
  KEPT_ADDED_TABLES,
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
    expect(schemaVersion([])).toBe(1);
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
      coachMessages: { key: 'id', autoIncrement: false, indexes: ['at', 'chatId'] },
      settings: { key: 'key', autoIncrement: false, indexes: [] },
      secrets: { key: 'id', autoIncrement: false, indexes: [] },
      drafts: { key: 'id', autoIncrement: false, indexes: [] },
      quarantine: { key: 'seq', autoIncrement: true, indexes: ['at', 'table'] },
      meta: { key: 'key', autoIncrement: false, indexes: [] },
      activity: { key: 'day', autoIncrement: false, indexes: [] },
      walks: { key: 'id', autoIncrement: false, indexes: ['startedAt'] },
      coachChats: { key: 'id', autoIncrement: false, indexes: ['updatedAt'] },
    });
    const dayIndex = db.backendDB().transaction('entries').objectStore('entries');
    expect(dayIndex.index('[dayKey+loggedAt]').keyPath).toEqual(['dayKey', 'loggedAt']);
    db.close();
  });

  it('lists the same tables in TABLES and ADDED_TABLES as the database holds', async () => {
    const { db } = await openTestDb();
    expect(Array.from(db.backendDB().objectStoreNames).sort()).toEqual(
      Object.keys({ ...TABLES, ...ADDED_TABLES }).sort(),
    );
    db.close();
  });
});

describe('schema version 2 (P11-03)', () => {
  it('adds the activity table, keyed by day', () => {
    expect(UPGRADES[0]).toEqual({ version: 2, stores: { activity: 'day' } });
    expect(ADDED_TABLES.activity).toBe('day');
  });

  it('moves a version 1 database with rows in every table to version 2, every row kept and the activity table empty', async () => {
    const factory = new IDBFactory();
    const before = connect(factory, []);
    await before.open();
    await seedEveryTable(before);
    const seeded = await keysByTable(before);
    before.close();

    const after = connect(factory, UPGRADES.slice(0, 1));
    await after.open();
    expect(after.verno).toBe(2);
    const kept = await keysByTable(after);
    after.close();
    expect(kept).toEqual({ ...seeded, activity: [] });
  });
});

describe('schema version 3 (P15-02)', () => {
  it('adds the walks table, keyed by id with an index on the start', () => {
    expect(schemaVersion(UPGRADES.slice(0, 2))).toBe(3);
    expect(UPGRADES[1]).toEqual({ version: 3, stores: { walks: 'id, startedAt' } });
    expect(ADDED_TABLES.walks).toBe('id, startedAt');
  });

  it('carries the walks in backups and leaves the activity copy out', () => {
    expect(KEPT_ADDED_TABLES).toContain('walks');
    expect(KEPT_ADDED_TABLES).not.toContain('activity');
  });

  it('moves a version 2 database with rows in every table to version 3, every row kept and the walks table empty', async () => {
    const factory = new IDBFactory();
    const before = connect(factory, UPGRADES.slice(0, 1));
    await before.open();
    await seedEveryTable(before);
    await before.activity.put({
      day: '2026-10-26',
      steps: 8000,
      activeKcal: 300,
      totalKcal: 2400,
      distanceM: 6000,
      sessions: [],
      syncedAt: 0,
    });
    const seeded = await keysByTable(before);
    before.close();

    const after = connect(factory, UPGRADES.slice(0, 2));
    await after.open();
    expect(after.verno).toBe(3);
    const kept = await keysByTable(after);
    after.close();
    expect(kept).toEqual({ ...seeded, walks: [] });
  });

  it('moves a version 1 database straight to version 3', async () => {
    const factory = new IDBFactory();
    const before = connect(factory, []);
    await before.open();
    await seedEveryTable(before);
    const seeded = await keysByTable(before);
    before.close();

    const after = connect(factory, UPGRADES.slice(0, 2));
    await after.open();
    expect(after.verno).toBe(3);
    const kept = await keysByTable(after);
    after.close();
    expect(kept).toEqual({ ...seeded, activity: [], walks: [] });
  });
});

describe('schema version 4 (P16-02)', () => {
  it('is the current version: it adds the chats table and the chat index on messages', () => {
    expect(schemaVersion()).toBe(4);
    expect(UPGRADES[2]).toMatchObject({
      version: 4,
      stores: { coachChats: 'id, updatedAt', coachMessages: 'id, at, chatId' },
    });
    expect(ADDED_TABLES.coachChats).toBe('id, updatedAt');
    expect(KEPT_ADDED_TABLES).toEqual(['walks', 'coachChats']);
  });

  /** A version 3 database with the given Coach messages (and one row in every other table). */
  async function version3With(messages: readonly object[]) {
    const factory = new IDBFactory();
    const before = connect(factory, UPGRADES.slice(0, 2));
    await before.open();
    await seedEveryTable(before);
    await before.coachMessages.clear();
    await before.coachMessages.bulkPut(messages as never[]);
    const seeded = await keysByTable(before);
    before.close();
    const after = connect(factory, UPGRADES);
    await after.open();
    return { after, seeded };
  }

  it('moves the conversation into one chat titled from its first question, with its times, every row kept', async () => {
    const { after, seeded } = await version3With([
      // A reply left at the start by the cap, then the person's first question (and an
      // unreadable row, which must get the chat too).
      { id: 'm1', role: 'assistant', text: 'Earlier reply.', at: 1_000, seq: 1 },
      { id: 'm2', role: 'user', text: '  How was\nmy week?  ', at: 2_000, seq: 2 },
      { id: 'm3', role: 'assistant', text: 'Steady.', at: 3_000, seq: 3 },
      { id: 'm4', role: 'system', text: 'from an older version', at: 4_000 },
    ]);

    expect(after.verno).toBe(4);
    const kept = await keysByTable(after);
    expect(kept).toEqual({ ...seeded, coachChats: [FIRST_CHAT_ID] });
    expect(await after.coachChats.toArray()).toEqual([
      {
        id: FIRST_CHAT_ID,
        title: 'How was my week?',
        titleByPerson: false,
        createdAt: 1_000,
        updatedAt: 4_000,
      },
    ]);
    const messages: unknown[] = await after.coachMessages.toArray();
    expect(messages.map((row) => (row as { chatId?: string }).chatId)).toEqual(
      Array(4).fill(FIRST_CHAT_ID),
    );
    expect(messages[1]).toEqual({
      id: 'm2',
      chatId: FIRST_CHAT_ID,
      role: 'user',
      text: '  How was\nmy week?  ',
      at: 2_000,
      seq: 2,
    });
    expect(await after.coachMessages.where('chatId').equals(FIRST_CHAT_ID).count()).toBe(4);
    after.close();
  });

  it('leaves the title empty when no question has words, and adds no chat without messages', async () => {
    const withoutWords = await version3With([
      { id: 'm1', role: 'assistant', text: 'A reply alone.', at: 5_000 },
      { id: 'm2', role: 'user', text: ' ', at: 6_000 },
    ]);
    expect(await withoutWords.after.coachChats.toArray()).toEqual([
      { id: FIRST_CHAT_ID, title: '', titleByPerson: false, createdAt: 5_000, updatedAt: 6_000 },
    ]);
    withoutWords.after.close();

    const empty = await version3With([]);
    expect(await empty.after.coachChats.count()).toBe(0);
    empty.after.close();
  });

  it('moves a version 1 database straight to version 4', async () => {
    const factory = new IDBFactory();
    const before = connect(factory, []);
    await before.open();
    await seedEveryTable(before);
    const seeded = await keysByTable(before);
    before.close();

    const after = connect(factory, UPGRADES);
    await after.open();
    expect(after.verno).toBe(4);
    const kept = await keysByTable(after);
    after.close();
    expect(kept).toEqual({ ...seeded, activity: [], walks: [], coachChats: [FIRST_CHAT_ID] });
  });
});

describe('upgrade registry', () => {
  it('is usable as registered', () => {
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
