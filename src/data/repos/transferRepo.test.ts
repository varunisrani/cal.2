import { describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry, makeLine, makeWater } from '../../test/factories';
import { settleQuarantine } from '../guard';
import { createDiaryRepo } from './diaryRepo';
import { RewriteRefusedError, createTransferRepo, type DaysWrite } from './transferRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 12:30 on Monday 26 October 2026 in New York, and the days around it. */
const MON = '2026-10-26';
const SUN = '2026-10-25';
const SAT = '2026-10-24';

const NOTHING: DaysWrite = { putEntries: [], removeEntryIds: [], putWater: [], removeWaterIds: [] };

async function setUp() {
  const { db } = await openTestDb();
  const repo = createTransferRepo(db, { clock });
  return { db, repo, diary: createDiaryRepo(db, { clock }) };
}

describe('read', () => {
  it('gives the entries and water logs of the days asked for, oldest first', async () => {
    const { db, repo, diary } = await setUp();
    const saturday = makeEntry({ loggedAt: FACTORY_NOW - 2 * DAY });
    const sundayLate = makeEntry({ loggedAt: FACTORY_NOW - DAY + 2 * HOUR });
    const sundayEarly = makeEntry({ loggedAt: FACTORY_NOW - DAY - 2 * HOUR });
    const monday = makeEntry({ loggedAt: FACTORY_NOW });
    await diary.addMany([saturday, sundayLate, sundayEarly, monday]);
    const waterLate = makeWater({ at: FACTORY_NOW - DAY + HOUR });
    const waterEarly = makeWater({ at: FACTORY_NOW - DAY - HOUR });
    await db.water.bulkPut([makeWater({ at: FACTORY_NOW }), waterLate, waterEarly]);

    expect(await repo.read(SUN, SUN)).toEqual({
      entries: [sundayEarly, sundayLate],
      water: [waterEarly, waterLate],
    });
    expect((await repo.read(SAT, MON)).entries).toEqual([
      saturday,
      sundayEarly,
      sundayLate,
      monday,
    ]);
    expect(await repo.read(MON, SAT)).toEqual({ entries: [], water: [] });
    db.close();
  });
});

describe('firstDay', () => {
  it('is the earliest day with food or water, and null with neither', async () => {
    const { db, repo, diary } = await setUp();
    expect(await repo.firstDay()).toBeNull();

    await diary.add(makeEntry({ loggedAt: FACTORY_NOW - DAY }));
    expect(await repo.firstDay()).toBe(SUN);

    await db.water.put(makeWater({ at: FACTORY_NOW - 2 * DAY }));
    expect(await repo.firstDay()).toBe(SAT);
    db.close();
  });

  it('skips a row that cannot be read', async () => {
    const { db, repo, diary } = await setUp();
    await diary.add(makeEntry({ loggedAt: FACTORY_NOW }));
    await db.entries.put({ id: 'broken', dayKey: '2026-01-01', loggedAt: 0 } as never);

    expect(await repo.firstDay()).toBe(MON);
    await settleQuarantine(db);
    db.close();
  });
});

