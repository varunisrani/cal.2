import { Dexie } from 'dexie';
import { describe, expect, it } from 'vitest';
import { combineEntries } from '../../domain/food/combine';
import type { DiaryEntry, ProductInfo } from '../../domain/model';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, factories } from '../../test/factories';
import { ready, watch } from '../../test/live';
import { inTimeZone } from '../../test/time';
import { transact, type PlatewiseDb } from '../db';
import { keptAside } from '../guard';
import {
  FastActiveError,
  add,
  addMany,
  barcodeKeyOf,
  between,
  byDay,
  combine,
  count,
  endFastAndAdd,
  latestLabelFor,
  liveByDay,
  remove,
  since,
  update,
} from './diaryRepo';

const make = factories();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** An instant from a local date and time, read in the test zone (New York). */
const local = (text: string) => new Date(text).getTime();

/** An entry row that cannot be read: kcal is text. */
function brokenEntry(id: string, loggedAt = FACTORY_NOW) {
  return { id, name: 'Mystery stew', kcal: 'lots', loggedAt, dayKey: '2026-10-26' };
}

function product(barcode: string): ProductInfo {
  return { barcode, allergens: [], traces: [], labels: [], categories: [] };
}

/** A promise and the function that settles it. */
function signal(): { promise: Promise<void>; fire: () => void } {
  let fire!: () => void;
  const promise = new Promise<void>((resolve) => (fire = resolve));
  return { promise, fire };
}

/** Makes every entry write fail, as a full disk would. */
function failEntryWrites(db: PlatewiseDb): void {
  db.entries.hook('creating', () => {
    throw new Error('disk full');
  });
}

/** Names for combineEntries, as the catalogue would give them. */
const combineNames = { fallback: 'Combined meal', more: (n: number) => `${n} more` };

const names = (entries: DiaryEntry[]) => entries.map((entry) => entry.name);
const sortedIds = async (db: PlatewiseDb) => (await db.entries.toCollection().primaryKeys()).sort();

describe('writes during a fast (D-16.35)', () => {
  it('add throws FastActiveError and writes nothing; once the fast ends it logs (ACC-D27-2, R05.1, R02.12)', async () => {
    const db = await openTestDb();
    const fast = make.fast({ end: null });
    await db.fasts.put(fast);
    const entry = make.entry();

    const refused = add(db, entry);
    await expect(refused).rejects.toBeInstanceOf(FastActiveError);
    await expect(refused).rejects.toMatchObject({ fastId: fast.id });
    expect(await db.entries.count()).toBe(0);

    await db.fasts.put({ ...fast, end: FACTORY_NOW });
    expect(await add(db, entry)).toEqual(entry);
    expect(await sortedIds(db)).toEqual([entry.id]);
  });

  it('addMany and combine are refused as a whole and change nothing (ACC-D27-2, R02.12)', async () => {
    const db = await openTestDb();
    const [soup, bread] = [make.entry(), make.entry({ name: 'Bread' })];
    await addMany(db, [soup, bread]);
    await db.fasts.put(make.fast({ end: null }));

    await expect(addMany(db, [make.entry(), make.entry()])).rejects.toBeInstanceOf(FastActiveError);
    const meal = { ...combineEntries([soup, bread], combineNames), id: 'entry-combined' };
    await expect(combine(db, meal, [soup.id, bread.id])).rejects.toBeInstanceOf(FastActiveError);
    expect(await sortedIds(db)).toEqual([soup.id, bread.id].sort());
  });

  it('an add issued while a fast is being started ends refused once that start commits (R05.1)', async () => {
    const db = await openTestDb();
    const begun = signal();
    const release = signal();
    const starting = transact(db, 'rw', ['fasts'], async () => {
      await db.fasts.put(make.fast({ end: null }));
      begun.fire();
      await Dexie.waitFor(release.promise);
    });
    await begun.promise;

    // The add's own transaction reads the fasts, so it waits for the start and then sees it.
    // (Issued outside the starting transaction's scope, as another caller would.)
    const adding = Dexie.ignoreTransaction(() => add(db, make.entry()));
    const outcome = expect(adding).rejects.toBeInstanceOf(FastActiveError);
    release.fire();
    await starting;
    await outcome;
    expect(await db.entries.count()).toBe(0);
  });

  it('endFastAndAdd ends the fast at now and logs the entry together', async () => {
    const db = await openTestDb();
    const fast = make.fast({ start: FACTORY_NOW - 10 * HOUR, end: null });
    await db.fasts.put(fast);
    const entry = make.entry();

    const done = await endFastAndAdd(db, entry, FACTORY_NOW);
    expect(done).toEqual({ entry, endedFast: { ...fast, end: FACTORY_NOW } });
    expect(await db.fasts.get(fast.id)).toEqual({ ...fast, end: FACTORY_NOW });
    expect(await sortedIds(db)).toEqual([entry.id]);
  });

  it('endFastAndAdd leaves both as they were when the entry write fails after the end', async () => {
    const db = await openTestDb();
    const fast = make.fast({ start: FACTORY_NOW - 10 * HOUR, end: null });
    await db.fasts.put(fast);
    failEntryWrites(db);

    await expect(endFastAndAdd(db, make.entry(), FACTORY_NOW)).rejects.toThrow('disk full');
    expect(await db.fasts.get(fast.id)).toEqual(fast);
    expect(await db.entries.count()).toBe(0);
  });

  it('endFastAndAdd only logs when no fast is running any more', async () => {
    const db = await openTestDb();
    const finished = make.fast();
    await db.fasts.put(finished);
    const entry = make.entry();
    expect(await endFastAndAdd(db, entry, FACTORY_NOW)).toEqual({ entry, endedFast: null });
    expect(await db.fasts.get(finished.id)).toEqual(finished);
  });
});

