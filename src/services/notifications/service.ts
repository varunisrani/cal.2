// What screens use of the Android app's notifications (P17): the inbox as a live view with its
// changes (D-16.103), the Smart notifications switches, quiet hours, Only if I haven't logged it,
// the Home card's Not now, and opening what an item is about.

import type { LiveSource, LiveState } from '../../data/live';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import { SMART_KINDS, type SmartKind } from '../../domain/reminders/notices';
import type { Notices, NotifyService, NotifyView, OpenTarget } from './contract';
import { readDevice } from './device';
import {
  clearItems,
  markAllRead,
  markRead,
  readInbox,
  removeItem,
  unreadCount,
  type InboxState,
} from './inbox';
import type { NotifyStore } from './store';

export interface NotifyServiceDeps {
  readonly notices: Notices;
  readonly store: NotifyStore;
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'update'>;
  /** Opens what a notification is about (`open.ts` over the router). */
  open(target: OpenTarget): void;
  /** Live reads (`src/data/live`). */
  live<T>(query: () => T | Promise<T>): LiveSource<T>;
}

const NOT_READ: NotifyView = { items: [], unread: 0, cardDone: false, ready: false };

export function createNotifyService(deps: NotifyServiceDeps): NotifyService {
  const { store, settingsRepo } = deps;
  const source = deps.live(() =>
    Promise.all([settingsRepo.get('notify.inbox'), settingsRepo.get('notify.device')]),
  );
  let seen: LiveState<unknown> | null = null;
  let view = NOT_READ;

  const changeInbox = async (change: (state: InboxState) => InboxState) => {
    await store.inbox.change(change);
  };

  return {
    notices: deps.notices,
    kinds: SMART_KINDS,

    subscribe: (onChange) => source.subscribe(onChange),

    getSnapshot() {
      const state = source.getSnapshot();
      if (state === seen) return view;
      seen = state;
      if (state.status !== 'ready') return view;
      const [inbox, device] = state.value;
      const { items } = readInbox(inbox);
      view = {
        items,
        unread: unreadCount(items),
        cardDone: readDevice(device).cardDone,
        ready: true,
      };
      return view;
    },

    open: (target) => deps.open(target),

    markRead: (ref) => changeInbox((state) => markRead(state, ref)),
    markAllRead: () => changeInbox(markAllRead),
    remove: (ref) => changeInbox((state) => removeItem(state, ref)),
    clear: () => changeInbox(clearItems),

    async setKind(kind: SmartKind, on: boolean) {
      await settingsRepo.update('notify.off', (off) =>
        on ? off.filter((each) => each !== kind) : off.includes(kind) ? off : [...off, kind],
      );
    },

    async setQuiet(on) {
      await settingsRepo.update('notify.quiet', () => on);
    },

    async setOnlyIfNotLogged(on) {
      await settingsRepo.update('notify.onlyIfNotLogged', () => on);
    },

    async dismissCard() {
      await store.device.change((state) => (state.cardDone ? state : { ...state, cardDone: true }));
    },
  };
}
