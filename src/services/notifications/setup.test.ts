// The Android app's notifications put together (P17): the reminders' engine with the nudges, the
// inbox and the taps, over real repositories on a test database and a stand-in for the plugin.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOME_ROUTE } from '../../app/router';
import { live } from '../../data/live';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createFastRepo } from '../../data/repos/fastRepo';
import { createProfileRepo } from '../../data/repos/profileRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { createWaterRepo } from '../../data/repos/waterRepo';
import { createWeightRepo } from '../../data/repos/weightRepo';
import type { PlatewiseDb } from '../../data/schema';
import type { Clock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry } from '../../test/factories';
import type { PageVisibility } from '../reminders/engine';
import { setUpNativeReminders } from '../reminders/native';
import { writeMessage } from '../reminders/notifier';
import { DAY_SLOTS, NUDGE_IDS, daySlot } from '../reminders/nudgePlan';
import { storedReminderSources } from '../reminders/ports';
import { channelOf } from '../reminders/requests';
import { FakeNotificationsPlugin } from '../reminders/testing/fakeNotificationsPlugin';
import { readInbox } from './inbox';

// Tests run in Node, but the app's tsconfig has no Node types: the fake IndexedDB runs on this.
declare const setImmediate: (run: () => void) => unknown;

const local = (text: string) => new Date(text).getTime();

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function until(ready: () => boolean | Promise<boolean>): Promise<void> {
  for (let turn = 0; turn < 500 && !(await ready()); turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!(await ready())) throw new Error('until: the condition never held');
}

class Visibility implements PageVisibility {
  visible = true;
  private readonly listeners = new Set<() => void>();
  isVisible = () => this.visible;
  subscribe = (onChange: () => void) => {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  };
  set(visible: boolean) {
    this.visible = visible;
    for (const listener of [...this.listeners]) listener();
  }
}

async function rig() {
  const { db } = await openTestDb();
  opened.push(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
  const diaryRepo = createDiaryRepo(db);
  const profileRepo = createProfileRepo(db);
  const fastRepo = createFastRepo(db);
  const plugin = new FakeNotificationsPlugin();
  const visibility = new Visibility();
  let now = FACTORY_NOW;
  const clock: Clock = { now: () => now, timeZone: () => 'America/New_York' };
  const router = { navigate: vi.fn() };
  const appState = { selectDay: vi.fn() };
  const analysis = {
    restore: vi.fn(async () => undefined),
    subscribe: () => () => undefined,
    getSnapshot: () => ({ phase: 'idle' as const }),
  };
  const sources = storedReminderSources({ settingsRepo, fastRepo, diaryRepo, profileRepo });
  const parts = await setUpNativeReminders(
    {
      ...sources,
      clock,
      visibility,
      write: writeMessage,
      channel: { name: 'Reminders', description: 'All of them.' },
      onOpen: vi.fn(),
      notify: {
        settingsRepo,
        diaryRepo,
        waterRepo: createWaterRepo(db),
        weightRepo: createWeightRepo(db),
        profileRepo,
        app: { router, appState, analysis },
        live,
      },
    },
    plugin,
  );
  return {
    settingsRepo,
    diaryRepo,
    plugin,
    visibility,
    router,
    appState,
    parts,
    notify: parts.notify!,
    setNow(at: number) {
      now = at;
    },
    inbox: async () => readInbox(await settingsRepo.get('notify.inbox')),
  };
}

const lunchCheck = NUDGE_IDS.mealCheck + DAY_SLOTS + daySlot('2026-10-26');

describe('the Android app’s notifications together (P17)', () => {
  it('hands the nudges over in their channels and keeps the plan for the inbox', async () => {
    const r = await rig();
    r.parts.engine.start();
    await r.parts.engine.settled();

    expect(r.plugin.held.get(lunchCheck)).toMatchObject({
      title: 'Lunch',
      schedule: { at: new Date(local('2026-10-26T13:00:00')), allowWhileIdle: true },
      channelId: channelOf('mealCheck'),
    });
    expect(r.plugin.channels).toContainEqual({
      id: channelOf('mealCheck'),
      name: 'Meal check',
      description: 'An hour after your usual time.',
      importance: 3,
    });
    expect(r.plugin.channels).toContainEqual(
      expect.objectContaining({ id: channelOf('fastGoal'), name: 'Fasting goal reached' }),
    );
    const inbox = await r.inbox();
    expect(inbox.plan.map((each) => each.id)).toContain(lunchCheck);
    expect(inbox.items).toEqual([]);
    r.parts.engine.stop();
  });

  it('adds what came while the app was away when it comes back, and a tap opens it and marks it read', async () => {
    const r = await rig();
    r.parts.engine.start();
    await r.parts.engine.settled();

    r.visibility.set(false);
    r.setNow(local('2026-10-26T15:00:00'));
    r.visibility.set(true);
    await r.parts.engine.settled();
    await until(async () => (await r.inbox()).items.length === 1);
    expect((await r.inbox()).items[0]).toMatchObject({
      id: lunchCheck,
      kind: 'mealCheck',
      title: 'Lunch',
      at: local('2026-10-26T13:00:00'),
      read: false,
    });

    r.plugin.tap({ open: 'home', key: 'k', kind: 'mealCheck' }, lunchCheck);
    expect(r.appState.selectDay).toHaveBeenCalledWith(null);
    expect(r.router.navigate).toHaveBeenCalledWith(HOME_ROUTE);
    await until(async () => (await r.inbox()).items[0]!.read);
    r.parts.engine.stop();
  });

  it("takes today's check back once lunch is logged, so it never reaches the inbox", async () => {
    const r = await rig();
    r.parts.engine.start();
    await r.parts.engine.settled();

    await r.diaryRepo.add(makeEntry({ meal: 'lunch', loggedAt: FACTORY_NOW }));
    await until(() => !r.plugin.held.has(lunchCheck));
    await r.parts.engine.settled();

    r.setNow(local('2026-10-26T15:00:00'));
    await r.parts.engine.refresh();
    expect((await r.inbox()).items).toEqual([]);
    r.parts.engine.stop();
  });

  it('posts a notice at once through the plugin and keeps it in the inbox', async () => {
    const r = await rig();
    await expect(
      r.notify.service.notices.post({
        kind: 'backupFailed',
        title: 'Backups are failing',
        body: 'Two in a row failed.',
        open: 'data',
        onceKey: 'backupFailed:2026-10-26',
      }),
    ).resolves.toBe('posted');
    expect(r.plugin.shownAtOnce).toMatchObject([
      { title: 'Backups are failing', channelId: channelOf('backupFailed') },
    ]);
    const stop = r.notify.service.subscribe(() => undefined);
    await until(() => r.notify.service.getSnapshot().unread === 1);
    expect(r.notify.service.getSnapshot().items[0]).toMatchObject({
      kind: 'backupFailed',
      open: 'data',
    });
    stop();
  });
});
