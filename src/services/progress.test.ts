import { afterEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../data/bus';
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
  };
  await repos.profileRepo.save(profile);
  const posted: BusMessage[] = [];
  closers.push(bus.subscribe((message) => posted.push(message)));
  // Monday 26 October 2026, 12:30 in New York.
  const service = createProgressService({
    ...repos,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  });
  const profileWeight = async (): Promise<number> => {
    const read = await repos.profileRepo.get();
    if (read.kind !== 'ok') throw new Error(`no profile: ${read.kind}`);
    return read.value.weightKg;
  };
  return { ...repos, service, posted, profileWeight };
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

describe('settings', () => {
  it('stores the weight unit for the whole app (R05.11)', async () => {
    const h = await setUp();
    await h.service.setWeightUnit('lb');
    expect(await h.settingsRepo.get('units.weight')).toBe('lb');
  });

  it('stores whether today counts', async () => {
    const h = await setUp();
    expect(await h.settingsRepo.get('progress.countToday')).toBe(true);
    await h.service.setCountToday(false);
    expect(await h.settingsRepo.get('progress.countToday')).toBe(false);
  });
});
