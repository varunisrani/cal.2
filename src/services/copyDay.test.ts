import { afterEach, describe, expect, it } from 'vitest';
import { createDiaryRepo, type DiaryRepo } from '../data/repos/diaryRepo';
import { createFastRepo } from '../data/repos/fastRepo';
import { createPhotoRepo } from '../data/repos/photoRepo';
import type { PlatewiseDb } from '../data/schema';
import { fixedClock } from '../lib/clock';
import { withIdSequence } from '../lib/ids';
import { storableBlob } from '../test/blobs';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeEntry, makeLine, makeProduct } from '../test/factories';
import { createCopyDayService } from './copyDay';
import { createDiaryService } from './diary';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Monday 26 October 2026, 12:30 in New York (the test zone). */
const NOW = FACTORY_NOW;
const TODAY = '2026-10-26';
const YESTERDAY = '2026-10-25';

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setUp(now = NOW) {
  const { db } = await openTestDb();
  opened.push(db);
  const diaryRepo = createDiaryRepo(db);
  const service = createCopyDayService({
    diaryRepo,
    clock: fixedClock(now, 'America/New_York'),
    newId: withIdSequence('copy'),
  });
  return { db, diaryRepo, service };
}

/** Yesterday's breakfast, lunch and dinner. */
async function yesterday(diaryRepo: DiaryRepo) {
  const day = Date.parse('2026-10-25T00:00:00-04:00');
  return diaryRepo.addMany([
    makeEntry({ id: 'b', name: 'Porridge', meal: 'breakfast', loggedAt: day + 8 * HOUR }),
    makeEntry({ id: 'l', name: 'Lentil soup', meal: 'lunch', loggedAt: day + 13 * HOUR }),
    makeEntry({ id: 'd', name: 'Pasta', meal: 'dinner', loggedAt: day + 19 * HOUR }),
  ]);
}

describe('copy', () => {
  it('copies yesterday onto today with new ids at the clock time, meals kept and yesterday unchanged (ACC-D18-1)', async () => {
    const { diaryRepo, service } = await setUp();
    const originals = await yesterday(diaryRepo);

    const result = await service.copy(originals, TODAY);

    expect(result.kind).toBe('copied');
    const copied = await diaryRepo.byDay(TODAY);
    expect(copied.map((entry) => [entry.id, entry.name, entry.meal, entry.dayKey])).toEqual([
      ['copy-1', 'Pasta', 'dinner', TODAY],
      ['copy-2', 'Lentil soup', 'lunch', TODAY],
      ['copy-3', 'Porridge', 'breakfast', TODAY],
    ]);
    // The newest original takes the clock time; older ones a millisecond less each, in order.
    expect(copied.map((entry) => entry.loggedAt)).toEqual([NOW, NOW - 1, NOW - 2]);
    expect(await diaryRepo.byDay(YESTERDAY)).toEqual([...originals].reverse());
  });

  it("copies one meal group only, still under that meal at the evening's clock time (D-16.50)", async () => {
    const evening = Date.parse('2026-10-26T20:00:00-04:00');
    const { diaryRepo, service } = await setUp(evening);
    const originals = await yesterday(diaryRepo);
    const breakfast = originals.filter((entry) => entry.meal === 'breakfast');

    await service.copy(breakfast, TODAY);

    expect(await diaryRepo.byDay(TODAY)).toEqual([
      { ...breakfast[0], id: 'copy-1', loggedAt: evening, dayKey: TODAY },
    ]);
  });

  it('keeps everything else of the entry: source, values, units, note, lines and product', async () => {
    const { diaryRepo, service } = await setUp();
    const [original] = await diaryRepo.addMany([
      makeEntry({
        loggedAt: NOW - DAY,
        source: 'barcode',
        note: 'no sugar',
        lines: [makeLine({ photoIds: ['line-photo'] })],
        product: makeProduct(),
        chosenUnit: 'bowl',
        chosenCount: 1,
        emoji: '🍲',
      }),
    ]);
    if (!original) throw new Error('No original');

    await service.copy([original], TODAY);

    const [copy] = await diaryRepo.byDay(TODAY);
    expect(copy).toEqual({ ...original, id: 'copy-1', loggedAt: NOW, dayKey: TODAY });
  });

  it('shares the photos instead of duplicating them, and they outlive the original', async () => {
    const { db, diaryRepo, service } = await setUp();
    const photoRepo = createPhotoRepo(db);
    const photoId = await photoRepo.put(await storableBlob(1_000), { width: 800, height: 600 });
    const [original] = await diaryRepo.addMany([
      makeEntry({ loggedAt: NOW - DAY, photoIds: [photoId] }),
    ]);
    if (!original) throw new Error('No original');

    await service.copy([original], TODAY);

    expect(await db.photos.count()).toBe(1);
    const [copy] = await diaryRepo.byDay(TODAY);
    expect(copy?.photoIds).toEqual([photoId]);
    const diary = createDiaryService({ diaryRepo, photoRepo });
    expect(await diary.deleteEntry(original.id)).toEqual({ kind: 'deleted', releasedPhotoIds: [] });
    expect((await photoRepo.get(photoId))?.id).toBe(photoId);
  });

  it('writes nothing while a fast runs, and says so (R02.12)', async () => {
    const { db, diaryRepo, service } = await setUp();
    const originals = await yesterday(diaryRepo);
    const started = await createFastRepo(db).start(960, NOW - HOUR);
    expect(started.ok).toBe(true);

    const result = await service.copy(originals, TODAY);

    expect(result).toMatchObject({ kind: 'fastActive', fast: { end: null } });
    expect(await diaryRepo.byDay(TODAY)).toEqual([]);
  });

  it('stamps a past target day at the current clock time', async () => {
    const { diaryRepo, service } = await setUp();
    const [original] = await diaryRepo.addMany([
      makeEntry({ loggedAt: Date.parse('2026-10-20T08:00:00-04:00') }),
    ]);
    if (!original) throw new Error('No original');

    await service.copy([original], '2026-10-22');

    const [copy] = await diaryRepo.byDay('2026-10-22');
    expect(copy?.loggedAt).toBe(Date.parse('2026-10-22T12:30:00-04:00'));
  });

  it('never stamps a copy before the start of the target day', async () => {
    const midnight = Date.parse('2026-10-26T00:00:00.001-04:00');
    const { diaryRepo, service } = await setUp(midnight);
    const originals = await yesterday(diaryRepo);

    await service.copy(originals, TODAY);

    const stamps = (await diaryRepo.byDay(TODAY)).map((entry) => entry.loggedAt);
    expect(stamps).toHaveLength(3);
    expect(Math.min(...stamps)).toBe(midnight - 1);
  });

  it('ignores a second copy while the first is still being written', async () => {
    const { diaryRepo, service } = await setUp();
    const originals = await yesterday(diaryRepo);

    const [first, second] = await Promise.all([
      service.copy(originals, TODAY),
      service.copy(originals, TODAY),
    ]);

    expect(first.kind).toBe('copied');
    expect(second).toEqual({ kind: 'ignored' });
    expect(await diaryRepo.byDay(TODAY)).toHaveLength(3);
    expect((await service.copy(originals.slice(0, 1), TODAY)).kind).toBe('copied');
  });

  it('writes nothing when no entry is given', async () => {
    const { diaryRepo, service } = await setUp();
    expect(await service.copy([], TODAY)).toEqual({ kind: 'copied', entries: [] });
    expect(await diaryRepo.count()).toBe(0);
  });
});
