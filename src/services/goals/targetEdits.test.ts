import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProfileRepo } from '../../data/repos/profileRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { FIXTURE_TODAY, defaultProfile } from '../../domain/goals/__fixtures__/profiles';
import { formulaPlan } from '../../domain/goals/formulas';
import type { Profile } from '../../domain/model';
import { DEFAULT_GOAL_VALUES } from '../../domain/nutrients/goalDefaults';
import { planInputsKey } from '../../domain/profile/signature';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import { createTargetEditsService } from './targetEdits';
import type { TuneUpOutcome } from './tuneUp';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** The default body's formula plan on the fixture day: 2 452 kcal, 112 / 406 / 42 g. */
const FORMULA = formulaPlan(defaultProfile, FIXTURE_TODAY);

/** All four values saved, as after any Settings edit. */
const PINNED = { kcal: 2_452, protein: 112, carbs: 406, fat: 42 } as const;

/** A database holding `profile`, with the tune-up off (it reads as on when never set). */
async function setUp(profile: Profile | null = defaultProfile) {
  const test = await openTestDb();
  closers.push(() => test.db.close());
  const profileRepo = createProfileRepo(test.db);
  const settingsRepo = createSettingsRepo(test.db, { locale: 'en-US', bus: test.bus });
  if (profile) await profileRepo.save(profile);
  await settingsRepo.set('tuneUp.on', false);
  const tuneUp = {
    turnOn: vi.fn(async (): Promise<TuneUpOutcome> => ({
      kind: 'changed',
      kcal: 2_300,
      reason: 'Steady.',
    })),
    turnOff: vi.fn(async () => ({ restored: true })),
  };
  const service = createTargetEditsService({
    profileRepo,
    settingsRepo,
    tuneUp,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  });
  const stored = async (): Promise<Profile | null> => {
    const read = await profileRepo.get();
    return read.kind === 'ok' ? read.value : null;
  };
  return { service, profileRepo, settingsRepo, tuneUp, stored };
}

describe('targetEdits: edits through the lock engine (P01-13)', () => {
  it('locks energy and spreads it over the three free macros', async () => {
    const h = await setUp();

    expect(await h.service.setTarget('kcal', 2_452)).toEqual({ kind: 'saved' });

    expect(await h.stored()).toEqual({
      ...defaultProfile,
      saved: PINNED,
      caloriesLocked: true,
      lockedMacros: [],
    });
    expect(FORMULA).toEqual(PINNED);
  });

  it('keeps energy and lowers carbs and fat when protein rises with energy locked (ACC-C6-1)', async () => {
    const h = await setUp();
    await h.service.setTarget('kcal', 2_452);

    expect(await h.service.setTarget('protein', 150)).toEqual({ kind: 'saved' });

    // 01 §3.7's example: carbs and fat share 2 452 − 600 kcal by their current energy.
    expect(await h.stored()).toMatchObject({
      saved: { kcal: 2_452, protein: 150, carbs: 376, fat: 39 },
      caloriesLocked: true,
      lockedMacros: ['protein'],
    });
  });

  it('refuses an edit nothing can absorb and writes nothing (R01.13)', async () => {
    const locked: Profile = {
      ...defaultProfile,
      saved: PINNED,
      caloriesLocked: true,
      lockedMacros: ['carbs', 'fat'],
    };
    const h = await setUp(locked);

    expect(await h.service.setTarget('protein', 150)).toEqual({ kind: 'refused' });
    expect(await h.stored()).toEqual(locked);
  });

  it('applies an edit without adding a third macro lock (R01.13, ACC-C6-2)', async () => {
    const h = await setUp({ ...defaultProfile, saved: PINNED, lockedMacros: ['protein', 'carbs'] });

    expect(await h.service.setTarget('fat', 50)).toEqual({ kind: 'saved' });

    // Energy is free, so it floats to the macros' sum: 4 × 112 + 4 × 406 + 9 × 50.
    expect(await h.stored()).toMatchObject({
      saved: { kcal: 2_522, protein: 112, carbs: 406, fat: 50 },
      caloriesLocked: false,
      lockedMacros: ['protein', 'carbs'],
    });
  });

  it('resets a locked macro to auto: unlocked, it takes the energy the others leave', async () => {
    const h = await setUp({
      ...defaultProfile,
      saved: { ...PINNED, protein: 150 },
      caloriesLocked: true,
      lockedMacros: ['protein', 'fat'],
    });

    expect(await h.service.resetToAuto('protein')).toEqual({ kind: 'saved' });

    // (2 452 − 4 × 406 − 9 × 42) div 4 = 112.
    expect(await h.stored()).toMatchObject({
      saved: { kcal: 2_452, protein: 112, carbs: 406, fat: 42 },
      caloriesLocked: true,
      lockedMacros: ['fat'],
    });
  });

  it('resets energy to auto: unlocked, it becomes the energy of the macros', async () => {
    const h = await setUp({
      ...defaultProfile,
      saved: { ...PINNED, kcal: 2_600 },
      caloriesLocked: true,
      lockedMacros: [],
    });

    expect(await h.service.resetToAuto('kcal')).toEqual({ kind: 'saved' });

    expect(await h.stored()).toMatchObject({
      saved: { kcal: 2_450, protein: 112, carbs: 406, fat: 42 },
      caloriesLocked: false,
    });
  });

  it('refuses every edit while the tune-up is on and writes nothing (ACC-C8-3)', async () => {
    const h = await setUp();
    await h.settingsRepo.set('tuneUp.on', true);

    expect(await h.service.setTarget('kcal', 2_000)).toEqual({ kind: 'tuneUpOn' });
    expect(await h.service.setTarget('protein', 150)).toEqual({ kind: 'tuneUpOn' });
    expect(await h.service.resetToAuto('fat')).toEqual({ kind: 'tuneUpOn' });
    expect(await h.stored()).toEqual(defaultProfile);
  });

  it('changes nothing without a stored profile', async () => {
    const h = await setUp(null);

    expect(await h.service.setTarget('kcal', 2_000)).toEqual({ kind: 'noProfile' });
    expect(await h.service.resetToAuto('kcal')).toEqual({ kind: 'noProfile' });
    expect(await h.stored()).toBeNull();
  });
});

