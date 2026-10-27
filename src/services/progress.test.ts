import { afterEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../data/bus';
import { createBodyFatRepo } from '../data/repos/bodyFatRepo';
import { createProfileRepo } from '../data/repos/profileRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { createWeightRepo } from '../data/repos/weightRepo';
import type { Profile } from '../domain/model';
import { fixedClock } from '../lib/clock';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeProfile } from '../test/factories';
import { createProgressService } from './progress';

const HOUR = 60 * 60 * 1000;

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp(profile: Profile = makeProfile({ goal: 'maintain', weightKg: 72 })) {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const repos = {
    profileRepo: createProfileRepo(db),
    settingsRepo: createSettingsRepo(db, { locale: 'en-GB', bus }),
    weightRepo: createWeightRepo(db, { bus }),
    bodyFatRepo: createBodyFatRepo(db),
  };
  await repos.profileRepo.save(profile);
  const posted: BusMessage[] = [];
  closers.push(bus.subscribe((message) => posted.push(message)));
  // Monday 26 October 2026, 12:30 in New York.
  const service = createProgressService({
    ...repos,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  });
  const stored = async (): Promise<Profile> => {
    const read = await repos.profileRepo.get();
    if (read.kind !== 'ok') throw new Error(`no profile: ${read.kind}`);
    return read.value;
  };
  const profileWeight = async (): Promise<number> => (await stored()).weightKg;
  const profileBodyFat = async (): Promise<number | undefined> => (await stored()).bodyFat;
  return { ...repos, service, posted, profileWeight, profileBodyFat };
}

describe('logWeight', () => {
  it("stamps today's weigh-in now and moves the profile weight to it", async () => {
    const h = await setUp();

    const added = await h.service.logWeight(71.4, '2026-10-26');

    expect(added.entry).toEqual({ id: expect.any(String), at: FACTORY_NOW, kg: 71.4 });
    expect(await h.profileWeight()).toBe(71.4);
  });

  it('puts an earlier day at the current clock time and keeps the newer profile weight (ACC-G4-1)', async () => {
    const h = await setUp();
    await h.weightRepo.addWeighIn({ at: FACTORY_NOW - 2 * HOUR, kg: 72 });

    const added = await h.service.logWeight(73.5, '2026-10-19');

    expect(added.entry.at).toBe(Date.parse('2026-10-19T12:30:00-04:00'));
    expect(await h.profileWeight()).toBe(72);
    expect(await h.weightRepo.history()).toHaveLength(2);
  });

  it('takes a day after today as today', async () => {
    const h = await setUp();

    const added = await h.service.logWeight(70, '2026-10-29');

    expect(added.entry.at).toBe(FACTORY_NOW);
  });

  it('leaves goal-reached to the repository: a newest weight past a lose target raises it', async () => {
    const h = await setUp(makeProfile({ goal: 'lose', weightKg: 80, goalWeightKg: 79.5 }));
    await h.weightRepo.addWeighIn({ at: FACTORY_NOW - 24 * HOUR, kg: 80 });

    const added = await h.service.logWeight(79.4, '2026-10-26');

    expect(added.goalReached).toBe(true);
    expect(h.posted).toContainEqual({ type: 'goal-reached', kg: 79.4 });
  });

  it('raises nothing for a back-dated weight under a lose target (R05.7)', async () => {
    const h = await setUp(makeProfile({ goal: 'lose', weightKg: 80, goalWeightKg: 79.5 }));
    await h.weightRepo.addWeighIn({ at: FACTORY_NOW - 24 * HOUR, kg: 80 });

    const added = await h.service.logWeight(79, '2026-10-12');

    expect(added.goalReached).toBe(false);
    expect(h.posted.filter((message) => message.type === 'goal-reached')).toEqual([]);
    expect(await h.profileWeight()).toBe(80);
  });

  it('refuses something that is not a day', async () => {
    const h = await setUp();
    await expect(h.service.logWeight(70, '26/10/2026')).rejects.toThrow(RangeError);
    expect(await h.weightRepo.history()).toEqual([]);
  });
});

describe('logBodyFat', () => {
  it('stamps the reading now and moves the profile body fat to it (R05.8)', async () => {
    const h = await setUp(makeProfile({ bodyFat: 0.22 }));
    await h.bodyFatRepo.addReading({ at: FACTORY_NOW - 24 * HOUR, fraction: 0.21 });

    const added = await h.service.logBodyFat(0.185);

    expect(added).toEqual({ id: expect.any(String), at: FACTORY_NOW, fraction: 0.185 });
    expect(await h.profileBodyFat()).toBe(0.185);
    expect(await h.bodyFatRepo.history()).toHaveLength(2);
  });

  it('refuses a value that is not a fraction between 0 and 1, and stores nothing', async () => {
    const h = await setUp(makeProfile({ bodyFat: 0.22 }));
    await expect(h.service.logBodyFat(18.5)).rejects.toThrow(RangeError);
    expect(await h.bodyFatRepo.history()).toEqual([]);
    expect(await h.profileBodyFat()).toBe(0.22);
  });
});

describe('history deletes', () => {
  it('deletes the newest weigh-in and moves the profile weight to the one before (R05.8)', async () => {
    const h = await setUp();
    await h.weightRepo.addWeighIn({ at: FACTORY_NOW - 48 * HOUR, kg: 72.6 });
    const newest = await h.weightRepo.addWeighIn({ at: FACTORY_NOW - 2 * HOUR, kg: 71.8 });
    expect(await h.profileWeight()).toBe(71.8);

    await h.service.deleteWeighIn(newest.entry.id);

    expect((await h.weightRepo.history()).map((reading) => reading.kg)).toEqual([72.6]);
    expect(await h.profileWeight()).toBe(72.6);
  });

  it('deletes body-fat readings; the profile follows the newest left, then keeps the last value (R05.8)', async () => {
    const h = await setUp(makeProfile({ bodyFat: 0.24 }));
    const older = await h.bodyFatRepo.addReading({ at: FACTORY_NOW - 48 * HOUR, fraction: 0.23 });
    const newest = await h.bodyFatRepo.addReading({ at: FACTORY_NOW - 2 * HOUR, fraction: 0.22 });

    await h.service.deleteBodyFatReading(newest.id);
    expect(await h.profileBodyFat()).toBe(0.23);

    await h.service.deleteBodyFatReading(older.id);
    expect(await h.bodyFatRepo.history()).toEqual([]);
    expect(await h.profileBodyFat()).toBe(0.23);
  });

  it('does nothing for an id that is not stored', async () => {
    const h = await setUp();
    await h.weightRepo.addWeighIn({ at: FACTORY_NOW - 2 * HOUR, kg: 71.8 });

    await h.service.deleteWeighIn('gone');
    await h.service.deleteBodyFatReading('gone');

    expect(await h.weightRepo.history()).toHaveLength(1);
    expect(await h.profileWeight()).toBe(71.8);
  });
});

describe('settings', () => {
  it('has no weight unit to store: weight is kg for the whole app (R05.11, D-16.91)', async () => {
    const h = await setUp();
    expect('setWeightUnit' in h.service).toBe(false);
    expect(await h.settingsRepo.get('units.weight')).toBe('kg');
  });

  it('stores whether today counts', async () => {
    const h = await setUp();
    expect(await h.settingsRepo.get('progress.countToday')).toBe(true);
    await h.service.setCountToday(false);
    expect(await h.settingsRepo.get('progress.countToday')).toBe(false);
  });
});
