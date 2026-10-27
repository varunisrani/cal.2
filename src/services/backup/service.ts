// The backup service the screens act through (P09-13). Backup, restore and the archive code load
// on first use, so the app's first download does not carry them. Operations that read or write
// the whole store (making a backup, checking a file, restoring) run one at a time, in call order.
// Erase everything calls `invalidate` first: a backup that started before it is neither offered
// nor recorded afterwards (R06.5).

import type { BackupRepo } from '../../data/repos/backupRepo';
import type { FastRepo } from '../../data/repos/fastRepo';
import type { PhotoRepo } from '../../data/repos/photoRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { StorageAccess } from '../../data/storage';
import type { Clock } from '../../lib/clock';
import type { ImageCodec } from '../../lib/imageCodec';
import type { Result } from '../../lib/result';
import type { BackupProblem, MadeBackup, OfferOptions, OfferResult, ShareEnv } from './backup';
import type { BackupSummary, CheckedBackup, RestoreProblem } from './restore';

export type { BackupProblem, OfferResult } from './backup';
export type { BackupSummary, CheckedBackup, RestoreProblem } from './restore';

/** A made backup file, tied to the erase generation it was made in. */
export interface HeldBackup extends MadeBackup {
  readonly generation: number;
}

export interface BackupService {
  /** Makes the backup file of everything stored now. */
  make(): Promise<Result<HeldBackup, BackupProblem>>;
  /** Shares or downloads it; records the last backup time when it was handed over. */
  offer(made: HeldBackup, options?: OfferOptions): Promise<OfferResult>;
  /** Reads and checks a picked file; changes nothing. */
  inspect(file: Blob): Promise<Result<CheckedBackup, RestoreProblem>>;
  /** Restores a checked file, all or nothing. */
  apply(checked: CheckedBackup): Promise<Result<BackupSummary, RestoreProblem>>;
  /** Everything is about to be erased: backups already running never record success. */
  invalidate(): void;
}

export interface BackupServiceDeps {
  readonly backupRepo: BackupRepo;
  readonly settingsRepo: Pick<SettingsRepo, 'set'>;
  readonly fastRepo: Pick<FastRepo, 'settleOnOpen'>;
  readonly photoRepo: Pick<PhotoRepo, 'prune'>;
  readonly storage: Pick<StorageAccess, 'estimate'>;
  readonly clock: Clock;
  /** The app version written into each backup. */
  readonly appVersion: string;
  /** The browser's share sheet and download by default. */
  readonly share?: ShareEnv;
  /** The browser's image decoder by default. */
  readonly codec?: ImageCodec;
  /** The page's WebCrypto by default. */
  readonly crypto?: Pick<Crypto, 'subtle'> | null;
  /** Runs after each restore (the reminders re-read their settings). */
  readonly afterRestore?: () => unknown;
}

export function createBackupService(deps: BackupServiceDeps): BackupService {
  let generation = 0;
  let tail: Promise<unknown> = Promise.resolve();

  /** Runs `work` after every queued operation has settled. */
  function queued<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work);
    tail = run.catch(() => undefined);
    return run;
  }

  return {
    make() {
      // Taken when asked, not when the queue gets to it: an erase in between counts.
      const started = generation;
      return queued(async () => {
        const { makeBackup } = await import('./backup');
        const made = await makeBackup(deps);
        return made.ok ? { ...made, value: { ...made.value, generation: started } } : made;
      });
    },

    async offer(made, options) {
      const { offerBackup } = await import('./backup');
      return offerBackup(
        made,
        {
          settingsRepo: deps.settingsRepo,
          stillCurrent: () => made.generation === generation,
          share: deps.share,
        },
        options,
      );
    },

    inspect(file) {
      return queued(async () => {
        const { inspectBackup } = await import('./restore');
        return inspectBackup(file, deps);
      });
    },

    apply(checked) {
      return queued(async () => {
        const { applyBackup } = await import('./restore');
        return applyBackup(checked, deps);
      });
    },

    invalidate() {
      generation++;
    },
  };
}
