// The notifier (P09-09, D-16.5): how a reminder reaches the person. The engine decides what is due
// and hands over catalogue keys; the notifier writes them out and shows them. A reminder that fell
// due while the page was running becomes a system notification, shown through the service worker's
// registration, when the browser allows this app to notify. Anything else becomes a banner at the
// top of the app: a reminder missed while the app was closed (the person is looking at the app by
// the time it is found), and one the browser cannot show (no permission, no worker, a refusal). A
// weigh-in that reaches the goal weight (P05-14) sends a system notification too, when the
// notifications switch and its own switch are on and the browser allows it; it never becomes a
// banner, because the goal-reached dialog is already on screen.
//
// `browserNotifications()` is the browser's side: the permission, the request (only from a
// press), and the worker registration that shows notifications.

import type { Bus } from '../../data/bus';
import type { Settings } from '../../data/settingsSchema';
import type { MessageParams } from '../../i18n/message';
import { t } from '../../i18n/t';
import type { ReminderNotice } from './engine';
import type { ReminderId, ReminderTextKey } from './schedule';

/** What the browser says about notifications for this app; `unsupported` where it has none. */
export type NotificationState = 'granted' | 'denied' | 'default' | 'unsupported';

/** The part of a `ServiceWorkerRegistration` that shows a notification. */
export interface NotificationWorker {
  showNotification(title: string, options?: NotificationOptions): Promise<void>;
}

/** The browser's notifications as the app uses them. */
export interface NotificationAccess {
  /** The permission now; read again at every use, since it can change outside the app. */
  state(): NotificationState;
  /** Asks the browser (call it straight from a press); resolves with the answer. */
  request(): Promise<NotificationState>;
  /** The running worker's registration, which shows notifications; null without one. */
  worker(): Promise<NotificationWorker | null>;
}

// ---- The browser ------------------------------------------------------------------------------

/** The parts of the `Notification` constructor used here. */
export interface NotificationApi {
  readonly permission: string;
  requestPermission(): Promise<string> | unknown;
}

/** The parts of a `ServiceWorkerRegistration` used here. */
export interface WorkerRegistrationLike extends NotificationWorker {
  readonly active: object | null;
}

/** The part of `navigator.serviceWorker` used here. */
export interface WorkerLookup {
  getRegistration(): Promise<WorkerRegistrationLike | undefined>;
}

export interface BrowserNotificationParts {
  /** Defaults to the global `Notification`; null where the browser has none. */
  readonly api?: NotificationApi | null;
  /** Defaults to `navigator.serviceWorker`; null where the browser has none. */
  readonly workers?: WorkerLookup | null;
}

function globalApi(): NotificationApi | null {
  return typeof Notification === 'undefined' ? null : Notification;
}

function globalWorkers(): WorkerLookup | null {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker
    : null;
}

function asState(value: unknown): NotificationState | null {
  return value === 'granted' || value === 'denied' || value === 'default' ? value : null;
}

/** The browser's notifications, looked up at each call (so a test's stand-ins apply). */
export function browserNotifications(parts: BrowserNotificationParts = {}): NotificationAccess {
  const api = (): NotificationApi | null => (parts.api === undefined ? globalApi() : parts.api);
  const workers = (): WorkerLookup | null =>
    parts.workers === undefined ? globalWorkers() : parts.workers;
  const state = (): NotificationState => {
    const found = api();
    return found ? (asState(found.permission) ?? 'default') : 'unsupported';
  };

  return {
    state,

    async request() {
      const found = api();
      if (!found) return 'unsupported';
      try {
        // Older Safari answers through a callback only; then the permission tells.
        return asState(await found.requestPermission()) ?? state();
      } catch {
        return state();
      }
    },

    async worker() {
      const lookup = workers();
      if (!lookup) return null;
      try {
        const registration = await lookup.getRegistration();
        // Only a worker that is running can show anything (development registers none).
        return registration && registration.active ? registration : null;
      } catch {
        return null;
      }
    },
  };
}

// ---- The notifier -----------------------------------------------------------------------------

