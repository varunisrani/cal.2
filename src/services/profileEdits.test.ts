import { afterEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../data/bus';
import { createProfileRepo } from '../data/repos/profileRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { createWeightRepo } from '../data/repos/weightRepo';
import type { Profile } from '../domain/model';
import { needsRebuild, planInputsKey } from '../domain/profile/signature';
import { LB_PER_KG } from '../domain/units/body';
import { fixedClock } from '../lib/clock';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeProfile } from '../test/factories';
import { allergenName, createProfileEditsService, goalWeightProblem } from './profileEdits';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A profile with a plan of its own: pinned targets and two locks an edit must not touch. */
const PLANNED = makeProfile({
  saved: { kcal: 1_700, protein: 120, carbs: 180, fat: 55 },
  caloriesLocked: true,
  lockedMacros: ['protein', 'fat'],
});

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp(profile: Profile | null = PLANNED) {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const repos = {
    profileRepo: createProfileRepo(db),
    settingsRepo: createSettingsRepo(db, { locale: 'en-GB', bus }),
    weightRepo: createWeightRepo(db, { bus }),
  };
  if (profile) await repos.profileRepo.save(profile);
  const posted: BusMessage[] = [];
  closers.push(bus.subscribe((message) => posted.push(message)));
  const clock = fixedClock(FACTORY_NOW, 'America/New_York');
  const service = createProfileEditsService({ ...repos, clock });
  const stored = async (): Promise<Profile> => {
    const read = await repos.profileRepo.get();
    if (read.kind !== 'ok') throw new Error(`no profile: ${read.kind}`);
    return read.value;
  };
  return { ...repos, service, posted, stored };
}

describe('saveWeight', () => {
  it('adds one weigh-in stamped now and moves the profile weight to it (ACC-B12-1)', async () => {
    const h = await setUp(makeProfile({ weightKg: 64, goal: 'maintain' }));

    const saved = await h.service.saveWeight(62.4);

    expect(saved).toMatchObject({ goalReached: false, targetDropped: false });
    expect(await h.weightRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, kg: 62.4 },
    ]);
    expect((await h.stored()).weightKg).toBe(62.4);
  });

  it('posts goal-reached through the weight repository when the weigh-in crosses the goal (R01.11)', async () => {
    const h = await setUp(makeProfile({ goal: 'lose', weightKg: 80, goalWeightKg: 79.5 }));
    await h.weightRepo.addWeighIn({ at: FACTORY_NOW - DAY_MS, kg: 80 });

    const saved = await h.service.saveWeight(79.4);

    expect(saved.goalReached).toBe(true);
    expect(h.posted).toEqual([{ type: 'goal-reached', kg: 79.4 }]);
    // The goal was reached, so the lose target no longer points anywhere and goes.
    expect(saved.targetDropped).toBe(true);
    expect(await h.stored()).not.toHaveProperty('goalWeightKg');
  });

  it('drops a goal weight the new weight contradicts and keeps one it does not', async () => {
    const gain = await setUp(makeProfile({ goal: 'gain', weightKg: 60, goalWeightKg: 65 }));
    expect((await gain.service.saveWeight(66)).targetDropped).toBe(true);
    expect(await gain.stored()).toMatchObject({ weightKg: 66, goal: 'gain' });
    expect(await gain.stored()).not.toHaveProperty('goalWeightKg');

    const lose = await setUp(makeProfile({ goal: 'lose', weightKg: 64, goalWeightKg: 60 }));
    expect((await lose.service.saveWeight(63)).targetDropped).toBe(false);
    expect(await lose.stored()).toMatchObject({ weightKg: 63, goalWeightKg: 60 });
  });

  it('leaves the saved targets and locks as they were (R01.12)', async () => {
    const h = await setUp();

    await h.service.saveWeight(63);

    const after = await h.stored();
    expect(after.saved).toEqual(PLANNED.saved);
    expect(after.caloriesLocked).toBe(true);
    expect(after.lockedMacros).toEqual(['protein', 'fat']);
  });

  it('refuses a weight that is not above 0 and stores nothing', async () => {
    const h = await setUp();
    await expect(h.service.saveWeight(0)).rejects.toThrow(RangeError);
    await expect(h.service.saveWeight(Number.NaN)).rejects.toThrow(RangeError);
    expect(await h.weightRepo.history()).toEqual([]);
  });
});

