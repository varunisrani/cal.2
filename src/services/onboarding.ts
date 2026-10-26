// Onboarding: what sets a new person up. For now only the temporary quick start (P04-09) uses it;
// P05 adds the real wizard's save here.

import { dayKeyOf } from '../domain/dates/dayKey';
import { firstRunDefaults } from '../domain/profile/profile';
import type { ProfileRepo } from '../data/repos/profileRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { WeightRepo } from '../data/repos/weightRepo';

export interface OnboardingService {
  /**
   * Sets a new person up with the first-run defaults: the default profile for the local day of
   * `now`, the units the locale suggests, the first weigh-in at `now` (only when none is stored),
   * and last of all `onboarding.done`, so the shell never reads "ready" before the rest is stored.
   * Rejects when a write fails; calling again finishes the job without a second weigh-in.
   */
  startWithDefaults(now: number, locale: string): Promise<void>;
}

export interface OnboardingServiceDeps {
  readonly profileRepo: Pick<ProfileRepo, 'save'>;
  readonly settingsRepo: Pick<SettingsRepo, 'set'>;
  readonly weightRepo: Pick<WeightRepo, 'seedFirst'>;
}

export function createOnboardingService(deps: OnboardingServiceDeps): OnboardingService {
  const { profileRepo, settingsRepo, weightRepo } = deps;

  return {
    async startWithDefaults(now, locale) {
      const { profile, units } = firstRunDefaults(dayKeyOf(now), locale);
      await profileRepo.save(profile);
      // Stored, not left to the defaults, so a later change of browser language never flips them.
      await settingsRepo.set('units.energy', units.energy);
      await settingsRepo.set('units.height', units.height);
      await settingsRepo.set('units.weight', units.weight);
      await weightRepo.seedFirst(profile.weightKg, now);
      await settingsRepo.set('onboarding.done', true);
    },
  };
}
