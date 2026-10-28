// The Android app's notifications put together (P17): the reminders' engine with the nudges, the
// inbox and the taps, over real repositories on a test database and a stand-in for the plugin.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOME_ROUTE, tabRoute } from '../../app/router';
import { live } from '../../data/live';
import { createCoachRepo } from '../../data/repos/coachRepo';
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
import { checkInIds } from '../reminders/nativePlan';
import { coachScreen } from '../coach/onScreen';
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
  coachScreen.show(null);
  coachScreen.take();
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
  const coachRepo = createCoachRepo(db);
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
        coachRepo,
        app: { router, appState, analysis },
        live,
      },
    },
    plugin,
  );
  return {
    settingsRepo,
    diaryRepo,
    coachRepo,
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

describe('the Coach’s notifications in the Android app (P17-03, D-16.102)', () => {
  /** A stored chat with one exchange, and a check-in from it for Thursday at 19:00. */
  async function withCheckIn(r: Awaited<ReturnType<typeof rig>>, at = '19:00') {
    await r.coachRepo.append(
      { chatId: 'chat-1', role: 'user', text: 'Check on me Thursday.', at: FACTORY_NOW },
      { start: true },
    );
    const added = await r.notify.coach.checkIns.add({
      chatId: 'chat-1',
      date: '2026-10-29',
      time: at,
      text: 'How did the new breakfast go?',
    });
    if (!added.ok) throw new Error(added.error);
    return added.value;
  }

  it('plans a check-in in its channel; when it comes its message is in the chat, once, and in the inbox', async () => {
    const r = await rig();
    const checkIn = await withCheckIn(r);
    r.parts.engine.start();
    await r.parts.engine.settled();
    const id = checkInIds([checkIn]).get(checkIn.id)!;

    expect(r.plugin.held.get(id)).toMatchObject({
      title: 'Coach check-in',
      body: 'How did the new breakfast go?',
      channelId: channelOf('coachCheckIn'),
      extra: { open: { coachChat: 'chat-1' }, kind: 'coachCheckIn' },
    });
    expect(r.plugin.channels).toContainEqual(
      expect.objectContaining({ id: channelOf('coachCheckIn'), name: 'Check-ins' }),
    );

    // It came while the app was away; the app comes back twice.
    r.visibility.set(false);
    r.setNow(local('2026-10-29T20:00:00'));
    r.visibility.set(true);
    r.visibility.set(false);
    r.visibility.set(true);
    await r.parts.engine.settled();
    await until(async () => (await r.coachRepo.list('chat-1')).length === 2);
    await r.parts.engine.refresh();
    await r.parts.engine.settled();

    const messages = await r.coachRepo.list('chat-1');
    expect(messages.map(({ role, text, at }) => ({ role, text, at }))).toEqual([
      { role: 'user', text: 'Check on me Thursday.', at: FACTORY_NOW },
      {
        role: 'assistant',
        text: 'How did the new breakfast go?',
        at: local('2026-10-29T19:00:00'),
      },
    ]);
    expect(await r.settingsRepo.get('coach.checkIns')).toEqual([]);
    expect(r.plugin.held.has(id)).toBe(false);
    await until(async () => (await r.inbox()).items.some((item) => item.kind === 'coachCheckIn'));
    expect((await r.inbox()).items.find((item) => item.kind === 'coachCheckIn')).toMatchObject({
      title: 'Coach check-in',
      open: { coachChat: 'chat-1' },
      at: local('2026-10-29T19:00:00'),
    });
    r.parts.engine.stop();
  });

  it('puts the message in when Android shows the check-in while the app runs', async () => {
    const r = await rig();
    const checkIn = await withCheckIn(r);
    r.parts.engine.start();
    await r.parts.engine.settled();

    r.setNow(local('2026-10-29T19:00:00'));
    r.plugin.shown(checkInIds([checkIn]).get(checkIn.id)!);
    await until(async () => (await r.coachRepo.list('chat-1')).length === 2);
    r.parts.engine.stop();
  });

  it('keeps a check-in at its time in quiet hours', async () => {
    const r = await rig();
    const checkIn = await withCheckIn(r, '23:15');
    r.parts.engine.start();
    await r.parts.engine.settled();
    expect(r.plugin.held.get(checkInIds([checkIn]).get(checkIn.id)!)?.schedule).toEqual({
      at: new Date(local('2026-10-29T23:15:00')),
      allowWhileIdle: true,
    });
    r.parts.engine.stop();
  });

  it('opens the Coach on the chat of a tapped reply or check-in', async () => {
    const r = await rig();
    r.parts.engine.start();
    await r.parts.engine.settled();

    r.plugin.tap({ open: { coachChat: 'chat-9' }, key: 'k', kind: 'coachReplied' }, 390);

    expect(coachScreen.asked()).toBe('chat-9');
    expect(r.router.navigate).toHaveBeenCalledWith(tabRoute('coach'));
    r.parts.engine.stop();
  });

  it('posts The Coach replied only when the person is not looking at that chat, once a reply', async () => {
    const r = await rig();
    const reply = (id: string, chatId: string) => ({
      id,
      chatId,
      role: 'assistant' as const,
      text: '**Good news:** you are on pace.\n\n- Keep lunch as it is.',
      at: FACTORY_NOW,
    });
    const shown = () => r.plugin.shownAtOnce.filter((each) => each.extra.kind === 'coachReplied');

    // On the Coach, in chat-1: a reply there is seen, one in chat-2 is not.
    coachScreen.show('chat-1');
    r.notify.replied(reply('m1', 'chat-1'));
    r.notify.replied(reply('m2', 'chat-2'));
    await until(() => shown().length === 1);
    expect(shown()[0]).toMatchObject({
      title: 'The Coach replied',
      body: 'Good news: you are on pace. Keep lunch as it is.',
      channelId: channelOf('coachReplied'),
      extra: { open: { coachChat: 'chat-2' }, kind: 'coachReplied' },
    });

    // In the background, even chat-1's reply is announced; each reply once.
    r.setNow(FACTORY_NOW + 60_000);
    r.visibility.set(false);
    r.notify.replied(reply('m3', 'chat-1'));
    r.notify.replied(reply('m3', 'chat-1'));
    await until(() => shown().length === 2);
    // Another screen: the Coach screen shows nothing.
    r.setNow(FACTORY_NOW + 120_000);
    r.visibility.set(true);
    coachScreen.show(null);
    r.notify.replied(reply('m4', 'chat-1'));
    await until(() => shown().length === 3);
    expect(shown().map((each) => each.extra.open)).toEqual([
      { coachChat: 'chat-2' },
      { coachChat: 'chat-1' },
      { coachChat: 'chat-1' },
    ]);
    await until(
      async () =>
        (await r.inbox()).items.filter((item) => item.kind === 'coachReplied').length === 3,
    );
  });

  it('drops The Coach replied in quiet hours, and while its switch is off', async () => {
    const r = await rig();
    const reply = { id: 'm1', chatId: 'c', role: 'assistant' as const, text: 'Hi', at: 1 };
    r.setNow(local('2026-10-26T23:00:00'));
    r.notify.replied(reply);
    r.setNow(local('2026-10-27T09:00:00'));
    await r.settingsRepo.set('notify.off', ['coachReplied']);
    r.notify.replied({ ...reply, id: 'm2' });
    await expect(
      r.notify.service.notices.post({
        kind: 'coachReplied',
        title: 't',
        body: 'b',
        open: { coachChat: 'c' },
        onceKey: 'probe',
      }),
    ).resolves.toBe('off');
    expect(r.plugin.shownAtOnce).toEqual([]);
  });
});
