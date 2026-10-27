import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBus } from '../../data/bus';
import { defaultSettings } from '../../data/settingsSchema';
import { reminders } from '../../i18n/en/reminders';
import { systemClock } from '../../lib/clock';
import { fakeNotifications } from '../../test/notifications';
import {
  REMINDER_SETTING_KEYS,
  createReminderEngine,
  type ReminderNotice,
  type ReminderSettings,
} from './engine';
import { browserTimers, localReminderMemory } from './ports';
import {
  NOTIFICATION_ICON,
  browserNotifications,
  createNotifier,
  notificationTag,
  type GoalAlertSettings,
  type NotificationAccess,
  type NotificationState,
  type NotificationWorker,
  type NotifierDeps,
  type WorkerRegistrationLike,
} from './notifier';

const words = reminders.reminders;

/** Lets the promise chains started meanwhile run to their end (no timer is involved). */
async function drain(): Promise<void> {
  for (let round = 0; round < 20; round++) await Promise.resolve();
}

/** A worker that records what it was asked to show. */
function recordingWorker() {
  return { showNotification: vi.fn<NotificationWorker['showNotification']>(async () => undefined) };
}

interface Setup {
  readonly state?: NotificationState;
  /** The running worker; null for none. */
  readonly worker?: NotificationWorker | null;
  readonly alerts?: Partial<GoalAlertSettings>;
}

function notifierWith({ state = 'granted', worker = recordingWorker(), alerts = {} }: Setup = {}) {
  const access: Pick<NotificationAccess, 'state' | 'worker'> = {
    state: vi.fn(() => state),
    worker: vi.fn(async () => worker),
  };
  const onError = vi.fn<NonNullable<NotifierDeps['onError']>>();
  const settings: GoalAlertSettings = {
    'remind.master': true,
    'alerts.goalReached': true,
    ...alerts,
  };
  const notifier = createNotifier({ access, alertSettings: async () => settings, onError });
  return { notifier, access, worker, onError };
}

const DUE = new Date('2026-10-26T12:00:00').getTime();

function notice(fields: Partial<ReminderNotice> = {}): ReminderNotice {
  return {
    id: 'lunch',
    title: 'reminders.lunch.title',
    body: 'reminders.lunch.body',
    dueAt: DUE,
    missed: false,
    ...fields,
  };
}

describe('createNotifier: reminders', () => {
  it('shows a reminder due while the page runs as a system notification, with its words and tag', async () => {
    const worker = recordingWorker();
    const { notifier } = notifierWith({ worker });

    await expect(notifier.show(notice())).resolves.toBe('system');

    expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith(words.lunch.title, {
      body: words.lunch.body,
      tag: 'platewise-lunch',
      icon: NOTIFICATION_ICON,
    });
    expect(notifier.banners()).toEqual([]);
  });

  it('writes out the summary with its numbers', async () => {
    const worker = recordingWorker();
    const { notifier } = notifierWith({ worker });

    await notifier.show(
      notice({
        id: 'summary',
        title: 'reminders.summary.title',
        body: 'reminders.summary.kcal',
        params: { eaten: 1_200, goal: 2_000, left: 800 },
      }),
    );

    expect(worker.showNotification).toHaveBeenCalledWith(
      words.summary.title,
      expect.objectContaining({ body: 'Eaten 1,200 of 2,000 kcal, 800 left.' }),
    );
  });

  it('shows a reminder missed while the app was closed as a banner, never as a system notification (D-16.5)', async () => {
    const worker = recordingWorker();
    const { notifier } = notifierWith({ worker });

    await expect(notifier.show(notice({ missed: true }))).resolves.toBe('banner');

    expect(worker.showNotification).not.toHaveBeenCalled();
    expect(notifier.banners()).toEqual([
      {
        id: 'lunch',
        title: words.lunch.title,
        body: words.lunch.body,
        dueAt: DUE,
        missed: true,
      },
    ]);
  });

  it.each(['default', 'denied', 'unsupported'] as const)(
    'uses the banner when the permission is %s (ACC-L5-1)',
    async (state) => {
      const worker = recordingWorker();
      const { notifier, access } = notifierWith({ state, worker });

      await expect(notifier.show(notice())).resolves.toBe('banner');

      expect(access.worker).not.toHaveBeenCalled();
      expect(worker.showNotification).not.toHaveBeenCalled();
      expect(notifier.banners()).toEqual([expect.objectContaining({ id: 'lunch', missed: false })]);
    },
  );

  it('uses the banner without a running worker', async () => {
    const { notifier } = notifierWith({ worker: null });

    await expect(notifier.show(notice())).resolves.toBe('banner');
    expect(notifier.banners()).toHaveLength(1);
  });

  it('uses the banner when the browser refuses to show it, and reports why', async () => {
    const refusal = new TypeError('No permission to show notifications');
    const worker = { showNotification: vi.fn(async () => Promise.reject(refusal)) };
    const { notifier, onError } = notifierWith({ worker });

    await expect(notifier.show(notice())).resolves.toBe('banner');

    expect(onError).toHaveBeenCalledExactlyOnceWith(refusal);
    expect(notifier.banners()).toHaveLength(1);
  });

  it('keeps one banner per reminder, the newest last, tells its listeners and dismisses one', async () => {
    const { notifier } = notifierWith({ state: 'default' });
    const heard = vi.fn();
    const stop = notifier.subscribe(heard);

    await notifier.show(notice({ id: 'breakfast', title: 'reminders.breakfast.title' }));
    await notifier.show(notice({ missed: true }));
    const before = notifier.banners();
    expect(notifier.banners()).toBe(before);
    await notifier.show(notice({ id: 'breakfast', title: 'reminders.breakfast.title' }));

    expect(notifier.banners().map((banner) => banner.id)).toEqual(['lunch', 'breakfast']);
    expect(heard).toHaveBeenCalledTimes(3);

    notifier.dismiss('lunch');
    notifier.dismiss('water');
    expect(notifier.banners().map((banner) => banner.id)).toEqual(['breakfast']);
    expect(heard).toHaveBeenCalledTimes(4);

    stop();
    notifier.dismiss('breakfast');
    expect(notifier.banners()).toEqual([]);
    expect(heard).toHaveBeenCalledTimes(4);
  });
});

