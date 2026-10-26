import { describe, expect, it, vi } from 'vitest';
import type { PlatewiseDb } from '../data/db';
import { withIdSequence } from '../lib/ids';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, factories } from '../test/factories';
import { createDiaryService, type DiaryServiceDeps, type LogContext } from './diary';

const make = factories();
const HOUR = 3_600_000;

/** Logged at 12:30 in New York, under lunch, typed by hand. */
const lunch: LogContext = { loggedAt: FACTORY_NOW, meal: 'lunch', source: 'manual' };

function service(db: PlatewiseDb, deps: Partial<DiaryServiceDeps> = {}) {
  return createDiaryService({ db, ids: withIdSequence('logged'), ...deps });
}

/** Makes every entry write fail, as a full disk would; returns the undo. */
function failEntryWrites(db: PlatewiseDb): () => void {
  const diskFull = () => {
    throw new Error('disk full');
  };
  db.entries.hook('creating', diskFull);
  return () => db.entries.hook('creating').unsubscribe(diskFull);
}

describe('logEntry: one log at a time (R02.11)', () => {
  it('writes one entry for two rapid calls; the second answers busy (ACC-D26-1, R02.11)', async () => {
    const db = await openTestDb();
    const diary = service(db);
    const toast = make.draft({ name: 'Toast', kcal: 250 });

    const first = diary.logEntry(toast, lunch);
    const second = diary.logEntry(toast, lunch);

    expect(await second).toEqual({ kind: 'busy' });
    expect(await first).toMatchObject({ kind: 'logged', entry: { id: 'logged-1', name: 'Toast' } });
    expect(await db.entries.count()).toBe(1);
  });

  it('logs again once the first log has finished', async () => {
    const db = await openTestDb();
    const diary = service(db);

    expect((await diary.logEntry(make.draft(), lunch)).kind).toBe('logged');
    expect((await diary.logEntry(make.draft({ name: 'Bread' }), lunch)).kind).toBe('logged');
    expect((await db.entries.toArray()).map((entry) => entry.name).sort()).toEqual([
      'Bread',
      'Lentil soup',
    ]);
  });

  it('opens again after a failed write, which rejects and writes nothing', async () => {
    const db = await openTestDb();
    const diary = service(db);
    const undo = failEntryWrites(db);

    await expect(diary.logEntry(make.draft(), lunch)).rejects.toThrow('disk full');
    expect(await db.entries.count()).toBe(0);

    undo();
    expect((await diary.logEntry(make.draft(), lunch)).kind).toBe('logged');
    expect(await db.entries.count()).toBe(1);
  });

  it('gives deleting a gate of its own: a delete goes ahead while a log is in flight', async () => {
    const db = await openTestDb();
    const old = make.entry({ name: 'Old toast' });
    await db.entries.put(old);
    const diary = service(db);

    const logging = diary.logEntry(make.draft(), lunch);
    const deleting = diary.deleteEntry(old.id);

    expect(await deleting).toBe('deleted');
    expect((await logging).kind).toBe('logged');
    expect((await db.entries.toArray()).map((entry) => entry.name)).toEqual(['Lentil soup']);
  });

  it('runs two deletes of one row once, and deletes of two rows both', async () => {
    const db = await openTestDb();
    const [soup, bread] = [make.entry(), make.entry({ name: 'Bread' })];
    await db.entries.bulkPut([soup, bread]);
    const diary = service(db);

    const outcomes = await Promise.all([
      diary.deleteEntry(soup.id),
      diary.deleteEntry(soup.id),
      diary.deleteEntry(bread.id),
    ]);

    expect(outcomes).toEqual(['deleted', 'busy', 'deleted']);
    expect(await db.entries.count()).toBe(0);
  });
});

