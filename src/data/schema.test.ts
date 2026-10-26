import { Dexie, type IndexableType } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { FACTORY_NOW, factories } from '../test/factories';
import {
  BASE_STORES,
  BASE_VERSION,
  DB_NAME,
  TABLE_NAMES,
  UPGRADE_STEPS,
  checkSteps,
  declareSchema,
  schemaVersion,
  type UpgradeStep,
} from './schema';

/** Rows to seed into a table before an upgrade; tables added later get a bare keyed row. */
function seedRows(table: string, keyPath: string | string[] | null): unknown[] {
  const make = factories();
  const n = (i: number) => `${table}-${i}`;
  switch (table) {
    case 'profile':
      return [make.profileRow()];
    case 'entries':
      return [make.entry(), make.entry({ meal: 'dinner' })];
    case 'photos':
      return [make.photo(), make.photo()];
    case 'savedMeals':
      return [make.savedMeal(), make.savedMeal()];
    case 'weighIns':
      return [make.weighIn(), make.weighIn()];
    case 'bodyFat':
      return [make.bodyFat(), make.bodyFat()];
    case 'water':
      return [make.water(), make.water()];
    case 'fasts':
      return [make.fast(), make.fast({ end: null })];
    case 'coachMessages':
      return [make.coachMessage(), make.coachMessage({ role: 'assistant' })];
    case 'settings':
    case 'meta':
      return [1, 2].map((i) => ({ key: n(i), value: i }));
    case 'quarantine':
      return [1, 2].map((i) => ({
        table: 'entries',
        key: n(i),
        at: FACTORY_NOW,
        raw: {},
        hash: '0',
      }));
    default:
      return [1, 2].map((i) => (typeof keyPath === 'string' ? { [keyPath]: n(i) } : { id: n(i) }));
  }
}

/**
 * Seeds every table at the version before `steps[index]`, upgrades through that step and lists
 * every seeded row (or table) that is gone afterwards.
 */
async function rowsLostBy(steps: readonly UpgradeStep[], index: number): Promise<string[]> {
  const options = { indexedDB: new IDBFactory(), IDBKeyRange };
  const before = new Dexie('upgrade-check', options);
  declareSchema(before, steps.slice(0, index));
  await before.open();
  const seeded = new Map<string, IndexableType[]>();
  for (const table of before.tables) {
    const rows = seedRows(table.name, table.schema.primKey.keyPath ?? null);
    seeded.set(table.name, await table.bulkAdd(rows, { allKeys: true }));
  }
  before.close();

  const after = new Dexie('upgrade-check', options);
  declareSchema(after, steps.slice(0, index + 1));
  await after.open();
  const lost: string[] = [];
  for (const [name, keys] of seeded) {
    if (!after.tables.some((table) => table.name === name)) {
      lost.push(`${name}: table removed`);
      continue;
    }
    const found = await after.table(name).bulkGet(keys);
    keys.forEach((key, i) => {
      if (found[i] === undefined) lost.push(`${name}: ${String(key)}`);
    });
  }
  after.close();
  return lost;
}

describe('schema', () => {
  it('declares the platewise database at version 1 with every table and index', () => {
    expect(DB_NAME).toBe('platewise');
    expect(BASE_VERSION).toBe(1);
    expect(BASE_STORES).toEqual({
      profile: 'id',
      entries: 'id, dayKey, loggedAt, [dayKey+loggedAt], barcodeKey',
      photos: 'id',
      savedMeals: 'id, order, originEntryId',
      weighIns: 'id, at',
      bodyFat: 'id, at',
      water: 'id, at, dayKey',
      fasts: 'id, start, end',
      coachMessages: 'id, at',
      settings: 'key',
      secrets: 'id',
      drafts: 'id',
      quarantine: '++seq, table, at',
      meta: 'key',
    });
    expect(TABLE_NAMES).toHaveLength(14);
  });

  it('has no upgrade steps yet, so this build opens version 1', () => {
    expect(UPGRADE_STEPS).toEqual([]);
    expect(schemaVersion()).toBe(1);
    expect(checkSteps(UPGRADE_STEPS)).toEqual([]);
  });
});

describe('checkSteps', () => {
  const step = (version: number, why = 'a reason'): UpgradeStep => ({ version, stores: {}, why });

  it('accepts whole versions that rise from 2', () => {
    expect(checkSteps([step(2), step(3), step(5)])).toEqual([]);
    expect(schemaVersion([step(2), step(3), step(5)])).toBe(5);
  });

  it('rejects a version that does not rise, is not whole or does not say why', () => {
    expect(checkSteps([step(1)])).toHaveLength(1);
    expect(checkSteps([step(3), step(2)])).toHaveLength(1);
    expect(checkSteps([step(2.5)])).toHaveLength(1);
    expect(checkSteps([step(2, ' ')])).toHaveLength(1);
    expect(() => declareSchema(new Dexie('unused'), [step(3), step(3)])).toThrow(RangeError);
  });
});

describe('upgrade steps', () => {
  it('keep every row: each registered step is checked against every table', async () => {
    for (const [index, step] of UPGRADE_STEPS.entries()) {
      expect(await rowsLostBy(UPGRADE_STEPS, index), `version ${step.version}`).toEqual([]);
    }
  });

  it('the check passes a step that adds an index and rewrites rows', async () => {
    const keeps: UpgradeStep = {
      version: 2,
      stores: { entries: `${BASE_STORES.entries}, meal` },
      migrate: (tx) =>
        tx
          .table('entries')
          .toCollection()
          .modify((row: { note?: string }) => {
            row.note ??= '';
          }),
      why: 'index entries by meal',
    };
    expect(await rowsLostBy([keeps], 0)).toEqual([]);
  });

  it('the check catches a step that deletes rows or removes a table', async () => {
    const clears: UpgradeStep = {
      version: 2,
      stores: {},
      migrate: (tx) => tx.table('water').clear(),
      why: 'a careless step',
    };
    expect(await rowsLostBy([clears], 0)).toEqual(['water: water-1', 'water: water-2']);
    const drops: UpgradeStep = { version: 2, stores: { drafts: null }, why: 'drop drafts' };
    expect(await rowsLostBy([drops], 0)).toEqual(['drafts: table removed']);
  });
});
