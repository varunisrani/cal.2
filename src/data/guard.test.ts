import { describe, expect, it } from 'vitest';
import { fixedClock } from '../lib/clock';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeEntry, makeProfileRow } from '../test/factories';
import { decodeEntry, decodeProfile } from './codecs';
import {
  UNREADABLE_FLAG,
  WriteBlockedError,
  decodeRows,
  fingerprint,
  hasUnreadableData,
  keepAside,
  readAll,
  readOne,
  removeRows,
  settleQuarantine,
  writeOne,
} from './guard';
import { PROFILE_KEY, type EntryRow, type PlatewiseDb } from './schema';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

/** Puts raw values straight into a table, as damaged storage or another app version would. */
async function plant(db: PlatewiseDb, table: 'entries' | 'profile', rows: unknown[]) {
  await db.table(table).bulkPut(rows);
}

/** Makes every add to `quarantine` on this connection fail, like a full disk would. */
function breakQuarantine(db: PlatewiseDb): void {
  db.quarantine.hook('creating', () => {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  });
}

describe('readAll', () => {
  it('drops an unreadable entry, keeps it in its table and aside, and sets the flag (R06.1, ACC-K9-1)', async () => {
    const { db } = await openTestDb();
    const first = makeEntry({ id: 'a' });
    const third = makeEntry({ id: 'c' });
    const broken = { id: 'b', name: 'no numbers' };
    await plant(db, 'entries', [first, broken, third]);

    const result = await readAll(db, 'entries', decodeEntry, clock);
    expect(result.items).toEqual([first, third]);
    expect(result.dropped).toBe(1);

    await settleQuarantine(db);
    expect(await db.entries.get('b')).toEqual(broken);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'entries', key: 'b', at: FACTORY_NOW, raw: broken }),
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    db.close();
  });

  it('never lets an unreadable row turn into an empty list that a save replaces (R05.6)', async () => {
    const { db } = await openTestDb();
    const broken = { id: 'old', loggedAt: 'garbage' };
    await plant(db, 'entries', [broken]);

    expect(await readAll(db, 'entries', decodeEntry)).toEqual({ items: [], dropped: 1 });
    const added = makeEntry({ id: 'new' });
    await writeOne(db, 'entries', added, decodeEntry);

    expect(await db.entries.toArray()).toEqual([added, broken]);
    await settleQuarantine(db);
    db.close();
  });

  it('reports nothing dropped and leaves the flag alone when every row reads', async () => {
    const { db } = await openTestDb();
    await plant(db, 'entries', [makeEntry(), makeEntry()]);
    expect((await readAll(db, 'entries', decodeEntry)).dropped).toBe(0);
    await settleQuarantine(db);
    expect(await db.quarantine.count()).toBe(0);
    expect(await hasUnreadableData(db)).toBe(false);
    db.close();
  });

  it('keeps one copy when the same unreadable row is read twice, and a new copy when it changes', async () => {
    const { db } = await openTestDb();
    await plant(db, 'entries', [{ id: 'b', kcal: 'many' }]);
    await readAll(db, 'entries', decodeEntry);
    await readAll(db, 'entries', decodeEntry);
    await settleQuarantine(db);
    expect(await db.quarantine.count()).toBe(1);

    await plant(db, 'entries', [{ id: 'b', kcal: 'even more' }]);
    await readAll(db, 'entries', decodeEntry);
    await settleQuarantine(db);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([
      { id: 'b', kcal: 'many' },
      { id: 'b', kcal: 'even more' },
    ]);
    db.close();
  });
});

describe('decodeRows', () => {
  it('sorts rows a repository queried itself and keeps the unreadable ones aside', async () => {
    const { db } = await openTestDb();
    const good = makeEntry();
    await plant(db, 'entries', [good, { id: 'x', dayKey: good.dayKey }]);
    const rows: unknown[] = await db.entries.where('dayKey').equals(good.dayKey).toArray();
    expect(rows).toHaveLength(2);
    expect(decodeRows(db, 'entries', rows, decodeEntry)).toEqual({ items: [good], dropped: 1 });
    await settleQuarantine(db);
    expect(await db.quarantine.where('table').equals('entries').count()).toBe(1);
    db.close();
  });
});

describe('readOne', () => {
  it('tells missing, readable and corrupt apart', async () => {
    const { db } = await openTestDb();
    expect(await readOne(db, 'profile', PROFILE_KEY, decodeProfile)).toEqual({ kind: 'missing' });

    const row = makeProfileRow();
    await db.profile.put(row);
    const { id: _id, ...profile } = row;
    expect(await readOne(db, 'profile', PROFILE_KEY, decodeProfile)).toEqual({
      kind: 'ok',
      value: profile,
    });

    const corrupt = { id: PROFILE_KEY, weightKg: 'heavy' };
    await plant(db, 'profile', [corrupt]);
    expect(await readOne(db, 'profile', PROFILE_KEY, decodeProfile)).toEqual({
      kind: 'corrupt',
      raw: corrupt,
    });
    db.close();
  });

  it('keeps one copy of a corrupt record read twice', async () => {
    const { db } = await openTestDb();
    await plant(db, 'profile', [{ id: PROFILE_KEY, sex: 'x' }]);
    await readOne(db, 'profile', PROFILE_KEY, decodeProfile);
    await readOne(db, 'profile', PROFILE_KEY, decodeProfile);
    await settleQuarantine(db);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({
        table: 'profile',
        key: PROFILE_KEY,
        raw: { id: PROFILE_KEY, sex: 'x' },
      }),
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    db.close();
  });
});

