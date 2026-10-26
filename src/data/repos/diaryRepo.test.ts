import { Dexie } from 'dexie';
import { describe, expect, it } from 'vitest';
import { combineEntries } from '../../domain/food/combine';
import type { DiaryEntry } from '../../domain/model';
import { fixedClock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry, makeFast, makeLine, makeProduct } from '../../test/factories';
import { settleQuarantine } from '../guard';
import type { PlatewiseDb } from '../schema';
import { FastActiveError, MissingEntriesError, createDiaryRepo } from './diaryRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');
const HOUR = 3_600_000;
const words = { fallbackName: 'Meal', more: (count: number) => `${count} more` };

async function setUp() {
  const { db } = await openTestDb();
  const diary = createDiaryRepo(db, { clock, newId: withIdSequence('combined') });
  return { db, diary };
}

/** Starts a fast two hours before the factory instant and leaves it running. */
async function startFast(db: PlatewiseDb) {
  const fast = makeFast({ start: FACTORY_NOW - 2 * HOUR, end: null });
  await db.fasts.put(fast);
  return fast;
}

/** Makes every new row in `entries` fail on this connection, like a full disk would. */
function breakEntryWrites(db: PlatewiseDb): void {
  db.entries.hook('creating', () => {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  });
}

describe('food during a fast', () => {
  it('refuses an add while a fast runs and writes nothing (R05.1, R02.12, ACC-D27-2)', async () => {
    const { db, diary } = await setUp();
    const fast = await startFast(db);

    const refused = diary.add(makeEntry());
    await expect(refused).rejects.toBeInstanceOf(FastActiveError);
    await expect(refused).rejects.toMatchObject({ fast });
    expect(await db.entries.count()).toBe(0);

    await db.fasts.put({ ...fast, end: FACTORY_NOW });
    const entry = makeEntry();
    expect(await diary.add(entry)).toEqual(entry);
    expect(await db.entries.count()).toBe(1);
    db.close();
  });

  it('refuses adding several entries and combining during a fast (R05.1, R02.12, ACC-D27-2)', async () => {
    const { db, diary } = await setUp();
    const first = makeEntry({ name: 'Toast' });
    const second = makeEntry({ name: 'Eggs' });
    await diary.addMany([first, second]);
    await startFast(db);

    await expect(diary.addMany([makeEntry(), makeEntry()])).rejects.toBeInstanceOf(FastActiveError);
    const combined = combineEntries([first, second], words);
    if (!combined) throw new Error('two entries always combine');
    await expect(diary.combine(combined, [first.id, second.id])).rejects.toBeInstanceOf(
      FastActiveError,
    );
    expect(await diary.byDay(first.dayKey)).toEqual([second, first]);
    db.close();
  });

  it('refuses an add that was waiting while another transaction started a fast (R05.1)', async () => {
    const { db, diary } = await setUp();
    let adding: Promise<DiaryEntry> | undefined;
    await db.transaction('rw', db.fasts, async () => {
      await db.fasts.put(makeFast({ end: null }));
      // Starts while the fast is not committed yet; the add's transaction waits for it.
      adding = Dexie.ignoreTransaction(() => diary.add(makeEntry()));
    });
    await expect(adding).rejects.toBeInstanceOf(FastActiveError);
    expect(await db.entries.count()).toBe(0);
    db.close();
  });

  it('lets an existing entry be edited or deleted during a fast', async () => {
    const { db, diary } = await setUp();
    const entry = await diary.add(makeEntry());
    await startFast(db);

    expect(await diary.update({ ...entry, name: 'Lentil soup, small' })).toMatchObject({
      kind: 'updated',
    });
    await diary.remove(entry.id);
    expect(await db.entries.count()).toBe(0);
    db.close();
  });

  it('does not let an unreadable fast row block food', async () => {
    const { db, diary } = await setUp();
    await db.fasts.put({ id: 'broken', start: 'yesterday', end: null } as never);

    await diary.add(makeEntry());
    expect(await db.entries.count()).toBe(1);
    await settleQuarantine(db);
    expect(await db.quarantine.where('table').equals('fasts').count()).toBe(1);
    db.close();
  });
});

