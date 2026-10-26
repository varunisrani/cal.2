import { describe, expect, it, onTestFinished } from 'vitest';
import type { AppBus } from '../data/bus';
import type { PlatewiseDb } from '../data/db';
import { keptAside } from '../data/guard';
import { ProfileUnreadableError, createProfileRepo } from '../data/repos/profileRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { createWeightRepo } from '../data/repos/weightRepo';
import { defaultProfile } from '../domain/profile/profile';
import { withIdSequence } from '../lib/ids';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, factories } from '../test/factories';
import { quickStartAction, startWithDefaults, type QuickStartDeps } from './quickStart';

const make = factories();
const clock = make.clock;
const HOUR = 3_600_000;

/** A bus that goes nowhere: these tests do not listen for app messages. */
const quietBus: AppBus = { post: () => {}, subscribe: () => () => {}, close: () => {} };

/** The repositories the shell would pass, on the test's database. */
function reposOn(db: PlatewiseDb): QuickStartDeps {
  const settings = createSettingsRepo(db, { bus: quietBus, clock });
  onTestFinished(() => settings.close());
  return {
    profile: createProfileRepo(db),
    settings,
    weight: createWeightRepo(db, { ids: withIdSequence('w'), bus: quietBus, clock }),
    clock,
  };
}

/** The stored settings rows as key → value. */
async function storedSettings(db: PlatewiseDb): Promise<Record<string, unknown>> {
  return Object.fromEntries((await db.settings.toArray()).map((row) => [row.key, row.value]));
}

/** Makes every weigh-in write fail, as a full disk would; returns the undo. */
function failWeighInWrites(db: PlatewiseDb): () => void {
  const diskFull = () => {
    throw new Error('disk full');
  };
  db.weighIns.hook('creating', diskFull);
  return () => db.weighIns.hook('creating').unsubscribe(diskFull);
}

describe('startWithDefaults', () => {
  it('stores the default profile, the region’s units, one weigh-in and onboarding done', async () => {
    const db = await openTestDb();

    const result = await startWithDefaults(reposOn(db), 'en-GB');

    // 12:30 on 26 October 2026 in New York: 25 years before is 26 October 2001.
    const expected = defaultProfile('2026-10-26');
    expect(expected).toMatchObject({ birthDate: '2001-10-26', weightKg: 70, heightCm: 175 });
    expect(result).toEqual({ profile: expected, created: true });
    expect(await createProfileRepo(db).get()).toEqual({ kind: 'ok', value: expected });
    expect(await storedSettings(db)).toEqual({
      'units.energy': 'kcal',
      'units.height': 'cm',
      'units.weight': 'kg',
      'onboarding.done': true,
    });
    expect(await db.weighIns.toArray()).toEqual([{ id: 'w-1', at: FACTORY_NOW, kg: 70 }]);
  });

  it('starts a US browser in pounds and feet and inches, energy in kcal (D-16.10)', async () => {
    const db = await openTestDb();

    await startWithDefaults(reposOn(db), 'en-US');

    expect(await storedSettings(db)).toMatchObject({
      'units.energy': 'kcal',
      'units.height': 'ftIn',
      'units.weight': 'lb',
    });
    // Storage stays metric whatever the display units.
    expect((await db.weighIns.toArray()).map((entry) => entry.kg)).toEqual([70]);
  });

  it('keeps a profile that is already there, its units and its weigh-ins', async () => {
    const db = await openTestDb();
    const mine = make.profile({ weightKg: 64 });
    await db.profile.put(make.profileRow({ weightKg: 64 }));
    await db.settings.put({ key: 'units.weight', value: 'lb' });
    await db.weighIns.put({ id: 'earlier', at: FACTORY_NOW - 48 * HOUR, kg: 64 });

    const result = await startWithDefaults(reposOn(db), 'en-GB');

    expect(result).toEqual({ profile: mine, created: false });
    expect(await createProfileRepo(db).get()).toEqual({ kind: 'ok', value: mine });
    expect(await storedSettings(db)).toEqual({ 'units.weight': 'lb', 'onboarding.done': true });
    expect((await db.weighIns.toArray()).map((entry) => entry.id)).toEqual(['earlier']);
  });

  it('seeds a kept profile’s own weight when it has no weigh-ins yet', async () => {
    const db = await openTestDb();
    await db.profile.put(make.profileRow({ weightKg: 64 }));

    await startWithDefaults(reposOn(db), 'en-GB');

    expect(await db.weighIns.toArray()).toEqual([{ id: 'w-1', at: FACTORY_NOW, kg: 64 }]);
  });

  it('changes nothing more when it runs a second time', async () => {
    const db = await openTestDb();
    const repos = reposOn(db);
    await startWithDefaults(repos, 'en-GB');
    const before = {
      profile: await db.profile.toArray(),
      settings: await storedSettings(db),
      weighIns: await db.weighIns.toArray(),
    };

    expect(await startWithDefaults(repos, 'en-US')).toMatchObject({ created: false });

    expect(await db.profile.toArray()).toEqual(before.profile);
    expect(await storedSettings(db)).toEqual(before.settings);
    expect(await db.weighIns.toArray()).toEqual(before.weighIns);
  });

  it('refuses an unreadable profile and writes nothing (R01.17)', async () => {
    const db = await openTestDb();
    const damaged = { id: 'me', sex: 'male', weightKg: 'heavy' };
    await db.profile.put(damaged as never);

    await expect(startWithDefaults(reposOn(db), 'en-GB')).rejects.toBeInstanceOf(
      ProfileUnreadableError,
    );
    await keptAside();

    expect(await db.profile.get('me')).toEqual(damaged);
    expect(await db.settings.count()).toBe(0);
    expect(await db.weighIns.count()).toBe(0);
  });

  it('leaves onboarding not done when a write fails, and a retry finishes the start', async () => {
    const db = await openTestDb();
    const repos = reposOn(db);
    const undo = failWeighInWrites(db);

    await expect(startWithDefaults(repos, 'en-US')).rejects.toThrow('disk full');
    expect(await storedSettings(db)).not.toHaveProperty('onboarding.done');

    undo();
    expect(await startWithDefaults(repos, 'en-US')).toMatchObject({ created: false });
    expect(await storedSettings(db)).toEqual({
      'units.energy': 'kcal',
      'units.height': 'ftIn',
      'units.weight': 'lb',
      'onboarding.done': true,
    });
    expect(await db.weighIns.count()).toBe(1);
  });
});

describe('quickStartAction', () => {
  it('runs the start with the shell’s repositories and a weight repository on the same database', async () => {
    const db = await openTestDb();
    const { profile, settings } = reposOn(db);
    const start = quickStartAction({ db, profile, settings, bus: quietBus, clock }, 'en-US');
    expect(await db.profile.count()).toBe(0);

    expect(await start()).toMatchObject({ created: true });

    expect(await storedSettings(db)).toMatchObject({
      'units.weight': 'lb',
      'onboarding.done': true,
    });
    expect(await db.weighIns.toArray()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, kg: 70 },
    ]);
  });
});
