import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createHealthRepo } from '../../data/repos/healthRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { createWeightRepo } from '../../data/repos/weightRepo';
import type { SettingKey, SettingValue } from '../../data/settingsSchema';
import type { Clock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry, makeProfileRow } from '../../test/factories';
import type { Timers } from '../reminders/engine';
import { browserTimers } from '../reminders/ports';
import type { DailyTotals } from './contract';
import { syncWindow } from './records';
import { createHealthService, HELD_BACK_MARGIN_MS } from './service';
import { fakeHealthPlugin, type FakeHealthPlugin } from './testing/fakeHealthPlugin';
import type { HealthWatch } from './watch';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TODAY = '2026-10-26';
const WINDOW = syncWindow(TODAY);

const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** A clock at FACTORY_NOW in New York that a test can move on. */
function movableClock(): Clock & { move(ms: number): void } {
  let now = FACTORY_NOW;
  return {
    now: () => now,
    timeZone: () => 'America/New_York',
    move(ms) {
      now += ms;
    },
  };
}

/** A page whose visibility the test flips. */
function page() {
  let visible = true;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    isVisible: () => visible,
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    /** The app goes to the background and comes back. */
    leaveAndReturn() {
      visible = false;
      emit();
      visible = true;
      emit();
    },
  };
}

/** A watch the test fires by hand, as the live queries would after a change. */
function handWatch() {
  let listener: (() => void) | null = null;
  const watch: HealthWatch = (onChange) => {
    listener = onChange;
    return () => {
      listener = null;
    };
  };
  return { watch, fire: () => listener?.() };
}

/**
 * The page's timers (faked by the test with Vitest), keeping count of the ones set and neither
 * run nor cleared, and of every delay asked for.
 */
function countedTimers() {
  const pending = new Set<unknown>();
  const delays: number[] = [];
  const timers: Timers = {
    setTimeout(run, ms) {
      delays.push(ms);
      const handle: unknown = browserTimers.setTimeout(() => {
        pending.delete(handle);
        run();
      }, ms);
      pending.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      pending.delete(handle);
      browserTimers.clearTimeout(handle);
    },
  };
  return { timers, delays, pending: () => pending.size };
}

interface SetupOptions {
  readonly plugin?: FakeHealthPlugin;
  readonly settings?: Partial<{ [K in SettingKey]: SettingValue<K> }>;
  readonly timers?: Timers;
}

async function setup({ plugin = fakeHealthPlugin(), settings = {}, timers }: SetupOptions = {}) {
  const { db, bus } = await openTestDb();
  const clock = movableClock();
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US', bus, clock });
  const diaryRepo = createDiaryRepo(db, { clock });
  const weightRepo = createWeightRepo(db, { bus, clock });
  const healthRepo = createHealthRepo(db, { clock });
  const stored = { 'health.connected': true, ...settings };
  for (const [key, value] of Object.entries(stored)) {
    await settingsRepo.set(key as SettingKey, value as never);
  }
  const visibility = page();
  const watch = handWatch();
  const service = createHealthService({
    plugin,
    healthRepo,
    settingsRepo,
    diaryRepo,
    weightRepo,
    clock,
    ...(timers ? { timers } : {}),
    visibility,
    watch: watch.watch,
  });
  closers.push(() => {
    service.stop();
    db.close();
  });
  return {
    db,
    clock,
    plugin,
    service,
    settingsRepo,
    diaryRepo,
    weightRepo,
    healthRepo,
    visibility,
    watch,
  };
}

function totals(day: string, overrides: Partial<DailyTotals> = {}): DailyTotals {
  return { day, steps: null, activeKcal: null, totalKcal: null, distanceM: null, ...overrides };
}

const SOME_DAYS = [
  totals('2026-10-24', { steps: 4_200, activeKcal: 180 }),
  totals('2026-10-25', { steps: 11_050, activeKcal: 530.6, totalKcal: 2_480, distanceM: 8_100 }),
  totals(TODAY, { steps: 2_300, activeKcal: 95 }),
];

const RUN = {
  id: 'run-7',
  day: '2026-10-25',
  start: '2026-10-25T10:00:00Z',
  end: '2026-10-25T10:45:00Z',
  type: 'running',
  title: null,
  activeKcal: 410,
  source: 'org.example.watch',
};