describe('createNotifier: the goal-weight alert (P05-14)', () => {
  it('notifies with the master switch and its own switch on and the permission granted', async () => {
    const worker = recordingWorker();
    const { notifier } = notifierWith({ worker });

    await expect(notifier.goalReached()).resolves.toBe(true);

    expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith(words.goalReached.title, {
      body: words.goalReached.body,
      tag: notificationTag('goalReached'),
      icon: NOTIFICATION_ICON,
    });
  });

  it.each([
    ['the master switch is off', { alerts: { 'remind.master': false } }],
    ['its own switch is off', { alerts: { 'alerts.goalReached': false } }],
    ['the permission is not granted', { state: 'default' }],
    ['no worker is running', { worker: null }],
  ] as [string, Setup][])(
    'stays quiet when %s, and never becomes a banner',
    async (_case, setup) => {
      const worker = setup.worker === null ? null : recordingWorker();
      const { notifier } = notifierWith({ ...setup, worker });

      await expect(notifier.goalReached()).resolves.toBe(false);

      if (worker) expect(worker.showNotification).not.toHaveBeenCalled();
      expect(notifier.banners()).toEqual([]);
    },
  );

  it("hears this tab's goal-reached messages on the bus until stopped", async () => {
    const worker = recordingWorker();
    const { notifier } = notifierWith({ worker });
    const bus = createBus({ channel: null });
    const stop = notifier.listen(bus);

    bus.post({ type: 'settings-loaded' });
    bus.post({ type: 'goal-reached', kg: 79.4 }, 'this-tab');
    await drain();
    expect(worker.showNotification).toHaveBeenCalledTimes(1);

    stop();
    bus.post({ type: 'goal-reached', kg: 79 }, 'this-tab');
    await drain();
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    bus.close();
  });

  it('reports switches it could not read and shows nothing', async () => {
    const failure = new Error('settings unreadable');
    const worker = recordingWorker();
    const onError = vi.fn();
    const notifier = createNotifier({
      access: { state: () => 'granted', worker: async () => worker },
      alertSettings: () => Promise.reject(failure),
      onError,
    });

    await expect(notifier.goalReached()).resolves.toBe(false);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(worker.showNotification).not.toHaveBeenCalled();
  });
});

