// The Android app's notifications (P13, D-16.92): the system's plugin and the parts built on it.
// Only ever fetched by `load.ts` inside the Android app, so neither this module, the plan, nor
// @capacitor/core is part of the web download.

import { registerPlugin } from '@capacitor/core';
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
import {
  createNativeReminders,
  type NativeReminderDeps,
  type NativeReminders,
  type NotificationsPlugin,
} from './nativeSync';

/** What the composition root already has: everything but the plugin. */
export type NativeRemindersBase = Omit<NativeReminderDeps, 'plugin'>;

/**
 * The plugin `@capacitor/local-notifications` registers in the Android shell (its native half is
 * added by `cap sync`). Registered by name, as the health plugin is, so its web stand-in is never
 * bundled.
 */
export function nativeNotificationsPlugin(): NotificationsPlugin {
  return registerPlugin<LocalNotificationsPlugin>('LocalNotifications');
}

/** The parts over `base`; the plugin is the real one unless a test passes its own. */
export function setUpNativeReminders(
  base: NativeRemindersBase,
  plugin: NotificationsPlugin = nativeNotificationsPlugin(),
): NativeReminders {
  return createNativeReminders({ ...base, plugin });
}
