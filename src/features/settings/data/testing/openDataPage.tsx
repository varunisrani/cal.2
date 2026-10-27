// Test helper: Settings › Your data over a fresh test database: the real backup, diary-file and
// Your data services on the screen harness's database, router, toasts and providers. The browser
// parts are stand-ins: the storage estimate and persistence are given, and the erase, the reminder
// stop and the restart are recorded in `steps` instead of deleting the database (the service's
// own tests cover the real erase). The clock is the harness's: Monday 26 October 2026, 12:30 in
// New York.

import type { ReactNode } from 'react';
import type { StorageAccess } from '../../../../data/storage';
import type { EraseResult } from '../../../../data/wipe';
import { ServicesProvider, type Services } from '../../../../services/context';
import { testDataServices } from '../../../../services/testing/yourData';
import type { YourDataService } from '../../../../services/yourData';
import { openBackup, type BackupSetup } from './openBackup';

export interface DataPageSetup extends BackupSetup {
  /** The browser's storage answers; 1.2 MB of 50 MB, not persistent, by default. */
  readonly storage?: Pick<StorageAccess, 'estimate' | 'persistenceStatus'>;
  /** What the erase reports; erased by default. */
  readonly eraseResult?: () => Promise<EraseResult>;
  /** Wraps the real Your data service (a held clear, a slow measure). */
  readonly wrapData?: (real: YourDataService) => YourDataService;
}

export const DEFAULT_STORAGE: Pick<StorageAccess, 'estimate' | 'persistenceStatus'> = {
  estimate: async () => ({ usage: 1_234_567, quota: 50_000_000 }),
  persistenceStatus: async () => 'best-effort',
};

export async function openDataPage(setup: DataPageSetup = {}) {
  const h = await openBackup(setup);
  const steps: string[] = [];
  const built = testDataServices(h.db, {
    storage: setup.storage ?? DEFAULT_STORAGE,
    backup: {
      invalidate: () => {
        steps.push('invalidate');
        h.backup.invalidate();
      },
    },
    reminders: { stop: () => steps.push('stop') },
    erase: async () => {
      steps.push('erase');
      return setup.eraseResult ? setup.eraseResult() : { status: 'erased' };
    },
    restart: () => steps.push('restart'),
  });
  const yourData = setup.wrapData ? setup.wrapData(built.yourData) : built.yourData;
  const services: Services = { ...h.services, yourData, transfer: built.transfer };

  /** Renders `ui` in the harness's providers with these services. */
  const mount = (ui: ReactNode) =>
    h.mount(<ServicesProvider services={services}>{ui}</ServicesProvider>);

  return { ...h, services, yourData, steps, photoUsage: built.photoUsage, mount };
}