describe('sync (P11-03)', () => {
  it('fills the last 30 days from Health Connect and keeps the sync time', async () => {
    const { plugin, service, healthRepo } = await setup({
      plugin: fakeHealthPlugin({ days: SOME_DAYS, sessions: [RUN] }),
    });

    expect(await service.sync()).toEqual({ kind: 'synced', days: 3, weighIns: 0 });

    expect(plugin.callsOf('readDailyTotals')).toEqual([{ from: WINDOW.first, to: TODAY }]);
    const rows = await healthRepo.between(WINDOW.first, TODAY);
    expect(rows.map((row) => [row.day, row.steps, row.activeKcal])).toEqual([
      ['2026-10-24', 4_200, 180],
      ['2026-10-25', 11_050, 530.6],
      [TODAY, 2_300, 95],
    ]);
    expect(rows[1]?.sessions.map((session) => session.id)).toEqual(['run-7']);
    expect(await healthRepo.lastSyncAt()).toBe(FACTORY_NOW);
    expect(service.getSnapshot()).toMatchObject({
      availability: 'available',
      lastSyncAt: FACTORY_NOW,
      syncing: false,
      failure: null,
    });
  });

  it('changes nothing on a second sync with the same answers', async () => {
    const weights = [{ id: 'hc-1', time: '2026-10-25T07:00:00Z', kg: 63.4, source: 'scale' }];
    const { db, clock, service, healthRepo } = await setup({
      plugin: fakeHealthPlugin({ days: SOME_DAYS, sessions: [RUN], weights }),
    });
    expect(await service.sync()).toEqual({ kind: 'synced', days: 3, weighIns: 1 });
    const first = await healthRepo.between(WINDOW.first, TODAY);

    clock.move(HOUR);
    expect(await service.sync()).toEqual({ kind: 'synced', days: 0, weighIns: 0 });

    expect(await healthRepo.between(WINDOW.first, TODAY)).toEqual(first);
    expect(await db.weighIns.count()).toBe(1);
    expect(await healthRepo.lastSyncAt()).toBe(FACTORY_NOW + HOUR);
  });

  it('imports weigh-ins once under their Health Connect ids, and none while importing is off', async () => {
    const weights = [
      { id: 'hc-1', time: '2026-10-25T07:00:00Z', kg: 63.4, source: 'scale' },
      { id: 'hc-2', time: '2026-10-20T07:00:00Z', kg: 64.1, source: 'scale' },
    ];
    const { db, service, settingsRepo } = await setup({
      plugin: fakeHealthPlugin({ weights }),
      settings: { 'health.importWeights': false },
    });
    await db.profile.put(makeProfileRow({ weightKg: 65 }));

    await service.sync();
    expect(await db.weighIns.count()).toBe(0);

    await settingsRepo.set('health.importWeights', true);
    await service.sync();
    await service.sync();
    expect((await db.weighIns.toArray()).map((w) => w.id).sort()).toEqual([
      'health-hc-1',
      'health-hc-2',
    ]);
    expect((await db.profile.get('me'))?.weightKg).toBe(63.4);
  });

  it('stores null for a kind that is not allowed', async () => {
    const { service, healthRepo } = await setup({
      plugin: fakeHealthPlugin({
        days: SOME_DAYS,
        sessions: [RUN],
        granted: { read: ['steps'], write: [] },
      }),
    });
    await service.sync();
    const [day] = await healthRepo.between('2026-10-25', '2026-10-25');
    expect(day).toMatchObject({ steps: 11_050, activeKcal: null, totalKcal: null, sessions: [] });
  });

  it('shows revoked permissions and reads nothing', async () => {
    const { plugin, service, healthRepo } = await setup({
      plugin: fakeHealthPlugin({ days: SOME_DAYS, granted: { read: [], write: [] } }),
    });
    expect(await service.sync()).toEqual({ kind: 'revoked' });
    expect(service.getSnapshot().granted).toEqual({ read: [], write: [] });
    expect(plugin.callsOf('readDailyTotals')).toEqual([]);
    expect(await healthRepo.between(WINDOW.first, TODAY)).toEqual([]);
  });

  it('reads nothing while not connected', async () => {
    const { plugin, service } = await setup({ settings: { 'health.connected': false } });
    expect(await service.sync()).toEqual({ kind: 'off' });
    expect(plugin.calls).toEqual([]);
  });

  it('says when Health Connect is missing or needs an update', async () => {
    const { plugin, service } = await setup({
      plugin: fakeHealthPlugin({ availability: 'notInstalled' }),
    });
    expect(await service.sync()).toEqual({ kind: 'unavailable' });
    expect(service.getSnapshot()).toMatchObject({ availability: 'notInstalled', granted: null });
    plugin.set({ availability: 'updateRequired' });
    await service.refresh();
    expect(service.getSnapshot().availability).toBe('updateRequired');
  });

  it('keeps a failure in the status without rejecting, and clears it on the next success', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { plugin, service, healthRepo } = await setup({
      plugin: fakeHealthPlugin({ days: SOME_DAYS }),
    });
    plugin.failNext('readDailyTotals', 'rateLimited');

    expect(await service.sync()).toEqual({ kind: 'failed', code: 'rateLimited' });
    expect(service.getSnapshot()).toMatchObject({ failure: 'rateLimited', syncing: false });
    expect(await healthRepo.lastSyncAt()).toBeNull();
    expect(error).toHaveBeenCalled();

    expect(await service.sync()).toMatchObject({ kind: 'synced' });
    expect(service.getSnapshot().failure).toBeNull();
  });

  it('runs one sync at a time: a second request joins the running one', async () => {
    const { plugin, service } = await setup({ plugin: fakeHealthPlugin({ days: SOME_DAYS }) });
    const [first, second] = await Promise.all([service.sync(), service.sync()]);
    expect(first).toBe(second);
    expect(plugin.callsOf('readDailyTotals')).toHaveLength(1);
  });
});

