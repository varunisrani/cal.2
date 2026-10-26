import { afterEach, describe, expect, it } from 'vitest';
import { createBodyFatRepo } from '../data/repos/bodyFatRepo';
import { createProfileRepo } from '../data/repos/profileRepo';
import { createSettingsRepo, type SettingsRepo } from '../data/repos/settingsRepo';
import { createWeightRepo } from '../data/repos/weightRepo';
import type { Targets } from '../domain/model';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeProfile } from '../test/factories';
import {
  createOnboardingService,
  type OnboardingAnswers,
  type OnboardingServiceDeps,
} from './onboarding';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp() {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const repos = {
    profileRepo: createProfileRepo(db),
    // The repository's locale reads imperial, so the stored metric units show.
    settingsRepo: createSettingsRepo(db, { locale: 'en-US', bus }),
    weightRepo: createWeightRepo(db, { bus }),
    bodyFatRepo: createBodyFatRepo(db),
  };
  return { ...repos, service: createOnboardingService(repos) };
}

const PLAN: Targets = { kcal: 1_850, protein: 115, carbs: 197, fat: 66 };

/** What a wizard that lost weight at the default pace, without body fat, ends with. */
const ANSWERS: OnboardingAnswers = {
  profile: makeProfile({ weightKg: 64, saved: {} }),
  plan: PLAN,
  planEdited: false,
  remindersOn: false,
  units: { height: 'cm', weight: 'kg' },
};

