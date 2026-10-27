import { afterEach, describe, expect, it } from 'vitest';
import { createDiaryRepo, type DiaryRepo } from '../data/repos/diaryRepo';
import { createFastRepo } from '../data/repos/fastRepo';
import { createPhotoRepo } from '../data/repos/photoRepo';
import type { PlatewiseDb } from '../data/schema';
import type { DiaryEntry } from '../domain/model';
import { withIdSequence } from '../lib/ids';
import { storableBlob } from '../test/blobs';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeEntry, makeLine } from '../test/factories';
import { createCombineService, inEatingOrder, type CombineWords } from './combine';

const HOUR = 60 * 60 * 1000;
const TODAY = '2026-10-26';
const WORDS: CombineWords = {
  fallbackName: 'Plate',
  more: (count) => `${count} others`,
};

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setUp(diaryOverride?: (real: DiaryRepo) => Pick<DiaryRepo, 'combine'>) {
  const { db } = await openTestDb();
  opened.push(db);
  const diaryRepo = createDiaryRepo(db, { newId: withIdSequence('combined') });
  const photoRepo = createPhotoRepo(db);
  const service = createCombineService({
    diaryRepo: diaryOverride ? diaryOverride(diaryRepo) : diaryRepo,
    photoRepo,
    words: WORDS,
  });
  return { db, diaryRepo, photoRepo, service };
}

/** Toast at 08:00 (breakfast), eggs at 08:10 (breakfast) and tea at 09:30 (snack), today. */
async function morning(diaryRepo: DiaryRepo, sodium: [number?, number?, number?] = []) {
  const at = (time: string) => Date.parse(`${TODAY}T${time}:00-04:00`);
  const nutrients = (value?: number) => (value === undefined ? {} : { sodium: value });
  return diaryRepo.addMany([
    makeEntry({
      id: 'toast',
      name: 'Toast',
      kcal: 250,
      protein: 8,
      carbs: 40,
      fat: 5,
      meal: 'breakfast',
      loggedAt: at('08:00'),
      basis: { kind: 'grams', grams: 80 },
      nutrients: nutrients(sodium[0]),
    }),
    makeEntry({
      id: 'eggs',
      name: 'Eggs',
      kcal: 155,
      protein: 13,
      carbs: 1,
      fat: 11,
      meal: 'breakfast',
      loggedAt: at('08:10'),
      basis: { kind: 'grams', grams: 110 },
      nutrients: nutrients(sodium[1]),
    }),
    makeEntry({
      id: 'tea',
      name: 'Tea',
      kcal: 30,
      protein: 1,
      carbs: 4,
      fat: 1,
      meal: 'snack',
      loggedAt: at('09:30'),
      basis: { kind: 'grams', grams: 250 },
      nutrients: nutrients(sodium[2]),
    }),
  ]);
}

