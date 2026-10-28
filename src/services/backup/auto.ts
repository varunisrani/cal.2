// Automatic backup in the Android app (P14-01, D-16.95). When the app starts or comes back to the
// front (the app cannot work while it is closed: the data lives in the WebView), a backup is
// saved when one is due:
// - automatic backup is on (`backup.auto`, on by default), setup is finished (a fresh install
//   never puts an empty backup next to the person's real ones), and no restore is running;
// - the newest backup, made by hand or automatically (`backup.lastAt`, and this device's last
//   automatic one), is a day old (Daily, the default) or a week old (Weekly). A newest backup in
//   the future (a clock that went back) counts as due, so a wrong clock never stops backups.
//
// The file is the one Back up now makes, through the backup service (so it waits for any other
// backup or restore), written as `platewise-backup-YYYY-MM-DD-HHmm.zip` into Documents/Platewise
// (`folder.ts`). Then "Last backup" moves to its time, so Home's 14-day card counts it, and the
// automatic backups this install wrote are pruned to the newest 7. Only names in this device's
// own list are ever deleted: a file the app did not write stays, and one with the same name is
// never written over (the new file gets `-2`, `-3` …). A file that started before everything was
// erased is neither written nor recorded (R06.5); one made while the switch went off is dropped.
//
// Android 8–10 ask for storage access: once by themselves, at the first run there, and again when
// the person turns the switch on. A failure (no space, access refused, a file that could not be
// made or written) is stored with its time for the card, and the next start or return tries
// again. Nothing here rejects into the app. One run at a time: a trigger during a run is dropped.

import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type {
  AutoBackupEvery,
  AutoBackupProblem,
  AutoBackupRecord,
  AutoBackupState,
} from '../../data/settingsSchema';
import { dayKeyOf } from '../../domain/dates/dayKey';
import type { Clock } from '../../lib/clock';
import { err, ok, type Result } from '../../lib/result';
import type { PageVisibility } from '../reminders/engine';
import type { BackupProblem } from './backup';
import { folderProblemOf, type BackupFolder, type FolderFile } from './folder';
import type { BackupService } from './service';

/** How many automatic backups are kept in the folder. */
export const AUTO_BACKUPS_KEPT = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long after the newest backup the next one is due. */
export const AUTO_BACKUP_INTERVAL_MS: Readonly<Record<AutoBackupEvery, number>> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
};

/** True when a backup is due at `now`, the newest one having been made at `newest`. */
export function isAutoBackupDue(newest: number | null, every: AutoBackupEvery, now: number) {
  if (newest === null || newest > now) return true;
  return now >= newest + AUTO_BACKUP_INTERVAL_MS[every];
}

const twoDigits = (n: number) => String(n).padStart(2, '0');

/** The name of an automatic backup made at `madeAt`, in local time; `copy` 2+ adds `-2` … */
export function autoBackupFileName(madeAt: number, copy = 1): string {
  const local = new Date(madeAt);
  const time = `${twoDigits(local.getHours())}${twoDigits(local.getMinutes())}`;
  return `platewise-backup-${dayKeyOf(madeAt)}-${time}${copy > 1 ? `-${copy}` : ''}.zip`;
}

/** An automatic backup this install wrote that is in the folder now. */
export interface AutoBackupFile {
  readonly name: string;
  /** Epoch ms. */
  readonly madeAt: number;
  /** Bytes. */
  readonly size: number;
}

/** What the card shows besides the settings. */
export interface AutoBackupStatus {
  /** A backup is being made or written now. */
  readonly running: boolean;
  /** This install's automatic backups in the folder, newest first; null until listed. */
  readonly files: readonly AutoBackupFile[] | null;
}

/** How a check ended. */
export type AutoBackupOutcome =
  | 'written'
  /** Automatic backup is off. */
  | 'off'
  /** Setup is not finished. */
  | 'notReady'
  /** A restore is running or waiting. */
  | 'restoring'
  | 'notDue'
  /** Another check is running. */
  | 'busy'
  /** Everything was erased while the file was made: nothing written, nothing recorded. */
  | 'invalidated'
  /** Not saved; the reason is stored in `backup.autoState`. */
  | 'failed';

/** Why a listed backup could not be read back. */
export type OpenProblem = 'missing' | 'denied' | 'failed';

export interface CheckOptions {
  /** The person just acted (turned the switch on): Android 8–10 may ask for access again. */
  readonly ask?: boolean;
}