describe('rewriteDays', () => {
  it('shows the plan the days and every id used elsewhere, then stores its write', async () => {
    const { db, repo, diary } = await setUp();
    const outside = makeEntry({ id: 'outside', loggedAt: FACTORY_NOW - 2 * DAY });
    const kept = makeEntry({ id: 'kept', loggedAt: FACTORY_NOW - DAY, photoIds: ['p-kept'] });
    const dropped = makeEntry({ id: 'dropped', loggedAt: FACTORY_NOW, photoIds: ['p-dropped'] });
    await diary.addMany([outside, kept, dropped]);
    await db.entries.put({ id: 'broken', dayKey: MON, loggedAt: FACTORY_NOW - HOUR } as never);
    const oldWater = makeWater({ id: 'w-old', at: FACTORY_NOW });
    await db.water.bulkPut([makeWater({ id: 'w-outside', at: FACTORY_NOW - 2 * DAY }), oldWater]);

    const plan = vi.fn((): DaysWrite => ({
      putEntries: [{ ...kept, name: 'Renamed' }, makeEntry({ id: 'new', loggedAt: FACTORY_NOW })],
      removeEntryIds: ['dropped'],
      putWater: [makeWater({ id: 'w-new', at: FACTORY_NOW + HOUR, ml: 500 })],
      removeWaterIds: ['w-old'],
    }));
    const result = await repo.rewriteDays(SUN, MON, plan);

    expect(plan).toHaveBeenCalledWith({
      entries: [kept, dropped],
      water: [oldWater],
      takenEntryIds: new Set(['outside', 'broken']),
      takenWaterIds: new Set(['w-outside']),
    });
    expect(result).toEqual({ releasedPhotoIds: ['p-dropped'] });
    expect((await db.entries.toArray()).map((row) => [row.id, row.name]).sort()).toEqual([
      ['broken', undefined],
      ['kept', 'Renamed'],
      ['new', 'Lentil soup'],
      ['outside', 'Lentil soup'],
    ]);
    expect((await db.water.toArray()).map((log) => log.id).sort()).toEqual(['w-new', 'w-outside']);
    await settleQuarantine(db);
    db.close();
  });

  it("releases the photos a replaced entry no longer names, its parts' included", async () => {
    const { db, repo, diary } = await setUp();
    const before = makeEntry({
      id: 'e',
      photoIds: ['p-1', 'p-2'],
      lines: [makeLine({ photoIds: ['p-line'] })],
    });
    await diary.add(before);

    const result = await repo.rewriteDays(MON, MON, () => ({
      ...NOTHING,
      putEntries: [{ ...before, photoIds: ['p-2'], lines: [] }],
    }));

    expect(result.releasedPhotoIds.sort()).toEqual(['p-1', 'p-line']);
    db.close();
  });

  it.each<[string, (taken: string) => DaysWrite]>([
    [
      'an entry on a day outside the span',
      () => ({ ...NOTHING, putEntries: [makeEntry({ id: 'x', loggedAt: FACTORY_NOW - DAY })] }),
    ],
    [
      'an entry id used on another day',
      (taken) => ({ ...NOTHING, putEntries: [makeEntry({ id: taken })] }),
    ],
    [
      'the same entry id twice',
      () => ({ ...NOTHING, putEntries: [makeEntry({ id: 'x' }), makeEntry({ id: 'x' })] }),
    ],
    ['deleting an entry of another day', (taken) => ({ ...NOTHING, removeEntryIds: [taken] })],
    [
      'a water log on a day outside the span',
      () => ({ ...NOTHING, putWater: [makeWater({ at: FACTORY_NOW + DAY })] }),
    ],
    ['deleting a water log of another day', () => ({ ...NOTHING, removeWaterIds: ['w-other'] })],
  ])('refuses %s and changes nothing', async (_label, write) => {
    const { db, repo, diary } = await setUp();
    const other = makeEntry({ id: 'other', loggedAt: FACTORY_NOW - DAY });
    const today = makeEntry({ id: 'today' });
    await diary.addMany([other, today]);
    await db.water.put(makeWater({ id: 'w-other', at: FACTORY_NOW - DAY }));

    // The refused part comes with a valid one, which must not be stored either.
    const planned = write('other');
    const plan = () => ({ ...planned, removeEntryIds: [...planned.removeEntryIds, 'today'] });
    await expect(repo.rewriteDays(MON, MON, plan)).rejects.toThrow(RewriteRefusedError);

    expect((await db.entries.toArray()).map((row) => row.id).sort()).toEqual(['other', 'today']);
    expect((await db.water.toArray()).map((log) => log.id)).toEqual(['w-other']);
    db.close();
  });

  it('refuses a span that ends before it starts', async () => {
    const { db, repo } = await setUp();
    await expect(repo.rewriteDays(MON, SUN, () => NOTHING)).rejects.toThrow(RewriteRefusedError);
    db.close();
  });
});
