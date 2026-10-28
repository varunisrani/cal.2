// What Platewise sends by itself in the Android app (P17, D-16.100–D-16.103): the `Notices`
// contract of the phase file, where a tap opens the app, and what screens use (`NotifyService`).
// Types only: the code behind them is fetched in the Android app alone.

import type { NoticeKind, SmartKind } from '../../domain/reminders/notices';

export type { NoticeKind, SmartKind } from '../../domain/reminders/notices';

/**
 * Where a tap on a notification (or on its inbox item) opens the app: Home on today, the running
 * fast or the water there, Progress for a weigh-in, the meal's review, Settings › Your data, or a
 * Coach chat (a reply, a check-in: D-16.102).
 */
export type OpenTarget =
  'home' | 'fast' | 'water' | 'weight' | 'review' | 'data' | { readonly coachChat: string };

/** One notice to post at once. `onceKey` says what makes it the same notice ("sugarOver:<day>"). */
export interface Notice {
  readonly kind: NoticeKind;
  readonly title: string;
  readonly body: string;
  readonly open: OpenTarget;
  readonly onceKey: string;
}

export type PostOutcome = 'posted' | 'off' | 'notAllowed' | 'quiet' | 'already';

export interface Notices {
  /**
   * Posts at once when the kind is on, Android allows notifications, it is not quiet hours (else
   * it is dropped) and `onceKey` has not been posted; records `onceKey` (device state, out of
   * backups).
   */
  post(notice: Notice): Promise<PostOutcome>;
}

/** What the inbox keeps for each kind: a kind of notice, or one of the person's reminders. */
export type InboxKind = NoticeKind | 'reminder';

/** One notification in the in-app inbox (D-16.103). */
export interface InboxItem {
  /** `<notification id>@<when>`: the same notification at the same time is kept once. */
  readonly ref: string;
  /** Android's notification id, so a tap on the system notification finds its item. */
  readonly id: number;
  readonly kind: InboxKind;
  readonly title: string;
  readonly body: string;
  /** When it came, epoch ms. */
  readonly at: number;
  readonly open: OpenTarget;
  readonly read: boolean;
}

/** What screens show: the inbox, newest first, and the Home card's state. */
export interface NotifyView {
  readonly items: readonly InboxItem[];
  readonly unread: number;
  /** Not now was pressed on the Home card (or Android refused): it never shows again. */
  readonly cardDone: boolean;
  /** Whether the stored state has been read. */
  readonly ready: boolean;
}

/** The Android app's notifications as screens use them (P17). Only the Android app has one. */
export interface NotifyService {
  /** The posting side, also for "The Coach replied" (D-16.102). */
  readonly notices: Notices;
  /** The kinds with a switch in Smart notifications, in its order. */
  readonly kinds: readonly SmartKind[];
  subscribe(onChange: () => void): () => void;
  /** The same object until something changes. */
  getSnapshot(): NotifyView;
  /** Opens what an item (or a notification) is about. */
  open(target: OpenTarget): void;
  markRead(ref: string): Promise<void>;
  markAllRead(): Promise<void>;
  remove(ref: string): Promise<void>;
  clear(): Promise<void>;
  /** One Smart notifications switch. */
  setKind(kind: SmartKind, on: boolean): Promise<void>;
  setQuiet(on: boolean): Promise<void>;
  /** Only if I haven't logged it, on the meal reminders. */
  setOnlyIfNotLogged(on: boolean): Promise<void>;
  /** Hides the Home card for good. */
  dismissCard(): Promise<void>;
  /** Let the Coach set reminders (P17, D-16.102). */
  setCoachSets(on: boolean): Promise<void>;
  /** Takes a waiting check-in off the list; its notification goes with the next plan. */
  cancelCheckIn(id: string): Promise<void>;
}
