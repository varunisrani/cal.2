import { describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../lib/clock';
import { openTestDb, type TestDb } from '../test/db';
import { FACTORY_NOW } from '../test/factories';
import { createSettingsRepo, type SettingsRepo } from './repos/settingsRepo';
import { createStorageAccess, type StorageManagerLike } from './storage';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

/** A settings repository the way boot makes one, with its first read finished. */
async function settingsOn({ db, bus }: TestDb): Promise<SettingsRepo> {
  const settings = createSettingsRepo(db, { locale: 'en-US', clock, bus });
  await settings.loaded;
  return settings;
}

/** A browser storage manager that grants (or refuses) persistence when asked. */
function fakeStorage(grant: boolean) {
  let persisted = false;
  const storage = {
    persist: vi.fn(async () => {
      persisted = grant;
      return grant;
    }),
    persisted: vi.fn(async () => persisted),
    estimate: vi.fn(async () => ({ usage: 1_234_567, quota: 50_000_000 })),
  };
  return storage satisfies StorageManagerLike;
}

describe('requestPersistence (R06.19, D-16.8)', () => {
  it('asks the browser once even when asked twice, and shows the answer', async () => {
    const opened = await openTestDb();
    const settings = await settingsOn(opened);
    const storage = fakeStorage(true);
    const access = createStorageAccess({ settings, storage });

    expect(await access.persistenceStatus()).toBe('best-effort');
    expect(await access.requestPersistence()).toBe('persistent');
    expect(await access.requestPersistence()).toBe('persistent');
    expect(storage.persist).toHaveBeenCalledTimes(1);
    expect(await access.persistenceStatus()).toBe('persistent');
    expect(await settings.get('storage.persistAsked')).toBe(true);
    opened.db.close();
  });

  it('asks once when two calls overlap, and both get the answer', async () => {
    const opened = await openTestDb();
    const storage = fakeStorage(true);
    const access = createStorageAccess({ settings: await settingsOn(opened), storage });

    expect(await Promise.all([access.requestPersistence(), access.requestPersistence()])).toEqual([
      'persistent',
      'persistent',
    ]);
    expect(storage.persist).toHaveBeenCalledTimes(1);
    opened.db.close();
  });

  it('does not ask again after a reload or from another tab', async () => {
    const opened = await openTestDb();
    const storage = fakeStorage(false);
    const first = createStorageAccess({ settings: await settingsOn(opened), storage });
    expect(await first.requestPersistence()).toBe('best-effort');

    const otherTab = await openTestDb({ indexedDB: opened.factory, name: opened.name });
    const second = createStorageAccess({ settings: await settingsOn(otherTab), storage });
    expect(await second.requestPersistence()).toBe('best-effort');
    expect(storage.persist).toHaveBeenCalledTimes(1);
    otherTab.db.close();
    opened.db.close();
  });

  it('keeps the answer for the status when the browser cannot be asked later', async () => {
    const opened = await openTestDb();
    const persist = vi.fn(async () => true);
    const access = createStorageAccess({
      settings: await settingsOn(opened),
      storage: { persist },
    });

    expect(await access.persistenceStatus()).toBe('unknown');
    expect(await access.requestPersistence()).toBe('persistent');
    expect(await access.persistenceStatus()).toBe('persistent');
    opened.db.close();
  });

  it('records nothing when the browser fails to answer, so a later call asks again', async () => {
    const opened = await openTestDb();
    const settings = await settingsOn(opened);
    const persist = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new DOMException('Not now', 'InvalidStateError'))
      .mockResolvedValueOnce(true);
    const access = createStorageAccess({ settings, storage: { persist } });

    expect(await access.requestPersistence()).toBe('unknown');
    expect(await settings.get('storage.persistAsked')).toBe(false);
    expect(await access.requestPersistence()).toBe('persistent');
    expect(persist).toHaveBeenCalledTimes(2);
    opened.db.close();
  });

  it('gives status unknown without navigator.storage, and never throws', async () => {
    const opened = await openTestDb();
    const settings = await settingsOn(opened);
    // jsdom has no navigator.storage, like a browser without the Storage API.
    expect((navigator as { storage?: unknown }).storage).toBeUndefined();

    for (const access of [
      createStorageAccess({ settings }),
      createStorageAccess({ settings, storage: null }),
      createStorageAccess({ settings, storage: {} }),
    ]) {
      expect(await access.requestPersistence()).toBe('unknown');
      expect(await access.persistenceStatus()).toBe('unknown');
      expect(await access.estimate()).toBeNull();
    }
    expect(await settings.get('storage.persistAsked')).toBe(false);
    opened.db.close();
  });

  it('reads the browser status even when it was never asked here', async () => {
    const opened = await openTestDb();
    const persisted = vi.fn(async () => true);
    const access = createStorageAccess({
      settings: await settingsOn(opened),
      storage: { persisted },
    });
    expect(await access.persistenceStatus()).toBe('persistent');
    opened.db.close();
  });
});

describe('estimate', () => {
  it('returns usage and quota', async () => {
    const opened = await openTestDb();
    const access = createStorageAccess({
      settings: await settingsOn(opened),
      storage: fakeStorage(true),
    });
    expect(await access.estimate()).toEqual({ usage: 1_234_567, quota: 50_000_000 });
    opened.db.close();
  });

  it('returns null when the browser leaves out a number or fails', async () => {
    const opened = await openTestDb();
    const settings = await settingsOn(opened);
    const partial = createStorageAccess({
      settings,
      storage: { estimate: async () => ({ usage: 10 }) },
    });
    const failing = createStorageAccess({
      settings,
      storage: {
        estimate: () => Promise.reject(new DOMException('Denied', 'SecurityError')),
      },
    });
    expect(await partial.estimate()).toBeNull();
    expect(await failing.estimate()).toBeNull();
    opened.db.close();
  });
});
