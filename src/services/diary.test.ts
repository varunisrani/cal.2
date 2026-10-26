import { describe, expect, it, vi } from 'vitest';
import { FastActiveError, createDiaryRepo, type DiaryRepo } from '../data/repos/diaryRepo';
import { createFastRepo } from '../data/repos/fastRepo';
import { createPhotoRepo, type PhotoRepo } from '../data/repos/photoRepo';
import type { PlatewiseDb } from '../data/schema';
import type { DiaryEntry } from '../domain/model';
import { withIdSequence } from '../lib/ids';
import { storableBlob } from '../test/blobs';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeDraft, makeEntry, makeFast } from '../test/factories';
import { createDiaryService, type DiaryServiceDeps, type LogContext } from './diary';

const LUNCH: LogContext = { loggedAt: FACTORY_NOW, meal: 'lunch', source: 'manual' };

async function setUp(extra: Partial<DiaryServiceDeps> = {}) {
  const { db } = await openTestDb();
  const diaryRepo = createDiaryRepo(db);
  const photoRepo = createPhotoRepo(db, { newId: withIdSequence('photo') });
  const service = createDiaryService({
    diaryRepo,
    photoRepo,
    newId: withIdSequence('entry'),
    ...extra,
  });
  return { db, diaryRepo, photoRepo, service };
}

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Stores `count` small photos and returns their ids. */
async function storePhotos(photos: PhotoRepo, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    ids.push(await photos.put(await storableBlob(16, index), { width: 4, height: 3 }));
  }
  return ids;
}

async function storedPhotoIds(db: PlatewiseDb): Promise<string[]> {
  return (await db.photos.toCollection().primaryKeys()).sort();
}

/** A diary repository whose writes wait for the test. */
function heldDiary() {
  const adds: Array<ReturnType<typeof deferred<DiaryEntry>>> = [];
  const removes: Array<{ id: string; done: ReturnType<typeof deferred<string[]>> }> = [];
  const repo: Pick<DiaryRepo, 'add' | 'remove'> = {
    add: vi.fn(() => {
      const held = deferred<DiaryEntry>();
      adds.push(held);
      return held.promise;
    }),
    remove: vi.fn((id: string) => {
      const done = deferred<string[]>();
      removes.push({ id, done });
      return done.promise;
    }),
  };
  return { repo, adds, removes };
}

const noPhotos: Pick<PhotoRepo, 'releaseIfUnused'> = {
  releaseIfUnused: vi.fn(async () => []),
};