describe('writeOne', () => {
  it('keeps a corrupt profile aside before saving over it (R06.1)', async () => {
    const { db } = await openTestDb();
    const corrupt = { id: PROFILE_KEY, heightCm: -3, note: 'damaged' };
    await plant(db, 'profile', [corrupt]);

    const row = makeProfileRow();
    await writeOne(db, 'profile', row, decodeProfile, clock);

    expect(await db.profile.get(PROFILE_KEY)).toEqual(row);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({
        table: 'profile',
        key: PROFILE_KEY,
        at: FACTORY_NOW,
        raw: corrupt,
      }),
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    db.close();
  });

  it('refuses the save and leaves the record untouched when the copy fails (R06.1)', async () => {
    const { db } = await openTestDb();
    const corrupt = { id: PROFILE_KEY, birthDate: 'unknown' };
    await plant(db, 'profile', [corrupt]);
    breakQuarantine(db);

    const saving = writeOne(db, 'profile', makeProfileRow(), decodeProfile);
    await expect(saving).rejects.toBeInstanceOf(WriteBlockedError);
    await expect(saving).rejects.toMatchObject({
      table: 'profile',
      key: PROFILE_KEY,
      cause: expect.objectContaining({ name: 'QuotaExceededError' }),
    });

    expect(await db.profile.get(PROFILE_KEY)).toEqual(corrupt);
    expect(await db.quarantine.count()).toBe(0);
    expect(await db.meta.get(UNREADABLE_FLAG)).toBeUndefined();
    db.close();
  });

  it('saves over a missing or readable record without a copy', async () => {
    const { db } = await openTestDb();
    const entry = makeEntry();
    await writeOne(db, 'entries', entry, decodeEntry);
    const edited: EntryRow = { ...entry, name: 'Lentil soup, large', barcodeKey: '0400' };
    await writeOne(db, 'entries', edited, decodeEntry);
    expect(await db.entries.get(entry.id)).toEqual(edited);
    expect(await db.quarantine.count()).toBe(0);
    db.close();
  });

  it('does not keep a second copy when a read already kept the corrupt record aside', async () => {
    const { db } = await openTestDb();
    await plant(db, 'entries', [{ id: 'e', name: 'half' }]);
    await readOne(db, 'entries', 'e', decodeEntry);
    await settleQuarantine(db);
    await writeOne(db, 'entries', makeEntry({ id: 'e' }), decodeEntry);
    expect(await db.quarantine.count()).toBe(1);
    db.close();
  });

  it('refuses to store a row its own codec cannot read back', async () => {
    const { db } = await openTestDb();
    await expect(writeOne(db, 'entries', { id: 'e' }, decodeEntry)).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(await db.entries.count()).toBe(0);
    db.close();
  });
});

describe('removeRows', () => {
  it('keeps an unreadable row aside before deleting it, and deletes readable rows plainly', async () => {
    const { db } = await openTestDb();
    const readable = makeEntry({ id: 'a' });
    const unreadable = { id: 'b', kcal: 'lots' };
    await plant(db, 'entries', [readable, unreadable]);

    await removeRows(db, 'entries', ['a', 'b', 'missing'], decodeEntry, clock);

    expect(await db.entries.count()).toBe(0);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'entries', key: 'b', at: FACTORY_NOW, raw: unreadable }),
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    db.close();
  });

  it('deletes nothing when an unreadable row cannot be kept aside', async () => {
    const { db } = await openTestDb();
    const readable = makeEntry({ id: 'a' });
    const unreadable = { id: 'b', kcal: 'lots' };
    await plant(db, 'entries', [readable, unreadable]);
    breakQuarantine(db);

    await expect(removeRows(db, 'entries', ['a', 'b'], decodeEntry)).rejects.toMatchObject({
      name: 'WriteBlockedError',
      key: 'b',
    });
    expect(await db.entries.toArray()).toEqual([readable, unreadable]);
    db.close();
  });
});

describe('keepAside', () => {
  it('joins the transaction of its caller, so a later failure there undoes the copy too', async () => {
    const { db } = await openTestDb();
    await expect(
      db.transaction('rw', db.profile, db.quarantine, db.meta, async () => {
        await keepAside(db, 'profile', PROFILE_KEY, { id: PROFILE_KEY, junk: true });
        throw new Error('the caller changed its mind');
      }),
    ).rejects.toThrow('the caller changed its mind');
    expect(await db.quarantine.count()).toBe(0);

    await keepAside(db, 'profile', PROFILE_KEY, { id: PROFILE_KEY, junk: true });
    expect(await db.quarantine.count()).toBe(1);
    db.close();
  });
});

describe('fingerprint', () => {
  it('is the same for equal values in any key order', () => {
    expect(fingerprint({ a: 1, b: [1, 'x', null] })).toBe(fingerprint({ b: [1, 'x', null], a: 1 }));
    expect(fingerprint({ at: new Date(5) })).toBe(fingerprint({ at: new Date(5) }));
    expect(fingerprint(new Uint8Array([1, 2]))).toBe(fingerprint(new Uint8Array([1, 2])));
  });

  it('differs for different values and types', () => {
    const values: unknown[] = [
      { a: 1 },
      { a: '1' },
      { a: 1, b: undefined },
      [1],
      '1',
      1,
      -0,
      null,
      undefined,
      true,
      new Uint8Array([1, 2]),
      new Uint8Array([2, 1]),
      new Blob(['ab'], { type: 'image/jpeg' }),
      new Map([['a', 1]]),
      new Set([1]),
    ];
    const prints = values.map(fingerprint);
    expect(new Set(prints).size).toBe(values.length);
    expect(prints.every((print) => /^[0-9a-f]{16}$/.test(print))).toBe(true);
  });

  it('survives a value that contains itself', () => {
    const loop: Record<string, unknown> = { name: 'loop' };
    loop.self = loop;
    expect(fingerprint(loop)).toMatch(/^[0-9a-f]{16}$/);
  });
});