describe('targetEdits: the rebuild baseline (P01-15)', () => {
  it('seeds the baseline silently on first open and keeps it after a change (R01.12)', async () => {
    const h = await setUp();
    expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBeNull();

    await h.service.seedRebuildBaseline();
    expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBe(planInputsKey(defaultProfile));

    await h.profileRepo.update((profile) => ({ ...profile, weightKg: 71 }));
    await h.service.seedRebuildBaseline();
    // The old key stays, so the page now shows the nudge.
    expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBe(planInputsKey(defaultProfile));
  });

  it('stores nothing without a profile', async () => {
    const h = await setUp(null);
    await h.service.seedRebuildBaseline();
    expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBeNull();
  });
});

describe('targetEdits: switches and nutrient goals', () => {
  it('turns the tune-up on through the runner and returns its forced run', async () => {
    const h = await setUp();

    expect(await h.service.setTuneUp(true)).toEqual({
      kind: 'on',
      run: { kind: 'changed', kcal: 2_300, reason: 'Steady.' },
    });
    expect(h.tuneUp.turnOn).toHaveBeenCalledTimes(1);
    expect(h.tuneUp.turnOff).not.toHaveBeenCalled();
  });

  it('turns the tune-up off through the runner and says whether the plan came back', async () => {
    const h = await setUp();

    expect(await h.service.setTuneUp(false)).toEqual({ kind: 'off', restored: true });
    expect(h.tuneUp.turnOff).toHaveBeenCalledTimes(1);
    expect(h.tuneUp.turnOn).not.toHaveBeenCalled();
  });

  it('stores the goal-reached alert switch', async () => {
    const h = await setUp();

    await h.service.setGoalReachedAlert(true);
    expect(await h.settingsRepo.get('alerts.goalReached')).toBe(true);
    await h.service.setGoalReachedAlert(false);
    expect(await h.settingsRepo.get('alerts.goalReached')).toBe(false);
  });

  it('stores a typed nutrient goal exactly and clamps only above 999 999 (ACC-C10-1)', async () => {
    const h = await setUp();

    await h.service.setNutrientGoal('sodium', 2_345);
    expect(await h.settingsRepo.get('goals.nutrients')).toEqual({
      ...DEFAULT_GOAL_VALUES,
      sodium: 2_345,
    });

    await h.service.setNutrientGoal('calcium', 1_234_567);
    expect(await h.settingsRepo.get('goals.nutrients')).toEqual({
      ...DEFAULT_GOAL_VALUES,
      sodium: 2_345,
      calcium: 999_999,
    });
  });
});
