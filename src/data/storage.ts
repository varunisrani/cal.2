// Persistent storage and the space estimate (D-16.8, R06.19). Browsers may evict a site's storage:
// Safari after a week without a visit unless the app is on the home screen, others under storage
// pressure. Asking for persistent storage protects the diary from that. The app asks once, after
// the first logged entry (the diary service calls `requestPersistence`); the fact that it asked is
// a setting, so a later call, a reload or another tab never asks again. Settings shows the
// browser's current answer. Where the browser offers none of this, nothing throws: the status is
// `unknown` and the estimate is null.

import type { SettingsRepo } from './repos/settingsRepo';

/** `persistent`: the browser will not evict the data; `best-effort`: it may under pressure. */
export type PersistenceStatus = 'persistent' | 'best-effort' | 'unknown';

/** The part of `navigator.storage` used here; any of it may be missing. */
export interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

/** Bytes this site uses and may use. */
export interface StorageEstimateResult {
  usage: number;
  quota: number;
}

export interface StorageAccess {
  /**
   * Asks the browser to keep this site's data, unless it was asked before; resolves with the
   * status afterwards. Calls made while one is asking share its answer.
   */
  requestPersistence(): Promise<PersistenceStatus>;
  /** The browser's current answer, or `unknown` when it cannot say. */
  persistenceStatus(): Promise<PersistenceStatus>;
  /** Usage and quota, or null when the browser does not tell. */
  estimate(): Promise<StorageEstimateResult | null>;
}

export interface StorageAccessOptions {
  /** Where the request is remembered (`storage.persistAsked`). */
  settings: Pick<SettingsRepo, 'update' | 'set'>;
  /** Defaults to `navigator.storage`; `null` for a browser without it. */
  storage?: StorageManagerLike | null;
}

function browserStorage(): StorageManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as { storage?: StorageManagerLike }).storage ?? null;
}

function isByteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function createStorageAccess(options: StorageAccessOptions): StorageAccess {
  const { settings } = options;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  /** The browser's reply to this session's request, for browsers that cannot be asked later. */
  let answer: boolean | null = null;
  let asking: Promise<PersistenceStatus> | null = null;

  async function persistenceStatus(): Promise<PersistenceStatus> {
    if (storage?.persisted) {
      try {
        return (await storage.persisted()) ? 'persistent' : 'best-effort';
      } catch {
        // Fall back to the answer this session got, if any.
      }
    }
    if (answer === null) return 'unknown';
    return answer ? 'persistent' : 'best-effort';
  }

  async function ask(persist: () => Promise<boolean>): Promise<PersistenceStatus> {
    // Claim the one request in a single settings transaction, so two tabs never both ask.
    let claimed = false;
    try {
      await settings.update('storage.persistAsked', (asked) => {
        claimed = !asked;
        return true;
      });
    } catch {
      // Without the record the browser is not asked: asking could then repeat on every call.
      return persistenceStatus();
    }
    if (!claimed) return persistenceStatus();
    try {
      answer = await persist();
    } catch {
      // No answer: give the request back so a later call may ask again.
      await settings.set('storage.persistAsked', false).catch(() => undefined);
      return persistenceStatus();
    }
    return answer ? 'persistent' : 'best-effort';
  }

  return {
    requestPersistence() {
      if (!storage?.persist) return persistenceStatus();
      const persist = storage.persist.bind(storage);
      asking ??= ask(persist).finally(() => {
        asking = null;
      });
      return asking;
    },

    persistenceStatus,

    async estimate() {
      if (!storage?.estimate) return null;
      try {
        const { usage, quota } = await storage.estimate();
        return isByteCount(usage) && isByteCount(quota) ? { usage, quota } : null;
      } catch {
        return null;
      }
    },
  };
}