describe('endFastAndAdd', () => {
  it('ends the running fast at now and adds the entry together (D-16.35)', async () => {
    const { db, diary } = await setUp();
    const fast = await startFast(db);
    const entry = makeEntry();

    const result = await diary.endFastAndAdd(entry, FACTORY_NOW);
    expect(result).toEqual({ entry, endedFast: { ...fast, end: FACTORY_NOW } });
    expect(await db.fasts.get(fast.id)).toEqual({ ...fast, end: FACTORY_NOW });
    expect(await diary.byDay(entry.dayKey)).toEqual([entry]);
    db.close();
  });

  it('leaves the fast running and adds nothing when the add fails after the end (D-16.35)', async () => {
    const { db, diary } = await setUp();
    const fast = await startFast(db);
    breakEntryWrites(db);

    await expect(diary.endFastAndAdd(makeEntry(), FACTORY_NOW)).rejects.toThrow(
      'quota has been exceeded',
    );
    expect(await db.fasts.get(fast.id)).toEqual(fast);
    expect(await db.entries.count()).toBe(0);
    db.close();
  });

  it('just adds when no fast is running any more', async () => {
    const { db, diary } = await setUp();
    const finished = makeFast();
    await db.fasts.put(finished);
    const entry = makeEntry();

    expect(await diary.endFastAndAdd(entry, FACTORY_NOW)).toEqual({ entry, endedFast: null });
    expect(await db.fasts.get(finished.id)).toEqual(finished);
    expect(await db.entries.count()).toBe(1);
    db.close();
  });
});

describe('add', () => {
  it('derives the day and the barcode key on write', async () => {
    const { db, diary } = await setUp();
    const late = Date.parse('2026-10-26T23:30:00-04:00');
    const entry = makeEntry({
      loggedAt: late,
      dayKey: '2001-01-01',
      source: 'barcode',
      product: makeProduct({ barcode: '0036000291452' }),
    });

    const stored = await diary.add(entry);
    expect(stored).toEqual({ ...entry, dayKey: '2026-10-26' });
    expect(stored).not.toHaveProperty('barcodeKey');
    expect(await db.entries.get(entry.id)).toEqual({
      ...entry,
      dayKey: '2026-10-26',
      barcodeKey: '36000291452',
    });
    db.close();
  });

  it('stores only what the entry codec reads, and refuses an entry it cannot read', async () => {
    const { db, diary } = await setUp();
    const entry = makeEntry();
    await diary.add({ ...entry, healthRecordId: 'x' } as DiaryEntry);
    expect(await db.entries.get(entry.id)).toEqual(entry);

    await expect(diary.add(makeEntry({ kcal: Number.NaN }))).rejects.toBeInstanceOf(TypeError);
    expect(await db.entries.count()).toBe(1);
    db.close();
  });

  it('never replaces a stored row, readable or not, with a new one under the same id (R02.24)', async () => {
    const { db, diary } = await setUp();
    const broken = { id: 'taken', name: 'no numbers' };
    await db.entries.put(broken as never);

    await expect(diary.add(makeEntry({ id: 'taken' }))).rejects.toMatchObject({
      name: 'ConstraintError',
    });
    expect(await db.entries.get('taken')).toEqual(broken);
    db.close();
  });

  it('adds several entries all together or not at all', async () => {
    const { db, diary } = await setUp();
    const existing = await diary.add(makeEntry());
    const fresh = makeEntry({ name: 'Apple' });

    await expect(diary.addMany([fresh, makeEntry({ id: existing.id })])).rejects.toMatchObject({
      name: 'BulkError',
    });
    expect(await db.entries.toArray()).toEqual([existing]);

    expect(await diary.addMany([fresh])).toEqual([fresh]);
    expect(await diary.count()).toBe(2);
    db.close();
  });
});

