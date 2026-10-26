import { describe, expect, it } from 'vitest';
import type { Profile } from '../../domain/model';
import { fixedClock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeProfileRow, makeWeighIn } from '../../test/factories';
import type { BusMessage } from '../bus';
import { settleQuarantine } from '../guard';
import { PROFILE_KEY, type PlatewiseDb } from '../schema';
import { createWeightRepo } from './weightRepo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const clock = fixedClock(FACTORY_NOW, 'America/New_York');

/**
 * A fresh database with a profile (lose, 64 kg, target 60 kg, unless overridden; `null` for
 * none) and a weight repository whose `goal-reached` messages are collected in `heard`.
 */
async function setup(profile: Partial<Profile> | null = {}) {
  const { db, bus } = await openTestDb();
  if (profile) await db.profile.put(makeProfileRow(profile));
  const heard: BusMessage[] = [];
  bus.subscribe((message) => heard.push(message));
  const repo = createWeightRepo(db, { clock, newId: withIdSequence('weigh'), bus });
  return { db, repo, heard };
}

async function storedProfile(db: PlatewiseDb) {
  return db.profile.get(PROFILE_KEY);
}

/** Makes every write over an existing profile on this connection fail, like a full disk would. */
function breakProfileWrites(db: PlatewiseDb): void {
  db.profile.hook('updating', () => {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  });
}

describe('addWeighIn (R05.8, R01.11)', () => {
  it('keeps the profile weight and raises nothing for a back-dated weigh-in below the target (ACC-C11-2, R01.11)', async () => {
    const { db, repo, heard } = await setup({ weightKg: 64, goal: 'lose', goalWeightKg: 60 });
    await db.weighIns.put(makeWeighIn({ id: 'today', at: FACTORY_NOW, kg: 64 }));

    const added = await repo.addWeighIn({ at: FACTORY_NOW - 10 * DAY, kg: 59 });

    expect(added).toEqual({
      entry: { id: 'weigh-1', at: FACTORY_NOW - 10 * DAY, kg: 59 },
      goalReached: false,
    });
    expect(heard).toEqual([]);
    expect((await storedProfile(db))?.weightKg).toBe(64);
    expect(await db.weighIns.count()).toBe(2);
    db.close();
  });

  it('raises goal-reached once when a new latest crosses the lose target (R01.11)', async () => {
    const { db, repo, heard } = await setup({ weightKg: 60.4, goal: 'lose', goalWeightKg: 60 });
    await db.weighIns.put(makeWeighIn({ at: FACTORY_NOW - DAY, kg: 60.4 }));

    const crossing = await repo.addWeighIn({ at: FACTORY_NOW, kg: 59.8 });
    expect(crossing.goalReached).toBe(true);
    expect(heard).toEqual([{ type: 'goal-reached', kg: 59.8 }]);
    expect((await storedProfile(db))?.weightKg).toBe(59.8);

    const beyond = await repo.addWeighIn({ at: FACTORY_NOW + DAY, kg: 59.5 });
    expect(beyond.goalReached).toBe(false);
    expect(heard).toHaveLength(1);
    db.close();
  });

  it('moves the profile weight to the newest reading only when it differs by more than 0.01 kg (R05.8)', async () => {
    const { db, repo } = await setup({ weightKg: 64 });

    await repo.addWeighIn({ at: FACTORY_NOW, kg: 64.008 });
    expect((await storedProfile(db))?.weightKg).toBe(64);

    await repo.addWeighIn({ at: FACTORY_NOW + HOUR, kg: 64.5 });
    expect((await storedProfile(db))?.weightKg).toBe(64.5);
    db.close();
  });

  it('only moves the weight: a reading past the target keeps the target weight', async () => {
    const { db, repo } = await setup({ weightKg: 61, goal: 'lose', goalWeightKg: 60 });
    await db.weighIns.put(makeWeighIn({ at: FACTORY_NOW - DAY, kg: 61 }));

    await repo.addWeighIn({ at: FACTORY_NOW, kg: 58 });

    const profile = await storedProfile(db);
    expect(profile).toMatchObject({ weightKg: 58, goal: 'lose', goalWeightKg: 60 });
    db.close();
  });

  it('stores nothing and raises nothing when the profile write fails (R05.8)', async () => {
    const { db, repo, heard } = await setup({ weightKg: 60.5, goal: 'lose', goalWeightKg: 60 });
    await db.weighIns.put(makeWeighIn({ id: 'before', at: FACTORY_NOW - DAY, kg: 60.5 }));
    breakProfileWrites(db);

    await expect(repo.addWeighIn({ at: FACTORY_NOW, kg: 59.9 })).rejects.toThrow(/quota/);

    expect((await db.weighIns.toArray()).map((row) => row.id)).toEqual(['before']);
    expect((await storedProfile(db))?.weightKg).toBe(60.5);
    expect(heard).toEqual([]);
    db.close();
  });

  it('stores the reading without a profile and syncs nothing', async () => {
    const { db, repo, heard } = await setup(null);
    await db.weighIns.put(makeWeighIn({ at: FACTORY_NOW - DAY, kg: 70 }));

    const added = await repo.addWeighIn({ at: FACTORY_NOW, kg: 60 });

    expect(added.goalReached).toBe(false);
    expect(heard).toEqual([]);
    expect(await db.weighIns.count()).toBe(2);
    expect(await db.profile.count()).toBe(0);
    db.close();
  });

  it('stores the reading next to an unreadable profile and leaves the profile as it was (R06.1)', async () => {
    const { db, repo } = await setup(null);
    const corrupt = { id: PROFILE_KEY, weightKg: 'heavy', goal: 'lose', goalWeightKg: 60 };
    await db.profile.put(corrupt as never);
    await db.weighIns.put(makeWeighIn({ at: FACTORY_NOW - DAY, kg: 61 }));

    const added = await repo.addWeighIn({ at: FACTORY_NOW, kg: 59 });
    await settleQuarantine(db);

    expect(added.goalReached).toBe(false);
    expect(await db.weighIns.count()).toBe(2);
    expect(await db.profile.get(PROFILE_KEY)).toEqual(corrupt);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([corrupt]);
    db.close();
  });

  it.each([
    ['a weight of 0', { at: FACTORY_NOW, kg: 0 }],
    ['a negative weight', { at: FACTORY_NOW, kg: -70 }],
    ['a weight that is not a number', { at: FACTORY_NOW, kg: Number.NaN }],
    ['an instant that is not finite', { at: Number.POSITIVE_INFINITY, kg: 70 }],
  ])('refuses %s and stores nothing', async (_label, reading) => {
    const { db, repo } = await setup();
    await expect(repo.addWeighIn(reading)).rejects.toThrow(RangeError);
    expect(await db.weighIns.count()).toBe(0);
    db.close();
  });
});

