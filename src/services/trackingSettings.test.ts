import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettingsRepo, InvalidSettingError } from '../data/repos/settingsRepo';
import { DEFAULT_MEAL_TIMES } from '../domain/meals/times';
import { openTestDb } from '../test/db';
import { fakeNotifications } from '../test/notifications';
import type { NotificationState, NotificationSystem } from './reminders/notifier';
import { createTrackingSettingsService } from './trackingSettings';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp(state: NotificationState = 'default', system: NotificationSystem = 'browser') {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US', bus });
  const notifications = fakeNotifications(state, system);
  const reminders = { refresh: vi.fn(async () => undefined) };
  const service = createTrackingSettingsService({ settingsRepo, notifications, reminders });
  return { settingsRepo, notifications, reminders, service };
}

describe('setMealTimes', () => {
  it('stores the four starts', async () => {
    const h = await setUp();
    const times = { breakfast: 427, lunch: 690, dinner: 1_080, lateSnack: 1_380 };

    await expect(h.service.setMealTimes(times)).resolves.toEqual(times);

    expect(await h.settingsRepo.get('meals.times')).toEqual(times);
  });

  it('refuses starts that are not in order within one day, and keeps the stored ones', async () => {
    const h = await setUp();

    await expect(
      h.service.setMealTimes({ breakfast: 300, lunch: 1_080, dinner: 720, lateSnack: 1_380 }),
    ).rejects.toBeInstanceOf(InvalidSettingError);

    expect(await h.settingsRepo.get('meals.times')).toEqual(DEFAULT_MEAL_TIMES);
  });
});

describe('the notifications switch (R06.13)', () => {
  it('asks the browser and stores the switch on after a grant', async () => {
    const h = await setUp('default');

    await expect(h.service.turnRemindersOn()).resolves.toBe('granted');

    expect(h.notifications.request).toHaveBeenCalledOnce();
    expect(await h.settingsRepo.get('remind.master')).toBe(true);
    expect(h.service.permission()).toBe('granted');
    // The engine checks again: the permission changed, which no stored change reports.
    expect(h.reminders.refresh).toHaveBeenCalledOnce();
  });

  it.each(['denied', 'default'] as const)(
    'leaves the switch off when the browser answers %s',
    async (answer) => {
      const h = await setUp('default');
      h.notifications.answerWith(answer);

      await expect(h.service.turnRemindersOn()).resolves.toBe(answer);

      expect(await h.settingsRepo.get('remind.master')).toBe(false);
    },
  );

  it('asks before anything is awaited, so the request stays inside the press', async () => {
    const h = await setUp('default');

    const turning = h.service.turnRemindersOn();
    expect(h.notifications.request).toHaveBeenCalledOnce();
    await turning;
  });

  it('stores nothing where the browser has no notifications', async () => {
    const h = await setUp('unsupported');

    await expect(h.service.turnRemindersOn()).resolves.toBe('unsupported');

    expect(await h.settingsRepo.get('remind.master')).toBe(false);
  });

  it('turns the switch off', async () => {
    const h = await setUp('granted');
    await h.settingsRepo.set('remind.master', true);

    await h.service.turnRemindersOff();

    expect(await h.settingsRepo.get('remind.master')).toBe(false);
  });

  it('reads the permission again, and lets the engine check only when it changed (R06.10)', async () => {
    const h = await setUp('granted');

    await expect(h.service.recheck()).resolves.toBe('granted');
    expect(h.reminders.refresh).not.toHaveBeenCalled();

    h.notifications.setState('denied');
    expect(h.service.permission()).toBe('granted');
    await expect(h.service.recheck()).resolves.toBe('denied');
    expect(h.service.permission()).toBe('denied');
    expect(h.reminders.refresh).toHaveBeenCalledOnce();

    await expect(h.service.recheck()).resolves.toBe('denied');
    expect(h.reminders.refresh).toHaveBeenCalledOnce();
  });

  it('tells its listeners when the permission as read changes, and only then', async () => {
    const h = await setUp('default');
    const heard = vi.fn();
    const stop = h.service.subscribe(heard);

    await h.service.turnRemindersOn();
    expect(heard).toHaveBeenCalledOnce();
    await h.service.recheck();
    expect(heard).toHaveBeenCalledOnce();

    stop();
    h.notifications.setState('denied');
    await h.service.recheck();
    expect(heard).toHaveBeenCalledOnce();
  });

  it('asks for the permission without storing anything (onboarding stores its answer itself)', async () => {
    const h = await setUp('default');

    await expect(h.service.requestPermission()).resolves.toBe('granted');

    expect(h.notifications.request).toHaveBeenCalledOnce();
    expect(h.service.permission()).toBe('granted');
    expect(await h.settingsRepo.get('remind.master')).toBe(false);
  });
});

describe('in the Android app (P13)', () => {
  it("says the notifications are Android's, and reads the permission again through it", async () => {
    const h = await setUp('granted', 'android');
    const refresh = vi.spyOn(h.notifications, 'refresh');
    expect(h.service.system).toBe('android');

    h.notifications.setState('denied');
    await expect(h.service.recheck()).resolves.toBe('denied');

    expect(refresh).toHaveBeenCalledOnce();
    expect(h.reminders.refresh).toHaveBeenCalledOnce();
  });

  it('is the browser elsewhere', async () => {
    const h = await setUp('granted');
    expect(h.service.system).toBe('browser');
  });
});

describe('the reminders', () => {
  it("changes a reminder's switch or its time and keeps the other", async () => {
    const h = await setUp();
    await h.settingsRepo.set('remind.lunch', { on: false, at: '12:30' });

    await h.service.setReminder('lunch', { on: true });
    expect(await h.settingsRepo.get('remind.lunch')).toEqual({ on: true, at: '12:30' });

    await h.service.setReminder('lunch', { at: '11:45' });
    expect(await h.settingsRepo.get('remind.lunch')).toEqual({ on: true, at: '11:45' });

    await h.service.setReminder('water', { on: true, at: '15:00' });
    expect(await h.settingsRepo.get('remind.water')).toEqual({ on: true, at: '15:00' });
  });

  it('refuses a time that is not HH:MM', async () => {
    const h = await setUp();

    await expect(h.service.setReminder('dinner', { at: '7pm' })).rejects.toBeInstanceOf(
      InvalidSettingError,
    );
    expect(await h.settingsRepo.get('remind.dinner')).toEqual({ on: false, at: '19:00' });
  });

  it('switches the fasting goal and the goal-weight alerts', async () => {
    const h = await setUp();

    await h.service.setFastGoalAlert(true);
    await h.service.setGoalReachedAlert(true);

    expect(await h.settingsRepo.get('remind.fastGoal')).toBe(true);
    expect(await h.settingsRepo.get('alerts.goalReached')).toBe(true);

    await h.service.setGoalReachedAlert(false);
    expect(await h.settingsRepo.get('alerts.goalReached')).toBe(false);
  });
});