describe('changing the diary', () => {
  it('combine removes the originals and adds one row in one transaction (R02.24, R06.2)', async () => {
    const db = await openTestDb();
    const parts = [
      make.entry({ name: 'Rice', loggedAt: FACTORY_NOW - HOUR }),
      make.entry({ name: 'Beans' }),
      make.entry({ name: 'Salsa', loggedAt: FACTORY_NOW - 2 * HOUR }),
    ];
    await addMany(db, parts);
    const meal = { ...combineEntries(parts, combineNames), id: 'entry-combined' };

    const partIds = parts.map((part) => part.id);
    expect(await combine(db, meal, partIds)).toBe('combined');
    expect(await byDay(db, meal.dayKey)).toEqual([meal]);
    expect(meal.name).toBe('Rice + Beans + Salsa');
  });

  it('combine keeps the originals when the combined row cannot be written', async () => {
    const db = await openTestDb();
    const parts = [make.entry({ name: 'Rice' }), make.entry({ name: 'Beans' })];
    await addMany(db, parts);
    failEntryWrites(db);

    const meal = { ...combineEntries(parts, combineNames), id: 'entry-combined' };
    const partIds = parts.map((part) => part.id);
    await expect(combine(db, meal, partIds)).rejects.toThrow('disk full');
    expect(await sortedIds(db)).toEqual(partIds.sort());
  });

  it('combine is stale and writes nothing when an original is gone or unreadable', async () => {
    const db = await openTestDb();
    const rice = make.entry({ name: 'Rice' });
    await add(db, rice);
    await db.table('entries').put(brokenEntry('entry-broken'));
    const meal = { ...combineEntries([rice, make.entry()], combineNames), id: 'entry-combined' };

    expect(await combine(db, meal, [rice.id, 'entry-deleted'])).toBe('stale');
    expect(await combine(db, meal, [rice.id, 'entry-broken'])).toBe('stale');
    expect(await sortedIds(db)).toEqual(['entry-broken', rice.id].sort());
  });

  it('update never writes over an unreadable row and says when the row is gone (R02.24)', async () => {
    const db = await openTestDb();
    const broken = brokenEntry('entry-broken');
    await db.table('entries').put(broken);

    expect(await update(db, { ...make.entry(), id: 'entry-broken' })).toBe('unreadable');
    expect(await db.table('entries').get('entry-broken')).toEqual(broken);
    expect((await db.quarantine.toArray()).map((row) => row.key)).toEqual(['entry-broken']);
    expect(await update(db, make.entry())).toBe('missing');
    expect(await db.entries.count()).toBe(1);
  });

  it('adding never replaces unreadable rows, and reads leave them out and keep them aside (R02.24)', async () => {
    const db = await openTestDb();
    const broken = [brokenEntry('entry-old-1'), brokenEntry('entry-old-2')];
    for (const row of broken) await db.table('entries').put(row);

    const entry = await add(db, make.entry());
    expect(await byDay(db, '2026-10-26')).toEqual([entry]);
    expect(await count(db)).toBe(1);
    expect(await db.table('entries').bulkGet(['entry-old-1', 'entry-old-2'])).toEqual(broken);
    await keptAside();
    expect(await db.quarantine.count()).toBe(2);
  });

  it('remove deletes a readable row only', async () => {
    const db = await openTestDb();
    const entry = await add(db, make.entry());
    await db.table('entries').put(brokenEntry('entry-broken'));

    expect(await remove(db, entry.id)).toBe(true);
    expect(await remove(db, entry.id)).toBe(false);
    expect(await remove(db, 'entry-broken')).toBe(false);
    expect(await sortedIds(db)).toEqual(['entry-broken']);
  });

  it('works out the day and barcode keys on write instead of trusting the caller', async () => {
    const db = await openTestDb();
    const entry = make.entry({
      dayKey: '1999-01-01',
      source: 'barcode',
      product: product(' 0036000291452 '),
    });

    const stored = await add(db, entry);
    expect(stored).toEqual({ ...entry, dayKey: '2026-10-26' });
    expect(await db.entries.get(entry.id)).toEqual({
      ...stored,
      barcodeKey: '36000291452',
    });
    expect(await byDay(db, '2026-10-26')).toEqual([stored]);
  });

  it('update keeps the stored day unless the time changed', async () => {
    const db = await openTestDb();
    // 16:30 UTC is already 01:30 the next day in Tokyo.
    const entry = make.entry({ loggedAt: FACTORY_NOW });
    await inTimeZone('Asia/Tokyo', () => add(db, entry));

    expect(await update(db, { ...entry, name: 'Miso soup' })).toBe('updated');
    expect((await db.entries.get(entry.id))?.dayKey).toBe('2026-10-27');

    expect(await update(db, { ...entry, loggedAt: FACTORY_NOW + HOUR })).toBe('updated');
    expect((await db.entries.get(entry.id))?.dayKey).toBe('2026-10-26');
  });

  it('refuses entries that would not read back, and two entries with one id', async () => {
    const db = await openTestDb();
    await expect(add(db, make.entry({ kcal: Number.NaN }))).rejects.toBeInstanceOf(TypeError);
    const twin = make.entry();
    await expect(addMany(db, [twin, { ...twin, name: 'Twin' }])).rejects.toBeInstanceOf(RangeError);
    expect(await db.entries.count()).toBe(0);
  });
});