describe('deleteWeighIn (R05.8)', () => {
  it('sets the profile weight to the previous reading when the latest is deleted (ACC-G7-1, R05.8)', async () => {
    const { db, repo } = await setup({ weightKg: 64 });
    await repo.addWeighIn({ at: FACTORY_NOW - DAY, kg: 63 });
    const latest = await repo.addWeighIn({ at: FACTORY_NOW, kg: 62 });
    expect((await storedProfile(db))?.weightKg).toBe(62);

    await repo.deleteWeighIn(latest.entry.id);

    expect((await storedProfile(db))?.weightKg).toBe(63);
    expect(await repo.history()).toEqual([{ id: 'weigh-1', at: FACTORY_NOW - DAY, kg: 63 }]);
    db.close();
  });

  it('leaves the profile weight as it was when the only reading is deleted (R05.8)', async () => {
    const { db, repo } = await setup({ weightKg: 64 });
    const only = await repo.addWeighIn({ at: FACTORY_NOW, kg: 62 });

    await repo.deleteWeighIn(only.entry.id);

    expect(await db.weighIns.count()).toBe(0);
    expect((await storedProfile(db))?.weightKg).toBe(62);
    db.close();
  });

  it('changes nothing for an id that is not stored', async () => {
    const { db, repo } = await setup({ weightKg: 64 });
    await db.weighIns.put(makeWeighIn({ id: 'kept', at: FACTORY_NOW, kg: 66 }));

    await repo.deleteWeighIn('gone');

    expect(await db.weighIns.count()).toBe(1);
    expect((await storedProfile(db))?.weightKg).toBe(64);
    db.close();
  });

  it('deletes the reading and the profile change together, or neither (R05.8)', async () => {
    const { db, repo } = await setup({ weightKg: 62 });
    await db.weighIns.bulkPut([
      makeWeighIn({ id: 'older', at: FACTORY_NOW - DAY, kg: 63 }),
      makeWeighIn({ id: 'newest', at: FACTORY_NOW, kg: 62 }),
    ]);
    breakProfileWrites(db);

    await expect(repo.deleteWeighIn('newest')).rejects.toThrow(/quota/);

    expect(await db.weighIns.count()).toBe(2);
    expect((await storedProfile(db))?.weightKg).toBe(62);
    db.close();
  });
});