describe('triggers', () => {
  it('syncs when started and each time the page comes back to the front', async () => {
    const { plugin, service, visibility } = await setup({
      plugin: fakeHealthPlugin({ days: SOME_DAYS }),
    });
    service.start();
    await service.idle();
    expect(plugin.callsOf('readDailyTotals')).toHaveLength(1);

    visibility.leaveAndReturn();
    await service.idle();
    expect(plugin.callsOf('readDailyTotals')).toHaveLength(2);

    service.stop();
    visibility.leaveAndReturn();
    await service.idle();
    expect(plugin.callsOf('readDailyTotals')).toHaveLength(2);
  });

  it('reads the status and the last sync time without syncing while not connected', async () => {
    const { plugin, service, healthRepo } = await setup({
      settings: { 'health.connected': false },
    });
    await healthRepo.setLastSyncAt(FACTORY_NOW - DAY);
    service.start();
    await service.idle();
    expect(plugin.callsOf('readDailyTotals')).toEqual([]);
    expect(service.getSnapshot()).toMatchObject({
      availability: 'available',
      granted: { read: expect.arrayContaining(['steps']) as unknown },
      lastSyncAt: FACTORY_NOW - DAY,
    });
  });

  it('tells subscribers about each change of the status', async () => {
    const { service } = await setup();
    const seen: boolean[] = [];
    const stop = service.subscribe(() => seen.push(service.getSnapshot().syncing));
    await service.sync();
    stop();
    expect(seen[0]).toBe(true);
    expect(seen.at(-1)).toBe(false);
  });
});