describe('update', () => {
  it('rewrites the entry with fresh keys and returns the photos it dropped (R02.24)', async () => {
    const { db, diary } = await setUp();
    const entry = await diary.add(
      makeEntry({
        photoIds: ['p1', 'p2'],
        lines: [makeLine({ photoIds: ['p3', 'p1'] })],
        product: makeProduct({ barcode: '4006381333931' }),
      }),
    );
    const nextDay = Date.parse('2026-10-27T08:00:00-04:00');
    const edited: DiaryEntry = {
      ...entry,
      loggedAt: nextDay,
      photoIds: ['p2'],
      lines: [makeLine({ photoIds: [] })],
    };
    delete edited.product;

    const result = await diary.update(edited);
    expect(result).toEqual({
      kind: 'updated',
      entry: { ...edited, dayKey: '2026-10-27' },
      releasedPhotoIds: ['p1', 'p3'],
    });
    expect(await db.entries.get(entry.id)).toEqual({ ...edited, dayKey: '2026-10-27' });
    expect(await diary.byDay('2026-10-26')).toEqual([]);
    db.close();
  });

  it('does not bring back an entry that was deleted meanwhile', async () => {
    const { db, diary } = await setUp();
    const entry = await diary.add(makeEntry());
    await diary.remove(entry.id);

    expect(await diary.update({ ...entry, name: 'Lentil soup, large' })).toEqual({
      kind: 'missing',
    });
    expect(await db.entries.count()).toBe(0);
    db.close();
  });

  it('keeps an unreadable stored row aside before writing over it (R06.1, R02.24)', async () => {
    const { db, diary } = await setUp();
    const broken = { id: 'e1', name: 'no numbers', photoIds: ['p9'] };
    await db.entries.put(broken as never);

    const entry = makeEntry({ id: 'e1' });
    expect(await diary.update(entry)).toEqual({ kind: 'updated', entry, releasedPhotoIds: [] });
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'entries', key: 'e1', raw: broken }),
    ]);
    db.close();
  });

  it('keeps both of two edits made at the same time to different entries (R06.2)', async () => {
    const { db, diary } = await setUp();
    const [first, second] = await diary.addMany([makeEntry(), makeEntry()]);
    if (!first || !second) throw new Error('two entries were added');

    await Promise.all([
      diary.update({ ...first, name: 'Porridge' }),
      diary.update({ ...second, kcal: 120 }),
      diary.add(makeEntry({ name: 'Tea' })),
    ]);
    const names = (await diary.byDay(first.dayKey)).map((entry) => [entry.name, entry.kcal]);
    expect(names).toEqual(
      expect.arrayContaining([
        ['Porridge', first.kcal],
        [second.name, 120],
        ['Tea', 410],
      ]),
    );
    expect(names).toHaveLength(3);
    db.close();
  });
});

describe('remove', () => {
  it('deletes the entry and returns the photos it held, parts included', async () => {
    const { db, diary } = await setUp();
    const entry = await diary.add(
      makeEntry({ photoIds: ['p1'], lines: [makeLine({ photoIds: ['p2'] })] }),
    );

    expect(await diary.remove(entry.id)).toEqual(['p1', 'p2']);
    expect(await diary.remove(entry.id)).toEqual([]);
    expect(await db.entries.count()).toBe(0);
    db.close();
  });

  it('keeps an unreadable row aside before deleting it (R06.1)', async () => {
    const { db, diary } = await setUp();
    const broken = { id: 'e1', loggedAt: 'garbage' };
    await db.entries.put(broken as never);

    expect(await diary.remove('e1')).toEqual([]);
    expect(await db.entries.count()).toBe(0);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'entries', key: 'e1', raw: broken }),
    ]);
    db.close();
  });
});

