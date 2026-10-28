// The Android app's reminders against a stand-in for `@capacitor/local-notifications`
// (testing/fakeNotificationsPlugin.ts): what is handed to the system, taken back, and left alone;
// the permission; taps. No JVM.

import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../data/settingsSchema';
import type { Fast } from '../../domain/model';
import type { CustomReminder } from '../../domain/reminders/custom';
import type { Clock } from '../../lib/clock';
import { makeFast } from '../../test/factories';
import { REMINDER_SETTING_KEYS, type PageVisibility, type ReminderSettings } from './engine';
import { CHANNEL_ID, NATIVE_IDS, channelOf, summaryId, type NudgeFacts } from './nativePlan';
import { createNativeReminders, permissionOf, type NativeReminderDeps } from './nativeSync';
import { writeMessage } from './notifier';
import { DAY_SLOTS, NUDGE_IDS, daySlot } from './nudgePlan';
import type { DayTotals } from './schedule';
import { FakeNotificationsPlugin } from './testing/fakeNotificationsPlugin';

// Tests run in America/New_York. Monday 26 October 2026, 12:30.
const NOW = new Date('2026-10-26T12:30:00').getTime();
const MINUTE = 60_000;

class FakeVisibility implements PageVisibility {
  visible = true;
  readonly listeners = new Set<() => void>();

  isVisible = (): boolean => this.visible;

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  set(visible: boolean): void {
    this.visible = visible;
    for (const listener of [...this.listeners]) listener();
  }
}

function storedDefaults(changes: Partial<ReminderSettings> = {}): ReminderSettings {
  const all = defaultSettings({ locale: 'en-US' });
  const picked: Partial<Record<keyof ReminderSettings, unknown>> = {};
  for (const key of REMINDER_SETTING_KEYS) picked[key] = all[key];
  return { ...(picked as ReminderSettings), ...changes };
}

const MEALS: Partial<ReminderSettings> = {
  'remind.master': true,
  'remind.breakfast': { on: true, at: '08:00' },
  'remind.lunch': { on: true, at: '12:00' },
};

function rig(settings: ReminderSettings = storedDefaults(MEALS)) {
  const plugin = new FakeNotificationsPlugin();
  const visibility = new FakeVisibility();
  let changed: (() => void) | null = null;
  let now = NOW;
  const clock: Clock = { now: () => now, timeZone: () => 'America/New_York' };
  const state = {
    settings,
    fast: null as Fast | null,
    totals: (): DayTotals => ({ eatenKcal: 0, goalKcal: 2_000 }),
  };
  const onOpen = vi.fn<NativeReminderDeps['onOpen']>();
  const onError = vi.fn<NonNullable<NativeReminderDeps['onError']>>();
  const { access, engine } = createNativeReminders({
    plugin,
    clock,
    visibility,
    settings: async () => state.settings,
    activeFast: async () => state.fast,
    todayTotals: async () => state.totals(),
    watch(onChange) {
      changed = onChange;
      return () => {
        changed = null;
      };
    },
    write: writeMessage,
    channel: { name: 'Reminders', description: 'All of them.' },
    onOpen,
    onError,
  });
  return {
    plugin,
    visibility,
    state,
    access,
    engine,
    onOpen,
    onError,
    setNow(at: number) {
      now = at;
    },
    /** A stored change, as the live queries report one, and the check it starts. */
    async change(next: Partial<typeof state>) {
      Object.assign(state, next);
      changed?.();
      await engine.settled();
    },
    async start() {
      engine.start();
      await engine.settled();
    },
  };
}

