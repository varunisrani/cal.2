// The Progress tab's writes (P07-09, P07-12): a weigh-in for a chosen day, the weight unit the Log
// weight sheet's toggle changes for the whole app (R05.11), and the Count today switch. A weigh-in
// goes straight to the weight repository, which moves the profile weight only when the reading is
// the newest by date and posts goal-reached itself (R05.7), so a back-dated weight changes
// neither. Unlike the Settings weight save, it never drops a goal weight.

import { dayKeyOf, isDayKey, type DayKey } from '../domain/dates/dayKey';
import { stampForDay } from '../domain/dates/ranges';
import type { WeightDisplayUnit } from '../domain/units/body';
import type { AddedWeighIn, WeightRepo } from '../data/repos/weightRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { Clock } from '../lib/clock';

export interface ProgressService {
  /**
   * Adds a weigh-in of `kg` for `day`: today at this instant, an earlier day at the current
   * clock time on that day. A day after today is taken as today.
   */
  logWeight(kg: number, day: DayKey): Promise<AddedWeighIn>;
  /** The weight unit every screen shows (setting `units.weight`). */
  setWeightUnit(unit: WeightDisplayUnit): Promise<void>;
  /** Whether the calorie chart and the averages count today (setting `progress.countToday`). */
  setCountToday(on: boolean): Promise<void>;
}

export interface ProgressDeps {
  readonly weightRepo: Pick<WeightRepo, 'addWeighIn'>;
  readonly settingsRepo: Pick<SettingsRepo, 'set'>;
  /** Stamps the weigh-ins. */
  readonly clock: Clock;
}

export function createProgressService({
  weightRepo,
  settingsRepo,
  clock,
}: ProgressDeps): ProgressService {
  return {
    async logWeight(kg, day) {
      if (!isDayKey(day)) throw new RangeError(`A weigh-in needs a day key, got ${String(day)}`);
      const now = clock.now();
      const today = dayKeyOf(now);
      // Day keys are zero-padded, so text order is calendar order.
      const onDay = day > today ? today : day;
      return weightRepo.addWeighIn({ at: stampForDay(onDay, now), kg });
    },

    async setWeightUnit(unit) {
      await settingsRepo.set('units.weight', unit);
    },

    async setCountToday(on) {
      await settingsRepo.set('progress.countToday', on);
    },
  };
}