describe('combine', () => {
  it('replaces three entries by one named "Toast + Eggs + Tea" at the latest time, in one write (ACC-D15-1, R02.24)', async () => {
    const { diaryRepo, service } = await setUp();
    const [toast, eggs, tea] = await morning(diaryRepo);
    if (!toast || !eggs || !tea) throw new Error('three entries were added');

    const result = await service.combine([tea, toast, eggs]);

    expect(result).toMatchObject({ kind: 'combined', entry: { id: 'combined-1' } });
    const stored = await diaryRepo.byDay(TODAY);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: 'combined-1',
      name: 'Toast + Eggs + Tea',
      kcal: 435,
      protein: 22,
      carbs: 45,
      fat: 17,
      loggedAt: tea.loggedAt,
      meal: 'snack',
      source: 'manual',
      basis: { kind: 'grams', grams: 440 },
    });
    expect(stored[0]?.lines.map((line) => line.name)).toEqual(['Toast', 'Eggs', 'Tea']);
    if (result.kind === 'combined') expect(result.entry).toEqual(stored[0]);
  });

  it('sums sodium only when all three entries know it (D-16.20, R02.9)', async () => {
    const all = await setUp();
    await morning(all.diaryRepo, [400, 120, 5]);
    await all.service.combine(await all.diaryRepo.byDay(TODAY));
    const [summed] = await all.diaryRepo.byDay(TODAY);
    expect(summed?.nutrients.sodium).toBe(525);

    const some = await setUp();
    await morning(some.diaryRepo, [400, undefined, 5]);
    await some.service.combine(await some.diaryRepo.byDay(TODAY));
    const [unknown] = await some.diaryRepo.byDay(TODAY);
    expect(unknown?.name).toBe('Toast + Eggs + Tea');
    expect(unknown?.nutrients).not.toHaveProperty('sodium');
  });

  it('changes nothing while a fast runs, and says so (R02.12)', async () => {
    const { db, diaryRepo, service } = await setUp();
    const entries = await morning(diaryRepo);
    const started = await createFastRepo(db).start(960, FACTORY_NOW - HOUR);
    expect(started.ok).toBe(true);

    const result = await service.combine(entries);

    expect(result).toMatchObject({ kind: 'fastActive', fast: { end: null } });
    expect(await diaryRepo.byDay(TODAY)).toEqual([...entries].reverse());
  });

  it('writes nothing when one of the entries was deleted meanwhile', async () => {
    const { diaryRepo, service } = await setUp();
    const entries = await morning(diaryRepo);
    await diaryRepo.remove('eggs');

    expect(await service.combine(entries)).toEqual({ kind: 'missing' });
    expect((await diaryRepo.byDay(TODAY)).map((entry) => entry.id)).toEqual(['tea', 'toast']);
  });

  it('needs two different entries: one, or one given twice, writes nothing', async () => {
    const { diaryRepo, service } = await setUp();
    const [toast] = await morning(diaryRepo);
    if (!toast) throw new Error('an entry was added');

    expect(await service.combine([toast])).toEqual({ kind: 'tooFew' });
    expect(await service.combine([toast, toast])).toEqual({ kind: 'tooFew' });
    expect(await service.combine([])).toEqual({ kind: 'tooFew' });
    expect(await diaryRepo.count()).toBe(3);
  });

  it('keeps every photo of the originals on the combined entry, and deletes none', async () => {
    const { db, diaryRepo, photoRepo, service } = await setUp();
    const first = await photoRepo.put(await storableBlob(64), { width: 4, height: 3 });
    const second = await photoRepo.put(await storableBlob(64, 9), { width: 4, height: 3 });
    const entries = await diaryRepo.addMany([
      makeEntry({ name: 'Rice', loggedAt: FACTORY_NOW - HOUR, photoIds: [first] }),
      makeEntry({ name: 'Dal', lines: [makeLine({ photoIds: [second] })] }),
    ]);

    await service.combine(entries);

    const [combined] = await diaryRepo.byDay(TODAY);
    expect(combined?.photoIds).toEqual([first, second]);
    expect(await db.photos.count()).toBe(2);
  });

  it('ignores a second combine while the first is still being written', async () => {
    const { diaryRepo, service } = await setUp();
    const entries = await morning(diaryRepo);

    const [first, second] = await Promise.all([service.combine(entries), service.combine(entries)]);

    expect(first.kind).toBe('combined');
    expect(second).toEqual({ kind: 'ignored' });
    expect(await diaryRepo.count()).toBe(1);
  });

  it('passes a storage failure on, and the next combine may try again', async () => {
    let fail = true;
    const { diaryRepo, service } = await setUp((real) => ({
      combine: (entry, ids) => {
        if (!fail) return real.combine(entry, ids);
        fail = false;
        return Promise.reject(new Error('disk full'));
      },
    }));
    const entries = await morning(diaryRepo);

    await expect(service.combine(entries)).rejects.toThrow('disk full');
    expect(await diaryRepo.count()).toBe(3);
    expect((await service.combine(entries)).kind).toBe('combined');
    expect(await diaryRepo.count()).toBe(1);
  });
});

describe('inEatingOrder', () => {
  it('puts the entries oldest first, keeps the given order for equal times and drops repeats', () => {
    const late = makeEntry({ id: 'late', loggedAt: 3_000 });
    const early = makeEntry({ id: 'early', loggedAt: 1_000 });
    const sameA = makeEntry({ id: 'a', loggedAt: 2_000 });
    const sameB = makeEntry({ id: 'b', loggedAt: 2_000 });
    const ids = (entries: readonly DiaryEntry[]) => entries.map((entry) => entry.id);

    expect(ids(inEatingOrder([late, sameB, early, sameA, late]))).toEqual([
      'early',
      'b',
      'a',
      'late',
    ]);
  });
});
