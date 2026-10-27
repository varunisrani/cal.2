// Settings › Tracking & reminders' own writes (P09-03, P09-09): the meal times, the notifications
// switch, and each reminder's switch and time. The water and fasting cards write through their own
// services. The notifications switch is stored on only after the browser granted the permission,
// so it never claims reminders can show when they cannot (R06.13); the permission itself lives in
// the browser and is read again whenever the page asks (it can be withdrawn outside the app).

import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { MealTimes } from '../domain/model';
import type { ReminderEngine } from './reminders/engine';
import type { NotificationAccess, NotificationState } from './reminders/notifier';
import { REMINDER_SETTING, type DailyReminder } from './reminders/schedule';

/** A change to one reminder: its switch, its time (`HH:MM`), or both. */
export interface ReminderChange {
  readonly on?: boolean;
  readonly at?: string;
}

export interface TrackingSettingsService {
  /** Stores the four meal starts; refuses a set that is not strictly increasing within a day. */
  setMealTimes(times: MealTimes): Promise<MealTimes>;
  /** The browser's notification permission as last read. */
  permission(): NotificationState;
  /**
   * Reads the permission again (the page came back into focus); when it changed, the reminder
   * engine checks again, so a permission taken away stops everything at once (R06.10).
   */
  recheck(): NotificationState;
  /**
   * Asks the browser for permission (call it straight from the press) and stores the
   * notifications switch on only on a grant. Resolves with the browser's answer.
   */
  turnRemindersOn(): Promise<NotificationState>;
  turnRemindersOff(): Promise<void>;
  /** Changes one daily reminder's switch or time, keeping the other. */
  setReminder(id: DailyReminder, change: ReminderChange): Promise<void>;
  /** The fasting goal alert's switch. */
  setFastGoalAlert(on: boolean): Promise<void>;
  /** The goal-weight alert's switch (also on Settings › Goals). */
  setGoalReachedAlert(on: boolean): Promise<void>;
}

export interface TrackingSettingsDeps {
  readonly settingsRepo: Pick<SettingsRepo, 'set' | 'update'>;
  readonly notifications: Pick<NotificationAccess, 'state' | 'request'>;
  /** Asked to check again when the permission changes, which no stored change reports. */
  readonly reminders?: Pick<ReminderEngine, 'refresh'>;
}

export function createTrackingSettingsService({
  settingsRepo,
  notifications,
  reminders,
}: TrackingSettingsDeps): TrackingSettingsService {
  let seen = notifications.state();

  /** Remembers `now`; a change from what was seen before makes the engine check again. */
  function note(now: NotificationState): NotificationState {
    if (now !== seen) {
      seen = now;
      void reminders?.refresh();
    }
    return now;
  }

  return {
    setMealTimes: (times) => settingsRepo.set('meals.times', { ...times }),

    permission: () => seen,

    recheck: () => note(notifications.state()),

    turnRemindersOn() {
      // Asked before anything is awaited: browsers prompt only inside the press.
      const asked = notifications.request();
      return asked.then(async (answer) => {
        if (answer === 'granted') await settingsRepo.set('remind.master', true);
        // The switch may have been stored on already, so a stored change cannot be relied on.
        return note(answer);
      });
    },

    async turnRemindersOff() {
      await settingsRepo.set('remind.master', false);
    },

    async setReminder(id, change) {
      await settingsRepo.update(REMINDER_SETTING[id], (current) => ({
        on: change.on ?? current.on,
        at: change.at ?? current.at,
      }));
    },

    async setFastGoalAlert(on) {
      await settingsRepo.set('remind.fastGoal', on);
    },

    async setGoalReachedAlert(on) {
      await settingsRepo.set('alerts.goalReached', on);
    },
  };
}
