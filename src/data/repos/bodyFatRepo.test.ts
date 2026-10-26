import { describe, expect, it } from 'vitest';
import type { Profile } from '../../domain/model';
import { fixedClock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeBodyFat, makeProfileRow } from '../../test/factories';
import { settleQuarantine } from '../guard';
import { PROFILE_KEY, type PlatewiseDb } from '../schema';
import { createBodyFatRepo } from './bodyFatRepo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const clock = fixedClock(FACTORY_NOW, 'America/New_York');

/** A fresh database with a profile (no body fat unless given) and a body-fat repository. */
async function setup(profile: Partial<Profile> = {}) {
  const { db } = await openTestDb();
  await db.profile.put(makeProfileRow(profile));
  const repo = createBodyFatRepo(db, { clock, newId: withIdSequence('bodyfat') });
  return { db, repo };
}

async function profileBodyFat(db: PlatewiseDb) {
  return (await db.profile.get(PROFILE_KEY))?.bodyFat;
}

/** Makes every write over an existing profile on this connection fail, like a full disk would. */
function breakProfileWrites(db: PlatewiseDb): void {
  db.profile.hook('updating', () => {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  });
}

describe('addReading (R05.8)', () => {
  it('moves the profile body fat to the newest reading; a back-dated one leaves it (R05.8)', async () => {
    const { db, repo } = await setup();

    expect(await repo.addReading({ at: FACTORY_NOW, fraction: 0.25 })).toEqual({
      id: 'bodyfat-1',
      at: FACTORY_NOW,
      fraction: 0.25,
    });
    expect(await profileBodyFat(db)).toBe(0.25);

    await repo.addReading({ at: FACTORY_NOW - 5 * DAY, fraction: 0.22 });
    expect(await profileBodyFat(db)).toBe(0.25);

    await repo.addReading({ at: FACTORY_NOW + HOUR, fraction: 0.24 });
    expect(await profileBodyFat(db)).toBe(0.24);
    db.close();
  });

  it('keeps goal body fat and the rest of the profile when it syncs', async () => {
    const { db, repo } = await setup({ bodyFat: 0.3, goalBodyFat: 0.2, weightKg: 70 });

    await repo.addReading({ at: FACTORY_NOW, fraction: 0.28 });

    expect(await db.profile.get(PROFILE_KEY)).toEqual(
      makeProfileRow({ bodyFat: 0.28, goalBodyFat: 0.2, weightKg: 70 }),
    );
    db.close();
  });

  it('stores nothing when the profile write fails (R05.8)', async () => {
    const { db, repo } = await setup({ bodyFat: 0.3 });
    breakProfileWrites(db);

    await expect(repo.addReading({ at: FACTORY_NOW, fraction: 0.25 })).rejects.toThrow(/quota/);

    expect(await db.bodyFat.count()).toBe(0);
    expect(await profileBodyFat(db)).toBe(0.3);
    db.close();
  });

  it.each([
    ['0', 0],
    ['1 (100 %)', 1],
    ['a negative fraction', -0.2],
    ['a value that is not a number', Number.NaN],
  ])('refuses %s and stores nothing', async (_label, fraction) => {
    const { db, repo } = await setup();
    await expect(repo.addReading({ at: FACTORY_NOW, fraction })).rejects.toThrow(RangeError);
    expect(await db.bodyFat.count()).toBe(0);
    db.close();
  });
});

describe('deleteReading (R05.8)', () => {
  it('moves the profile body fat to the previous reading when the newest is deleted (R05.8)', async () => {
    const { db, repo } = await setup();
    await repo.addReading({ at: FACTORY_NOW - DAY, fraction: 0.26 });
    const newest = await repo.addReading({ at: FACTORY_NOW, fraction: 0.25 });

    await repo.deleteReading(newest.id);

    expect(await profileBodyFat(db)).toBe(0.26);
    db.close();
  });

  it('keeps the profile value when the last reading is deleted (R05.8)', async () => {
    const { db, repo } = await setup({ bodyFat: 0.3 });
    const only = await repo.addReading({ at: FACTORY_NOW, fraction: 0.25 });

    await repo.deleteReading(only.id);

    expect(await db.bodyFat.count()).toBe(0);
    expect(await profileBodyFat(db)).toBe(0.25);
    db.close();
  });

  it('deletes the reading and the profile change together, or neither (R05.8)', async () => {
    const { db, repo } = await setup({ bodyFat: 0.25 });
    await db.bodyFat.bulkPut([
      makeBodyFat({ id: 'older', at: FACTORY_NOW - DAY, fraction: 0.26 }),
      makeBodyFat({ id: 'newest', at: FACTORY_NOW, fraction: 0.25 }),
    ]);
    breakProfileWrites(db);

    await expect(repo.deleteReading('newest')).rejects.toThrow(/quota/);

    expect(await db.bodyFat.count()).toBe(2);
    expect(await profileBodyFat(db)).toBe(0.25);
    db.close();
  });
});

describe('seedFirst', () => {
  it('stores one reading when seeded twice, and sets the profile body fat', async () => {
    const { db, repo } = await setup();

    expect(await repo.seedFirst(0.24, FACTORY_NOW)).toEqual({
      id: 'bodyfat-1',
      at: FACTORY_NOW,
      fraction: 0.24,
    });
    expect(await repo.seedFirst(0.24, FACTORY_NOW)).toBeNull();

    expect(await db.bodyFat.count()).toBe(1);
    expect(await profileBodyFat(db)).toBe(0.24);
    db.close();
  });
});

describe('reads', () => {
  it('lists whole local days oldest first, the history newest first, and the latest by date', async () => {
    const { db, repo } = await setup();
    await db.bodyFat.bulkPut([
      makeBodyFat({ id: 'c', at: Date.parse('2026-10-27T00:00:00-04:00') }),
      makeBodyFat({ id: 'a', at: Date.parse('2026-10-25T00:00:00-04:00') }),
      makeBodyFat({ id: 'b', at: Date.parse('2026-10-26T23:59:59-04:00') }),
      makeBodyFat({ id: 'early', at: Date.parse('2026-10-24T23:59:59-04:00') }),
    ]);

    expect((await repo.between('2026-10-25', '2026-10-26')).map((row) => row.id)).toEqual([
      'a',
      'b',
    ]);
    expect((await repo.history()).map((row) => row.id)).toEqual(['c', 'b', 'a', 'early']);
    expect((await repo.latest())?.id).toBe('c');
    db.close();
  });

  it('drops an unreadable reading from reads and keeps it (R06.1)', async () => {
    const { db, repo } = await setup();
    const broken = { id: 'broken', at: FACTORY_NOW, fraction: 'lean' };
    await db.bodyFat.bulkPut([makeBodyFat({ id: 'ok' }), broken as never]);

    expect((await repo.history()).map((row) => row.id)).toEqual(['ok']);
    await settleQuarantine(db);

    expect(await db.bodyFat.get('broken')).toEqual(broken);
    expect(await db.quarantine.count()).toBe(1);
    db.close();
  });
});
