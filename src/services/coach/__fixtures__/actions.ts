// What the Android app lets the Coach do (P17), made as the app makes it over a test settings
// repository: the real custom reminders service and check-in store, the switch read from storage.

import type { SettingsRepo } from '../../../data/repos/settingsRepo';
import type { Clock } from '../../../lib/clock';
import { withIdSequence } from '../../../lib/ids';
import {
  createCustomRemindersService,
  type CustomRemindersService,
} from '../../reminders/customReminders';
import { createCheckIns } from '../checkIns';
import type { CoachActions } from '../ownTools';

export function storedActions(stores: {
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'update'>;
  readonly clock: Clock;
}): CoachActions & { readonly reminders: CustomRemindersService } {
  const { settingsRepo, clock } = stores;
  return {
    setsReminders: () => settingsRepo.get('coach.setsReminders'),
    reminders: createCustomRemindersService({
      settingsRepo,
      clock,
      newId: withIdSequence('set'),
    }),
    checkIns: createCheckIns({ settingsRepo, clock, newId: withIdSequence('check') }),
  };
}
