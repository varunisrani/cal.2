// Builds the Google Drive copies of the Android app (P15-04) over the native sign-in plugin.
// Fetched only through `driveLoad.ts`, inside the Android app.

import { createDriveBackup, type DriveBackupDeps, type DriveBackupService } from './drive';
import type { DrivePlugin } from './drivePlugin';
import { nativeDrivePlugin } from './driveNative';

/** What the composition root already has: everything but the plugin. */
export type DriveBackupBase = Omit<DriveBackupDeps, 'plugin'>;

/** The service over `base`; the plugin is the native one unless a test passes its own. */
export function setUpDriveBackup(
  base: DriveBackupBase,
  plugin: DrivePlugin = nativeDrivePlugin(),
): DriveBackupService {
  return createDriveBackup({ ...base, plugin });
}
