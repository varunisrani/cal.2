import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBus, type Bus } from '../data/bus';
import { createPhotoRepo } from '../data/repos/photoRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { createTransferRepo } from '../data/repos/transferRepo';
import { TABLE_NAMES, type PlatewiseDb } from '../data/schema';
import type { StorageAccess } from '../data/storage';
import { closeOnErase, eraseEverything, type EraseResult } from '../data/wipe';
import { storableBlob } from '../test/blobs';
import { openTestDb } from '../test/db';
import { FACTORY_NOW } from '../test/factories';
import { SEED_CLOCK, seedStore, storedTables, testBackupService } from './backup/testing/seed';
import { BACKUP_QUIET_KEY } from './storageNudge';
import { createYourDataService, type YourDataDeps } from './yourData';

const DAY = 86_400_000;
const closers: Array<{ close(): void }> = [];
let channels = 0;

afterEach(() => {
  for (const item of closers.splice(0)) item.close();
});

/** Two buses joined like two tabs of the app. */
function twoTabs(): [Bus, Bus] {
  const name = `platewise-your-data-test-${++channels}`;
  const tabs: [Bus, Bus] = [createBus({ name }), createBus({ name })];
  closers.push(...tabs);
  return tabs;
}

const browserStorage: Pick<StorageAccess, 'estimate' | 'persistenceStatus'> = {
  estimate: async () => ({ usage: 1_234_567, quota: 50_000_000 }),
  persistenceStatus: async () => 'persistent',
};

/** The service over `db`, every outside step recorded in `steps` in the order it ran. */
function serviceOver(db: PlatewiseDb, extra: Partial<YourDataDeps> = {}) {
  const steps: string[] = [];
  const service = createYourDataService({
    transferRepo: createTransferRepo(db),
    photoRepo: createPhotoRepo(db),
    storage: browserStorage,
    backup: { invalidate: () => steps.push('invalidate') },
    reminders: { stop: () => steps.push('stop') },
    erase: async (): Promise<EraseResult> => {
      steps.push('erase');
      return { status: 'erased' };
    },
    restart: () => steps.push('restart'),
    ...extra,
  });
  return { service, steps };
}

/** A promise the test settles by hand. */
function signal() {
  let fire!: () => void;
  const fired = new Promise<void>((resolve) => (fire = resolve));
  return { fired, fire };
}

describe('createYourDataService: the storage card', () => {
  it('measures photo and thumbnail bytes, the site’s usage of its quota and the persistence (ACC-K7-1, R06.19)', async () => {
    const { db } = await openTestDb();
    const photos = createPhotoRepo(db);
    await photos.put(await storableBlob(3_000), {
      thumb: await storableBlob(300),
      width: 4,
      height: 3,
    });
    await photos.put(await storableBlob(1_200), { width: 4, height: 3 });

    expect(await serviceOver(db).service.measure()).toEqual({
      photoBytes: 4_200,
      thumbBytes: 300,
      estimate: { usage: 1_234_567, quota: 50_000_000 },
      persistence: 'persistent',
    });
    db.close();
  });

  it('gives null for what cannot be measured and unknown for the persistence', async () => {
    const { db } = await openTestDb();
    const { service } = serviceOver(db, {
      photoRepo: {
        ...createPhotoRepo(db),
        usage: () => Promise.reject(new Error('Blocked')),
      },
      storage: {
        estimate: async () => null,
        persistenceStatus: () => Promise.reject(new Error('Gone')),
      },
    });

    expect(await service.measure()).toEqual({
      photoBytes: null,
      thumbBytes: null,
      estimate: null,
      persistence: 'unknown',
    });
    db.close();
  });

  it('clears the cache: thumbnails go, every photo stays', async () => {
    const { db } = await openTestDb();
    const { photoIds } = await seedStore(db);
    const photos = createPhotoRepo(db);

    expect(await serviceOver(db).service.clearCache()).toBe(1);

    expect((await db.photos.toCollection().primaryKeys()).sort()).toEqual([...photoIds].sort());
    expect(await photos.usage()).toEqual({ count: 2, photoBytes: 4_200, thumbBytes: 0 });
    db.close();
  });
});

describe('createYourDataService: Clear diary', () => {
  it('removes every entry and the photos only they used; saved meals, weights, water, fasts, the profile, chat and settings stay (ACC-K5-1)', async () => {
    const { db } = await openTestDb();
    const [meal, side] = (await seedStore(db)).photoIds;
    const before = await storedTables(db);

    expect(await serviceOver(db).service.clearDiary()).toBe(2);

    const after = await storedTables(db);
    expect(after.entries).toEqual([]);
    // The lunch photo is the saved meal's too; the yoghurt's part photo was the entry's alone.
    expect((await db.photos.toCollection().primaryKeys()).sort()).toEqual([meal]);
    expect(side).toBeDefined();
    for (const table of Object.keys(before)) {
      if (table === 'entries' || table === 'photos') continue;
      expect(after[table], table).toEqual(before[table]);
    }
    db.close();
  });

  it('leaves a row it cannot read as it is', async () => {
    const { db } = await openTestDb();
    await seedStore(db);
    await db.entries.put({ id: 'entry-broken', dayKey: '2026-10-20' } as never);

    expect(await serviceOver(db).service.clearDiary()).toBe(2);

    expect(await db.entries.toCollection().primaryKeys()).toEqual(['entry-broken']);
    db.close();
  });

  it('removes nothing when the write fails', async () => {
    const { db } = await openTestDb();
    await seedStore(db);
    const { service } = serviceOver(db, {
      transferRepo: { rewriteDays: () => Promise.reject(new Error('Quota exceeded')) },
    });

    await expect(service.clearDiary()).rejects.toThrow('Quota exceeded');
    expect(await db.entries.count()).toBe(2);
    expect(await db.photos.count()).toBe(2);
    db.close();
  });
});

