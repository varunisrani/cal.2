// The reminders the person writes (P13, D-16.93): add, change, switch and delete, stored under the
// `remind.custom` setting. Each change reads and writes the stored list in one transaction, so two
// adds at once cannot pass the limit and an edit never undoes another. The reminder engine (web)
// and the Android app's schedule follow the setting by themselves.
//
// `addCustomReminder` is also the Coach's call (Wave B): it answers the stored reminder, or the
// reason it was not kept, and never throws for a bad input.

import type { SettingsRepo } from '../../data/repos/settingsRepo';
import {
  CUSTOM_REMINDER_LIMIT,
  checkCustomReminder,
  type CheckedReminder,
  type CustomReminder,
  type CustomReminderInput,
  type CustomReminderProblem,
} from '../../domain/reminders/custom';
import type { Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { err, ok, type Result } from '../../lib/result';
import { clockOn } from './schedule';

/** The stored reminder, or why it was not kept. */
export type CustomReminderResult = Result<CustomReminder, CustomReminderProblem>;

export interface CustomRemindersService {
  /**
   * What is wrong with `input` as `add` and `update` would see it, or null: lets a form say so
   * before it asks for anything (the notification permission, a write).
   */
  problemWith(input: CustomReminderInput): CustomReminderProblem | null;
  /**
   * Adds a reminder (on unless `on: false`) at the end of the list. Answers `full` at 20, `past`
   * for a once reminder whose moment has passed, or the input's first problem.
   */
  addCustomReminder(input: CustomReminderInput): Promise<CustomReminderResult>;
  /** Replaces one reminder's text, time, days or date and switch; `notFound` for an unknown id. */
  updateCustomReminder(id: string, input: CustomReminderInput): Promise<CustomReminderResult>;
  /** Switches one reminder on or off; `notFound` for an unknown id. */
  setCustomReminderOn(id: string, on: boolean): Promise<CustomReminderResult>;
  /** Deletes one reminder; resolves false when there was none with that id. */
  removeCustomReminder(id: string): Promise<boolean>;
}

export interface CustomRemindersDeps {
  readonly settingsRepo: Pick<SettingsRepo, 'update'>;
  readonly clock: Clock;
  /** Makes the id of a new reminder; random UUIDs unless a test passes its own. */
  readonly newId?: IdSource;
}

type Checked = Result<CheckedReminder, CustomReminderProblem>;

export function createCustomRemindersService({
  settingsRepo,
  clock,
  newId = randomId,
}: CustomRemindersDeps): CustomRemindersService {
  /** The input's checks, and for a once reminder, that its moment is still ahead. */
  function check(input: CustomReminderInput): Checked {
    const checked = checkCustomReminder(input);
    if (!checked.ok) return err(checked.problem);
    const { value } = checked;
    if (value.date !== undefined && clockOn(value.date, value.time) <= clock.now()) {
      return err('past');
    }
    return ok(value);
  }

  /** Changes the one reminder with `id` inside the stored list's transaction. */
  async function change(
    id: string,
    next: (reminder: CustomReminder) => CustomReminder,
  ): Promise<CustomReminderResult> {
    let result: CustomReminderResult = err('notFound');
    await settingsRepo.update('remind.custom', (list) =>
      list.map((reminder) => {
        if (reminder.id !== id) return reminder;
        const changed = next(reminder);
        result = ok(changed);
        return changed;
      }),
    );
    return result;
  }

  return {
    problemWith(input) {
      const checked = check(input);
      return checked.ok ? null : checked.error;
    },

    async addCustomReminder(input) {
      const checked = check(input);
      if (!checked.ok) return checked;
      const reminder: CustomReminder = { id: newId(), ...checked.value };
      let result: CustomReminderResult = err('full');
      await settingsRepo.update('remind.custom', (list) => {
        if (list.length >= CUSTOM_REMINDER_LIMIT) return list;
        result = ok(reminder);
        return [...list, reminder];
      });
      return result;
    },

    async updateCustomReminder(id, input) {
      const checked = check(input);
      if (!checked.ok) return checked;
      return change(id, () => ({ id, ...checked.value }));
    },

    setCustomReminderOn: (id, on) => change(id, (reminder) => ({ ...reminder, on })),

    async removeCustomReminder(id) {
      let found = false;
      await settingsRepo.update('remind.custom', (list) => {
        found = list.some((reminder) => reminder.id === id);
        return found ? list.filter((reminder) => reminder.id !== id) : list;
      });
      return found;
    },
  };
}
