// Automatic backup at start-up (P14-01, D-16.95): in the Android app only. The platform is checked
// before anything is fetched, so the web build never downloads the automatic backup, the native
// folder, the files plugin's bridge or Capacitor's core: they sit behind the one dynamic import
// below, in chunks only the Android app asks for. The web keeps backups by hand (a browser cannot
// write a file by itself).

import { isHealthAvailable } from '../health/platform';
import type { AutoBackupService } from './auto';
import type { AutoBackupBase } from './autoSetup';

export type { AutoBackupBase } from './autoSetup';
export type { AutoBackupService } from './auto';

/** Fetches the module that builds the service; tests pass their own to see if it was fetched. */
export type AutoBackupModule = () => Promise<{
  setUpAutoBackup(base: AutoBackupBase): AutoBackupService;
}>;

const APP_SETUP: AutoBackupModule = () => import('./autoSetup');

/** The automatic backup, or undefined outside the Android app (nothing is fetched then). */
export async function loadAutoBackup(
  base: AutoBackupBase,
  setup: AutoBackupModule = APP_SETUP,
  // The Android shell is where Health Connect is: the same probe tells the app it runs there.
  inAndroidApp: () => boolean = isHealthAvailable,
): Promise<AutoBackupService | undefined> {
  if (!inAndroidApp()) return undefined;
  const { setUpAutoBackup } = await setup();
  return setUpAutoBackup(base);
}
