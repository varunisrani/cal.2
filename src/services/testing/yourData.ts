// Test helper: the Your data and diary-file services over a test database, built from their real
// repositories. The browser parts are stand-ins the caller gives: the storage answers, the
// backup's invalidate, the reminder stop, the erase and the restart.

import { createPhotoRepo, type PhotoUsage } from '../../data/repos/photoRepo';
import { createTransferRepo } from '../../data/repos/transferRepo';
import type { PlatewiseDb } from '../../data/schema';
import { createTransferService, type TransferService } from '../transfer/transfer';
import { createYourDataService, type YourDataDeps, type YourDataService } from '../yourData';

export type DataStandIns = Omit<YourDataDeps, 'transferRepo' | 'photoRepo'>;

export interface TestDataServices {
  readonly yourData: YourDataService;
  readonly transfer: TransferService;
  /** Photo bytes and thumbnails as stored now. */
  readonly photoUsage: () => Promise<PhotoUsage>;
}

export function testDataServices(db: PlatewiseDb, standIns: DataStandIns): TestDataServices {
  const photoRepo = createPhotoRepo(db);
  return {
    yourData: createYourDataService({
      transferRepo: createTransferRepo(db),
      photoRepo,
      ...standIns,
    }),
    transfer: createTransferService({ transferRepo: createTransferRepo(db), photoRepo }),
    photoUsage: () => photoRepo.usage(),
  };
}
