// The inbox and the bookkeeping as stored (P17): the `notify.inbox` and `notify.device` settings,
// this device's own (out of backups and their hash). Each change is a pure function of the state;
// nothing is written when it changes nothing (every settings write makes the app's live reads look
// again), and a change that does write runs again inside the settings transaction, so two at once
// never lose one another.

import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { StoredRecord } from '../../data/settingsSchema';
import { readDevice, type DeviceState } from './device';
import { readInbox, type InboxState } from './inbox';

export type Change<S> = (state: S) => S;

export interface StateCell<S> {
  /** The state as stored now. */
  read(): Promise<S>;
  /** Applies `change` and stores the result when it differs; resolves with the state after it. */
  change(change: Change<S>): Promise<S>;
}

export interface NotifyStore {
  readonly inbox: StateCell<InboxState>;
  readonly device: StateCell<DeviceState>;
}

type Key = 'notify.inbox' | 'notify.device';

function cell<S>(
  settingsRepo: Pick<SettingsRepo, 'get' | 'update'>,
  key: Key,
  read: (stored: unknown) => S,
): StateCell<S> {
  return {
    read: async () => read(await settingsRepo.get(key)),
    async change(change) {
      const before = read(await settingsRepo.get(key));
      if (change(before) === before) return before;
      let after = before;
      await settingsRepo.update(key, (stored) => {
        const current = read(stored);
        after = change(current);
        // A plain record of JSON values: the reader above checks it on the way back.
        return after === current ? stored : (after as unknown as StoredRecord);
      });
      return after;
    },
  };
}

export function createNotifyStore(settingsRepo: Pick<SettingsRepo, 'get' | 'update'>): NotifyStore {
  return {
    inbox: cell(settingsRepo, 'notify.inbox', readInbox),
    device: cell(settingsRepo, 'notify.device', readDevice),
  };
}
