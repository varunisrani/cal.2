import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../data/settingsSchema';
import { fixedClock } from '../../lib/clock';
import { FACTORY_NOW } from '../../test/factories';
import { REMINDER_SETTING_KEYS, type ReminderSettings } from './engine';
import { loadNativeReminders, type NativeRemindersBase, type NativeRemindersModule } from './load';
import { setUpNativeReminders } from './native';
import { writeMessage } from './notifier';
import { FakeNotificationsPlugin } from './testing/fakeNotificationsPlugin';

afterEach(() => {
  vi.unstubAllGlobals();
});

function base(): NativeRemindersBase {
  const all = defaultSettings({ locale: 'en-US' });
  const settings: Partial<Record<keyof ReminderSettings, unknown>> = {};
  for (const key of REMINDER_SETTING_KEYS) settings[key] = all[key];
  return {
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
    visibility: { isVisible: () => true, subscribe: () => () => undefined },
    settings: async () => settings as ReminderSettings,
    activeFast: async () => null,
    todayTotals: async () => ({ eatenKcal: 0, goalKcal: null }),
    write: writeMessage,
    channel: { name: 'Reminders', description: 'All of them.' },
    onOpen: () => undefined,
  };
}

describe('loadNativeReminders (P13, D-16.92)', () => {
  it('fetches nothing and builds nothing on the web, where there is no Capacitor bridge', async () => {
    const setup = vi.fn<NativeRemindersModule>();

    expect(await loadNativeReminders(base(), setup)).toBeUndefined();
    expect(setup).not.toHaveBeenCalled();
  });

  it("fetches the native module inside the Android app and reads Android's permission first", async () => {
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });
    const plugin = new FakeNotificationsPlugin();
    plugin.display = 'prompt-with-rationale';
    const setup = vi.fn<NativeRemindersModule>(async () => ({
      setUpNativeReminders: (given: NativeRemindersBase) => setUpNativeReminders(given, plugin),
    }));

    const native = await loadNativeReminders(base(), setup);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(native?.access.system).toBe('android');
    // Read before the first screen: the switch and the pointer are right from the start.
    expect(native?.access.state()).toBe('denied');
  });
});
