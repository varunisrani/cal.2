// Reminders at start-up in the Android app (P13, D-16.92). The platform is checked before anything
// is fetched, so the web build never downloads the native notifications, their plan or Capacitor's
// core: they sit behind the one dynamic import below, in chunks only the Android app asks for. The
// web keeps the reminder engine and the browser's notifications.

import { withPartitions } from '../../i18n/onDemand';
import { isHealthAvailable } from '../health/platform';
import type { NativeParts, NativeRemindersBase } from './native';

export type { NativeParts, NativeRemindersBase } from './native';
export type { NativeReminders } from './nativeSync';

/** Fetches the module that builds the parts; tests pass their own to see whether it was fetched. */
export type NativeRemindersModule = () => Promise<{
  setUpNativeReminders(base: NativeRemindersBase): NativeParts | Promise<NativeParts>;
}>;

const APP_SETUP: NativeRemindersModule = () => withPartitions(['reminders'], import('./native'));

/**
 * The Android app's notifications, with the permission read once so the first screen shows it
 * as it is; undefined outside the Android app (nothing is fetched then).
 */
export async function loadNativeReminders(
  base: NativeRemindersBase,
  setup: NativeRemindersModule = APP_SETUP,
  // The Android shell is where Health Connect is: the same probe tells the app it runs there.
  inAndroidApp: () => boolean = isHealthAvailable,
): Promise<NativeParts | undefined> {
  if (!inAndroidApp()) return undefined;
  const { setUpNativeReminders } = await setup();
  const parts = await setUpNativeReminders(base);
  await parts.access.refresh();
  return parts;
}
