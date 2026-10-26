// The temporary quick start (P04-09): one press sets up a new person with the defaults, until the
// onboarding wizard (P05) replaces it; P05-07 deletes this file.
//
// It saves the starting profile with the units of the browser's region (D-16.10), seeds the first
// weigh-in from that profile and marks onboarding done. The writes go through three repositories,
// so they are ordered to make every partial outcome safe to retry: units before the profile (a
// retry that finds the profile also finds the units), onboarding done last (the screen stays
// until everything is stored). A profile that is already there is kept as it is, and the seed
// adds nothing when any weigh-in exists. An unreadable profile is never taken for a missing one
// (R01.17): the start is refused and nothing is written.

import { dayKeyOf } from '../domain/dates/dayKey';
import type { Profile } from '../domain/model';
import { startingSetup } from '../domain/profile/profile';
import { systemClock, type Clock } from '../lib/clock';
import type { AppBus } from '../data/bus';
import type { PlatewiseDb } from '../data/db';
import { ProfileUnreadableError, type ProfileRepo } from '../data/repos/profileRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import { createWeightRepo, type WeightRepo } from '../data/repos/weightRepo';

export interface QuickStartDeps {
  profile: Pick<ProfileRepo, 'get' | 'save'>;
  settings: Pick<SettingsRepo, 'set'>;
  weight: Pick<WeightRepo, 'seedFirst'>;
  /** Today's date and the weigh-in's time; the device clock by default. */
  clock?: Clock;
}

/** What the shell already holds: the database and its profile and settings repositories. */
export interface QuickStartApp extends Omit<QuickStartDeps, 'weight'> {
  db: PlatewiseDb;
  /** Where the weight repository posts `goal-reached`; the app's bus by default. */
  bus?: AppBus;
}

export interface QuickStartResult {
  /** The profile stored now. */
  profile: Profile;
  /** True when this call saved it; false when one was already there and was kept. */
  created: boolean;
}

/**
 * Sets up a new person with the defaults and marks onboarding done. `localeTag` is the browser's
 * language tag (`navigator.language`). Rejects with ProfileUnreadableError, writing nothing, when
 * the stored profile cannot be read; any other failure rejects with onboarding left not done.
 */
export async function startWithDefaults(
  deps: QuickStartDeps,
  localeTag: string,
): Promise<QuickStartResult> {
  const clock = deps.clock ?? systemClock;
  const now = clock.now();
  const stored = await deps.profile.get();
  if (stored.kind === 'corrupt') throw new ProfileUnreadableError(stored.raw);

  let profile: Profile;
  if (stored.kind === 'ok') {
    profile = stored.value;
  } else {
    const setup = startingSetup(dayKeyOf(now), localeTag);
    await deps.settings.set('units.energy', setup.units.energy);
    await deps.settings.set('units.height', setup.units.height);
    await deps.settings.set('units.weight', setup.units.weight);
    await deps.profile.save(setup.profile);
    profile = setup.profile;
  }

  await deps.weight.seedFirst(profile.weightKg, now);
  await deps.settings.set('onboarding.done', true);
  return { profile, created: stored.kind === 'missing' };
}

/**
 * The action the onboarding route gives the quick-start screen: `startWithDefaults` with the
 * shell's repositories and a weight repository on the same database (screens cannot reach
 * repositories themselves).
 */
export function quickStartAction(
  app: QuickStartApp,
  localeTag: string,
): () => Promise<QuickStartResult> {
  const { db, bus, ...deps } = app;
  const weight = createWeightRepo(db, {
    ...(bus ? { bus } : {}),
    ...(deps.clock ? { clock: deps.clock } : {}),
  });
  return () => startWithDefaults({ ...deps, weight }, localeTag);
}
