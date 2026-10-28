// The `Notices` service of the Android app (P17-02, D-16.101): a notice is posted at once when its
// kind is on, Android allows notifications, it is not quiet hours (then it is dropped, not kept
// for later) and its onceKey has not been posted. The onceKey is recorded in the same settings
// transaction that checks it (device state, out of backups), so two posts of one notice at once
// show it once. A posted notice goes into the inbox too (D-16.103). Each kind has its own channel;
// each kind's notice of a day takes one of 8 ids by the day number (300–403), so today's never
// takes yesterday's out of the shade.

import type { Settings } from '../../data/settingsSchema';
import { dayKeyOf } from '../../domain/dates/dayKey';
import { NOTICE_KINDS, isQuietAt, type NoticeKind } from '../../domain/reminders/notices';
import type { Clock } from '../../lib/clock';
import { DAY_SLOTS, daySlot } from '../reminders/nudgePlan';
import { request, type NativeRequest } from '../reminders/requests';
import type { InboxItem, Notice, Notices, PostOutcome } from './contract';
import { claimOnce } from './device';
import { addItems } from './inbox';
import type { NotifyStore } from './store';

/** The first id of the event notices: each kind takes 8 (one per day slot). */
export const NOTICE_BASE_ID = 300;

/** The id of `kind`'s notice on the day of `at`. */
export function noticeId(kind: NoticeKind, at: number): number {
  return NOTICE_BASE_ID + NOTICE_KINDS.indexOf(kind) * DAY_SLOTS + daySlot(dayKeyOf(at));
}

export interface NoticesDeps {
  /** Shows a notification at once (the plugin's `schedule` without a time). */
  show(request: NativeRequest): Promise<unknown>;
  /** Android allows notifications now (read afresh). */
  permitted(): Promise<boolean>;
  settings(): Promise<Pick<Settings, 'notify.off' | 'notify.quiet'>>;
  readonly store: NotifyStore;
  readonly clock: Clock;
  /** A notice that could not be shown or kept; the console by default. */
  onError?(error: unknown): void;
}

function reportToConsole(error: unknown): void {
  console.error('Platewise: a notification could not be posted', error);
}

export function createNotices(deps: NoticesDeps): Notices {
  const { store, clock } = deps;
  const onError = deps.onError ?? reportToConsole;

  /** Records the onceKey; true when this call recorded it. */
  async function claim(onceKey: string, now: number): Promise<boolean> {
    let claimed = false;
    await store.device.change((state) => {
      const next = claimOnce(state, onceKey, now);
      claimed = next !== state;
      return next;
    });
    return claimed;
  }

  return {
    async post(notice: Notice): Promise<PostOutcome> {
      const settings = await deps.settings();
      if (settings['notify.off'].includes(notice.kind)) return 'off';
      if (!(await deps.permitted())) return 'notAllowed';
      const now = clock.now();
      if (settings['notify.quiet'] && isQuietAt(now)) return 'quiet';
      if (!(await claim(notice.onceKey, now))) return 'already';

      const { kind, title, body, open } = notice;
      const id = noticeId(kind, now);
      try {
        await deps.show(request(id, { title, body }, undefined, open, kind));
      } catch (error) {
        // Android refused (notifications off for the app): it stays recorded, so no retry storm.
        onError(error);
        return 'notAllowed';
      }
      const item: InboxItem = {
        ref: `${id}@${now}`,
        id,
        kind,
        title,
        body,
        at: now,
        open,
        read: false,
      };
      await store.inbox.change((state) => addItems(state, [item], now)).catch(onError);
      return 'posted';
    },
  };
}