describe('combine', () => {
  it('deletes the originals and adds one entry in one transaction (R02.24)', async () => {
    const { db, diary } = await setUp();
    const [toast, eggs, tea] = await diary.addMany([
      makeEntry({ name: 'Toast', photoIds: ['p1'] }),
      makeEntry({ name: 'Eggs', lines: [makeLine({ photoIds: ['p2'] })] }),
      makeEntry({ name: 'Tea' }),
    ]);
    if (!toast || !eggs || !tea) throw new Error('three entries were added');
    const combined = combineEntries([toast, eggs], words);
    if (!combined) throw new Error('two entries always combine');

    const result = await diary.combine(combined, [toast.id, eggs.id]);
    expect(result).toEqual({ entry: { ...combined, id: 'combined-1' }, releasedPhotoIds: [] });
    expect((await db.entries.toArray()).map((row) => row.id).sort()).toEqual(
      ['combined-1', tea.id].sort(),
    );
    db.close();
  });

  it('returns the photos the originals held and the combined entry does not', async () => {
    const { db, diary } = await setUp();
    const [first, second] = await diary.addMany([
      makeEntry({ photoIds: ['p1'] }),
      makeEntry({ photoIds: ['p2'] }),
    ]);
    if (!first || !second) throw new Error('two entries were added');
    const combined = combineEntries([first, second], words);
    if (!combined) throw new Error('two entries always combine');

    const result = await diary.combine({ ...combined, photoIds: ['p2'], lines: [] }, [
      first.id,
      second.id,
    ]);
    expect(result.releasedPhotoIds).toEqual(['p1']);
    db.close();
  });

  it('writes nothing when an original is no longer stored', async () => {
    const { db, diary } = await setUp();
    const [first, second] = await diary.addMany([makeEntry(), makeEntry()]);
    if (!first || !second) throw new Error('two entries were added');
    const combined = combineEntries([first, second], words);
    if (!combined) throw new Error('two entries always combine');
    await diary.remove(second.id);

    const refused = diary.combine(combined, [first.id, second.id]);
    await expect(refused).rejects.toBeInstanceOf(MissingEntriesError);
    await expect(refused).rejects.toMatchObject({ ids: [second.id] });
    expect(await db.entries.toArray()).toEqual([first]);
    db.close();
  });

  it('refuses to combine fewer than two entries', async () => {
    const { db, diary } = await setUp();
    const [first, second] = await diary.addMany([makeEntry(), makeEntry()]);
    if (!first || !second) throw new Error('two entries were added');
    const combined = combineEntries([first, second], words);
    if (!combined) throw new Error('two entries always combine');

    await expect(diary.combine(combined, [first.id, first.id])).rejects.toBeInstanceOf(RangeError);
    expect(await db.entries.count()).toBe(2);
    db.close();
  });

  it('keeps the originals when adding the combined entry fails', async () => {
    const { db, diary } = await setUp();
    const [first, second] = await diary.addMany([makeEntry(), makeEntry()]);
    if (!first || !second) throw new Error('two entries were added');
    const combined = combineEntries([first, second], words);
    if (!combined) throw new Error('two entries always combine');
    breakEntryWrites(db);

    await expect(diary.combine(combined, [first.id, second.id])).rejects.toThrow(
      'quota has been exceeded',
    );
    expect(await db.entries.count()).toBe(2);
    db.close();
  });
});

