// The Android app's notifications (P13, D-16.92): the system's plugin and the parts built on it.
// Only ever fetched by `load.ts` inside the Android app, so neither this module, the plan, nor
// @capacitor/core is part of the web download. P17 adds the nudges, the notices and the inbox
// (`notifications/setup.ts`) when the composition root hands over what they need.

import { registerPlugin } from '@capacitor/core';
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
import type { NotifyBase, NotifyParts } from '../notifications/setup';
import {
  createNativeReminders,
  type NativeReminderDeps,
  type NativeReminders,
  type NotificationsPlugin,
} from './nativeSync';

/** What the composition root already has: everything but the plugin, and P17's parts. */
export type NativeRemindersBase = Omit<
  NativeReminderDeps,
  'plugin' | 'nudgeFacts' | 'channels' | 'onHandedOver' | 'onShown'
> & {
  /** P17: what the nudges, the notices and the inbox read; without it there are none. */
  readonly notify?: NotifyBase;
};

/** The reminders, and P17's notifications when they were asked for. */
export interface NativeParts extends NativeReminders {
  readonly notify?: NotifyParts;
}

/**
 * The plugin `@capacitor/local-notifications` registers in the Android shell (its native half is
 * added by `cap sync`). Registered by name, as the health plugin is, so its web stand-in is never
 * bundled.
 */
export function nativeNotificationsPlugin(): NotificationsPlugin {
  return registerPlugin<LocalNotificationsPlugin>('LocalNotifications');
}

/**
 * The parts over `base`; the plugin is the real one unless a test passes its own. P17's parts are
 * fetched apart (they are bigger than the reminders), still only in the Android app.
 */
export async function setUpNativeReminders(
  base: NativeRemindersBase,
  plugin: NotificationsPlugin = nativeNotificationsPlugin(),
): Promise<NativeParts> {
  const { notify, ...deps } = base;
  if (!notify) return createNativeReminders({ ...deps, plugin });
  const { wireNotify } = await import('../notifications/setup');
  const wiring = wireNotify({
    base: notify,
    plugin,
    clock: deps.clock,
    visibility: deps.visibility,
    ...(deps.watch ? { watch: deps.watch } : {}),
    ...(deps.onError ? { onError: deps.onError } : {}),
  });
  return { ...createNativeReminders({ ...deps, ...wiring.engine, plugin }), notify: wiring.parts };
}
