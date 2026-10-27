import { describe, expect, it, vi } from 'vitest';
import { defaultSettings, type ReminderSetting } from '../../data/settingsSchema';
import type { Fast } from '../../domain/model';
import { t, type TKey } from '../../i18n/t';
import type { MessageParams } from '../../i18n/message';
import { systemClock } from '../../lib/clock';
import { makeFast } from '../../test/factories';
import {
  MAX_WAIT_MS,
  REMINDER_SETTING_KEYS,
  createReminderEngine,
  type PageVisibility,
  type ReminderEngine,
  type ReminderEngineDeps,
  type ReminderNotice,
  type ReminderSettings,
} from './engine';
import { browserTimers, localReminderMemory } from './ports';
import { REMINDER_SETTING, type DailyReminder, type DayTotals } from './schedule';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** A local wall-clock time in the zone tests run in (America/New_York). */
function local(text: string): number {
  return new Date(text).getTime();
}

/** Fake timers and `Date`; the fake IndexedDB's `setImmediate` stays real. */
function useFakeClock(at: string): void {
  vi.useFakeTimers({
    now: local(at),
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
}

function render(key: TKey, params?: MessageParams): string {
  return (t as (key: string, params?: MessageParams) => string)(key, params);
}

/** The settings with every reminder off, as stored by default. */
function storedDefaults(): ReminderSettings {
  const all = defaultSettings({ locale: 'en-US' });
  const picked: Partial<Record<keyof ReminderSettings, unknown>> = {};
  for (const key of REMINDER_SETTING_KEYS) picked[key] = all[key];
  return picked as ReminderSettings;
}

class FakeVisibility implements PageVisibility {
  visible = true;
  readonly listeners = new Set<() => void>();

  isVisible(): boolean {
    return this.visible;
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  set(visible: boolean): void {
    this.visible = visible;
    for (const listener of [...this.listeners]) listener();
  }
}

interface Rig {
  readonly engine: ReminderEngine;
  readonly shown: ReminderNotice[];
  readonly visibility: FakeVisibility;
  readonly errors: unknown[];
  /** The stored settings; change them in place. */
  settings: ReminderSettings;
  fast: Fast | null;
  permitted: boolean;
  totals: () => Promise<DayTotals>;
  readonly totalsAsked: string[];
  /** Calls the watch listener, as a stored change would. */
  changed(): void;
  readonly watching: () => boolean;
}

interface RigOptions {
  readonly memory?: ReturnType<typeof localReminderMemory>;
  readonly settings?: ReminderSettings;
  readonly fast?: Fast | null;
  readonly deps?: Partial<ReminderEngineDeps>;
}

function rig(options: RigOptions = {}): Rig {
  let listener: (() => void) | null = null;
  const state: Rig = {
    shown: [],
    visibility: new FakeVisibility(),
    errors: [],
    settings: options.settings ?? storedDefaults(),
    fast: options.fast ?? null,
    permitted: true,
    totals: () => Promise.resolve({ eatenKcal: 0, goalKcal: 2_000 }),
    totalsAsked: [],
    changed: () => listener?.(),
    watching: () => listener !== null,
    engine: undefined as unknown as ReminderEngine,
  };
  const engine = createReminderEngine({
    clock: systemClock,
    timers: browserTimers,
    visibility: state.visibility,
    settings: () => Promise.resolve(state.settings),
    activeFast: () => Promise.resolve(state.fast),
    todayTotals: (day) => {
      state.totalsAsked.push(day);
      return state.totals();
    },
    permitted: () => state.permitted,
    memory: options.memory ?? localReminderMemory(() => null),
    show: (notice) => state.shown.push(notice),
    watch(onChange) {
      listener = onChange;
      return () => {
        listener = null;
      };
    },
    onError: (error) => state.errors.push(error),
    ...options.deps,
  });
  return Object.assign(state, { engine });
}

/** Turns the master switch and the given reminders on (as the settings section will). */
function remindersOn(
  settings: ReminderSettings,
  times: Partial<Record<DailyReminder, string>>,
): ReminderSettings {
  const next: Record<string, unknown> = { ...settings, 'remind.master': true };
  for (const [id, at] of Object.entries(times) as [DailyReminder, string][]) {
    const reminder: ReminderSetting = { on: true, at };
    next[REMINDER_SETTING[id]] = reminder;
  }
  return next as ReminderSettings;
}

async function startAndSettle(engine: ReminderEngine): Promise<void> {
  engine.start();
  await engine.settled();
}

/** Moves fake time forward, firing timers, and waits for the checks they started. */
async function pass(engine: ReminderEngine, ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await engine.settled();
}

function ids(notices: readonly ReminderNotice[]): string[] {
  return notices.map((notice) => notice.id);
}

describe('createReminderEngine: daily reminders', () => {
  it('shows a water reminder set for 15:00 at 15:00 while the app is open (ACC-H5-1)', async () => {
    useFakeClock('2026-06-10T14:00:00');
    const r = rig();
    r.settings = { ...remindersOn(r.settings, { water: '15:00' }), 'water.on': true };
    await startAndSettle(r.engine);
    await pass(r.engine, HOUR - 1);
    expect(r.shown).toEqual([]);

    await pass(r.engine, 1);
    expect(r.shown).toEqual([
      {
        id: 'water',
        dueAt: local('2026-06-10T15:00:00'),
        missed: false,
        title: 'reminders.water.title',
        body: 'reminders.water.body',
      },
    ]);
    expect(render(r.shown[0]!.title)).toBe('Water');

    // Once a day: the next one is tomorrow at 15:00.
    await pass(r.engine, 24 * HOUR - 1);
    expect(r.shown).toHaveLength(1);
    await pass(r.engine, 1);
    expect(r.shown).toHaveLength(2);
  });

  it('keeps the water reminder quiet while water tracking is off', async () => {
    useFakeClock('2026-06-10T14:00:00');
    const r = rig();
    r.settings = remindersOn(r.settings, { water: '15:00' });
    await startAndSettle(r.engine);
    await pass(r.engine, 2 * HOUR);
    expect(r.shown).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the meal reminders whatever was logged: a log never holds one back (D-16.61)', async () => {
    useFakeClock('2026-06-10T07:00:00');
    const r = rig();
    r.settings = remindersOn(r.settings, { breakfast: '08:00', lunch: '12:00', dinner: '19:00' });
    r.totals = () => Promise.resolve({ eatenKcal: 1_850, goalKcal: 2_000 });
    await startAndSettle(r.engine);
    await pass(r.engine, 12 * HOUR);
    expect(ids(r.shown)).toEqual(['breakfast', 'lunch', 'dinner']);
    // The diary is read for the summary only.
    expect(r.totalsAsked).toEqual([]);
  });

  it.each([
    [
      'its own switch',
      (s: ReminderSettings) => ({ ...s, 'remind.lunch': { on: false, at: '12:00' } }),
    ],
    ['the master switch', (s: ReminderSettings) => ({ ...s, 'remind.master': false })],
  ])(
    'does not show a reminder when %s goes off between scheduling and fire time (R06.10)',
    async (_name, switchOff) => {
      useFakeClock('2026-06-10T11:00:00');
      const r = rig();
      r.settings = remindersOn(r.settings, { lunch: '12:00' });
      await startAndSettle(r.engine);
      expect(vi.getTimerCount()).toBe(1);

      // Stored without a word to the engine: only the check at fire time can see it.
      r.settings = switchOff(r.settings);
      await pass(r.engine, HOUR);
      expect(r.shown).toEqual([]);
    },
  );

  it('does not show a reminder when the permission was taken back before fire time (R06.10)', async () => {
    useFakeClock('2026-06-10T11:00:00');
    const r = rig();
    r.settings = remindersOn(r.settings, { lunch: '12:00' });
    await startAndSettle(r.engine);
    r.permitted = false;
    await pass(r.engine, HOUR);
    expect(r.shown).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    // Allowed again later the same day: lunch counts from then, so nothing old floods in.
    r.permitted = true;
    await r.engine.refresh();
    await pass(r.engine, 6 * HOUR);
    expect(r.shown).toEqual([]);
  });

  it('cancels the pending timer when the master switch goes off (R06.10)', async () => {
    useFakeClock('2026-06-10T11:00:00');
    const r = rig();
    r.settings = remindersOn(r.settings, { lunch: '12:00', dinner: '19:00' });
    await startAndSettle(r.engine);
    expect(vi.getTimerCount()).toBe(1);

    r.settings = { ...r.settings, 'remind.master': false };
    r.changed();
    await r.engine.settled();
    expect(vi.getTimerCount()).toBe(0);
    await pass(r.engine, 2 * 24 * HOUR);
    expect(r.shown).toEqual([]);
  });

  it('cancels everything on stop (erase everything): no timer, no listener, nothing shown (R06.10)', async () => {
    useFakeClock('2026-06-10T11:00:00');
    const r = rig();
    r.settings = remindersOn(r.settings, { lunch: '12:00' });
    await startAndSettle(r.engine);
    r.engine.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(r.visibility.listeners.size).toBe(0);
    expect(r.watching()).toBe(false);

    r.visibility.set(true);
    await r.engine.refresh();
    await pass(r.engine, 24 * HOUR);
    expect(r.shown).toEqual([]);
  });

  it('drops what a check found when stopped while it was reading', async () => {
    useFakeClock('2026-06-10T12:30:00');
    const memory = localReminderMemory(() => null);
    memory.write({
      daily: { lunch: { at: '12:00', since: local('2026-06-10T11:00:00') } },
      fast: null,
    });
    const settings = remindersOn(storedDefaults(), { lunch: '12:00' });
    let release: () => void = () => undefined;
    const reading = new Promise<ReminderSettings>((resolve) => {
      release = () => resolve(settings);
    });
    const r = rig({ memory, deps: { settings: () => reading } });
    r.engine.start();
    r.engine.stop();
    release();
    await r.engine.settled();
    expect(r.shown).toEqual([]);
    expect(memory.read().daily.lunch?.since).toBe(local('2026-06-10T11:00:00'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows a lunch reminder missed while the app was closed once on the next open (ACC-J11-2)', async () => {
    useFakeClock('2026-06-10T11:00:00');
    const memory = localReminderMemory(() => null);
    const before = rig({ memory });
    before.settings = remindersOn(before.settings, { lunch: '12:00' });
    await startAndSettle(before.engine);
    // The app closes at 11:00 and opens again at 15:00.
    before.engine.stop();
    vi.setSystemTime(local('2026-06-10T15:00:00'));

    const after = rig({ memory, settings: before.settings });
    await startAndSettle(after.engine);
    expect(after.shown).toEqual([
      {
        id: 'lunch',
        dueAt: local('2026-06-10T12:00:00'),
        missed: true,
        title: 'reminders.lunch.title',
        body: 'reminders.lunch.body',
      },
    ]);

    // Once: coming back to the front, a stored change or another check shows it no more.
    after.visibility.set(false);
    after.visibility.set(true);
    after.changed();
    await after.engine.refresh();
    expect(after.shown).toHaveLength(1);

    // Tomorrow's lunch shows on time.
    await pass(after.engine, 21 * HOUR);
    expect(after.shown.map(({ id, missed }) => ({ id, missed }))).toEqual([
      { id: 'lunch', missed: true },
      { id: 'lunch', missed: false },
    ]);
  });

  it('shows a reminder that fell due while the page slept when it comes back to the front, once', async () => {
    useFakeClock('2026-06-10T11:50:00');
    const r = rig();
    r.settings = remindersOn(r.settings, { lunch: '12:00' });
    await startAndSettle(r.engine);
    r.visibility.set(false);
    // The device sleeps: the clock moves on, the page's timer has not run.
    vi.setSystemTime(local('2026-06-10T12:40:00'));
    r.visibility.set(true);
    await r.engine.settled();
    expect(r.shown.map(({ id, missed }) => ({ id, missed }))).toEqual([
      { id: 'lunch', missed: true },
    ]);
    // The overdue timer now runs and finds it already shown.
    await pass(r.engine, 0);
    expect(r.shown).toHaveLength(1);
  });

  it('shows nothing today for a reminder turned on after its time, and shows it tomorrow', async () => {
    useFakeClock('2026-06-10T15:00:00');
    const r = rig();
    r.settings = { ...r.settings, 'remind.master': true };
    await startAndSettle(r.engine);
    r.settings = remindersOn(r.settings, { lunch: '12:00' });
    r.changed();
    await r.engine.settled();
    expect(r.shown).toEqual([]);
    await pass(r.engine, 21 * HOUR);
    expect(ids(r.shown)).toEqual(['lunch']);
  });

  it('shows 08:00 at 08:00 on the clock the morning after the March DST change (R06.11)', async () => {
    useFakeClock('2026-03-07T08:30:00');
    const r = rig();
    r.settings = remindersOn(r.settings, { breakfast: '08:00' });
    await startAndSettle(r.engine);
    // 08:30 EST to 08:00 EDT the next day is 22.5 hours.
    await pass(r.engine, 22.5 * HOUR - 1);
    expect(r.shown).toEqual([]);
    await pass(r.engine, 1);
    expect(r.shown).toHaveLength(1);
    expect(r.shown[0]!.dueAt).toBe(local('2026-03-08T08:00:00'));
    expect(new Date(r.shown[0]!.dueAt).getHours()).toBe(8);
  });

  it('never waits more than an hour between checks while a reminder is on', async () => {
    useFakeClock('2026-06-10T08:00:00');
    const settings = remindersOn(storedDefaults(), { dinner: '19:00' });
    const reads = vi.fn(() => Promise.resolve(settings));
    const r = rig({ deps: { settings: reads } });
    await startAndSettle(r.engine);
    expect(reads).toHaveBeenCalledTimes(1);
    await pass(r.engine, MAX_WAIT_MS - 1);
    expect(reads).toHaveBeenCalledTimes(1);
    await pass(r.engine, 1);
    expect(reads).toHaveBeenCalledTimes(2);
  });
});

describe('createReminderEngine: the daily summary', () => {
  it('reads eaten 6 276 of 8 368 kJ, 2 092 left, for the day it falls due', async () => {
    useFakeClock('2026-06-10T19:00:00');
    const r = rig();
    r.settings = { ...remindersOn(r.settings, { summary: '20:00' }), 'units.energy': 'kJ' };
    r.totals = () => Promise.resolve({ eatenKcal: 1_500, goalKcal: 2_000 });
    await startAndSettle(r.engine);
    await pass(r.engine, HOUR);

    expect(r.totalsAsked).toEqual(['2026-06-10']);
    const [notice] = r.shown;
    expect(notice?.body).toBe('reminders.summary.kJ');
    expect(notice?.params).toEqual({ eaten: 6_276, goal: 8_368, left: 2_092 });
    expect(render(notice!.title)).toBe('Your day so far');
    expect(render(notice!.body, notice!.params)).toBe('Eaten 6,276 of 8,368 kJ, 2,092 left.');
  });

  it('shows a plain summary when the day cannot be read, and says why', async () => {
    useFakeClock('2026-06-10T19:59:00');
    const r = rig();
    r.settings = remindersOn(r.settings, { summary: '20:00' });
    const failure = new Error('the diary could not be read');
    r.totals = () => Promise.reject(failure);
    await startAndSettle(r.engine);
    await pass(r.engine, MINUTE);
    expect(r.shown.map((notice) => notice.body)).toEqual(['reminders.summary.unread']);
    expect(r.errors).toEqual([failure]);
  });
});

describe('createReminderEngine: the fasting goal (R05.20)', () => {
  const start = local('2026-06-10T20:00:00');

  /** Notifications on, fasting tracked, the goal alert on. */
  function fastingSettings(): ReminderSettings {
    return {
      ...storedDefaults(),
      'remind.master': true,
      'remind.fastGoal': true,
      'fasting.on': true,
    };
  }

  function fastingRig(fast: Fast | null, memory?: RigOptions['memory']): Rig {
    return rig({ fast, memory, settings: fastingSettings() });
  }

  it('shows the goal at start + goal while the app is open, once (ACC-H11-1)', async () => {
    useFakeClock('2026-06-10T20:00:00');
    const r = fastingRig(makeFast({ id: 'fast-1', start, end: null, goalMin: 960 }));
    await startAndSettle(r.engine);
    await pass(r.engine, 16 * HOUR - 1);
    expect(r.shown).toEqual([]);
    await pass(r.engine, 1);
    expect(r.shown).toEqual([
      {
        id: 'fastGoal',
        dueAt: local('2026-06-11T12:00:00'),
        missed: false,
        title: 'reminders.fastGoal.title',
        body: 'reminders.fastGoal.body',
        params: { goal: '16h' },
      },
    ]);
    expect(render(r.shown[0]!.body, r.shown[0]!.params)).toBe(
      '16h done. Your fast keeps running until you end it.',
    );
    await pass(r.engine, 24 * HOUR);
    expect(r.shown).toHaveLength(1);
  });

  it('never shows the goal of a fast that ended before it (ACC-H11-1)', async () => {
    useFakeClock('2026-06-10T20:00:00');
    const running = makeFast({ id: 'fast-1', start, end: null, goalMin: 960 });
    const r = fastingRig(running);
    await startAndSettle(r.engine);
    // Ended at 08:00; the store no longer has a running fast.
    await pass(r.engine, 12 * HOUR);
    r.fast = null;
    r.changed();
    await r.engine.settled();
    expect(vi.getTimerCount()).toBe(0);
    await pass(r.engine, 24 * HOUR);
    expect(r.shown).toEqual([]);
  });

  it('drops the goal when the fast is cancelled or deleted, even with no word before the goal time', async () => {
    useFakeClock('2026-06-10T20:00:00');
    const r = fastingRig(makeFast({ id: 'fast-1', start, end: null, goalMin: 960 }));
    await startAndSettle(r.engine);
    r.fast = null;
    await pass(r.engine, 17 * HOUR);
    expect(r.shown).toEqual([]);
  });

  it('moves the alert to the new goal after an edit', async () => {
    useFakeClock('2026-06-10T20:00:00');
    const running = makeFast({ id: 'fast-1', start, end: null, goalMin: 960 });
    const r = fastingRig(running);
    await startAndSettle(r.engine);
    await pass(r.engine, 10 * HOUR);
    r.fast = { ...running, goalMin: 18 * 60 };
    r.changed();
    await r.engine.settled();
    await pass(r.engine, 8 * HOUR - 1);
    expect(r.shown).toEqual([]);
    await pass(r.engine, 1);
    expect(r.shown.map((notice) => [notice.id, notice.dueAt, notice.params])).toEqual([
      ['fastGoal', local('2026-06-11T14:00:00'), { goal: '18h' }],
    ]);
  });

  it('shows nothing when an edit puts the goal in the past', async () => {
    useFakeClock('2026-06-11T10:00:00');
    const running = makeFast({ id: 'fast-1', start, end: null, goalMin: 960 });
    const r = fastingRig(running);
    await startAndSettle(r.engine);
    // The start moved back four hours: the goal was 08:00, already behind.
    r.fast = { ...running, start: start - 4 * HOUR };
    r.changed();
    await r.engine.settled();
    await pass(r.engine, 24 * HOUR);
    expect(r.shown).toEqual([]);
  });

  it('shows a goal reached while the app was closed once on the next open', async () => {
    useFakeClock('2026-06-10T20:00:00');
    const memory = localReminderMemory(() => null);
    const running = makeFast({ id: 'fast-1', start, end: null, goalMin: 960 });
    const before = fastingRig(running, memory);
    await startAndSettle(before.engine);
    // The app closes and opens again an hour after the goal.
    before.engine.stop();
    vi.setSystemTime(local('2026-06-11T13:00:00'));

    const after = fastingRig(running, memory);
    await startAndSettle(after.engine);
    after.visibility.set(true);
    await after.engine.settled();
    expect(after.shown.map(({ id, missed, dueAt }) => ({ id, missed, dueAt }))).toEqual([
      { id: 'fastGoal', missed: true, dueAt: local('2026-06-11T12:00:00') },
    ]);
  });

  it.each([
    ['fasting tracking', { 'fasting.on': false }],
    ['the goal switch', { 'remind.fastGoal': false }],
    ['the master switch', { 'remind.master': false }],
  ] as const)('needs %s on', async (_name, off) => {
    useFakeClock('2026-06-10T20:00:00');
    const r = fastingRig(makeFast({ id: 'fast-1', start, end: null, goalMin: 960 }));
    r.settings = { ...r.settings, ...off };
    await startAndSettle(r.engine);
    await pass(r.engine, 17 * HOUR);
    expect(r.shown).toEqual([]);
  });
});

describe('createReminderEngine: checks', () => {
  it('runs one check at a time and folds the requests made meanwhile into one', async () => {
    useFakeClock('2026-06-10T10:00:00');
    const settings = { ...storedDefaults(), 'remind.master': true };
    const pending: ((value: ReminderSettings) => void)[] = [];
    let onRead: () => void = () => undefined;
    const nextRead = () =>
      new Promise<void>((resolve) => {
        onRead = resolve;
      });
    const reads = vi.fn(
      () =>
        new Promise<ReminderSettings>((resolve) => {
          pending.push(resolve);
          onRead();
        }),
    );
    const r = rig({ deps: { settings: reads } });

    const first = nextRead();
    r.engine.start();
    await first;
    // Three more requests while the first check reads: one check after it.
    void r.engine.refresh();
    r.visibility.set(true);
    r.changed();
    const second = nextRead();
    pending[0]?.(settings);
    await second;
    pending[1]?.(settings);
    await r.engine.settled();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('reports a failed check and tries again within the hour', async () => {
    useFakeClock('2026-06-10T10:00:00');
    const failure = new Error('settings unreadable');
    const settings = remindersOn(storedDefaults(), { lunch: '12:00' });
    const reads = vi
      .fn<() => Promise<ReminderSettings>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(settings);
    const r = rig({ deps: { settings: reads } });
    await startAndSettle(r.engine);
    expect(r.errors).toEqual([failure]);
    await pass(r.engine, MAX_WAIT_MS);
    expect(reads).toHaveBeenCalledTimes(2);
    await pass(r.engine, HOUR);
    expect(ids(r.shown)).toEqual(['lunch']);
  });

  it('can start again after a stop', async () => {
    useFakeClock('2026-06-10T11:00:00');
    const r = rig();
    r.settings = remindersOn(r.settings, { lunch: '12:00' });
    await startAndSettle(r.engine);
    r.engine.stop();
    await startAndSettle(r.engine);
    await pass(r.engine, HOUR);
    expect(ids(r.shown)).toEqual(['lunch']);
  });
});
