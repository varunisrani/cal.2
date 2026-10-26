// Onboarding completion (P05-07, 01 §3.4): what the end of the wizard stores, in one flow. The
// profile with the plan as its saved targets comes first, so the weigh-in seed finds it; the
// `onboarding.done` flag comes last, so the shell never leaves onboarding before the rest is
// stored. Every write is safe to repeat: a second completion (a retry after a failed write) adds
// no second weigh-in. The AI choice and key are not here: the AI access step stored them.

import { dayKeyOf } from '../domain/dates/dayKey';
import type { Profile, Targets } from '../domain/model';
import type { HeightDisplayUnit, WeightDisplayUnit } from '../domain/units/body';
import type { BodyFatRepo } from '../data/repos/bodyFatRepo';
import type { ProfileRepo } from '../data/repos/profileRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { WeightRepo } from '../data/repos/weightRepo';

/** The meal reminders a granted answer switches on, each at its stored or default time. */
const MEAL_REMINDERS = ['remind.breakfast', 'remind.lunch', 'remind.dinner'] as const;

/** What the wizard ends with. */
export interface OnboardingAnswers {
  /** The answers as a profile (`wizardProfile`); its saved targets are replaced by `plan`. */
  readonly profile: Profile;
  /** The plan Plan ready shows, stored as the four saved targets. */
  readonly plan: Targets;
  /** The person changed the plan on Plan ready: the weekly tune-up then starts off (R01.7). */
  readonly planEdited: boolean;
  /** The browser granted notifications on the Reminders step (D-16.15). */
  readonly remindersOn: boolean;
  /** The units picked on the Body step. */
  readonly units: { readonly height: HeightDisplayUnit; readonly weight: WeightDisplayUnit };
}

export interface CompleteOptions {
  /** Epoch ms: the first weigh-in's time; its local day is the tune-up's last check. */
  readonly now: number;
  /**
   * The data came from a backup file (P09-14): its history and settings stand, so no weigh-in,
   * body-fat reading, tune-up default or sort mode is seeded.
   */
  readonly restored?: boolean;
}

export interface OnboardingService {
  /**
   * Stores the end of onboarding: the profile with the plan; the first weigh-in (empty history
   * only) and a first body-fat reading when body fat was entered; the units; on a granted answer
   * the reminder switch and the three meal reminders; the tune-up switch (off for an edited plan)
   * with today as its last check; the Home sort mode; and last `onboarding.done`. Rejects at the
   * first failed write, before `onboarding.done`; calling again finishes the job.
   */
  complete(answers: OnboardingAnswers, options: CompleteOptions): Promise<void>;
}

export interface OnboardingServiceDeps {
  readonly profileRepo: Pick<ProfileRepo, 'save'>;
  readonly settingsRepo: Pick<SettingsRepo, 'set' | 'update'>;
  readonly weightRepo: Pick<WeightRepo, 'seedFirst'>;
  readonly bodyFatRepo: Pick<BodyFatRepo, 'seedFirst'>;
}

export function createOnboardingService(deps: OnboardingServiceDeps): OnboardingService {
  const { profileRepo, settingsRepo, weightRepo, bodyFatRepo } = deps;

  return {
    async complete(answers, { now, restored = false }) {
      const profile: Profile = { ...answers.profile, saved: { ...answers.plan } };
      await profileRepo.save(profile);

      if (!restored) {
        await weightRepo.seedFirst(profile.weightKg, now);
        if (profile.bodyFat !== undefined) await bodyFatRepo.seedFirst(profile.bodyFat, now);
      }

      // Stored, not left to the locale defaults, so a later browser language never flips them.
      await settingsRepo.set('units.height', answers.units.height);
      await settingsRepo.set('units.weight', answers.units.weight);

      if (answers.remindersOn) {
        await settingsRepo.set('remind.master', true);
        for (const key of MEAL_REMINDERS) {
          await settingsRepo.update(key, (reminder) => ({ ...reminder, on: true }));
        }
      }

      if (!restored) {
        // The plan was just built, so this week counts as checked; the first run is a week away.
        await settingsRepo.set('tuneUp.on', !answers.planEdited);
        await settingsRepo.set('tuneUp.lastCheckDay', dayKeyOf(now));
        // Pinned as it reads now (the default on a new install), never overwriting a choice.
        await settingsRepo.update('home.sort', (mode) => mode);
      }

      await settingsRepo.set('onboarding.done', true);
    },
  };
}