describe('logEntry', () => {
  it('builds the entry with a new id, its local day, whole kcal and the other values as given', async () => {
    const { diaryRepo, service } = await setUp();
    const draft = makeDraft({
      name: 'Toast',
      kcal: 250.6,
      protein: 7.25,
      carbs: 31.333,
      fat: 9.05,
      nutrients: { fibre: 2.45 },
    });

    const result = await service.logEntry(draft, { ...LUNCH, meal: 'breakfast' });

    const expected: DiaryEntry = {
      ...draft,
      kcal: 251,
      id: 'entry-1',
      loggedAt: FACTORY_NOW,
      dayKey: '2026-10-26',
      meal: 'breakfast',
      source: 'manual',
      photoIds: [],
    };
    expect(result).toEqual({ kind: 'logged', entry: expected });
    expect(await diaryRepo.byDay('2026-10-26')).toEqual([expected]);
  });

  it('keeps the photos it is given, primary first', async () => {
    const { service } = await setUp();
    const result = await service.logEntry(makeDraft(), {
      ...LUNCH,
      source: 'photo',
      photoIds: ['photo-b', 'photo-a'],
    });
    expect(result.kind === 'logged' && result.entry.photoIds).toEqual(['photo-b', 'photo-a']);
  });

  it('files an entry at 23:59 and one at 00:01 under their own days', async () => {
    const { diaryRepo, service } = await setUp();
    const late = Date.parse('2026-10-26T23:59:00-04:00');
    const early = Date.parse('2026-10-27T00:01:00-04:00');
    await service.logEntry(makeDraft({ name: 'Late tea' }), { ...LUNCH, loggedAt: late });
    await service.logEntry(makeDraft({ name: 'Early toast' }), { ...LUNCH, loggedAt: early });
    expect((await diaryRepo.byDay('2026-10-26')).map((entry) => entry.name)).toEqual(['Late tea']);
    expect((await diaryRepo.byDay('2026-10-27')).map((entry) => entry.name)).toEqual([
      'Early toast',
    ]);
  });

  it('writes one entry for two rapid calls (R02.11, ACC-D26-1)', async () => {
    const { diaryRepo, service } = await setUp();
    const draft = makeDraft({ name: 'Toast', kcal: 250 });

    // A double tap: the second call arrives before the first write has finished.
    const results = await Promise.all([
      service.logEntry(draft, LUNCH),
      service.logEntry(draft, LUNCH),
    ]);

    expect(results.map((result) => result.kind)).toEqual(['logged', 'ignored']);
    expect(await diaryRepo.count()).toBe(1);
  });

  it('opens the gate again once the first log has finished', async () => {
    const held = heldDiary();
    const service = createDiaryService({ diaryRepo: held.repo, photoRepo: noPhotos });

    const first = service.logEntry(makeDraft(), LUNCH);
    expect(await service.logEntry(makeDraft(), LUNCH)).toEqual({ kind: 'ignored' });
    const entry = makeEntry();
    held.adds[0]!.resolve(entry);
    expect(await first).toEqual({ kind: 'logged', entry });

    const second = service.logEntry(makeDraft(), LUNCH);
    held.adds[1]!.resolve(entry);
    expect((await second).kind).toBe('logged');
    expect(held.repo.add).toHaveBeenCalledTimes(2);
  });

  it('passes a storage failure on and opens the gate again', async () => {
    const held = heldDiary();
    const service = createDiaryService({ diaryRepo: held.repo, photoRepo: noPhotos });

    const failing = service.logEntry(makeDraft(), LUNCH);
    held.adds[0]!.reject(new Error('The disk is full'));
    await expect(failing).rejects.toThrow('The disk is full');

    const retry = service.logEntry(makeDraft(), LUNCH);
    held.adds[1]!.resolve(makeEntry());
    expect((await retry).kind).toBe('logged');
  });

  it('answers fastActive with the running fast and writes nothing (R02.12)', async () => {
    const { db, diaryRepo, service } = await setUp();
    const fasts = createFastRepo(db);
    const started = await fasts.start(960, FACTORY_NOW - 3_600_000);
    if (!started.ok) throw new Error('the fast should start');

    const result = await service.logEntry(makeDraft(), LUNCH);

    expect(result).toEqual({ kind: 'fastActive', fast: started.value });
    expect(await diaryRepo.count()).toBe(0);
    // The gate is open again: once the fast ends, food goes in.
    await fasts.end(started.value.id, FACTORY_NOW);
    expect((await service.logEntry(makeDraft(), LUNCH)).kind).toBe('logged');
  });

  it('turns only the fast refusal into an answer', async () => {
    const fast = makeFast({ end: null });
    const refusing: Pick<DiaryRepo, 'add' | 'remove'> = {
      add: async () => {
        throw new FastActiveError(fast);
      },
      remove: async () => [],
    };
    const service = createDiaryService({ diaryRepo: refusing, photoRepo: noPhotos });
    expect(await service.logEntry(makeDraft(), LUNCH)).toEqual({ kind: 'fastActive', fast });
  });
});

