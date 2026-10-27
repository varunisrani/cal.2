// Keeping the diary from being cleared by the browser (D-16.8, R06.19, R06.15). Browsers may evict
// a site's storage: Safari after a week without a visit unless the app is on the home screen,
// others under storage pressure. After the first logged entry the app asks once for persistent
// storage (`requestPersistence` remembers that it asked). Then Home may show one of two cards, one
// at a time:
// - keep safe: once, when storage is not known to be persistent or the app is not installed:
//   install it and make backups;
// - backup due: when the last backup, or the start of the diary when there is none, is 14 days
//   old or more; dismissing either card keeps this one away for another 14 days.
// The card is worked out as the app opens (`check`) and never in the middle of a visit: the
// moment of the first entry is not interrupted, and the card waits for the next visit. A card
// counts as done only when it was drawn and then dismissed or acted on: one that was worked out
// but never shown (the person stayed on other tabs) comes back. The keep-safe flag is a
// device-local setting and the backup card's quiet time a device-local key, so neither travels in
// a backup and a new device asks again.

import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { PersistenceStatus, StorageAccess } from '../data/storage';
import type { Clock } from '../lib/clock';

/** The backup card shows once the last backup is this many days old. */
export const BACKUP_REMINDER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_MS = BACKUP_REMINDER_DAYS * DAY_MS;

/**
 * When the backup card's 14 days last started: the first entry logged on this device (or the first
 * check after it), then each dismissal. An app-owned `localStorage` key, so Erase everything
 * removes it.
 */
export const BACKUP_QUIET_KEY = 'platewise-backup-quiet';

export type Nudge =
  | {
      readonly kind: 'keepSafe';
      /** Running as the installed app; when not, the card suggests installing. */
      readonly installed: boolean;
      readonly persistence: PersistenceStatus;
    }
  | {
      readonly kind: 'backupDue';
      /** Null when no backup was ever made on this device. */
      readonly lastBackupAt: number | null;
      /** Whole days since the last backup; null with no backup. */
      readonly days: number | null;
    };

/** Where the backup card's quiet time lives. */
export interface NudgeMemory {
  read(): number | null;
  write(at: number): void;
}

export interface StorageNudgeDeps {
  readonly storage: Pick<StorageAccess, 'requestPersistence' | 'persistenceStatus'>;
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'set'>;
  readonly clock: Clock;
  /** Whether the page runs as the installed app; read at each check. */
  readonly installed?: () => boolean;
  /** Defaults to `localStorage` (in memory where it is blocked). */
  readonly memory?: NudgeMemory;
}

export interface StorageNudge {
  /** After an entry is logged: asks the browser once, ever. Changes no card in this visit. */
  afterFirstEntry(): Promise<PersistenceStatus>;
  /** The card due now, if any. Marks nothing. */
  due(): Promise<Nudge | null>;
  /** Works out this visit's card (`current`); the app calls it once as it opens. */
  check(): Promise<Nudge | null>;
  /** This visit's card, if any; the same object until it changes. */
  current(): Nudge | null;
  /** The card was drawn on screen. */
  shown(nudge: Nudge): void;
  /**
   * The person dismissed the card or acted on it: it goes. Recorded only for a card that was
   * drawn (`shown`); returns whether it was recorded.
   */
  dismiss(nudge: Nudge): Promise<boolean>;
  /** Called when `current` changes; returns the stop. */
  subscribe(listener: () => void): () => void;
}

/** Running as the installed app (a home-screen or desktop app window). */
export function runsInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = (navigator as Navigator & { readonly standalone?: boolean }).standalone;
  if (standalone === true) return true;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/** The quiet time in `localStorage`, kept in memory when the browser blocks it. */
export function localNudgeMemory(
  storage: () => Pick<Storage, 'getItem' | 'setItem'> | null = () => localStorage,
): NudgeMemory {
  let kept: number | null = null;
  return {
    read() {
      try {
        const raw = storage()?.getItem(BACKUP_QUIET_KEY) ?? null;
        const at = raw === null ? Number.NaN : Number(raw);
        if (Number.isFinite(at)) return at;
      } catch {
        // Blocked: the value kept in memory below.
      }
      return kept;
    },
    write(at) {
      kept = at;
      try {
        storage()?.setItem(BACKUP_QUIET_KEY, String(at));
      } catch {
        // In memory only, for this page.
      }
    },
  };
}

function latest(...instants: readonly (number | null)[]): number | null {
  let last: number | null = null;
  for (const at of instants) {
    if (at !== null && (last === null || at > last)) last = at;
  }
  return last;
}

export function createStorageNudge(deps: StorageNudgeDeps): StorageNudge {
  const { storage, settingsRepo, clock } = deps;
  const installed = deps.installed ?? runsInstalled;
  const memory = deps.memory ?? localNudgeMemory();
  const listeners = new Set<() => void>();
  /** Cards drawn on screen in this page. */
  const drawn = new WeakSet<Nudge>();
  let visitCard: Nudge | null = null;

  const show = (next: Nudge | null): void => {
    if (next === visitCard) return;
    visitCard = next;
    for (const listener of [...listeners]) listener();
  };

  async function backupDue(now: number): Promise<Nudge | null> {
    const lastBackupAt = await settingsRepo.get('backup.lastAt');
    const quiet = memory.read();
    const since = latest(lastBackupAt, quiet);
    if (since === null) {
      // The first look at a diary that was never backed up: its 14 days start now.
      memory.write(now);
      return null;
    }
    // A clock that moved back makes every time look recent, never overdue.
    if (now - since < REMINDER_MS) return null;
    return {
      kind: 'backupDue',
      lastBackupAt,
      days: lastBackupAt === null ? null : Math.floor((now - lastBackupAt) / DAY_MS),
    };
  }

  async function due(): Promise<Nudge | null> {
    const [asked, done] = await Promise.all([
      settingsRepo.get('storage.persistAsked'),
      settingsRepo.get('storage.nudgeDone'),
    ]);
    // Nothing logged yet on this device: nothing to keep safe.
    if (!asked && memory.read() === null) return null;
    if (!done) {
      const persistence = await storage.persistenceStatus();
      const onHomeScreen = installed();
      if (persistence !== 'persistent' || !onHomeScreen) {
        return { kind: 'keepSafe', installed: onHomeScreen, persistence };
      }
    }
    return backupDue(clock.now());
  }

  return {
    afterFirstEntry() {
      // The diary now holds something: the backup card's clock starts here at the latest.
      if (memory.read() === null) memory.write(clock.now());
      return storage.requestPersistence();
    },

    due,

    async check() {
      const next = await due();
      show(next);
      return next;
    },

    current: () => visitCard,

    shown(nudge) {
      drawn.add(nudge);
    },

    async dismiss(nudge) {
      if (!drawn.has(nudge)) return false;
      drawn.delete(nudge);
      // Either card has just said to make backups: the backup card waits 14 days from here.
      if (visitCard === nudge) show(null);
      if (nudge.kind === 'keepSafe') await settingsRepo.set('storage.nudgeDone', true);
      memory.write(clock.now());
      return true;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
