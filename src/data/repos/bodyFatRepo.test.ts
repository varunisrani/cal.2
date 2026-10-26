import { describe, expect, it } from 'vitest';
import type { Profile } from '../../domain/model';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, factories } from '../../test/factories';
import { ready, watch } from '../../test/live';
import type { PlatewiseDb } from '../db';
import { createBodyFatRepo } from './bodyFatRepo';

const make = factories();
const clock = make.clock;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = FACTORY_NOW;

async function setup(profile: Partial<Profile> | null = {}) {
  const db = await openTestDb();
  if (profile) await db.profile.put(make.profileRow(profile));
  const repo = createBodyFatRepo(db, { ids: withIdSequence('bf'), clock });
  return { db, repo };
}

async function profileBodyFat(db: PlatewiseDb): Promise<number | undefined> {
  return (await db.profile.get('me'))?.bodyFat;
}

/** Local wall-clock time in the test zone (New York). */
function local(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

describe('addReading', () => {
  it('moves the profile body fat to the latest reading (R05.8)', async () => {
    const { db, repo } = await setup();
    expect(await profileBodyFat(db)).toBeUndefined();

    await repo.addReading({ at: NOW - DAY, fraction: 0.25 });
    expect(await profileBodyFat(db)).toBe(0.25);

    const reading = await repo.addReading({ at: NOW, fraction: 0.235 });
    expect(reading).toEqual({ id: 'bf-2', at: NOW, fraction: 0.235 });
    expect(await profileBodyFat(db)).toBe(0.235);
  });

  it('leaves the profile body fat on the latest reading when an older one is added', async () => {
    const { db, repo } = await setup();
    await repo.addReading({ at: NOW, fraction: 0.24 });

    await repo.addReading({ at: NOW - 10 * DAY, fraction: 0.3 });

    expect(await profileBodyFat(db)).toBe(0.24);
    expect(await db.bodyFat.count()).toBe(2);
  });

  it('does not rewrite the profile for a difference within the tolerance', async () => {
    const { db, repo } = await setup({ bodyFat: 0.25005 });

    await repo.addReading({ at: NOW, fraction: 0.25 });

    expect(await profileBodyFat(db)).toBe(0.25005);
  });

  it('stores the reading and leaves an unreadable profile exactly as it was', async () => {
    const { db, repo } = await setup(null);
    const broken = { id: 'me', heightCm: 'tall', bodyFat: 0.3 };
    await db.table('profile').put(broken);

    await repo.addReading({ at: NOW, fraction: 0.22 });

    expect(await db.table('profile').get('me')).toEqual(broken);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([broken]);
    expect(await db.bodyFat.count()).toBe(1);
  });

  it('stores the reading without a profile', async () => {
    const { db, repo } = await setup(null);

    await repo.addReading({ at: NOW, fraction: 0.22 });

    expect(await db.bodyFat.count()).toBe(1);
    expect(await db.profile.count()).toBe(0);
  });

  it('refuses a fraction outside 0–1 or a time that is not an instant, and stores nothing', async () => {
    const { db, repo } = await setup({ bodyFat: 0.2 });

    for (const fraction of [0, 1, 22, -0.1, Number.NaN]) {
      await expect(repo.addReading({ at: NOW, fraction })).rejects.toThrow(RangeError);
    }
    await expect(repo.addReading({ at: Number.NaN, fraction: 0.2 })).rejects.toThrow(RangeError);

    expect(await db.bodyFat.count()).toBe(0);
    expect(await profileBodyFat(db)).toBe(0.2);
  });
});

describe('deleteReading', () => {
  it('moves the profile body fat to the new latest when the latest is deleted (R05.8)', async () => {
    const { db, repo } = await setup();
    await repo.addReading({ at: NOW - DAY, fraction: 0.26 });
    const latest = await repo.addReading({ at: NOW, fraction: 0.24 });

    expect(await repo.deleteReading(latest.id)).toBe(true);

    expect(await profileBodyFat(db)).toBe(0.26);
  });

  it('keeps the profile body fat when the last reading is deleted (R05.8)', async () => {
    const { db, repo } = await setup({ bodyFat: 0.3 });
    const only = await repo.addReading({ at: NOW, fraction: 0.22 });
    expect(await profileBodyFat(db)).toBe(0.22);

    expect(await repo.deleteReading(only.id)).toBe(true);

    expect(await db.bodyFat.count()).toBe(0);
    expect(await profileBodyFat(db)).toBe(0.22);
  });

  it('answers false for an id that is not stored', async () => {
    const { repo } = await setup();

    expect(await repo.deleteReading('nothing-here')).toBe(false);
  });

  it('keeps an unreadable reading aside before deleting it', async () => {
    const { db, repo } = await setup();
    const broken = { id: 'bf-broken', at: NOW, fraction: 'a fifth' };
    await db.table('bodyFat').put(broken);

    expect(await repo.deleteReading('bf-broken')).toBe(true);

    expect(await db.bodyFat.count()).toBe(0);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([broken]);
  });
});

describe('seedFirst', () => {
  it('adds one row when seeded twice', async () => {
    const { db, repo } = await setup();

    const first = await repo.seedFirst(0.21, NOW);
    const second = await repo.seedFirst(0.21, NOW + HOUR);

    expect(first).toEqual({ id: 'bf-1', at: NOW, fraction: 0.21 });
    expect(second).toBeNull();
    expect(await db.bodyFat.toArray()).toEqual([first]);
    expect(await profileBodyFat(db)).toBe(0.21);
  });
});

describe('reads', () => {
  it('lists a window oldest first and keeps a reading from late on its last day (R05.5)', async () => {
    const { repo } = await setup();
    const times = [
      local(2026, 10, 26, 23, 45),
      local(2026, 10, 19, 23, 59),
      local(2026, 10, 22),
      local(2026, 10, 27, 0, 0),
    ];
    for (const at of times) await repo.addReading({ at, fraction: 0.2 });

    const window = await repo.between('2026-10-20', '2026-10-26');

    expect(window.map((reading) => reading.at)).toEqual([
      local(2026, 10, 22),
      local(2026, 10, 26, 23, 45),
    ]);
  });

  it('lists the history newest first and gives the newest as the latest', async () => {
    const { db, repo } = await setup();
    await repo.addReading({ at: NOW - 2 * DAY, fraction: 0.23 });
    await repo.addReading({ at: NOW, fraction: 0.22 });
    await repo.addReading({ at: NOW - 4 * DAY, fraction: 0.24 });
    await db.table('bodyFat').put({ id: 'bf-broken', at: NOW + DAY, fraction: 2 });

    expect((await repo.history()).map((reading) => reading.fraction)).toEqual([0.22, 0.23, 0.24]);
    expect(await repo.latest()).toEqual({ id: 'bf-2', at: NOW, fraction: 0.22 });
  });

  it('pushes a new reading to a live history feed', async () => {
    const { repo } = await setup();
    const history = watch(repo.liveHistory());
    await history.until(ready((value) => value.length === 0));

    await repo.addReading({ at: NOW, fraction: 0.19 });

    await history.until(ready((value) => value.map((r) => r.fraction).join() === '0.19'));
  });
});
