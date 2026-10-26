import { describe, expect, it } from 'vitest';
import { createProfileRepo } from '../data/repos/profileRepo';
import { createSettingsRepo, type SettingsRepo } from '../data/repos/settingsRepo';
import { createWeightRepo } from '../data/repos/weightRepo';
import { profileDefaults } from '../domain/profile/profile';
import { openTestDb } from '../test/db';
import { FACTORY_NOW } from '../test/factories';
import { createOnboardingService, type OnboardingServiceDeps } from './onboarding';

async function setUp() {
  const { db, bus } = await openTestDb();
  const profileRepo = createProfileRepo(db);
  // The repository's own locale is the opposite of what the tests pass, so stored units show.
  const settingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
  const weightRepo = createWeightRepo(db, { bus });
  return { db, profileRepo, settingsRepo, weightRepo };
}

describe('startWithDefaults', () => {
  it('stores the default profile, the locale units, one weigh-in and onboarding done', async () => {
    const repos = await setUp();
    const service = createOnboardingService(repos);

    await service.startWithDefaults(FACTORY_NOW, 'en-US');

    expect(await repos.profileRepo.get()).toEqual({
      kind: 'ok',
      value: profileDefaults('2026-10-26'),
    });
    const history = await repos.weightRepo.history();
    expect(history).toEqual([{ id: expect.any(String), at: FACTORY_NOW, kg: 70 }]);
    const settings = await repos.settingsRepo.snapshot();
    expect(settings['units.energy']).toBe('kcal');
    expect(settings['units.height']).toBe('ftIn');
    expect(settings['units.weight']).toBe('lb');
    expect(settings['onboarding.done']).toBe(true);
  });

  it('stores metric units for a metric locale', async () => {
    const { db, bus } = await openTestDb();
    const settingsRepo = createSettingsRepo(db, { locale: 'en-US', bus });
    const service = createOnboardingService({
      profileRepo: createProfileRepo(db),
      settingsRepo,
      weightRepo: createWeightRepo(db, { bus }),
    });

    await service.startWithDefaults(FACTORY_NOW, 'de-DE');

    expect(await settingsRepo.get('units.height')).toBe('cm');
    expect(await settingsRepo.get('units.weight')).toBe('kg');
  });

  it('dates the profile from the local day of now', async () => {
    const repos = await setUp();
    const service = createOnboardingService(repos);
    // 23:30 in New York is already the next day in UTC; the profile follows the local day.
    const now = Date.parse('2026-10-26T23:30:00-04:00');
    await service.startWithDefaults(now, 'en-US');
    const stored = await repos.profileRepo.get();
    expect(stored.kind === 'ok' && stored.value.birthDate).toBe('2001-10-26');
  });

  it('writes onboarding done last', async () => {
    const calls: string[] = [];
    const deps: OnboardingServiceDeps = {
      profileRepo: {
        save: async () => {
          calls.push('profile');
        },
      },
      settingsRepo: {
        set: (async (key: string, value: unknown) => {
          calls.push(`setting ${key}`);
          return value;
        }) as SettingsRepo['set'],
      },
      weightRepo: {
        seedFirst: async (kg, at) => {
          calls.push('weigh-in');
          return { id: 'weigh-1', kg, at };
        },
      },
    };

    await createOnboardingService(deps).startWithDefaults(FACTORY_NOW, 'en-GB');

    expect(calls).toEqual([
      'profile',
      'setting units.energy',
      'setting units.height',
      'setting units.weight',
      'weigh-in',
      'setting onboarding.done',
    ]);
  });

  it('finishes on a second try after a failed write, still with one weigh-in', async () => {
    const repos = await setUp();
    let refuseDone = true;
    const flakySettings: Pick<SettingsRepo, 'set'> = {
      set: ((key, value) => {
        if (key === 'onboarding.done' && refuseDone) {
          refuseDone = false;
          return Promise.reject(new Error('The disk is full'));
        }
        return repos.settingsRepo.set(key, value);
      }) as SettingsRepo['set'],
    };
    const service = createOnboardingService({ ...repos, settingsRepo: flakySettings });

    await expect(service.startWithDefaults(FACTORY_NOW, 'en-GB')).rejects.toThrow(
      'The disk is full',
    );
    expect(await repos.settingsRepo.get('onboarding.done')).toBe(false);

    await service.startWithDefaults(FACTORY_NOW + 60_000, 'en-GB');
    expect(await repos.settingsRepo.get('onboarding.done')).toBe(true);
    expect(await repos.weightRepo.history()).toHaveLength(1);
  });
});