describe('reads', () => {
  it('splits days at local midnight in New York, newest first', async () => {
    const { db, diary } = await setUp();
    const noon = makeEntry({ loggedAt: Date.parse('2026-10-26T12:30:00-04:00') });
    const beforeMidnight = makeEntry({ loggedAt: Date.parse('2026-10-26T23:59:00-04:00') });
    const afterMidnight = makeEntry({ loggedAt: Date.parse('2026-10-27T00:01:00-04:00') });
    await diary.addMany([afterMidnight, noon, beforeMidnight]);

    expect(await diary.byDay('2026-10-26')).toEqual([beforeMidnight, noon]);
    expect(await diary.byDay('2026-10-27')).toEqual([afterMidnight]);
    expect(await diary.byDay('2026-10-25')).toEqual([]);
    db.close();
  });

  it('keeps all 25 hours of the day the clocks go back on that day', async () => {
    const { db, diary } = await setUp();
    const early = makeEntry({ loggedAt: Date.parse('2026-11-01T00:30:00-04:00') });
    const repeatedHour = makeEntry({ loggedAt: Date.parse('2026-11-01T01:30:00-05:00') });
    const late = makeEntry({ loggedAt: Date.parse('2026-11-01T23:30:00-05:00') });
    const nextDay = makeEntry({ loggedAt: Date.parse('2026-11-02T00:10:00-05:00') });
    await diary.addMany([early, repeatedHour, late, nextDay]);

    expect(await diary.byDay('2026-11-01')).toEqual([late, repeatedHour, early]);
    db.close();
  });

  it('lists a range of days oldest first, both ends included', async () => {
    const { db, diary } = await setUp();
    const at = (iso: string) => makeEntry({ loggedAt: Date.parse(iso) });
    const before = at('2026-10-24T22:00:00-04:00');
    const first = at('2026-10-25T08:00:00-04:00');
    const middle = at('2026-10-26T13:00:00-04:00');
    const last = at('2026-10-27T23:00:00-04:00');
    const after = at('2026-10-28T07:00:00-04:00');
    await diary.addMany([last, after, middle, before, first]);

    expect(await diary.between('2026-10-25', '2026-10-27')).toEqual([first, middle, last]);
    expect(await diary.between('2026-10-27', '2026-10-25')).toEqual([]);
    db.close();
  });

  it('lists the entries since an instant, newest first', async () => {
    const { db, diary } = await setUp();
    const old = makeEntry({ loggedAt: FACTORY_NOW - 2 * HOUR });
    const atCutoff = makeEntry({ loggedAt: FACTORY_NOW - HOUR });
    const recent = makeEntry({ loggedAt: FACTORY_NOW });
    await diary.addMany([recent, old, atCutoff]);

    expect(await diary.since(FACTORY_NOW - HOUR)).toEqual([recent, atCutoff]);
    db.close();
  });

  it('drops an unreadable row from reads and keeps it (R06.1)', async () => {
    const { db, diary } = await setUp();
    const entry = await diary.add(makeEntry());
    const broken = { id: 'broken', dayKey: entry.dayKey, loggedAt: entry.loggedAt - 1 };
    await db.entries.put(broken as never);

    expect(await diary.byDay(entry.dayKey)).toEqual([entry]);
    expect(await diary.count()).toBe(2);
    await settleQuarantine(db);
    expect(await db.entries.get('broken')).toEqual(broken);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'entries', key: 'broken', raw: broken }),
    ]);
    db.close();
  });
});

describe('latestLabelFor', () => {
  it('matches a UPC-A against its EAN-13 form and picks the newest label entry (R02.14)', async () => {
    const { db, diary } = await setUp();
    const label = (barcode: string, loggedAt: number, source: DiaryEntry['source'] = 'label') =>
      makeEntry({ loggedAt, source, product: makeProduct({ barcode }) });
    const older = label('036000291452', FACTORY_NOW - 3 * HOUR);
    const newer = label('0036000291452', FACTORY_NOW - 2 * HOUR);
    const scanned = label('036000291452', FACTORY_NOW - HOUR, 'barcode');
    const other = label('4006381333931', FACTORY_NOW);
    await diary.addMany([older, scanned, newer, other]);

    expect(await diary.latestLabelFor('0036000291452')).toEqual(newer);
    expect(await diary.latestLabelFor(' 036000291452 ')).toEqual(newer);
    expect(await diary.latestLabelFor('36000291452')).toEqual(newer);
    expect(await diary.latestLabelFor('5000112548167')).toBeNull();
    expect(await diary.latestLabelFor('  ')).toBeNull();
    db.close();
  });

  it('forgets the label once its entries are deleted', async () => {
    const { db, diary } = await setUp();
    const entry = await diary.add(
      makeEntry({ source: 'label', product: makeProduct({ barcode: '036000291452' }) }),
    );
    await diary.remove(entry.id);

    expect(await diary.latestLabelFor('036000291452')).toBeNull();
    db.close();
  });
});