describe('reading the diary', () => {
  it('byDay splits the days at local midnight in New York, newest first', async () => {
    const db = await openTestDb();
    const breakfast = make.entry({ name: 'Oats', loggedAt: local('2026-10-26T08:00') });
    const lastBite = make.entry({ name: 'Cake', loggedAt: local('2026-10-26T23:59:59.999') });
    const midnight = make.entry({ name: 'Tea', loggedAt: local('2026-10-27T00:00') });
    await addMany(db, [breakfast, lastBite, midnight]);

    expect(names(await byDay(db, '2026-10-26'))).toEqual(['Cake', 'Oats']);
    expect(names(await byDay(db, '2026-10-27'))).toEqual(['Tea']);
    await expect(byDay(db, '2026-13-01')).rejects.toBeInstanceOf(RangeError);
  });

  it('an entry keeps the day of the zone it was logged in', async () => {
    const db = await openTestDb();
    await inTimeZone('Asia/Tokyo', () => add(db, make.entry({ name: 'Ramen' })));
    expect(names(await byDay(db, '2026-10-27'))).toEqual(['Ramen']);
    expect(await byDay(db, '2026-10-26')).toEqual([]);
  });

  it('between covers both end days, oldest first', async () => {
    const db = await openTestDb();
    const days = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'];
    await addMany(
      db,
      days.flatMap((day) => [
        make.entry({ name: `${day} dinner`, loggedAt: local(`${day}T19:00`) }),
        make.entry({ name: `${day} lunch`, loggedAt: local(`${day}T12:00`) }),
      ]),
    );

    expect(names(await between(db, '2026-10-25', '2026-10-26'))).toEqual([
      '2026-10-25 lunch',
      '2026-10-25 dinner',
      '2026-10-26 lunch',
      '2026-10-26 dinner',
    ]);
    expect(await between(db, '2026-10-26', '2026-10-25')).toEqual([]);
  });

  it('since lists entries from an instant on, newest first', async () => {
    const db = await openTestDb();
    await addMany(db, [
      make.entry({ name: 'Three days ago', loggedAt: FACTORY_NOW - 3 * DAY }),
      make.entry({ name: 'Yesterday', loggedAt: FACTORY_NOW - DAY }),
      make.entry({ name: 'Now' }),
    ]);
    expect(names(await since(db, FACTORY_NOW - 2 * DAY))).toEqual(['Now', 'Yesterday']);
  });

  it('latestLabelFor matches a UPC-A against its EAN-13 form and only reads label entries', async () => {
    const db = await openTestDb();
    await addMany(db, [
      make.entry({
        name: 'Old label',
        source: 'label',
        product: product('0036000291452'),
        loggedAt: FACTORY_NOW - 2 * DAY,
      }),
      make.entry({
        name: 'New label',
        source: 'label',
        product: product('0036000291452'),
        loggedAt: FACTORY_NOW - DAY,
      }),
      make.entry({ name: 'Scanned', source: 'barcode', product: product('036000291452') }),
      make.entry({ name: 'Other label', source: 'label', product: product('4006381333931') }),
    ]);

    expect((await latestLabelFor(db, '036000291452'))?.name).toBe('New label');
    expect(await latestLabelFor(db, '036000291453')).toBeUndefined();
    expect(await latestLabelFor(db, '   ')).toBeUndefined();
  });

  it('barcodeKeyOf drops leading zeros of digit codes and lower-cases the rest', () => {
    expect(barcodeKeyOf('036000291452')).toBe(barcodeKeyOf('0036000291452'));
    expect(barcodeKeyOf(' 0000 ')).toBe('0');
    expect(barcodeKeyOf('ABC-12')).toBe('abc-12');
    expect(barcodeKeyOf('')).toBeUndefined();
  });

  it('a live day feed shows an entry logged after it started', async () => {
    const db = await openTestDb();
    const feed = watch(liveByDay(db, '2026-10-26'));
    await feed.until(ready((rows: DiaryEntry[]) => rows.length === 0));

    const entry = await add(db, make.entry());
    await feed.until(ready((rows: DiaryEntry[]) => rows.length === 1));
    expect(feed.values().at(-1)).toEqual([entry]);
  });
});