/** One reminder shown in the app. */
export interface ReminderBanner {
  readonly id: ReminderId;
  readonly title: string;
  readonly body: string;
  /** When it fell due. */
  readonly dueAt: number;
  /** Its time passed while the app was closed or asleep. */
  readonly missed: boolean;
}

/** The switches the goal-weight alert needs, read when a goal is reached. */
export type GoalAlertSettings = Pick<Settings, 'remind.master' | 'alerts.goalReached'>;

export interface NotifierDeps {
  readonly access: Pick<NotificationAccess, 'state' | 'worker'>;
  /** The stored switches of the goal-weight alert. */
  alertSettings(): Promise<GoalAlertSettings>;
  /** A notification that could not be shown; defaults to the console. */
  onError?(error: unknown): void;
}

/** Where a reminder went. */
export type Shown = 'system' | 'banner';

export interface Notifier {
  /** Shows a reminder from the engine: a system notification when it can, else a banner. */
  show(notice: ReminderNotice): Promise<Shown>;
  /** The goal-weight alert; resolves true when a system notification was shown. */
  goalReached(): Promise<boolean>;
  /** Hears this tab's goal-reached messages on `bus`; returns the stop. */
  listen(bus: Pick<Bus, 'subscribe'>): () => void;
  /** The banners on show, oldest first: the same array until one comes or goes. */
  banners(): readonly ReminderBanner[];
  /** Calls `onChange` whenever the banners change; returns the stop. */
  subscribe(onChange: () => void): () => void;
  /** Takes one reminder's banner away. */
  dismiss(id: ReminderId): void;
}

/** The app's icon on a system notification, next to index.html. */
export const NOTIFICATION_ICON = `${import.meta.env.BASE_URL}icons/icon-192.png`;

/** A notification's tag: a newer one of the same reminder replaces the one still on show. */
export function notificationTag(id: ReminderId | 'goalReached'): string {
  return `platewise-${id}`;
}

function write(key: ReminderTextKey, params?: MessageParams): string {
  // The key is one of the reminders partition's; params are whatever that message names.
  return (t as (key: string, params?: MessageParams) => string)(key, params);
}

function reportToConsole(error: unknown): void {
  console.error('Platewise: a notification could not be shown', error);
}

export function createNotifier(deps: NotifierDeps): Notifier {
  const { access } = deps;
  const onError = deps.onError ?? reportToConsole;
  let shown: readonly ReminderBanner[] = [];
  const listeners = new Set<() => void>();

  function setBanners(next: readonly ReminderBanner[]): void {
    shown = next;
    for (const listener of [...listeners]) listener();
  }

  /** Shows a system notification; false when the browser cannot or will not. */
  async function notify(title: string, body: string, tag: string): Promise<boolean> {
    if (access.state() !== 'granted') return false;
    try {
      const worker = await access.worker();
      if (!worker) return false;
      await worker.showNotification(title, { body, tag, icon: NOTIFICATION_ICON });
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  }

  async function goalReached(): Promise<boolean> {
    let settings: GoalAlertSettings;
    try {
      settings = await deps.alertSettings();
    } catch (error) {
      onError(error);
      return false;
    }
    if (!settings['remind.master'] || !settings['alerts.goalReached']) return false;
    return notify(
      write('reminders.goalReached.title'),
      write('reminders.goalReached.body'),
      notificationTag('goalReached'),
    );
  }

  return {
    async show(notice) {
      const title = write(notice.title, notice.params);
      const body = write(notice.body, notice.params);
      if (!notice.missed && (await notify(title, body, notificationTag(notice.id)))) {
        return 'system';
      }
      const banner: ReminderBanner = {
        id: notice.id,
        title,
        body,
        dueAt: notice.dueAt,
        missed: notice.missed,
      };
      // One banner per reminder: a newer one takes the older one's place at the end.
      setBanners([...shown.filter((each) => each.id !== notice.id), banner]);
      return 'banner';
    },

    goalReached,

    listen(bus) {
      return bus.subscribe((message, fromOtherTab) => {
        if (message.type === 'goal-reached' && !fromOtherTab) void goalReached();
      });
    },

    banners: () => shown,

    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    dismiss(id) {
      if (shown.some((each) => each.id === id)) setBanners(shown.filter((each) => each.id !== id));
    },
  };
}