describe('createNativeReminders: the schedule (D-16.92)', () => {
  it('hands every reminder that is on to the system when the app starts, in our channel', async () => {
    const r = rig();

    await r.start();

    expect(r.plugin.ids()).toEqual([NATIVE_IDS.breakfast, NATIVE_IDS.lunch]);
    expect(r.plugin.held.get(NATIVE_IDS.lunch)).toMatchObject({
      title: 'Lunch',
      schedule: { on: { hour: 12, minute: 0 }, allowWhileIdle: true },
      channelId: CHANNEL_ID,
    });
    expect(r.plugin.channels).toEqual([
      { id: CHANNEL_ID, importance: 3, name: 'Reminders', description: 'All of them.' },
    ]);
    expect(r.access.state()).toBe('granted');
  });

  it('hands everything over again when the app starts, as a force stop drops the alarms', async () => {
    const before = rig();
    await before.start();
    // The next start after a force stop: the plugin still lists them, Android has no alarm.
    const again = rig();
    for (const [id, each] of before.plugin.held) again.plugin.held.set(id, each);

    await again.start();

    expect(again.plugin.scheduled).toEqual([[NATIVE_IDS.breakfast, NATIVE_IDS.lunch]]);

    // Coming back to the front only checks: nothing unchanged is handed over again.
    again.visibility.set(false);
    again.visibility.set(true);
    await again.engine.settled();
    expect(again.plugin.scheduled).toHaveLength(1);
  });

  it('takes back a reminder switched off, and leaves the others alone', async () => {
    const r = rig();
    await r.start();
    r.plugin.scheduled.length = 0;

    await r.change({
      settings: { ...r.state.settings, 'remind.breakfast': { on: false, at: '08:00' } },
    });

    expect(r.plugin.cancelled).toEqual([[NATIVE_IDS.breakfast]]);
    expect(r.plugin.ids()).toEqual([NATIVE_IDS.lunch]);
    // Lunch is unchanged: handing it over again would take it out of the shade.
    expect(r.plugin.scheduled).toEqual([]);
  });

  it('hands over again only the reminder whose time moved', async () => {
    const r = rig();
    await r.start();
    r.plugin.scheduled.length = 0;

    await r.change({
      settings: { ...r.state.settings, 'remind.lunch': { on: true, at: '12:45' } },
    });

    expect(r.plugin.scheduled).toEqual([[NATIVE_IDS.lunch]]);
    expect(r.plugin.cancelled).toEqual([]);
    expect(r.plugin.held.get(NATIVE_IDS.lunch)!.schedule).toEqual({
      on: { hour: 12, minute: 45 },
      allowWhileIdle: true,
    });
  });

  it('takes everything back when the notifications switch goes off, and hands it over again when it is on', async () => {
    const r = rig();
    await r.start();

    await r.change({ settings: { ...r.state.settings, 'remind.master': false } });
    expect(r.plugin.ids()).toEqual([]);

    await r.change({ settings: { ...r.state.settings, 'remind.master': true } });
    expect(r.plugin.ids()).toEqual([NATIVE_IDS.breakfast, NATIVE_IDS.lunch]);
  });

  it('moves the fasting goal with the fast, and takes it back when the fast ends', async () => {
    // Quiet hours off: the goals below fall at night (P17 moves those to 07:00, tested apart).
    const r = rig(
      storedDefaults({
        ...MEALS,
        'fasting.on': true,
        'remind.fastGoal': true,
        'notify.quiet': false,
      }),
    );
    const fast = makeFast({ start: NOW - 60 * MINUTE, goalMin: 16 * 60, end: null });
    r.state.fast = fast;
    await r.start();
    expect(r.plugin.held.get(NATIVE_IDS.fastGoal)!.schedule).toEqual({
      at: new Date(NOW + 15 * 60 * MINUTE),
      allowWhileIdle: true,
    });

    await r.change({ fast: { ...fast, goalMin: 18 * 60 } });
    expect(r.plugin.held.get(NATIVE_IDS.fastGoal)!.schedule).toEqual({
      at: new Date(NOW + 17 * 60 * MINUTE),
      allowWhileIdle: true,
    });

    await r.change({ fast: null });
    expect(r.plugin.held.has(NATIVE_IDS.fastGoal)).toBe(false);
  });

  it('hands over a written reminder, and takes it back when it is deleted', async () => {
    const gym: CustomReminder = {
      id: 'gym',
      text: 'Gym bag',
      time: '07:00',
      days: ['mon', 'thu'],
      on: true,
    };
    const r = rig(storedDefaults({ 'remind.master': true, 'remind.custom': [gym] }));
    await r.start();
    expect([...r.plugin.held.values()].map((each) => each.body)).toEqual(['Gym bag', 'Gym bag']);

    await r.change({ settings: { ...r.state.settings, 'remind.custom': [] } });
    expect(r.plugin.ids()).toEqual([]);
  });

  it("hands the summary over again with new numbers after the day's diary changed", async () => {
    const r = rig(
      storedDefaults({ 'remind.master': true, 'remind.summary': { on: true, at: '20:00' } }),
    );
    await r.start();
    const today = summaryId('2026-10-26');
    expect(r.plugin.held.get(today)!.body).toBe('Eaten 0 of 2,000 kcal, 2,000 left.');
    r.plugin.scheduled.length = 0;

    await r.change({ totals: () => ({ eatenKcal: 650, goalKcal: 2_000 }) });

    expect(r.plugin.held.get(today)!.body).toBe('Eaten 650 of 2,000 kcal, 1,350 left.');
    // Every summary day reads the same stand-in here, so all seven moved.
    expect(r.plugin.scheduled[0]).toHaveLength(7);
  });
});

