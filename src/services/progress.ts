// The Progress tab's writes (P07-09, P07-12..14): a weigh-in for a chosen day, a body-fat reading
// stamped now, deletes from the two histories, the weight unit the Log weight sheet's toggle
// changes for the whole app (R05.11), and the Count today switch. Readings go straight to their
// repositories, which keep the profile weight and body fat on the newest reading by date in the
// same transaction (R05.8) and post goal-reached themselves (R05.7), so a back-dated weight changes
// neither. Unlike the Settings weight save, a weigh-in never drops a goal weight.

import { dayKeyOf, isDayKey, type DayKey } from '../domain/dates/dayKey';
import { stampForDay } from '../domain/dates/ranges';
import type { BodyFatReading } from '../domain/model';
import type { WeightDisplayUnit } from '../domain/units/body';
import type { BodyFatRepo } from '../data/repos/bodyFatRepo';
import type { AddedWeighIn, WeightRepo } from '../data/repos/weightRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { Clock } from '../lib/clock';

export interface ProgressService {
  /**
   * Adds a weigh-in of `kg` for `day`: today at this instant, an earlier day at the current
   * clock time on that day. A day after today is taken as today.
   */
  logWeight(kg: number, day: DayKey): Promise<AddedWeighIn>;
  /** Adds a body-fat reading (a fraction, 0.185 for 18.5 %) stamped at this instant. */
  logBodyFat(fraction: number): Promise<BodyFatReading>;
  /** Deletes a weigh-in; the profile weight moves to the newest one left, if any. */
  deleteWeighIn(id: string): Promise<void>;
  /** Deletes a body-fat reading; the profile follows the newest one left, or keeps its value. */
  deleteBodyFatReading(id: string): Promise<void>;
  /** The weight unit every screen shows (setting `units.weight`). */
  setWeightUnit(unit: WeightDisplayUnit): Promise<void>;
  /** Whether the calorie chart and the averages count today (setting `progress.countToday`). */
  setCountToday(on: boolean): Promise<void>;
}

export interface ProgressDeps {
  readonly weightRepo: Pick<WeightRepo, 'addWeighIn' | 'deleteWeighIn'>;
  readonly bodyFatRepo: Pick<BodyFatRepo, 'addReading' | 'deleteReading'>;
  readonly settingsRepo: Pick<SettingsRepo, 'set'>;
  /** Stamps the weigh-ins and the body-fat readings. */
  readonly clock: Clock;
}

export function createProgressService({
  weightRepo,
  bodyFatRepo,
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

    async logBodyFat(fraction) {
      return bodyFatRepo.addReading({ at: clock.now(), fraction });
    },

    async deleteWeighIn(id) {
      await weightRepo.deleteWeighIn(id);
    },

    async deleteBodyFatReading(id) {
      await bodyFatRepo.deleteReading(id);
    },

    async setWeightUnit(unit) {
      await settingsRepo.set('units.weight', unit);
    },

    async setCountToday(on) {
      await settingsRepo.set('progress.countToday', on);
    },
  };
}
