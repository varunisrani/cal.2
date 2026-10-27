// Test helper: the backup card and the restore sheet over a fresh test database, with the real
// backup service on the screen harness's database, router, toasts and providers. Files leave
// through a fake share sheet that records downloads. The clock is the harness's: Monday
// 26 October 2026, 12:30 in New York.

import type { ReactNode } from 'react';
import type { StorageEstimateResult } from '../../../../data/storage';
import type { ShareEnv } from '../../../../services/backup/backup';
import type { BackupService } from '../../../../services/backup/service';
import { testBackupService } from '../../../../services/backup/testing/seed';
import { ServicesProvider } from '../../../../services/context';
import { openHarness } from '../../../../test/screenHarness';

export { seededBackupFile } from '../../../../services/backup/testing/seed';

export interface BackupSetup {
  /** The share sheet; by default none, so files are downloaded (into `downloads`). */
  readonly share?: (downloads: File[]) => ShareEnv;
  /** Free storage; plenty by default. */
  readonly estimate?: () => Promise<StorageEstimateResult | null>;
  /** `null` for a page without WebCrypto. */
  readonly crypto?: null;
  /** Wraps the real service (a held restore). */
  readonly wrap?: (real: BackupService) => BackupService;
}

export async function openBackup(setup: BackupSetup = {}) {
  const h = await openHarness({ hash: '#/settings' });
  const downloads: File[] = [];
  const real = testBackupService(h.db, {
    clock: h.clock,
    share: setup.share ? setup.share(downloads) : { download: (file) => downloads.push(file) },
    ...(setup.estimate ? { estimate: setup.estimate } : {}),
    ...(setup.crypto === null ? { crypto: null } : {}),
  });
  const backup = setup.wrap ? setup.wrap(real) : real;
  const services = { ...h.services, backup };

  /** Renders `ui` in the harness's providers with the backup service. */
  const mount = (ui: ReactNode) =>
    h.mount(<ServicesProvider services={services}>{ui}</ServicesProvider>);

  return { ...h, backup, services, downloads, mount };
}
