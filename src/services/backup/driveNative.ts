// The native Google Drive sign-in plugin of the Android app (P15-01 builds it, P15-04 calls it).
// Only ever fetched through `driveLoad.ts` inside the Android app, so neither this module nor
// @capacitor/core is part of the web download.

import { registerPlugin } from '@capacitor/core';
import type { DrivePlugin } from './drivePlugin';

/** The name the Android shell registers the plugin under. */
export const DRIVE_PLUGIN_NAME = 'Drive';

/** The plugin the Android shell registers. */
export function nativeDrivePlugin(): DrivePlugin {
  return registerPlugin<DrivePlugin>(DRIVE_PLUGIN_NAME);
}
