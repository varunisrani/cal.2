// Water's writes (P07-06): a log for the day Home shows, and the water settings. A log is stamped
// by the selected-day rule (now for today, an earlier day at the current clock time) and must be
// a whole 1–5 000 ml, the most the entry sheets accept (D-16.39), so no path stores more. Turning
// tracking off also switches the water reminder off and keeps its time; it never touches the logs,
// which stay in the diary (R05.9). The reminder itself is P09's.

import { dayKeyOf, isDayKey, type DayKey } from '../domain/dates/dayKey';
import { stampForDay } from '../domain/dates/ranges';
import type { WaterLog } from '../domain/model';
import {
  WATER_AMOUNT_MAX_ML,
  WATER_AMOUNT_MIN_ML,
  type WaterDisplayUnit,
} from '../domain/units/water';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { WaterRepo } from '../data/repos/waterRepo';
import type { Clock } from '../lib/clock';

export interface WaterService {
  /**
   * Logs `ml` (a whole 1–5 000) on `day`: today at this instant, an earlier day at the current
   * clock time on that day. A day after today is taken as today.
   */
  logWater(ml: number, day: DayKey): Promise<WaterLog>;
  /** Water tracking on or off (setting `water.on`); off also turns the water reminder off. */
  setTracking(on: boolean): Promise<void>;
  /** The daily goal in ml (setting `water.goalMl`, 50–10 000). */
  setGoal(ml: number): Promise<void>;
  /** The unit every water amount shows in (setting `water.unit`). */
  setUnit(unit: WaterDisplayUnit): Promise<void>;
  /**
   * The three quick-add amounts in ml; resolves with them as stored, smallest first. Anything but
   * three whole amounts of 1–5 000 ml rejects and stores nothing.
   */
  setQuickAdd(amounts: readonly number[]): Promise<readonly number[]>;
}

export interface WaterDeps {
  readonly waterRepo: Pick<WaterRepo, 'add'>;
  readonly settingsRepo: Pick<SettingsRepo, 'set' | 'update'>;
  /** Stamps the logs. */
  readonly clock: Clock;
}

function isLoggable(ml: number): boolean {
  return Number.isInteger(ml) && ml >= WATER_AMOUNT_MIN_ML && ml <= WATER_AMOUNT_MAX_ML;
}

export function createWaterService({ waterRepo, settingsRepo, clock }: WaterDeps): WaterService {
  return {
    async logWater(ml, day) {
      if (!isDayKey(day)) throw new RangeError(`A water log needs a day key, got ${String(day)}`);
      if (!isLoggable(ml)) {
        throw new RangeError(
          `A water log takes a whole ${WATER_AMOUNT_MIN_ML}–${WATER_AMOUNT_MAX_ML} ml, got ${ml}`,
        );
      }
      const now = clock.now();
      const today = dayKeyOf(now);
      // Day keys are zero-padded, so text order is calendar order.
      const onDay = day > today ? today : day;
      return waterRepo.add({ at: stampForDay(onDay, now), ml });
    },

    async setTracking(on) {
      await settingsRepo.set('water.on', on);
      if (on) return;
      await settingsRepo.update('remind.water', (reminder) => ({ ...reminder, on: false }));
    },

    async setGoal(ml) {
      await settingsRepo.set('water.goalMl', ml);
    },

    async setUnit(unit) {
      await settingsRepo.set('water.unit', unit);
    },

    setQuickAdd: (amounts) => settingsRepo.set('water.quickAddMl', [...amounts]),
  };
}