describe('browserNotifications', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the permission, and unsupported where there is no Notifications API', () => {
    expect(
      browserNotifications({ api: { permission: 'denied', requestPermission: vi.fn() } }).state(),
    ).toBe('denied');
    expect(browserNotifications({ api: null }).state()).toBe('unsupported');

    // jsdom has no Notification: the default lookup finds none.
    expect(browserNotifications().state()).toBe('unsupported');
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() });
    expect(browserNotifications().state()).toBe('granted');
  });

  it('asks the browser and answers with its choice; an answer through a callback is read back', async () => {
    const api = { permission: 'default', requestPermission: vi.fn(async () => 'granted') };
    await expect(browserNotifications({ api }).request()).resolves.toBe('granted');
    expect(api.requestPermission).toHaveBeenCalledOnce();

    const callbackOnly = { permission: 'denied', requestPermission: vi.fn(() => undefined) };
    await expect(browserNotifications({ api: callbackOnly }).request()).resolves.toBe('denied');

    const throwing = {
      permission: 'default',
      requestPermission: vi.fn(() => {
        throw new TypeError('Not from a press');
      }),
    };
    await expect(browserNotifications({ api: throwing }).request()).resolves.toBe('default');

    await expect(browserNotifications({ api: null }).request()).resolves.toBe('unsupported');
  });

  it('finds the running worker only', async () => {
    const running: WorkerRegistrationLike = {
      active: {},
      showNotification: vi.fn(async () => undefined),
    };
    const installing: WorkerRegistrationLike = {
      active: null,
      showNotification: vi.fn(async () => undefined),
    };
    const lookup = (found: WorkerRegistrationLike | undefined) => ({
      getRegistration: vi.fn(async () => found),
    });

    await expect(browserNotifications({ workers: lookup(running) }).worker()).resolves.toBe(
      running,
    );
    await expect(
      browserNotifications({ workers: lookup(installing) }).worker(),
    ).resolves.toBeNull();
    await expect(browserNotifications({ workers: lookup(undefined) }).worker()).resolves.toBeNull();
    await expect(browserNotifications({ workers: null }).worker()).resolves.toBeNull();
    const failing = { getRegistration: vi.fn(() => Promise.reject(new Error('blocked'))) };
    await expect(browserNotifications({ workers: failing }).worker()).resolves.toBeNull();
  });
});

describe('the engine and the notifier together, as main.tsx joins them', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Fake timers and `Date`; the fake IndexedDB's `setImmediate` stays real (none is used here). */
  function useFakeClock(at: string): void {
    vi.useFakeTimers({
      now: new Date(at).getTime(),
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
  }

  /** The stored settings with the notifications switch and lunch at 12:00 on. */
  function lunchOn(): ReminderSettings {
    const all = defaultSettings({ locale: 'en-US' });
    const picked: Partial<Record<keyof ReminderSettings, unknown>> = {};
    for (const key of REMINDER_SETTING_KEYS) picked[key] = all[key];
    return {
      ...(picked as ReminderSettings),
      'remind.master': true,
      'remind.lunch': { on: true, at: '12:00' },
    };
  }

  function app(state: 'granted' | 'default', memory = localReminderMemory(() => null)) {
    const notifications = fakeNotifications(state);
    const notifier = createNotifier({
      access: notifications,
      alertSettings: async () => ({ 'remind.master': true, 'alerts.goalReached': false }),
    });
    const settings = lunchOn();
    const engine = createReminderEngine({
      clock: systemClock,
      timers: browserTimers,
      visibility: { isVisible: () => true, subscribe: () => () => undefined },
      settings: async () => settings,
      activeFast: async () => null,
      todayTotals: async () => ({ eatenKcal: 0, goalKcal: 2_000 }),
      memory,
      permitted: () => notifications.state() === 'granted',
      show: (notice) => void notifier.show(notice),
    });
    return { notifications, notifier, engine, memory };
  }

  it('turns a lunch reminder due while the page runs into a system notification', async () => {
    useFakeClock('2026-10-26T11:00:00');
    const { engine, notifier, notifications } = app('granted');
    engine.start();
    await engine.settled();

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    await engine.settled();

    await drain();
    expect(notifications.shown).toHaveBeenCalledTimes(1);
    expect(notifications.shown).toHaveBeenCalledWith(
      words.lunch.title,
      expect.objectContaining({ tag: 'platewise-lunch' }),
    );
    expect(notifier.banners()).toEqual([]);
    engine.stop();
  });

  it('shows a lunch missed while the app was closed as a banner once, on the next open (ACC-J11-2)', async () => {
    useFakeClock('2026-10-26T11:00:00');
    const first = app('granted');
    first.engine.start();
    await first.engine.settled();
    // The app is closed before noon and opened again at 12:30.
    first.engine.stop();
    vi.setSystemTime(new Date('2026-10-26T12:30:00'));

    const next = app('granted', first.memory);
    next.engine.start();
    await next.engine.settled();
    await drain();
    expect(next.notifier.banners()).toHaveLength(1);

    expect(next.notifier.banners()[0]).toMatchObject({
      id: 'lunch',
      title: words.lunch.title,
      missed: true,
      dueAt: new Date('2026-10-26T12:00:00').getTime(),
    });
    expect(next.notifications.shown).not.toHaveBeenCalled();
    next.engine.stop();
  });
});
