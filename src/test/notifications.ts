// A stand-in for the browser's notifications (src/services/reminders/notifier.ts): a permission
// the test sets, the answer the next request gives, and a worker that records what it showed.
// jsdom has no Notifications API and no service worker, so screen and service tests use this.

import { vi } from 'vitest';
import type {
  NotificationAccess,
  NotificationState,
  NotificationWorker,
} from '../services/reminders/notifier';

export interface FakeNotifications extends NotificationAccess {
  /** The browser's permission changes outside the app (site settings, another tab). */
  setState(state: NotificationState): void;
  /** What the next request answers; it also becomes the permission, as in a browser. */
  answerWith(state: NotificationState): void;
  readonly request: NotificationAccess['request'] & ReturnType<typeof vi.fn>;
  /** The running worker; set to null for none. */
  worker: NotificationAccess['worker'];
  readonly shown: ReturnType<typeof vi.fn<NotificationWorker['showNotification']>>;
}

/**
 * Notifications that start at `state` ('default' unless said otherwise). A request answers what
 * `answerWith` set, else 'granted' from 'default' and the permission as it stands otherwise.
 */
export function fakeNotifications(state: NotificationState = 'default'): FakeNotifications {
  let current = state;
  let answer: NotificationState | null = null;
  const shown = vi.fn<NotificationWorker['showNotification']>(async () => undefined);
  const worker: NotificationWorker = { showNotification: shown };
  const request = vi.fn(async (): Promise<NotificationState> => {
    if (current === 'unsupported') return current;
    const next = answer ?? (current === 'default' ? 'granted' : current);
    answer = null;
    current = next;
    return next;
  });
  return {
    state: () => current,
    setState(next) {
      current = next;
    },
    answerWith(next) {
      answer = next;
    },
    request,
    worker: async () => worker,
    shown,
  };
}
