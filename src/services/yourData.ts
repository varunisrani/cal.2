// Settings › Your data (P09-15, 06 §3.15–3.16): what the Storage card measures and its Clear
// cache, Clear diary, and Erase everything. Erase runs in a fixed order (R06.5, R06.10): any
// backup already running is told it can no longer record success, the reminder timers stop, the
// whole database goes (every tab is told), and only then does the app start again on Welcome.
// Starting again is a page load: every repository holds the connection the erase closed.

import { ONBOARDING_ROUTE, routeHash } from '../app/router';
import type { PhotoRepo } from '../data/repos/photoRepo';
import type { TransferRepo } from '../data/repos/transferRepo';
import type { PersistenceStatus, StorageAccess, StorageEstimateResult } from '../data/storage';
import type { EraseResult } from '../data/wipe';
import type { BackupService } from './backup/service';
import type { ReminderEngine } from './reminders/engine';

/** Day keys before and after any real day: Clear diary rewrites every day between them. */
const FIRST_DAY = '0000-01-01';
const LAST_DAY = '9999-12-31';

/** What the Storage card shows; a part that could not be measured is null. */
export interface StorageReport {
  /** Bytes of the stored photos. */
  readonly photoBytes: number | null;
  /** Bytes of their thumbnails (the cache Clear cache empties). */
  readonly thumbBytes: number | null;
  /** What the whole site uses of what it may use; null when the browser does not say. */
  readonly estimate: StorageEstimateResult | null;
  readonly persistence: PersistenceStatus;
}

export type EraseOutcome =
  /** Everything is gone; the app is starting again. */
  | { readonly kind: 'erased' }
  /**
   * Another tab still holds the database. The delete stays queued and the app starts again once
   * it went through (or was refused).
   */
  | { readonly kind: 'blocked' }
  /** The browser refused a step; `restart` reloads the app as it now is. */
  | { readonly kind: 'failed' };

export interface YourDataService {
  measure(): Promise<StorageReport>;
  /** Drops every photo thumbnail (made again on demand); returns how many. Photos stay. */
  clearCache(): Promise<number>;
  /**
   * Removes every readable diary entry in one write, then the photos nothing else uses; saved
   * meals, weights, water, fasts, the profile and settings stay. Returns how many entries went.
   */
  clearDiary(): Promise<number>;
  /** Erases everything on this device and, unless a step failed, starts the app again. */
  eraseEverything(): Promise<EraseOutcome>;
  /** Starts the app again on Welcome (a page load). */
  restart(): void;
}

export interface YourDataDeps {
  readonly transferRepo: Pick<TransferRepo, 'rewriteDays'>;
  readonly photoRepo: Pick<PhotoRepo, 'usage' | 'clearThumbs' | 'releaseIfUnused'>;
  readonly storage: Pick<StorageAccess, 'estimate' | 'persistenceStatus'>;
  /** Told first, so a backup that started before the erase never records success (R06.5). */
  readonly backup?: Pick<BackupService, 'invalidate'>;
  /** Stopped before the delete, so no reminder fires over an empty store (R06.10). */
  readonly reminders?: Pick<ReminderEngine, 'stop'>;
  /** Deletes the database and the app's own browser storage (`eraseEverything` of src/data). */
  readonly erase: () => Promise<EraseResult>;
  /** Defaults to loading the page again on Welcome. */
  readonly restart?: () => void;
}

/** Loads the page again on Welcome; the address is replaced, so Back cannot return here. */
export function reloadOnWelcome(): void {
  window.history.replaceState(null, '', routeHash(ONBOARDING_ROUTE));
  window.location.reload();
}

export function createYourDataService(deps: YourDataDeps): YourDataService {
  const { transferRepo, photoRepo, storage } = deps;
  const restart = deps.restart ?? reloadOnWelcome;
  let erasing: Promise<EraseOutcome> | null = null;

  async function erase(): Promise<EraseOutcome> {
    deps.backup?.invalidate();
    deps.reminders?.stop();
    const result = await deps.erase();
    switch (result.status) {
      case 'erased':
        restart();
        return { kind: 'erased' };
      case 'blocked':
        // Whether the queued delete went through or not, this tab's connection is closed.
        void result.finished.then(restart, restart);
        return { kind: 'blocked' };
      case 'failed':
        console.error('Platewise: erasing everything failed', result.cause);
        return { kind: 'failed' };
    }
  }

  return {
    async measure() {
      const [usage, estimate, persistence] = await Promise.all([
        photoRepo.usage().catch(() => null),
        storage.estimate().catch(() => null),
        storage.persistenceStatus().catch((): PersistenceStatus => 'unknown'),
      ]);
      return {
        photoBytes: usage?.photoBytes ?? null,
        thumbBytes: usage?.thumbBytes ?? null,
        estimate,
        persistence,
      };
    },

    clearCache: () => photoRepo.clearThumbs(),

    async clearDiary() {
      let removed = 0;
      const { releasedPhotoIds } = await transferRepo.rewriteDays(FIRST_DAY, LAST_DAY, (stored) => {
        removed = stored.entries.length;
        return {
          putEntries: [],
          removeEntryIds: stored.entries.map((entry) => entry.id),
          putWater: [],
          removeWaterIds: [],
        };
      });
      // The entries are gone either way; a photo left by a failed cleanup goes with the next one.
      await photoRepo.releaseIfUnused(releasedPhotoIds).catch(() => []);
      return removed;
    },

    eraseEverything() {
      // Asked twice (two taps, two buttons): one erase.
      erasing ??= erase();
      return erasing;
    },

    restart,
  };
}