export interface AutoBackupService {
  /** Checks now and each time the page comes back to the front; returns the stop. */
  start(): () => void;
  /** Saves a backup when one is due. Never rejects. */
  check(options?: CheckOptions): Promise<AutoBackupOutcome>;
  /** The switch: stores it, then checks (asking for access if needed) when it is turned on. */
  setOn(on: boolean): Promise<void>;
  /** Daily or Weekly: stores it, then checks. */
  setEvery(every: AutoBackupEvery): Promise<void>;
  /** Lists the folder again for the card. Never rejects. */
  refresh(): Promise<void>;
  /** One of this install's automatic backups, read back for the restore sheet. Never rejects. */
  open(name: string): Promise<Result<File, OpenProblem>>;
  /** Calls `listener` when `getSnapshot` changes; returns the stop. */
  subscribe(listener: () => void): () => void;
  /** The same object until something changes. */
  getSnapshot(): AutoBackupStatus;
}

export interface AutoBackupDeps {
  readonly backup: Pick<BackupService, 'make' | 'restoring' | 'isCurrent'>;
  readonly folder: BackupFolder;
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'set' | 'update'>;
  readonly clock: Clock;
  readonly visibility: PageVisibility;
  /** Where a failure is reported; the console by default. */
  readonly onError?: (message: string, error?: unknown) => void;
}

const MADE_PROBLEMS: Readonly<Record<BackupProblem, AutoBackupProblem>> = {
  photoUnreadable: 'photoUnreadable',
  tooLarge: 'tooLarge',
  // The Android app always runs on a secure page; anything else is a plain failure.
  insecure: 'failed',
  failed: 'failed',
};

function writeProblem(error: unknown): AutoBackupProblem {
  const problem = folderProblemOf(error);
  return problem === 'noSpace' || problem === 'denied' ? problem : 'failed';
}

function reportToConsole(message: string, error?: unknown): void {
  console.error(`Platewise: ${message}`, ...(error === undefined ? [] : [error]));
}

/** The first `-n` name that no file in the folder has, unless the file there is this install's. */
function freeName(madeAt: number, inFolder: ReadonlySet<string>, ours: ReadonlySet<string>) {
  for (let copy = 1; ; copy++) {
    const name = autoBackupFileName(madeAt, copy);
    if (!inFolder.has(name) || ours.has(name)) return name;
  }
}