describe('connect and disconnect', () => {
  it('connects when access is allowed and syncs at once', async () => {
    const { plugin, service, settingsRepo } = await setup({
      plugin: fakeHealthPlugin({ days: SOME_DAYS, granted: { read: [], write: [] } }),
      settings: { 'health.connected': false },
    });
    expect(await service.connect()).toEqual({ kind: 'connected' });
    await service.idle();

    expect(plugin.callsOf('requestPermissions')).toEqual([
      {
        read: [
          'steps',
          'activeCalories',
          'totalCalories',
          'distance',
          'exercise',
          'weight',
          'heartRate',
        ],
        write: [],
      },
    ]);
    expect(await settingsRepo.get('health.connected')).toBe(true);
    expect(plugin.callsOf('readDailyTotals')).toHaveLength(1);
  });

  it('stays disconnected when nothing is allowed', async () => {
    const { service, settingsRepo } = await setup({
      plugin: fakeHealthPlugin({ granted: { read: [], write: [] }, grantOnRequest: false }),
      settings: { 'health.connected': false },
    });
    expect(await service.connect()).toEqual({ kind: 'refused' });
    expect(await settingsRepo.get('health.connected')).toBe(false);
  });

  it('asks again after access was removed, and reads once it is back', async () => {
    const { plugin, service } = await setup({
      plugin: fakeHealthPlugin({ days: SOME_DAYS, granted: { read: [], write: [] } }),
    });
    expect(await service.sync()).toEqual({ kind: 'revoked' });
    expect(await service.connect()).toEqual({ kind: 'connected' });
    await service.idle();
    expect(service.getSnapshot().granted?.read).toContain('steps');
    expect(plugin.callsOf('readDailyTotals')).toHaveLength(1);
  });

  it('does not ask while Health Connect is missing', async () => {
    const { plugin, service } = await setup({
      plugin: fakeHealthPlugin({ availability: 'notSupported' }),
      settings: { 'health.connected': false },
    });
    expect(await service.connect()).toEqual({ kind: 'unavailable' });
    expect(plugin.callsOf('requestPermissions')).toEqual([]);
  });

  it('reports a failed request without connecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { plugin, service, settingsRepo } = await setup({
      settings: { 'health.connected': false },
    });
    plugin.failNext('requestPermissions', 'unknown');
    expect(await service.connect()).toEqual({ kind: 'failed', code: 'unknown' });
    expect(await settingsRepo.get('health.connected')).toBe(false);
  });

  it('stops reading after Disconnect and keeps the stored days', async () => {
    const { service, settingsRepo, healthRepo } = await setup({
      plugin: fakeHealthPlugin({ days: SOME_DAYS }),
    });
    await service.sync();
    await service.disconnect();
    expect(await settingsRepo.get('health.connected')).toBe(false);
    expect(await service.sync()).toEqual({ kind: 'off' });
    expect(await healthRepo.between(WINDOW.first, TODAY)).toHaveLength(3);
  });

  it('stores the counting and import switches and opens Health Connect', async () => {
    const { plugin, service, settingsRepo } = await setup();
    await service.setCountActiveCalories(false);
    await service.setImportWeights(false);
    expect(await settingsRepo.get('health.countActiveCalories')).toBe(false);
    expect(await settingsRepo.get('health.importWeights')).toBe(false);
    await service.openHealthConnect();
    expect(plugin.callsOf('openHealthConnectSettings')).toHaveLength(1);
  });
});

