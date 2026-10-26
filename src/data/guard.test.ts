import { describe, expect, it } from 'vitest';
import { freshDbOptions, openTestDb } from '../test/db';
import { FACTORY_NOW, factories } from '../test/factories';
import { ready, watch } from '../test/live';
import { decodeEntry, decodeProfile } from './codecs';
import { transact, type PlatewiseDb } from './db';
import {
  UNREADABLE_FLAG,
  WriteBlockedError,
  guardKey,
  hasUnreadableData,
  keptAside,
  readAll,
  readOne,
  writeOne,
  type ReadAllResult,
} from './guard';
import { live } from './live';
import type { DiaryEntry } from '../domain/model';

const make = factories();
const clock = make.clock;

/** An entry row that cannot be read: kcal is text. */
function brokenEntry(id: string, kcal: unknown = 'plenty') {
  return { id, name: 'Mystery stew', kcal, protein: 1, carbs: 1, fat: 1, loggedAt: FACTORY_NOW };
}

/** Writes a raw value straight into a table, as damage or another build would. */
async function putRaw(db: PlatewiseDb, table: string, raw: unknown): Promise<void> {
  await db.table(table).put(raw);
}

async function quarantined(db: PlatewiseDb) {
  return (await db.quarantine.toArray()).map(({ table, key, at, raw }) => ({
    table,
    key,
    at,
    raw,
  }));
}

const ids = (items: { id: string }[]) => items.map((item) => item.id).sort();