describe('createNativeReminders: the permission (Android 13+)', () => {
  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['prompt-with-rationale', 'denied'],
    ['prompt', 'default'],
  ] as const)('reads the plugin answer %s as %s', (display, state) => {
    expect(permissionOf(display)).toBe(state);
  });

  it('hands nothing over and takes everything back while Android refuses', async () => {
    const r = rig();
    await r.start();
    expect(r.plugin.ids()).toHaveLength(2);

    // Taken away in Android's settings; noticed when the app comes back to the front.
    r.plugin.display = 'denied';
    r.visibility.set(false);
    r.visibility.set(true);
    await r.engine.settled();

    expect(r.access.state()).toBe('denied');
    expect(r.plugin.ids()).toEqual([]);
    expect(r.onError).not.toHaveBeenCalled();
  });

  it('asks Android, and reads anything but a grant as a refusal', async () => {
    const r = rig();
    r.plugin.display = 'prompt';
    await r.access.refresh();
    expect(r.access.state()).toBe('default');

    r.plugin.answer = 'denied';
    await expect(r.access.request()).resolves.toBe('denied');
    expect(r.access.state()).toBe('denied');

    r.plugin.answer = 'granted';
    await expect(r.access.request()).resolves.toBe('granted');
    expect(r.access.system).toBe('android');
  });

  it('starts handing over once the permission is granted', async () => {
    const r = rig();
    r.plugin.display = 'prompt';
    await r.start();
    expect(r.plugin.ids()).toEqual([]);

    await r.access.request();
    await r.engine.refresh();

    expect(r.plugin.ids()).toEqual([NATIVE_IDS.breakfast, NATIVE_IDS.lunch]);
  });
});

describe('createNativeReminders: taps, errors and stop', () => {
  it('opens the fast for the fasting goal and Home for everything else', async () => {
    const r = rig();
    await r.start();

    r.plugin.tap({ open: 'fast', key: 'k' });
    r.plugin.tap({ open: 'home', key: 'k' });
    r.plugin.tap(null);

    expect(r.onOpen.mock.calls).toEqual([['fast'], ['home'], ['home']]);
  });

  it('opens what a tap that started the app was about, once the engine listens', async () => {
    const r = rig();
    r.plugin.tap({ open: 'fast', key: 'k' });
    expect(r.onOpen).not.toHaveBeenCalled();

    await r.start();

    expect(r.onOpen).toHaveBeenCalledExactlyOnceWith('fast');
  });

  it('shows the goal-weight alert at once through the same access', async () => {
    const r = rig();
    const worker = await r.access.worker();

    await worker!.showNotification('Goal weight reached', { body: 'Well done', tag: 'x' });

    expect(r.plugin.shownAtOnce).toMatchObject([
      { id: NATIVE_IDS.goalReached, title: 'Goal weight reached', body: 'Well done' },
    ]);
    expect(r.plugin.ids()).toEqual([]);
  });

  it('reports a refused hand-over and tries again at the next check', async () => {
    const r = rig();
    const failure = new Error('alarm service busy');
    r.plugin.failSchedule = failure;
    await r.start();
    expect(r.onError).toHaveBeenCalledWith(failure);
    expect(r.plugin.ids()).toEqual([]);

    r.plugin.failSchedule = null;
    await r.engine.refresh();
    expect(r.plugin.ids()).toEqual([NATIVE_IDS.breakfast, NATIVE_IDS.lunch]);
  });

  it('still owes the full hand-over of the start when it failed, and makes it at the next check', async () => {
    const before = rig();
    await before.start();
    const again = rig();
    for (const [id, each] of before.plugin.held) again.plugin.held.set(id, each);
    again.plugin.failSchedule = new Error('alarm service busy');
    await again.start();
    expect(again.plugin.scheduled).toEqual([]);

    again.plugin.failSchedule = null;
    await again.engine.refresh();
    expect(again.plugin.scheduled).toEqual([[NATIVE_IDS.breakfast, NATIVE_IDS.lunch]]);
  });

  it('takes every notification back on stop (erase everything), at once, and stops listening', async () => {
    const r = rig();
    await r.start();
    r.plugin.cancelled.length = 0;

    r.engine.stop();
    // Sent before anything is awaited: a reload right after cannot lose it.
    expect(r.plugin.cancelled).toEqual([[NATIVE_IDS.breakfast, NATIVE_IDS.lunch]]);
    await r.engine.settled();
    expect(r.plugin.ids()).toEqual([]);

    r.plugin.tap({ open: 'home' });
    await r.change({
      settings: { ...r.state.settings, 'remind.dinner': { on: true, at: '19:00' } },
    });
    expect(r.onOpen).not.toHaveBeenCalled();
    expect(r.plugin.ids()).toEqual([]);
  });

  it('can start again after a stop', async () => {
    const r = rig();
    await r.start();
    r.engine.stop();
    await r.engine.settled();

    await r.start();
    expect(r.plugin.ids()).toEqual([NATIVE_IDS.breakfast, NATIVE_IDS.lunch]);
    expect(r.plugin.channels).toHaveLength(1);
  });
});