describe('write-back (D-16.89)', () => {
  it('sends nothing while write-back is off', async () => {
    const { plugin, service, diaryRepo, watch } = await setup();
    service.start();
    await service.idle();
    await diaryRepo.add(makeEntry({ id: 'e1' }));
    watch.fire();
    await service.idle();
    expect(plugin.callsOf('writeNutrition')).toEqual([]);
  });

  it('asks for write access when turned on, and stays off when it is refused', async () => {
    const { plugin, service, settingsRepo } = await setup({
      plugin: fakeHealthPlugin({ granted: { read: ['steps'], write: [] }, grantOnRequest: false }),
    });
    expect(await service.setWriteBack(true)).toEqual({ kind: 'refused' });
    expect(plugin.callsOf('requestPermissions')).toEqual([
      { read: [], write: ['nutrition', 'weight', 'walk'] },
    ]);
    expect(await settingsRepo.get('health.writeBack')).toBe(false);
  });

  it("sends the window's entries when turned on, then follows add, edit and delete", async () => {
    const { plugin, service, diaryRepo, watch } = await setup({
      plugin: fakeHealthPlugin({ granted: { read: ['steps'], write: [] } }),
    });
    const before = await diaryRepo.add(makeEntry({ id: 'before', kcal: 300 }));
    await diaryRepo.add(makeEntry({ id: 'too-old', loggedAt: FACTORY_NOW - 45 * DAY }));
    service.start();

    expect(await service.setWriteBack(true)).toEqual({ kind: 'on' });
    await service.idle();
    expect([...plugin.nutrition.keys()]).toEqual(['before']);

    // Add.
    const added = await diaryRepo.add(makeEntry({ id: 'added', name: 'Pear', kcal: 90 }));
    watch.fire();
    await service.idle();
    expect(plugin.nutrition.get('added')).toMatchObject({ name: 'Pear', kcal: 90 });

    // Edit: the same client id again, with the new values.
    await diaryRepo.update({ ...added, kcal: 120 });
    watch.fire();
    await service.idle();
    expect(plugin.nutrition.get('added')?.kcal).toBe(120);

    // Delete.
    await diaryRepo.remove(before.id);
    watch.fire();
    await service.idle();
    expect(plugin.callsOf('deleteNutrition')).toEqual([{ clientIds: ['before'] }]);
    expect([...plugin.nutrition.keys()]).toEqual(['added']);

    // Nothing changed: nothing sent.
    const sends = plugin.callsOf('writeNutrition').length;
    watch.fire();
    await service.idle();
    expect(plugin.callsOf('writeNutrition')).toHaveLength(sends);
  });

  it('sends weigh-ins typed here and removes deleted ones, never imported ones', async () => {
    const weights = [{ id: 'hc-1', time: '2026-10-25T07:00:00Z', kg: 63.4, source: 'scale' }];
    const { plugin, service, weightRepo, watch } = await setup({
      plugin: fakeHealthPlugin({ weights }),
      settings: { 'health.writeBack': true },
    });
    service.start();
    await service.idle();
    expect(plugin.callsOf('readWeights')).toHaveLength(1);
    expect(plugin.callsOf('writeWeight')).toEqual([]);

    const { entry } = await weightRepo.addWeighIn({ at: FACTORY_NOW, kg: 63.2 });
    watch.fire();
    await service.idle();
    expect(plugin.callsOf('writeWeight')).toEqual([
      { clientId: entry.id, time: new Date(FACTORY_NOW).toISOString(), kg: 63.2 },
    ]);

    await weightRepo.deleteWeighIn(entry.id);
    watch.fire();
    await service.idle();
    expect(plugin.callsOf('deleteWeight')).toEqual([{ clientIds: [entry.id] }]);
  });

  it('sends a change again after a failed send', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { plugin, service, diaryRepo, watch } = await setup({
      settings: { 'health.writeBack': true },
    });
    service.start();
    await service.idle();
    await diaryRepo.add(makeEntry({ id: 'e1' }));
    plugin.failNext('writeNutrition', 'rateLimited');
    watch.fire();
    await service.idle();
    expect(plugin.nutrition.size).toBe(0);
    expect(service.getSnapshot().failure).toBe('rateLimited');

    watch.fire();
    await service.idle();
    expect([...plugin.nutrition.keys()]).toEqual(['e1']);
    expect(service.getSnapshot().failure).toBeNull();
  });

  it('holds back an entry logged for later today, sends the others, and sends it once its time has passed', async () => {
    const { plugin, service, diaryRepo, clock, visibility } = await setup({
      settings: { 'health.writeBack': true },
    });
    // Like the native plugin, the stand-in refuses a record dated after the phone's clock.
    plugin.set({ now: clock.now });
    await diaryRepo.add(makeEntry({ id: 'lunch', loggedAt: FACTORY_NOW - HOUR }));
    await diaryRepo.add(makeEntry({ id: 'dinner', loggedAt: FACTORY_NOW + 6 * HOUR }));
    service.start();
    await service.idle();
    expect([...plugin.nutrition.keys()]).toEqual(['lunch']);
    expect(service.getSnapshot().failure).toBeNull();

    // The first pass after its time: here the sync on coming back to the front.
    clock.move(6 * HOUR);
    visibility.leaveAndReturn();
    await service.idle();
    expect([...plugin.nutrition.keys()]).toEqual(['lunch', 'dinner']);
    expect(service.getSnapshot().failure).toBeNull();
  });

  it('runs one pass at a time and one more for changes made meanwhile', async () => {
    const { plugin, service, diaryRepo, watch } = await setup({
      settings: { 'health.writeBack': true },
    });
    service.start();
    await service.idle();
    await diaryRepo.add(makeEntry({ id: 'e1' }));
    watch.fire();
    watch.fire();
    watch.fire();
    await service.idle();
    expect(plugin.callsOf('writeNutrition')).toHaveLength(1);
  });

  it('turns write-back off without asking or removing anything', async () => {
    const { plugin, service, settingsRepo } = await setup({
      settings: { 'health.writeBack': true },
    });
    expect(await service.setWriteBack(false)).toEqual({ kind: 'off' });
    expect(await settingsRepo.get('health.writeBack')).toBe(false);
    expect(plugin.calls).toEqual([]);
  });
});