describe('readAll', () => {
  it('leaves out a damaged entry, keeps it aside and still shows the others (ACC-K9-1, R06.1)', async () => {
    const db = await openTestDb();
    const [lunch, dinner] = [make.entry(), make.entry({ meal: 'dinner' })];
    const broken = brokenEntry('entry-broken');
    await db.entries.bulkPut([lunch, dinner]);
    await putRaw(db, 'entries', broken);

    const read = await readAll(db, 'entries', decodeEntry, { clock });

    expect(ids(read.items)).toEqual(ids([lunch, dinner]));
    expect(read.dropped).toBe(1);
    expect(await quarantined(db)).toEqual([
      { table: 'entries', key: 'entry-broken', at: FACTORY_NOW, raw: broken },
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    // Dropped from the result, never from the table.
    expect(await db.table('entries').get('entry-broken')).toEqual(broken);
  });

  it('keeps nothing aside and raises no flag when every row reads', async () => {
    const db = await openTestDb();
    await db.entries.bulkPut([make.entry(), make.entry()]);
    expect((await readAll(db, 'entries', decodeEntry)).dropped).toBe(0);
    expect(await db.quarantine.count()).toBe(0);
    expect(await hasUnreadableData(db)).toBe(false);
  });

  it('copies the same unreadable value once, also after a reload', async () => {
    const options = freshDbOptions();
    const db = await openTestDb(options);
    await putRaw(db, 'entries', brokenEntry('entry-broken'));
    await readAll(db, 'entries', decodeEntry);
    await readAll(db, 'entries', decodeEntry);
    await readOne(db, 'entries', 'entry-broken', decodeEntry);
    expect(await db.quarantine.count()).toBe(1);

    db.close();
    const reloaded = await openTestDb(options);
    await readAll(reloaded, 'entries', decodeEntry);
    expect(await reloaded.quarantine.count()).toBe(1);
  });

  it('copies the value again when the unreadable row changes', async () => {
    const db = await openTestDb();
    await putRaw(db, 'entries', brokenEntry('entry-broken', 'plenty'));
    await readAll(db, 'entries', decodeEntry);
    await putRaw(db, 'entries', brokenEntry('entry-broken', 'even more'));
    await readAll(db, 'entries', decodeEntry);
    const copies = await quarantined(db);
    expect(copies.map((copy) => (copy.raw as { kcal: unknown }).kcal)).toEqual([
      'plenty',
      'even more',
    ]);
  });

  it('never replaces unreadable rows: adding to a table nobody can read keeps them (R05.6)', async () => {
    const db = await openTestDb();
    const first = brokenEntry('entry-old-1');
    const second = brokenEntry('entry-old-2', null);
    await putRaw(db, 'entries', first);
    await putRaw(db, 'entries', second);

    const read = await readAll(db, 'entries', decodeEntry);
    expect(read).toEqual({ items: [], dropped: 2 });

    const added = make.entry();
    await writeOne(db, 'entries', added, decodeEntry);
    expect(await db.table('entries').bulkGet(['entry-old-1', 'entry-old-2', added.id])).toEqual([
      first,
      second,
      added,
    ]);
  });

  it('reads only the rows the select function picks', async () => {
    const db = await openTestDb();
    const today = make.entry();
    const yesterday = make.entry({ loggedAt: FACTORY_NOW - 86_400_000 });
    await db.entries.bulkPut([today, yesterday]);
    await putRaw(db, 'entries', { ...brokenEntry('entry-broken'), dayKey: today.dayKey });

    const read = await readAll(db, 'entries', decodeEntry, {
      select: (table) => table.where('dayKey').equals(today.dayKey).toArray(),
    });
    expect(read).toEqual({ items: [today], dropped: 1 });
  });
});

describe('readOne', () => {
  it('tells a missing, a readable and a corrupt record apart', async () => {
    const db = await openTestDb();
    expect(await readOne(db, 'profile', 'me', decodeProfile)).toEqual({ kind: 'missing' });
    expect(await hasUnreadableData(db)).toBe(false);

    await db.profile.put(make.profileRow());
    expect(await readOne(db, 'profile', 'me', decodeProfile)).toEqual({
      kind: 'ok',
      value: make.profile(),
    });

    const damaged = { id: 'me', birthDate: 'last spring', heightCm: 170, weightKg: 70 };
    await putRaw(db, 'profile', damaged);
    expect(await readOne(db, 'profile', 'me', decodeProfile)).toEqual({
      kind: 'corrupt',
      raw: damaged,
    });
    expect((await quarantined(db)).map((copy) => copy.raw)).toEqual([damaged]);
  });
});

describe('writeOne', () => {
  it('keeps a corrupt profile aside before saving over it (R06.1)', async () => {
    const db = await openTestDb();
    const damaged = { id: 'me', sex: 'female', heightCm: 'tall', weightKg: 61 };
    await putRaw(db, 'profile', damaged);

    const fixed = make.profileRow();
    await writeOne(db, 'profile', fixed, decodeProfile, { clock });

    expect(await quarantined(db)).toEqual([
      { table: 'profile', key: 'me', at: FACTORY_NOW, raw: damaged },
    ]);
    expect(await db.profile.get('me')).toEqual(fixed);
    expect(await hasUnreadableData(db)).toBe(true);
  });

  it('refuses the save and changes nothing when the copy cannot be written (R06.1)', async () => {
    const db = await openTestDb();
    const damaged = { id: 'me', heightCm: 'tall' };
    await putRaw(db, 'profile', damaged);
    const diskFull = () => {
      throw new Error('quota exceeded');
    };
    db.quarantine.hook('creating', diskFull);

    const saving = writeOne(db, 'profile', make.profileRow(), decodeProfile);
    await expect(saving).rejects.toBeInstanceOf(WriteBlockedError);
    await expect(saving).rejects.toMatchObject({ table: 'profile', key: 'me' });

    db.quarantine.hook('creating').unsubscribe(diskFull);
    expect(await db.table('profile').get('me')).toEqual(damaged);
    expect(await db.quarantine.count()).toBe(0);
    expect(await db.meta.get(UNREADABLE_FLAG)).toBeUndefined();
  });

  it('writes over a readable record without copying anything', async () => {
    const db = await openTestDb();
    await db.profile.put(make.profileRow());
    await writeOne(db, 'profile', make.profileRow({ weightKg: 66 }), decodeProfile);
    expect((await db.profile.get('me'))?.weightKg).toBe(66);
    expect(await db.quarantine.count()).toBe(0);
  });

  it('refuses to store a record that would not read back', async () => {
    const db = await openTestDb();
    const bad = { ...make.entry(), kcal: Number.NaN };
    await expect(writeOne(db, 'entries', bad, decodeEntry)).rejects.toBeInstanceOf(TypeError);
    expect(await db.entries.count()).toBe(0);
  });
});

describe('keeping values aside inside other work', () => {
  it('copies a value found by a live query once the query has finished', async () => {
    const db = await openTestDb();
    await db.entries.put(make.entry());
    await putRaw(db, 'entries', brokenEntry('entry-broken'));

    const feed = watch(live(() => readAll(db, 'entries', decodeEntry)));
    const state = await feed.until(ready<ReadAllResult<DiaryEntry>>());
    expect(state).toMatchObject({ status: 'ready', value: { dropped: 1 } });

    await keptAside();
    expect((await quarantined(db)).map((copy) => copy.key)).toEqual(['entry-broken']);
    expect(await hasUnreadableData(db)).toBe(true);
  });

  it('copies inside a read-write transaction, and the copy rolls back with it', async () => {
    const db = await openTestDb();
    await putRaw(db, 'entries', brokenEntry('entry-broken'));

    const failing = transact(db, 'rw', ['entries'], async () => {
      await readAll(db, 'entries', decodeEntry);
      throw new Error('later step failed');
    });
    await expect(failing).rejects.toThrow('later step failed');
    expect(await db.quarantine.count()).toBe(0);

    await transact(db, 'rw', ['entries'], () => readAll(db, 'entries', decodeEntry));
    expect(await db.quarantine.count()).toBe(1);
  });

  it('insists that guardKey runs inside a read-write transaction over its table', async () => {
    const db = await openTestDb();
    await expect(guardKey(db, 'profile', 'me', decodeProfile)).rejects.toThrow(/transact/);
    await expect(
      transact(db, 'rw', ['profile'], () => guardKey(db, 'profile', 'me', decodeProfile)),
    ).resolves.toBeUndefined();
  });

  it('keeps an unreadable value aside before a delete in the same transaction', async () => {
    const db = await openTestDb();
    const broken = brokenEntry('entry-broken');
    await putRaw(db, 'entries', broken);

    await transact(db, 'rw', ['entries'], async () => {
      await guardKey(db, 'entries', 'entry-broken', decodeEntry);
      await db.entries.delete('entry-broken');
    });

    expect(await db.entries.count()).toBe(0);
    expect((await quarantined(db)).map((copy) => copy.raw)).toEqual([broken]);
  });
});