describe('deleteEntry', () => {
  it('removes the entry and deletes only the photos nothing else uses', async () => {
    const { db, diaryRepo, photoRepo, service } = await setUp();
    const [own, shared] = await storePhotos(photoRepo, 2);
    const logged = await service.logEntry(makeDraft({ name: 'Soup' }), {
      ...LUNCH,
      source: 'photo',
      photoIds: [own!, shared!],
    });
    await diaryRepo.add(makeEntry({ name: 'Soup again', photoIds: [shared!] }));
    if (logged.kind !== 'logged') throw new Error('the entry should be logged');

    const result = await service.deleteEntry(logged.entry.id);

    expect(result).toEqual({ kind: 'deleted', releasedPhotoIds: [own] });
    expect((await diaryRepo.byDay('2026-10-26')).map((entry) => entry.name)).toEqual([
      'Soup again',
    ]);
    expect(await storedPhotoIds(db)).toEqual([shared]);
  });

  it('releases nothing for an entry that is already gone', async () => {
    const { db, photoRepo, service } = await setUp();
    await storePhotos(photoRepo, 1);
    expect(await service.deleteEntry('entry-gone')).toEqual({
      kind: 'deleted',
      releasedPhotoIds: [],
    });
    expect(await storedPhotoIds(db)).toEqual(['photo-1']);
  });

  it('keeps the delete when the photo cleanup fails', async () => {
    const failingPhotos: Pick<PhotoRepo, 'releaseIfUnused'> = {
      releaseIfUnused: async () => {
        throw new Error('The photo store is busy');
      },
    };
    const removing: Pick<DiaryRepo, 'add' | 'remove'> = {
      add: async (entry) => entry,
      remove: async () => ['photo-1'],
    };
    const service = createDiaryService({ diaryRepo: removing, photoRepo: failingPhotos });
    expect(await service.deleteEntry('entry-1')).toEqual({
      kind: 'deleted',
      releasedPhotoIds: [],
    });
  });

  it('ignores a repeat delete of the same entry while it runs, but not another entry', async () => {
    const held = heldDiary();
    const service = createDiaryService({ diaryRepo: held.repo, photoRepo: noPhotos });

    const first = service.deleteEntry('entry-1');
    const repeat = service.deleteEntry('entry-1');
    const other = service.deleteEntry('entry-2');
    for (const { done } of held.removes) done.resolve([]);

    expect(await repeat).toEqual({ kind: 'ignored' });
    expect(await first).toEqual({ kind: 'deleted', releasedPhotoIds: [] });
    expect(await other).toEqual({ kind: 'deleted', releasedPhotoIds: [] });
    expect(held.removes.map((call) => call.id)).toEqual(['entry-1', 'entry-2']);
  });
});

describe('first entry hook', () => {
  it('calls the hook once, after the first successful log (D-16.8)', async () => {
    const onFirstEntry = vi.fn();
    const { diaryRepo, service } = await setUp({ onFirstEntry });

    expect(onFirstEntry).not.toHaveBeenCalled();
    await service.logEntry(makeDraft(), LUNCH);
    expect(onFirstEntry).toHaveBeenCalledTimes(1);
    expect(await diaryRepo.count()).toBe(1);

    await service.logEntry(makeDraft(), LUNCH);
    expect(onFirstEntry).toHaveBeenCalledTimes(1);
  });

  it('does not call it for a refused or failed log', async () => {
    const onFirstEntry = vi.fn();
    const { db, service } = await setUp({ onFirstEntry, newId: () => 'entry-same' });
    const fasts = createFastRepo(db);
    const started = await fasts.start(960, FACTORY_NOW - 3_600_000);
    if (!started.ok) throw new Error('the fast should start');

    expect((await service.logEntry(makeDraft(), LUNCH)).kind).toBe('fastActive');
    await fasts.end(started.value.id, FACTORY_NOW);
    await db.entries.add(makeEntry({ id: 'entry-same' }));
    // The id is taken, so the add fails.
    await expect(service.logEntry(makeDraft(), LUNCH)).rejects.toThrow();
    expect(onFirstEntry).not.toHaveBeenCalled();
  });

  it('keeps the log when the hook fails', async () => {
    const throwing = vi.fn(() => {
      throw new Error('No storage manager');
    });
    const first = await setUp({ onFirstEntry: throwing });
    expect((await first.service.logEntry(makeDraft(), LUNCH)).kind).toBe('logged');
    expect(throwing).toHaveBeenCalledTimes(1);

    const rejecting = vi.fn(() => Promise.reject(new Error('Refused')));
    const second = await setUp({ onFirstEntry: rejecting });
    expect((await second.service.logEntry(makeDraft(), LUNCH)).kind).toBe('logged');
    expect(rejecting).toHaveBeenCalledTimes(1);
  });
});