describe('the pass for a held-back record (ACC-M11-5)', () => {
  /** Fake timers; the service's clock is the test's own, and the fake IndexedDB stays real. */
  async function heldBackSetup() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const counted = countedTimers();
    const rig = await setup({ settings: { 'health.writeBack': true }, timers: counted.timers });
    // Like the native plugin, the stand-in refuses a record dated after the phone's clock.
    rig.plugin.set({ now: rig.clock.now });
    /** Moves the clock and the timers on together, and waits for the passes they start. */
    const pass = async (ms: number): Promise<void> => {
      rig.clock.move(ms);
      await vi.advanceTimersByTimeAsync(ms);
      await rig.service.idle();
    };
    return { ...rig, ...counted, pass };
  }

  it('sends an entry logged for later today a second after its time, with nothing else happening', async () => {
    const { plugin, service, diaryRepo, delays, pending, pass } = await heldBackSetup();
    await diaryRepo.add(makeEntry({ id: 'lunch', loggedAt: FACTORY_NOW - HOUR }));
    await diaryRepo.add(makeEntry({ id: 'dinner', loggedAt: FACTORY_NOW + 6 * HOUR }));
    service.start();
    await service.idle();
    expect([...plugin.nutrition.keys()]).toEqual(['lunch']);
    expect(delays).toEqual([6 * HOUR + HELD_BACK_MARGIN_MS]);
    expect(pending()).toBe(1);

    await pass(6 * HOUR);
    expect([...plugin.nutrition.keys()]).toEqual(['lunch']);

    await pass(HELD_BACK_MARGIN_MS);
    expect([...plugin.nutrition.keys()]).toEqual(['lunch', 'dinner']);
    expect(service.getSnapshot().failure).toBeNull();
    // Nothing waits any more: no timer.
    expect(pending()).toBe(0);
  });

  it('keeps one timer at most, for the earliest record, cleared by each pass and by stop', async () => {
    const { plugin, service, diaryRepo, weightRepo, watch, delays, pending, pass } =
      await heldBackSetup();
    await diaryRepo.add(makeEntry({ id: 'dinner', loggedAt: FACTORY_NOW + 6 * HOUR }));
    await diaryRepo.add(makeEntry({ id: 'snack', loggedAt: FACTORY_NOW + 3 * HOUR }));
    service.start();
    await service.idle();
    expect(delays).toEqual([3 * HOUR + HELD_BACK_MARGIN_MS]);
    expect(pending()).toBe(1);

    // A change runs a pass: the timer is cleared and set again, still one.
    await weightRepo.addWeighIn({ at: FACTORY_NOW + 2 * HOUR, kg: 63.2 });
    watch.fire();
    await service.idle();
    expect(delays).toHaveLength(2);
    expect(delays.at(-1)).toBe(2 * HOUR + HELD_BACK_MARGIN_MS);
    expect(pending()).toBe(1);

    // Its pass sends the weigh-in and sets the next one, for the snack.
    await pass(2 * HOUR + HELD_BACK_MARGIN_MS);
    expect(plugin.callsOf('writeWeight')).toHaveLength(1);
    expect(plugin.nutrition.size).toBe(0);
    expect(delays.at(-1)).toBe(HOUR);
    expect(pending()).toBe(1);

    // Stop clears it: the snack's time passes and nothing is sent.
    service.stop();
    expect(pending()).toBe(0);
    await pass(2 * HOUR);
    expect(plugin.nutrition.size).toBe(0);
  });

  it('retries a failed pass at the held-back time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { plugin, service, diaryRepo, pending, pass } = await heldBackSetup();
    await diaryRepo.add(makeEntry({ id: 'lunch', loggedAt: FACTORY_NOW - HOUR }));
    await diaryRepo.add(makeEntry({ id: 'dinner', loggedAt: FACTORY_NOW + HOUR }));
    plugin.failNext('writeNutrition', 'rateLimited');
    service.start();
    await service.idle();
    expect(plugin.nutrition.size).toBe(0);
    expect(service.getSnapshot().failure).toBe('rateLimited');
    expect(pending()).toBe(1);

    await pass(HOUR + HELD_BACK_MARGIN_MS);
    expect([...plugin.nutrition.keys()]).toEqual(['lunch', 'dinner']);
    expect(service.getSnapshot().failure).toBeNull();
  });

  it('sets no timer while write-back is off, or before the service starts', async () => {
    const { service, settingsRepo, diaryRepo, pending, delays } = await heldBackSetup();
    await diaryRepo.add(makeEntry({ id: 'dinner', loggedAt: FACTORY_NOW + 6 * HOUR }));

    // Not started: a sync's pass holds the entry back but sets nothing.
    await service.sync();
    expect(delays).toEqual([]);

    await settingsRepo.set('health.writeBack', false);
    service.start();
    await service.idle();
    expect(delays).toEqual([]);
    expect(pending()).toBe(0);
  });
});