export function createAutoBackup(deps: AutoBackupDeps): AutoBackupService {
  const { backup, folder, settingsRepo, clock, visibility } = deps;
  const report = deps.onError ?? reportToConsole;
  const listeners = new Set<() => void>();
  let status: AutoBackupStatus = { running: false, files: null };
  let checking = false;

  function show(change: Partial<AutoBackupStatus>): void {
    status = { ...status, ...change };
    for (const listener of [...listeners]) listener();
  }

  function changeState(change: (current: AutoBackupState) => AutoBackupState) {
    return settingsRepo.update('backup.autoState', change);
  }

  async function failed(kind: AutoBackupProblem, asked: boolean): Promise<'failed'> {
    report(`the automatic backup was not saved (${kind})`);
    const at = clock.now();
    await changeState((current) => ({
      ...current,
      problem: { kind, at },
      asked: current.asked || asked,
    }));
    return 'failed';
  }

  /** The folder's files by name; null when it cannot be read (nothing is pruned then). */
  async function listing(): Promise<Map<string, FolderFile> | null> {
    try {
      return new Map((await folder.list()).map((file) => [file.name, file]));
    } catch (error) {
      report('the backup folder could not be listed', error);
      return null;
    }
  }

  /** Deletes this install's automatic backups beyond the newest 7 that are still there. */
  async function prune(inFolder: ReadonlyMap<string, FolderFile> | null): Promise<void> {
    if (!inFolder) return;
    const { files } = await settingsRepo.get('backup.autoState');
    const there = files.filter((file) => inFolder.has(file.name));
    const gone = new Set(files.filter((file) => !inFolder.has(file.name)).map((f) => f.name));
    for (const file of there.slice(AUTO_BACKUPS_KEPT)) {
      try {
        await folder.remove(file.name);
        gone.add(file.name);
      } catch (error) {
        // Kept in the list, so the next run deletes it.
        report(`an old automatic backup could not be deleted (${file.name})`, error);
      }
    }
    if (gone.size === 0) return;
    await changeState((current) => ({
      ...current,
      files: current.files.filter((file) => !gone.has(file.name)),
    }));
  }

  async function run(options: CheckOptions): Promise<AutoBackupOutcome> {
    if (!(await settingsRepo.get('backup.auto'))) return 'off';
    if (!(await settingsRepo.get('onboarding.done'))) return 'notReady';
    if (backup.restoring()) return 'restoring';
    const state = await settingsRepo.get('backup.autoState');
    const lastAt = await settingsRepo.get('backup.lastAt');
    const every = await settingsRepo.get('backup.autoEvery');
    const newest = lastAt === null ? state.lastAt : Math.max(lastAt, state.lastAt ?? lastAt);
    if (!isAutoBackupDue(newest, every, clock.now())) return 'notDue';

    show({ running: true });
    // Android 8–10 ask by themselves only once; after that only when the person acts.
    let asked = false;
    if ((await folder.access(false)) === 'denied') {
      if (!options.ask && state.asked) return failed('denied', false);
      asked = true;
      if ((await folder.access(true)) === 'denied') return failed('denied', true);
    }

    const made = await backup.make();
    if (!made.ok) return failed(MADE_PROBLEMS[made.error], asked);
    // Checked again after waiting: an erase, or the switch turned off, while the file was made.
    if (!backup.isCurrent(made.value)) return 'invalidated';
    if (!(await settingsRepo.get('backup.auto'))) return 'off';

    const { madeAt, file } = made.value;
    const before = await listing();
    const ours = new Set(state.files.map((record) => record.name));
    const name = freeName(madeAt, new Set(before?.keys() ?? []), ours);
    try {
      await folder.write(name, file);
    } catch (error) {
      report('the automatic backup could not be written', error);
      return failed(writeProblem(error), asked);
    }
    if (!backup.isCurrent(made.value)) return 'invalidated';

    const record: AutoBackupRecord = { name, madeAt };
    await changeState((current) => ({
      files: [record, ...current.files.filter((other) => other.name !== name)].sort(
        (a, b) => b.madeAt - a.madeAt,
      ),
      lastAt: madeAt,
      problem: null,
      asked: current.asked || asked,
    }));
    // The file is saved and recorded: what follows cannot turn it into a failure.
    await settingsRepo.set('backup.lastAt', madeAt).catch((error: unknown) => {
      report('the backup time could not be saved', error);
    });
    const written: FolderFile = { name, size: file.size, modifiedAt: madeAt };
    await prune(before ? new Map(before).set(name, written) : null).catch((error: unknown) => {
      report('old automatic backups could not be pruned', error);
    });
    return 'written';
  }

  async function refresh(): Promise<void> {
    try {
      const { files } = await settingsRepo.get('backup.autoState');
      const inFolder = await listing();
      const listed = files.flatMap((record): AutoBackupFile[] => {
        const there = inFolder?.get(record.name);
        return there ? [{ name: record.name, madeAt: record.madeAt, size: there.size }] : [];
      });
      show({ files: listed });
    } catch (error) {
      report('the automatic backups could not be listed', error);
      show({ files: [] });
    }
  }

  async function check(options: CheckOptions = {}): Promise<AutoBackupOutcome> {
    if (checking) return 'busy';
    checking = true;
    let outcome: AutoBackupOutcome = 'failed';
    try {
      outcome = await run(options);
    } catch (error) {
      report('the automatic backup failed', error);
      await failed('failed', false).catch((cause: unknown) => {
        report('the automatic backup failure could not be stored', cause);
      });
    } finally {
      checking = false;
      if (status.running) show({ running: false });
    }
    if (outcome === 'written') await refresh();
    return outcome;
  }

  return {
    start() {
      void check();
      return visibility.subscribe(() => {
        if (visibility.isVisible()) void check();
      });
    },

    check,

    async setOn(on) {
      await settingsRepo.set('backup.auto', on);
      if (on) await check({ ask: true });
    },

    async setEvery(every) {
      await settingsRepo.set('backup.autoEvery', every);
      await check();
    },

    refresh,

    async open(name) {
      try {
        const { files } = await settingsRepo.get('backup.autoState');
        if (!files.some((record) => record.name === name)) return err('missing');
        return ok(await folder.read(name));
      } catch (error) {
        report('an automatic backup could not be read', error);
        void refresh();
        const problem = folderProblemOf(error);
        return err(problem === 'missing' || problem === 'denied' ? problem : 'failed');
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot: () => status,
  };
}