describe('createYourDataService: Erase everything', () => {
  it('tells the backup, stops the reminders, erases, then starts again, in that order (R06.5, R06.10)', async () => {
    const { db } = await openTestDb();
    const { service, steps } = serviceOver(db);

    expect(await service.eraseEverything()).toEqual({ kind: 'erased' });

    expect(steps).toEqual(['invalidate', 'stop', 'erase', 'restart']);
    db.close();
  });

  it('never offers or records a backup that was being made when everything was erased (R06.5)', async () => {
    const { db } = await openTestDb();
    await seedStore(db);
    const downloads: File[] = [];
    const backup = testBackupService(db, {
      clock: SEED_CLOCK,
      share: { download: (file) => downloads.push(file) },
    });
    // The erase itself is held back here so the stored value can be read afterwards.
    const { service, steps } = serviceOver(db, {
      backup: {
        invalidate: () => {
          steps.push('invalidate');
          backup.invalidate();
        },
      },
    });

    const making = backup.make();
    await service.eraseEverything();
    const made = await making;
    if (!made.ok) throw new Error(`the backup should be made: ${made.error}`);

    expect(await backup.offer(made.value)).toBe('invalidated');
    expect(downloads).toEqual([]);
    const settings = createSettingsRepo(db, { locale: 'en-US' });
    expect(await settings.get('backup.lastAt')).toBe(FACTORY_NOW - 30 * DAY);
    expect(steps[0]).toBe('invalidate');
    db.close();
  });

  it('deletes everything, the nudge’s key too, and another open tab starts again on Welcome (ACC-K6-1)', async () => {
    const [here, there] = twoTabs();
    const mine = await openTestDb({ bus: here });
    const other = await openTestDb({ indexedDB: mine.factory, name: mine.name, bus: there });
    await seedStore(mine.db);
    const otherRestarted = signal();
    closeOnErase(other.db, otherRestarted.fire, there);
    const keys = new Map([
      [BACKUP_QUIET_KEY, String(FACTORY_NOW)],
      ['not-ours', 'x'],
    ]);
    const restart = vi.fn();
    const { service } = serviceOver(mine.db, {
      erase: () =>
        eraseEverything({
          db: mine.db,
          bus: here,
          indexedDB: mine.factory,
          caches: null,
          localStorage: {
            get length() {
              return keys.size;
            },
            key: (index) => [...keys.keys()][index] ?? null,
            removeItem: (key) => void keys.delete(key),
          },
        }),
      restart,
    });

    expect(await service.eraseEverything()).toEqual({ kind: 'erased' });
    await otherRestarted.fired;

    expect(restart).toHaveBeenCalledTimes(1);
    expect(other.db.isOpen()).toBe(false);
    expect([...keys.keys()]).toEqual(['not-ours']);
    const reopened = await openTestDb({ indexedDB: mine.factory, name: mine.name });
    for (const table of TABLE_NAMES) expect(await reopened.db.table(table).count(), table).toBe(0);
    reopened.db.close();
  });

  it('waits for a tab that holds on, then starts again once the delete went through', async () => {
    const { db, factory, name } = await openTestDb();
    const stuck = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const restarted = signal();
    const restart = vi.fn(restarted.fire);
    const { service } = serviceOver(db, {
      erase: () =>
        eraseEverything({
          db,
          indexedDB: factory,
          caches: null,
          localStorage: null,
          wait: () => Promise.resolve(),
        }),
      restart,
    });

    expect(await service.eraseEverything()).toEqual({ kind: 'blocked' });
    expect(restart).not.toHaveBeenCalled();

    stuck.close();
    await restarted.fired;
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('says a refused erase failed and does not start again by itself', async () => {
    const { db } = await openTestDb();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, steps } = serviceOver(db, {
      erase: async () => ({ status: 'failed', cause: new Error('Refused') }),
    });

    expect(await service.eraseEverything()).toEqual({ kind: 'failed' });

    expect(steps).toEqual(['invalidate', 'stop']);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    db.close();
  });

  it('erases once when asked twice', async () => {
    const { db } = await openTestDb();
    const { service, steps } = serviceOver(db);

    await Promise.all([service.eraseEverything(), service.eraseEverything()]);

    expect(steps).toEqual(['invalidate', 'stop', 'erase', 'restart']);
    db.close();
  });
});
