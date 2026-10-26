import { describe, expect, it } from 'vitest';
import type { Profile } from '../../domain/model';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, factories } from '../../test/factories';
import { ready, watch } from '../../test/live';
import type { AppBus, AppMessage } from '../bus';
import type { PlatewiseDb } from '../db';
import { createWeightRepo } from './weightRepo';

const make = factories();
const clock = make.clock;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = FACTORY_NOW;

/** A bus that only records what is posted to it. */
function recordingBus() {
  const posted: AppMessage[] = [];
  const bus: AppBus = {
    post: (message) => {
      posted.push(message);
    },
    subscribe: () => () => {},
    close: () => {},
  };
  return { bus, posted };
}

async function setup(profile: Partial<Profile> | null = { goal: 'lose', goalWeightKg: 75 }) {
  const db = await openTestDb();
  if (profile) await db.profile.put(make.profileRow({ weightKg: 80, ...profile }));
  const { bus, posted } = recordingBus();
  const repo = createWeightRepo(db, { ids: withIdSequence('w'), bus, clock });
  return { db, repo, posted };
}

async function profileWeight(db: PlatewiseDb): Promise<number | undefined> {
  return (await db.profile.get('me'))?.weightKg;
}

/** Local wall-clock time in the test zone (New York). */
function local(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

describe('addWeighIn', () => {
  it('keeps the profile weight and posts nothing for a back-dated weigh-in below the target (ACC-C11-2, R05.7)', async () => {
    const { db, repo, posted } = await setup();
    await repo.addWeighIn({ at: NOW - DAY, kg: 80 });

    const result = await repo.addWeighIn({ at: NOW - 200 * DAY, kg: 74 });

    expect(result.goalReached).toBe(false);
    expect(result.entry).toEqual({ id: 'w-2', at: NOW - 200 * DAY, kg: 74 });
    expect(posted).toEqual([]);
    expect(await profileWeight(db)).toBe(80);
    expect(await db.weighIns.count()).toBe(2);
  });

  it('posts goal-reached once when a new latest weigh-in crosses the lose target (R01.11)', async () => {
    const { db, repo, posted } = await setup();
    await repo.addWeighIn({ at: NOW - 2 * DAY, kg: 80 });

    const crossing = await repo.addWeighIn({ at: NOW - DAY, kg: 74.8 });
    const further = await repo.addWeighIn({ at: NOW, kg: 74.2 });

    expect(crossing.goalReached).toBe(true);
    expect(further.goalReached).toBe(false);
    expect(posted).toEqual([{ type: 'goal-reached', weighInId: crossing.entry.id, kg: 74.8 }]);
    expect(await profileWeight(db)).toBe(74.2);
  });

  it('posts once when two crossing weigh-ins are added at the same moment (R01.11)', async () => {
    const { repo, posted } = await setup();
    await repo.addWeighIn({ at: NOW - DAY, kg: 80 });

    const results = await Promise.all([
      repo.addWeighIn({ at: NOW - HOUR, kg: 74.9 }),
      repo.addWeighIn({ at: NOW, kg: 74.5 }),
    ]);

    expect(results.filter((result) => result.goalReached)).toHaveLength(1);
    expect(posted).toHaveLength(1);
  });

  it('posts for a gain goal and never for maintain', async () => {
    const gain = await setup({ goal: 'gain', goalWeightKg: 82 });
    await gain.repo.addWeighIn({ at: NOW - DAY, kg: 80 });
    expect((await gain.repo.addWeighIn({ at: NOW, kg: 82 })).goalReached).toBe(true);
    expect(gain.posted).toHaveLength(1);

    const maintain = await setup({ goal: 'maintain', goalWeightKg: 75 });
    await maintain.repo.addWeighIn({ at: NOW - DAY, kg: 80 });
    expect((await maintain.repo.addWeighIn({ at: NOW, kg: 74 })).goalReached).toBe(false);
    expect(maintain.posted).toEqual([]);
  });

  it('never counts the very first weigh-in as reaching the goal', async () => {
    const { repo, posted } = await setup();

    expect((await repo.addWeighIn({ at: NOW, kg: 74 })).goalReached).toBe(false);
    expect(posted).toEqual([]);
  });

  it('moves the profile weight to the latest weigh-in only when it differs by more than 0.01 kg (R05.8)', async () => {
    const { db, repo } = await setup({ weightKg: 80.005 });

    await repo.addWeighIn({ at: NOW - HOUR, kg: 80 });
    expect(await profileWeight(db)).toBe(80.005);

    await repo.addWeighIn({ at: NOW, kg: 79.98 });
    expect(await profileWeight(db)).toBe(79.98);
  });

  it('keeps every other profile field as stored when it moves the weight', async () => {
    const db = await openTestDb();
    const stored = { ...make.profileRow({ weightKg: 80 }), fieldFromANewerBuild: 'kept' };
    await db.table('profile').put(stored);
    const repo = createWeightRepo(db, { bus: recordingBus().bus, clock });

    await repo.addWeighIn({ at: NOW, kg: 78 });

    expect(await db.profile.get('me')).toEqual({ ...stored, weightKg: 78 });
  });

  it('stores the weigh-in without a profile and checks no goal', async () => {
    const { db, repo, posted } = await setup(null);

    const result = await repo.addWeighIn({ at: NOW, kg: 70 });

    expect(result.goalReached).toBe(false);
    expect(await db.weighIns.toArray()).toEqual([result.entry]);
    expect(await db.profile.count()).toBe(0);
    expect(posted).toEqual([]);
  });

  it('stores the weigh-in and leaves an unreadable profile exactly as it was', async () => {
    const { db, repo, posted } = await setup(null);
    const broken = { id: 'me', weightKg: 'heavy', goal: 'lose', goalWeightKg: 75 };
    await db.table('profile').put(broken);
    await repo.addWeighIn({ at: NOW - DAY, kg: 80 });

    const result = await repo.addWeighIn({ at: NOW, kg: 74 });

    expect(result.goalReached).toBe(false);
    expect(posted).toEqual([]);
    expect(await db.table('profile').get('me')).toEqual(broken);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([broken]);
    expect(await db.weighIns.count()).toBe(2);
  });

  it('refuses a weight outside 20–250 kg or a time that is not an instant, and stores nothing', async () => {
    const { db, repo } = await setup();

    for (const kg of [19.9, 250.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(repo.addWeighIn({ at: NOW, kg })).rejects.toThrow(RangeError);
    }
    await expect(repo.addWeighIn({ at: Number.NaN, kg: 70 })).rejects.toThrow(RangeError);

    expect(await db.weighIns.count()).toBe(0);
    expect(await profileWeight(db)).toBe(80);
  });

  it('announces nothing and changes nothing when the add fails', async () => {
    const db = await openTestDb();
    await db.profile.put(make.profileRow({ weightKg: 80, goal: 'lose', goalWeightKg: 75 }));
    await db.weighIns.put({ id: 'taken', at: NOW - DAY, kg: 80 });
    const { bus, posted } = recordingBus();
    // Every new weigh-in gets an id that is already stored, so the add itself fails.
    const repo = createWeightRepo(db, { ids: () => 'taken', bus, clock });

    await expect(repo.addWeighIn({ at: NOW, kg: 74 })).rejects.toThrow();

    expect(posted).toEqual([]);
    expect(await db.weighIns.toArray()).toEqual([{ id: 'taken', at: NOW - DAY, kg: 80 }]);
    expect(await profileWeight(db)).toBe(80);
  });
});

describe('deleteWeighIn', () => {
  it('sets the profile weight to the previous weigh-in when the latest is deleted (ACC-G7-1, R05.8)', async () => {
    const { db, repo } = await setup();
    await repo.addWeighIn({ at: NOW - DAY, kg: 81.2 });
    const { entry: latest } = await repo.addWeighIn({ at: NOW, kg: 79.6 });
    expect(await profileWeight(db)).toBe(79.6);

    expect(await repo.deleteWeighIn(latest.id)).toBe(true);

    expect(await profileWeight(db)).toBe(81.2);
    expect(await repo.history()).toEqual([{ id: 'w-1', at: NOW - DAY, kg: 81.2 }]);
  });

  it('keeps the profile weight when the only weigh-in is deleted', async () => {
    const { db, repo } = await setup();
    const { entry } = await repo.addWeighIn({ at: NOW, kg: 77 });

    expect(await repo.deleteWeighIn(entry.id)).toBe(true);

    expect(await db.weighIns.count()).toBe(0);
    expect(await profileWeight(db)).toBe(77);
  });

  it('answers false and changes nothing for an id that is not stored', async () => {
    const { db, repo } = await setup();
    await repo.addWeighIn({ at: NOW, kg: 77 });

    expect(await repo.deleteWeighIn('nothing-here')).toBe(false);

    expect(await db.weighIns.count()).toBe(1);
  });

  it('keeps an unreadable weigh-in aside before deleting it', async () => {
    const { db, repo } = await setup();
    const broken = { id: 'w-broken', at: NOW, kg: 'seventy' };
    await db.table('weighIns').put(broken);

    expect(await repo.deleteWeighIn('w-broken')).toBe(true);

    expect(await db.weighIns.count()).toBe(0);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([broken]);
    expect(await profileWeight(db)).toBe(80);
  });
});

describe('seedFirst', () => {
  it('adds one row when seeded twice', async () => {
    const { db, repo } = await setup({ weightKg: 64 });

    const first = await repo.seedFirst(64, NOW);
    const second = await repo.seedFirst(64, NOW + HOUR);

    expect(first).toEqual({ id: 'w-1', at: NOW, kg: 64 });
    expect(second).toBeNull();
    expect(await db.weighIns.toArray()).toEqual([first]);
  });

  it('does not seed a history whose only rows cannot be read', async () => {
    const { db, repo } = await setup();
    await db.table('weighIns').put({ id: 'w-broken', at: NOW - DAY, kg: -3 });

    expect(await repo.seedFirst(64, NOW)).toBeNull();
    expect(await db.weighIns.count()).toBe(1);
  });
});

describe('reads', () => {
  it('lists a window oldest first and keeps a weigh-in from late on its last day (R05.5)', async () => {
    const { repo } = await setup();
    const times = [
      local(2026, 10, 26, 23, 30),
      local(2026, 10, 19, 23, 59),
      local(2026, 10, 23),
      local(2026, 10, 27, 0, 0),
      local(2026, 10, 20, 0, 0),
    ];
    for (const at of times) await repo.addWeighIn({ at, kg: 70 });

    const window = await repo.between('2026-10-20', '2026-10-26');

    expect(window.map((entry) => entry.at)).toEqual([
      local(2026, 10, 20, 0, 0),
      local(2026, 10, 23),
      local(2026, 10, 26, 23, 30),
    ]);
  });

  it('lists the history newest first and gives the newest as the latest', async () => {
    const { db, repo } = await setup();
    await repo.addWeighIn({ at: NOW - 3 * DAY, kg: 79 });
    await repo.addWeighIn({ at: NOW, kg: 78 });
    await repo.addWeighIn({ at: NOW - 5 * DAY, kg: 80 });
    await db.table('weighIns').put({ id: 'w-broken', at: NOW + DAY, kg: 'none' });

    expect((await repo.history()).map((entry) => entry.kg)).toEqual([78, 79, 80]);
    expect(await repo.latest()).toEqual({ id: 'w-2', at: NOW, kg: 78 });
  });

  it('pushes a new latest weigh-in to a live feed', async () => {
    const { repo } = await setup();
    const latest = watch(repo.liveLatest());
    await latest.until(ready((value) => value === undefined));

    await repo.addWeighIn({ at: NOW, kg: 76.4 });

    await latest.until(ready((value) => value?.kg === 76.4));
  });
});