describe('createNativeReminders: the nudges and the inbox hooks (P17)', () => {
  function nudgeRig() {
    const plugin = new FakeNotificationsPlugin();
    const visibility = new FakeVisibility();
    let changed: (() => void) | null = null;
    const clock: Clock = { now: () => NOW, timeZone: () => 'America/New_York' };
    const state = {
      settings: storedDefaults({
        'notify.off': ['waterPace', 'emptyDay', 'weighIn'],
      }),
      lunchLogged: false,
    };
    const facts = vi.fn(async (): Promise<NudgeFacts> => ({
      days: new Map([
        [
          '2026-10-26',
          {
            meals: state.lunchLogged ? (['lunch'] as const) : [],
            waterMl: 0,
            any: state.lunchLogged,
          },
        ],
      ]),
      usual: {},
      lastWeighIn: null,
    }));
    const handedOver = vi.fn<NonNullable<NativeReminderDeps['onHandedOver']>>();
    const shown = vi.fn();
    const onOpen = vi.fn<NativeReminderDeps['onOpen']>();
    const channels = [{ id: channelOf('mealCheck'), name: 'Meal check', importance: 3 as const }];
    const { engine } = createNativeReminders({
      plugin,
      clock,
      visibility,
      settings: async () => state.settings,
      activeFast: async () => null,
      todayTotals: async () => ({ eatenKcal: 0, goalKcal: 2_000 }),
      watch(onChange) {
        changed = onChange;
        return () => {
          changed = null;
        };
      },
      write: writeMessage,
      channel: { name: 'Reminders', description: 'All of them.' },
      onOpen,
      nudgeFacts: facts,
      channels,
      onHandedOver: handedOver,
      onShown: shown,
    });
    return {
      plugin,
      state,
      engine,
      facts,
      handedOver,
      shown,
      onOpen,
      async start() {
        engine.start();
        await engine.settled();
      },
      async change() {
        changed?.();
        await engine.settled();
      },
    };
  }

  const lunchCheckToday = NUDGE_IDS.mealCheck + DAY_SLOTS + daySlot('2026-10-26');

  it('makes a channel per kind besides the reminders’ and hands the nudges over without the reminders’ switch', async () => {
    const r = nudgeRig();
    await r.start();

    expect(r.plugin.channels).toEqual([
      { id: CHANNEL_ID, importance: 3, name: 'Reminders', description: 'All of them.' },
      { id: channelOf('mealCheck'), name: 'Meal check', importance: 3 },
    ]);
    expect(r.facts).toHaveBeenCalledWith(r.state.settings, NOW);
    expect(r.plugin.held.get(lunchCheckToday)).toMatchObject({
      title: 'Lunch',
      body: 'Nothing logged for lunch yet.',
      channelId: channelOf('mealCheck'),
    });
  });

  it("takes today's meal check back once the meal is logged, and reports each plan handed over", async () => {
    const r = nudgeRig();
    await r.start();
    expect(r.handedOver).toHaveBeenCalledTimes(1);
    expect(r.handedOver.mock.calls[0]![1]).toBe(NOW);

    r.state.lunchLogged = true;
    await r.change();

    expect(r.plugin.held.has(lunchCheckToday)).toBe(false);
    expect(r.plugin.cancelled.at(-1)).toContain(lunchCheckToday);
    expect(r.handedOver).toHaveBeenCalledTimes(2);
    expect(r.handedOver.mock.calls[1]![0].map((each) => each.id)).not.toContain(lunchCheckToday);
  });

  it('hears a notification Android shows while the app runs, and passes a tap’s id on', async () => {
    const r = nudgeRig();
    await r.start();

    r.plugin.shown(lunchCheckToday);
    r.plugin.tap({ open: 'water', key: 'k' }, 161);
    r.plugin.tap({ open: { coachChat: 'chat-1' } });
    r.plugin.tap({ open: 'gremlins' });

    expect(r.shown).toHaveBeenCalledTimes(1);
    expect(r.onOpen.mock.calls).toEqual([['water', 161], [{ coachChat: 'chat-1' }], ['home']]);
  });
});