describe('seedFirst', () => {
  it('stores one reading when seeded twice at the same moment', async () => {
    const { db, repo, heard } = await setup({ weightKg: 64 });

    const results = await Promise.all([
      repo.seedFirst(64, FACTORY_NOW),
      repo.seedFirst(64, FACTORY_NOW),
    ]);

    expect(results.filter((seeded) => seeded !== null)).toHaveLength(1);
    expect(await db.weighIns.count()).toBe(1);
    expect(heard).toEqual([]);
    db.close();
  });

  it('moves the profile weight to the seeded reading and never raises goal-reached', async () => {
    const { db, repo, heard } = await setup({ weightKg: 64, goal: 'lose', goalWeightKg: 60 });

    expect(await repo.seedFirst(59, FACTORY_NOW)).toEqual({
      id: 'weigh-1',
      at: FACTORY_NOW,
      kg: 59,
    });

    expect((await storedProfile(db))?.weightKg).toBe(59);
    expect(heard).toEqual([]);
    db.close();
  });

  it('adds nothing next to a reading that cannot be read (R06.1)', async () => {
    const { db, repo } = await setup();
    await db.weighIns.put({ id: 'unreadable', at: 'yesterday' } as never);

    expect(await repo.seedFirst(64, FACTORY_NOW)).toBeNull();
    expect(await db.weighIns.count()).toBe(1);
    db.close();
  });
});

describe('reads', () => {
  const lateOn24 = Date.parse('2026-10-24T23:59:00-04:00');
  const midnight25 = Date.parse('2026-10-25T00:00:00-04:00');
  const lateOn26 = Date.parse('2026-10-26T23:59:59-04:00');
  const midnight27 = Date.parse('2026-10-27T00:00:00-04:00');

  it('lists whole local days oldest first, the history newest first, and the latest by date', async () => {
    const { db, repo } = await setup();
    // Stored out of date order on purpose.
    await db.weighIns.bulkPut([
      makeWeighIn({ id: 'd', at: midnight27, kg: 61 }),
      makeWeighIn({ id: 'a', at: lateOn24, kg: 64 }),
      makeWeighIn({ id: 'c', at: lateOn26, kg: 62 }),
      makeWeighIn({ id: 'b', at: midnight25, kg: 63 }),
    ]);

    expect((await repo.between('2026-10-25', '2026-10-26')).map((row) => row.id)).toEqual([
      'b',
      'c',
    ]);
    expect((await repo.history()).map((row) => row.id)).toEqual(['d', 'c', 'b', 'a']);
    expect((await repo.latest())?.id).toBe('d');
    db.close();
  });

  it('drops an unreadable reading from every read and keeps it (R06.1)', async () => {
    const { db, repo } = await setup();
    const broken = { id: 'broken', at: midnight25, kg: 'heavy' };
    await db.weighIns.bulkPut([makeWeighIn({ id: 'ok', at: lateOn26 }), broken as never]);

    expect((await repo.between('2026-10-25', '2026-10-26')).map((row) => row.id)).toEqual(['ok']);
    expect((await repo.history()).map((row) => row.id)).toEqual(['ok']);
    await settleQuarantine(db);

    expect(await db.weighIns.get('broken')).toEqual(broken);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([broken]);
    db.close();
  });

  it('has no latest reading when none is stored', async () => {
    const { db, repo } = await setup();
    expect(await repo.latest()).toBeNull();
    db.close();
  });
});
