// Google Drive copies at start-up (P15-04, D-16.97): in the Android app only. The platform is
// checked before anything is fetched, so the web build never downloads the Drive service, its
// client, the sign-in plugin's bridge or Capacitor's core: they sit behind the one dynamic import
// below, in chunks only the Android app asks for. The web app has no Drive backup.

import { isHealthAvailable } from '../health/platform';
import type { DriveBackupService } from './drive';
import type { DriveBackupBase } from './driveSetup';

export type { DriveBackupBase } from './driveSetup';
export type { DriveBackupService } from './drive';

/** Fetches the module that builds the service; tests pass their own to see if it was fetched. */
export type DriveBackupModule = () => Promise<{
  setUpDriveBackup(base: DriveBackupBase): DriveBackupService;
}>;

const APP_SETUP: DriveBackupModule = () => import('./driveSetup');

/** The Drive copies, or undefined outside the Android app (nothing is fetched then). */
export async function loadDriveBackup(
  base: DriveBackupBase,
  setup: DriveBackupModule = APP_SETUP,
  // The Android shell is where Health Connect is: the same probe tells the app it runs there.
  inAndroidApp: () => boolean = isHealthAvailable,
): Promise<DriveBackupService | undefined> {
  if (!inAndroidApp()) return undefined;
  const { setUpDriveBackup } = await setup();
  return setUpDriveBackup(base);
}