describe('complete', () => {
  it('stores the profile with the plan, one weigh-in at now, the units, the tune-up on from today, and onboarding done (ACC-B9-1)', async () => {
    const h = await setUp();

    await h.service.complete(ANSWERS, { now: FACTORY_NOW });

    expect(await h.profileRepo.get()).toEqual({
      kind: 'ok',
      value: { ...ANSWERS.profile, saved: PLAN },
    });
    expect(await h.weightRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, kg: 64 },
    ]);
    expect(await h.bodyFatRepo.history()).toEqual([]);
    const settings = await h.settingsRepo.snapshot();
    expect(settings['units.height']).toBe('cm');
    expect(settings['units.weight']).toBe('kg');
    expect(settings['tuneUp.on']).toBe(true);
    expect(settings['tuneUp.lastCheckDay']).toBe('2026-10-26');
    expect(settings['tuneUp.savedPlan']).toBeNull();
    expect(settings['home.sort']).toBe('byMeal');
    expect(settings['remind.master']).toBe(false);
    expect(settings['onboarding.done']).toBe(true);
  });

  it('leaves the weekly tune-up off when the plan was changed by hand (ACC-B9-2, R01.7)', async () => {
    const h = await setUp();

    await h.service.complete({ ...ANSWERS, planEdited: true }, { now: FACTORY_NOW });

    expect(await h.settingsRepo.get('tuneUp.on')).toBe(false);
    expect(await h.settingsRepo.get('tuneUp.lastCheckDay')).toBe('2026-10-26');
    expect(await h.settingsRepo.get('onboarding.done')).toBe(true);
  });

  it('takes the last check from the local day of now', async () => {
    const h = await setUp();
    // 23:30 in New York (the tests' zone) is already the next day in UTC.
    const now = Date.parse('2026-10-26T23:30:00-04:00');

    await h.service.complete(ANSWERS, { now });

    expect(await h.settingsRepo.get('tuneUp.lastCheckDay')).toBe('2026-10-26');
  });

  it('seeds one body-fat reading when body fat was entered', async () => {
    const h = await setUp();
    const profile = makeProfile({ bodyFat: 0.28, goalBodyFat: 0.24 });

    await h.service.complete({ ...ANSWERS, profile }, { now: FACTORY_NOW });

    expect(await h.bodyFatRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, fraction: 0.28 },
    ]);
  });

  it('turns on the reminder switch and the three meal reminders after a granted answer, keeping a stored time', async () => {
    const h = await setUp();
    await h.settingsRepo.set('remind.lunch', { on: false, at: '12:45' });

    await h.service.complete({ ...ANSWERS, remindersOn: true }, { now: FACTORY_NOW });

    const settings = await h.settingsRepo.snapshot();
    expect(settings['remind.master']).toBe(true);
    expect(settings['remind.breakfast']).toEqual({ on: true, at: '08:00' });
    expect(settings['remind.lunch']).toEqual({ on: true, at: '12:45' });
    expect(settings['remind.dinner']).toEqual({ on: true, at: '19:00' });
    expect(settings['remind.summary'].on).toBe(false);
    expect(settings['remind.water'].on).toBe(false);
  });

  it('keeps a Home sort mode that is already stored', async () => {
    const h = await setUp();
    await h.settingsRepo.set('home.sort', 'newestFirst');

    await h.service.complete(ANSWERS, { now: FACTORY_NOW });

    expect(await h.settingsRepo.get('home.sort')).toBe('newestFirst');
  });

  it('adds no second weigh-in or body-fat reading on a second completion', async () => {
    const h = await setUp();
    const profile = makeProfile({ bodyFat: 0.28 });

    await h.service.complete({ ...ANSWERS, profile }, { now: FACTORY_NOW });
    await h.service.complete({ ...ANSWERS, profile }, { now: FACTORY_NOW + 60_000 });

    expect(await h.weightRepo.history()).toHaveLength(1);
    expect(await h.bodyFatRepo.history()).toHaveLength(1);
  });

  it('seeds nothing after a restore: no readings, no tune-up defaults, no sort mode (P09-14)', async () => {
    const h = await setUp();
    const profile = makeProfile({ bodyFat: 0.28 });

    await h.service.complete(
      { ...ANSWERS, profile, remindersOn: true },
      { now: FACTORY_NOW, restored: true },
    );

    expect(await h.weightRepo.history()).toEqual([]);
    expect(await h.bodyFatRepo.history()).toEqual([]);
    // Nothing was written for these, so they still read as their defaults.
    expect(await h.settingsRepo.get('tuneUp.lastCheckDay')).toBeNull();
    const stored = await h.settingsRepo.snapshot();
    expect(stored['onboarding.done']).toBe(true);
    // The person's own answers still count.
    expect(stored['units.weight']).toBe('kg');
    expect(stored['remind.master']).toBe(true);
    expect(await h.profileRepo.get()).toEqual({ kind: 'ok', value: { ...profile, saved: PLAN } });
  });

  it('stores the profile first and onboarding done last', async () => {
    const calls: string[] = [];
    const deps: OnboardingServiceDeps = {
      profileRepo: {
        save: async () => {
          calls.push('profile');
        },
      },
      settingsRepo: {
        set: (async (key: string, value: unknown) => {
          calls.push(`set ${key}`);
          return value;
        }) as SettingsRepo['set'],
        update: (async (key: string) => {
          calls.push(`update ${key}`);
        }) as unknown as SettingsRepo['update'],
      },
      weightRepo: {
        seedFirst: async (kg, at) => {
          calls.push('weigh-in');
          return { id: 'weigh-1', kg, at };
        },
      },
      bodyFatRepo: {
        seedFirst: async (fraction, at) => {
          calls.push('body fat');
          return { id: 'fat-1', fraction, at };
        },
      },
    };

    await createOnboardingService(deps).complete(
      { ...ANSWERS, profile: makeProfile({ bodyFat: 0.3 }), remindersOn: true },
      { now: FACTORY_NOW },
    );

    expect(calls).toEqual([
      'profile',
      'weigh-in',
      'body fat',
      'set units.height',
      'set units.weight',
      'set remind.master',
      'update remind.breakfast',
      'update remind.lunch',
      'update remind.dinner',
      'set tuneUp.on',
      'set tuneUp.lastCheckDay',
      'update home.sort',
      'set onboarding.done',
    ]);
  });

  it('leaves onboarding unfinished when a write fails, and a second try finishes with one weigh-in', async () => {
    const h = await setUp();
    let refuse = true;
    const flaky: OnboardingServiceDeps['settingsRepo'] = {
      set: ((key, value) => {
        if (key === 'tuneUp.on' && refuse) {
          refuse = false;
          return Promise.reject(new Error('The disk is full'));
        }
        return h.settingsRepo.set(key, value);
      }) as SettingsRepo['set'],
      update: h.settingsRepo.update,
    };
    const service = createOnboardingService({ ...h, settingsRepo: flaky });

    await expect(service.complete(ANSWERS, { now: FACTORY_NOW })).rejects.toThrow(
      'The disk is full',
    );
    expect(await h.settingsRepo.get('onboarding.done')).toBe(false);

    await service.complete(ANSWERS, { now: FACTORY_NOW + 60_000 });
    expect(await h.settingsRepo.get('onboarding.done')).toBe(true);
    expect(await h.weightRepo.history()).toHaveLength(1);
  });
});