describe('logEntry: the entry it builds', () => {
  it('stores a new id, the day of its time, whole kcal and the macros unrounded', async () => {
    const db = await openTestDb();
    const diary = service(db);
    const draft = make.draft({
      name: 'Flat white',
      kcal: 119.6,
      protein: 6.25,
      carbs: 9.375,
      fat: 6.125,
      nutrients: { fibre: 0.4, calcium: 220 },
    });
    // 23:30 on 26 October in New York is already 27 October in UTC.
    const late: LogContext = {
      loggedAt: Date.UTC(2026, 9, 27, 3, 30),
      meal: 'snack',
      source: 'photo',
      photoIds: ['photo-a', 'photo-b'],
    };

    const outcome = await diary.logEntry(draft, late);

    const expected = {
      ...draft,
      kcal: 120,
      id: 'logged-1',
      loggedAt: late.loggedAt,
      dayKey: '2026-10-26',
      meal: 'snack',
      source: 'photo',
      photoIds: ['photo-a', 'photo-b'],
    };
    expect(outcome).toEqual({ kind: 'logged', entry: expected });
    expect(await db.entries.get('logged-1')).toEqual(expected);
  });

  it('keeps only the food values of what it is given, and a fresh id', async () => {
    const db = await openTestDb();
    const diary = service(db);
    const saved = make.savedMeal({ name: 'Usual breakfast', originEntryId: 'entry-9' });

    const outcome = await diary.logEntry(saved, { ...lunch, meal: 'breakfast' });

    expect(outcome).toMatchObject({ kind: 'logged', entry: { id: 'logged-1' } });
    const stored = await db.entries.get('logged-1');
    expect(stored).toMatchObject({ name: 'Usual breakfast', meal: 'breakfast', photoIds: [] });
    expect(stored).not.toHaveProperty('order');
    expect(stored).not.toHaveProperty('originEntryId');
    expect(await db.entries.get(saved.id)).toBeUndefined();
  });
});

describe('logEntry during a fast (R02.12, D-16.35)', () => {
  it('answers fastActive with the running fast and writes nothing', async () => {
    const db = await openTestDb();
    const fast = make.fast({ start: FACTORY_NOW - 10 * HOUR, end: null });
    await db.fasts.put(fast);
    const diary = service(db);

    expect(await diary.logEntry(make.draft(), lunch)).toEqual({
      kind: 'fastActive',
      fastId: fast.id,
    });
    expect(await db.entries.count()).toBe(0);

    // The gate is open again: once the fast ends, the same log goes through.
    await db.fasts.put({ ...fast, end: FACTORY_NOW });
    expect((await diary.logEntry(make.draft(), lunch)).kind).toBe('logged');
  });
});

describe('deleteEntry', () => {
  it('deletes the entry and releases a photo only it used, keeping one a saved meal shares (R02.8)', async () => {
    const db = await openTestDb();
    const [own, shared] = [make.photo(), make.photo()];
    await db.photos.bulkPut([own, shared]);
    const entry = make.entry({ photoIds: [own.id, shared.id] });
    await db.entries.put(entry);
    await db.savedMeals.put(make.savedMeal({ photoIds: [shared.id] }));
    const diary = service(db);

    expect(await diary.deleteEntry(entry.id)).toBe('deleted');

    expect(await db.entries.get(entry.id)).toBeUndefined();
    expect(await db.photos.get(own.id)).toBeUndefined();
    expect(await db.photos.get(shared.id)).toBeDefined();
  });

  it('answers missing for an entry that is not there', async () => {
    const db = await openTestDb();
    expect(await service(db).deleteEntry('entry-gone')).toBe('missing');
  });
});

describe('asking to keep storage after the first entry (D-16.8)', () => {
  it('calls the hook once, after the first successful log only', async () => {
    const db = await openTestDb();
    const fast = make.fast({ end: null });
    await db.fasts.put(fast);
    const hook = vi.fn();
    const diary = service(db, { requestPersistenceAfterFirstEntry: hook });

    await diary.logEntry(make.draft(), lunch);
    expect(hook).not.toHaveBeenCalled();

    await db.fasts.put({ ...fast, end: FACTORY_NOW });
    await diary.logEntry(make.draft(), lunch);
    expect(hook).toHaveBeenCalledTimes(1);

    await diary.logEntry(make.draft(), lunch);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('logs anyway when the hook throws, rejects or never answers', async () => {
    const db = await openTestDb();
    const hooks = [
      () => {
        throw new Error('no storage manager');
      },
      () => Promise.reject(new Error('refused')),
      () => new Promise<never>(() => {}),
    ];
    for (const [index, hook] of hooks.entries()) {
      const diary = service(db, {
        ids: withIdSequence(`hook-${index}`),
        requestPersistenceAfterFirstEntry: hook,
      });
      expect((await diary.logEntry(make.draft(), lunch)).kind).toBe('logged');
    }
    expect(await db.entries.count()).toBe(3);
  });
});