describe('setGoalWeight (D-16.11, D-16.80)', () => {
  it('refuses a lose target that is not below the current weight and stores nothing (ACC-B12-2)', async () => {
    const h = await setUp(makeProfile({ goal: 'lose', weightKg: 70, goalWeightKg: 65 }));

    expect(await h.service.setGoalWeight(72, 'kg')).toEqual({
      ok: false,
      error: 'notBelowCurrent',
    });
    expect(await h.service.setGoalWeight(70, 'kg')).toEqual({
      ok: false,
      error: 'notBelowCurrent',
    });
    expect((await h.stored()).goalWeightKg).toBe(65);
  });

  it('refuses a gain target that is not above the current weight', async () => {
    const h = await setUp(makeProfile({ goal: 'gain', weightKg: 70, goalWeightKg: 75 }));

    expect(await h.service.setGoalWeight(69.5, 'kg')).toEqual({
      ok: false,
      error: 'notAboveCurrent',
    });
    expect((await h.stored()).goalWeightKg).toBe(75);
  });

  it('stores a target on the right side, leaving targets and locks (R01.12)', async () => {
    const h = await setUp();

    const result = await h.service.setGoalWeight(58.5, 'kg');

    expect(result.ok).toBe(true);
    const after = await h.stored();
    expect(after.goalWeightKg).toBe(58.5);
    expect(after.saved).toEqual(PLANNED.saved);
    expect(after.lockedMacros).toEqual(PLANNED.lockedMacros);
  });

  it('compares the weights as the person reads them, to the tenth in their unit', async () => {
    // 70.02 kg reads 70.0 kg and 154.4 lb; a 69.99 kg target reads the same, so it is refused.
    const h = await setUp(makeProfile({ goal: 'lose', weightKg: 70.02, goalWeightKg: 65 }));
    expect(await h.service.setGoalWeight(69.99, 'kg')).toEqual({
      ok: false,
      error: 'notBelowCurrent',
    });
    expect(await h.service.setGoalWeight(154.4 / LB_PER_KG, 'lb')).toEqual({
      ok: false,
      error: 'notBelowCurrent',
    });
    expect(await h.service.setGoalWeight(154.3 / LB_PER_KG, 'lb')).toMatchObject({ ok: true });
  });

  it('has no goal weight to store while the goal is maintain', async () => {
    const h = await setUp(
      makeProfile({ goal: 'maintain', weeklyKg: undefined, goalWeightKg: undefined }),
    );
    await expect(h.service.setGoalWeight(60, 'kg')).rejects.toThrow(TypeError);
    expect(await h.stored()).not.toHaveProperty('goalWeightKg');
  });

  it('agrees with the domain check: lose below, gain above, maintain anything', () => {
    expect(goalWeightProblem({ goal: 'lose', weightKg: 70 }, 69.9, 'kg')).toBeNull();
    expect(goalWeightProblem({ goal: 'gain', weightKg: 70 }, 70.04, 'kg')).toBe('notAboveCurrent');
    expect(goalWeightProblem({ goal: 'maintain', weightKg: 70 }, 90, 'kg')).toBeNull();
  });
});

describe('edits and the plan (R01.12)', () => {
  it('leaves the saved targets and locks as they were for every field edit', async () => {
    const h = await setUp();
    const s = h.service;

    await s.setSex('other');
    await s.setBirthDate('1990-01-02');
    await s.setHeight(171.5);
    await s.setActivity('hard');
    await s.setBodyFat(0.25);
    await s.setGoalBodyFat(0.2);
    await s.setPace('fast');
    await s.setGoal('gain');
    await s.addAllergen('Peanut');
    await s.removeAllergen('Peanut');

    const after = await h.stored();
    expect(after).toMatchObject({
      sex: 'other',
      birthDate: '1990-01-02',
      heightCm: 171.5,
      activity: 'hard',
      bodyFat: 0.25,
      goalBodyFat: 0.2,
      weeklyKg: 1,
      goal: 'gain',
      allergens: [],
    });
    expect(after.saved).toEqual(PLANNED.saved);
    expect(after.caloriesLocked).toBe(true);
    expect(after.lockedMacros).toEqual(['protein', 'fat']);
  });

  it('raises the rebuild nudge after an activity edit against a stored baseline', async () => {
    const h = await setUp();
    await h.settingsRepo.set('goals.rebuildBaseline', planInputsKey(PLANNED));

    await h.service.setActivity('athlete');

    const baseline = await h.settingsRepo.get('goals.rebuildBaseline');
    expect(baseline).toBe(planInputsKey(PLANNED));
    expect(needsRebuild(await h.stored(), baseline)).toBe(true);
  });

  it('seeds a missing baseline from the profile before the edit, so the edit still raises the nudge', async () => {
    const h = await setUp();
    expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBeNull();

    await h.service.saveWeight(63);

    const baseline = await h.settingsRepo.get('goals.rebuildBaseline');
    expect(baseline).toBe(planInputsKey(PLANNED));
    expect(needsRebuild(await h.stored(), baseline)).toBe(true);
  });

  it('raises no nudge for goal body fat or allergens, which are not plan inputs', async () => {
    const h = await setUp(makeProfile({ bodyFat: 0.3 }));
    await h.service.setGoalBodyFat(0.22);
    await h.service.addAllergen('sesame');

    const baseline = await h.settingsRepo.get('goals.rebuildBaseline');
    expect(needsRebuild(await h.stored(), baseline)).toBe(false);
  });
});

