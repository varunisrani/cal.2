// Builds the automatic backup of the Android app (P14-01) over the native backup folder. Fetched
// only through `autoLoad.ts`, inside the Android app.

import { createAutoBackup, type AutoBackupDeps, type AutoBackupService } from './auto';
import type { BackupFolder } from './folder';
import { nativeBackupFolder, type ReadEnv } from './nativeFolder';

/** What the composition root already has: everything but the folder, and the page's fetch. */
export interface AutoBackupBase extends Omit<AutoBackupDeps, 'folder'> {
  /** Reads a backup back through the WebView's route to local files. */
  readonly fetch: ReadEnv['fetch'];
}

/** The service over `base`; the folder is the native one unless a test passes its own. */
export function setUpAutoBackup(
  base: AutoBackupBase,
  folder: BackupFolder = nativeBackupFolder({ fetch: base.fetch }),
): AutoBackupService {
  const { fetch: _fetch, ...deps } = base;
  return createAutoBackup({ ...deps, folder });
}