describe('goal and pace', () => {
  it('drops pace and goal weight when the goal becomes maintain', async () => {
    const h = await setUp(makeProfile({ goal: 'lose', weeklyKg: 1, goalWeightKg: 60 }));

    await h.service.setGoal('maintain');

    const after = await h.stored();
    expect(after.goal).toBe('maintain');
    expect(after).not.toHaveProperty('weeklyKg');
    expect(after).not.toHaveProperty('goalWeightKg');
  });

  it('starts a gain goal at the steady pace and drops a target below the weight', async () => {
    const h = await setUp(
      makeProfile({ goal: 'maintain', weeklyKg: undefined, goalWeightKg: undefined }),
    );
    await h.service.setGoal('gain');
    expect(await h.stored()).toMatchObject({ goal: 'gain', weeklyKg: 0.5 });

    const lose = await setUp(makeProfile({ goal: 'lose', weightKg: 64, goalWeightKg: 60 }));
    await lose.service.setGoal('gain');
    expect(await lose.stored()).not.toHaveProperty('goalWeightKg');
  });

  it('stores each pace in kg a week, and has none to store for maintain', async () => {
    const h = await setUp();
    await h.service.setPace('slow');
    expect((await h.stored()).weeklyKg).toBe(0.25);
    await h.service.setPace('fast');
    expect((await h.stored()).weeklyKg).toBe(1);

    await h.service.setGoal('maintain');
    await expect(h.service.setPace('steady')).rejects.toThrow(TypeError);
    expect(await h.stored()).not.toHaveProperty('weeklyKg');
  });
});

describe('body fat', () => {
  it('removes goal body fat together with body fat', async () => {
    const h = await setUp(makeProfile({ bodyFat: 0.28, goalBodyFat: 0.22 }));

    await h.service.setBodyFat(null);

    const after = await h.stored();
    expect(after).not.toHaveProperty('bodyFat');
    expect(after).not.toHaveProperty('goalBodyFat');
  });

  it('stores goal body fat only while body fat is set, and removes it alone', async () => {
    const without = await setUp();
    await without.service.setGoalBodyFat(0.2);
    expect(await without.stored()).not.toHaveProperty('goalBodyFat');

    const h = await setUp(makeProfile({ bodyFat: 0.28 }));
    await h.service.setGoalBodyFat(0.235);
    expect(await h.stored()).toMatchObject({ bodyFat: 0.28, goalBodyFat: 0.235 });
    await h.service.setGoalBodyFat(null);
    expect(await h.stored()).toMatchObject({ bodyFat: 0.28 });
    expect(await h.stored()).not.toHaveProperty('goalBodyFat');
  });

  it('refuses a body fat that is not a fraction', async () => {
    const h = await setUp();
    await expect(h.service.setBodyFat(25)).rejects.toThrow(RangeError);
    await expect(h.service.setGoalBodyFat(0)).rejects.toThrow(RangeError);
  });
});

describe('allergens', () => {
  it('adds a name trimmed with its inner spaces made single, in the order added', async () => {
    const h = await setUp();

    expect(await h.service.addAllergen('  tree   nuts ')).toEqual({
      kind: 'added',
      allergens: ['tree nuts'],
    });
    expect(await h.service.addAllergen('Shellfish')).toEqual({
      kind: 'added',
      allergens: ['tree nuts', 'Shellfish'],
    });
    expect((await h.stored()).allergens).toEqual(['tree nuts', 'Shellfish']);
  });

  it('adds nothing for an empty name or one already listed in any case', async () => {
    const h = await setUp(makeProfile({ allergens: ['Milk'] }));

    expect(await h.service.addAllergen('   ')).toEqual({ kind: 'empty' });
    expect(await h.service.addAllergen(' milk ')).toEqual({ kind: 'duplicate' });
    expect((await h.stored()).allergens).toEqual(['Milk']);
  });

  it('removes that exact entry and keeps the rest in order', async () => {
    const h = await setUp(makeProfile({ allergens: ['Milk', 'Egg', 'Soy'] }));

    await h.service.removeAllergen('Egg');

    expect((await h.stored()).allergens).toEqual(['Milk', 'Soy']);
  });

  it('names an allergen trimmed, with single spaces', () => {
    expect(allergenName(' sesame\tseeds  ')).toBe('sesame seeds');
  });
});

describe('units', () => {
  it('stores the weight unit and the height unit, each on its own', async () => {
    const h = await setUp();

    await h.service.setWeightUnit('lb');
    expect(await h.settingsRepo.get('units.weight')).toBe('lb');
    expect(await h.settingsRepo.get('units.height')).toBe('cm');

    await h.service.setHeightUnit('ftIn');
    expect(await h.settingsRepo.get('units.height')).toBe('ftIn');
    expect(await h.settingsRepo.get('units.weight')).toBe('lb');
  });
});

describe('without a stored profile', () => {
  it('refuses a field edit and changes nothing', async () => {
    const h = await setUp(null);
    await expect(h.service.setActivity('active')).rejects.toThrow(/no stored profile/);
    expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBeNull();
  });

  it('still stores a weigh-in, with no goal weight to drop', async () => {
    const h = await setUp(null);
    expect(await h.service.saveWeight(70)).toMatchObject({ targetDropped: false });
    expect(await h.weightRepo.history()).toHaveLength(1);
  });
});
