// @vitest-environment node
// Node's own Blob and File here, as in the backup and restore tests.
//
// The automatic backup over the real backup service and settings on a test database, a folder
// in memory (`testing/fakeFolder.ts`) and a clock the test moves. Tests run in America/New_York:
// Monday 26 October 2026, 12:30.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettingsRepo, type SettingsRepo } from '../../data/repos/settingsRepo';
import type { PlatewiseDb } from '../../data/schema';
import type { Clock } from '../../lib/clock';
import { err, type Result } from '../../lib/result';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import type { PageVisibility } from '../reminders/engine';
import {
  AUTO_BACKUPS_KEPT,
  autoBackupFileName,
  createAutoBackup,
  isAutoBackupDue,
  type AutoBackupDeps,
  type AutoBackupService,
} from './auto';
import type { BackupProblem, BackupService, HeldBackup } from './service';
import { fakeFolder } from './testing/fakeFolder';
import { seedStore, testBackupService } from './testing/seed';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NAME_NOW = 'platewise-backup-2026-10-26-1230.zip';

const opened: PlatewiseDb[] = [];

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  vi.restoreAllMocks();
});

class FakeVisibility implements PageVisibility {
  visible = true;
  private readonly listeners = new Set<() => void>();

  isVisible = (): boolean => this.visible;

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  set(visible: boolean): void {
    this.visible = visible;
    for (const listener of [...this.listeners]) listener();
  }
}

/** A promise the test settles by hand. */
function held<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

interface RigOptions {
  /** A finished setup by default. */
  readonly onboarded?: boolean;
  /** Fills the store with a diary, photos and chat (`seedStore`). */
  readonly seeded?: boolean;
  /** The last backup by hand; none by default. */
  readonly lastAt?: number | null;
  /** Wraps the real backup service (a held or failing `make`, a restore running). */
  readonly wrap?: (real: BackupService) => Pick<BackupService, 'make' | 'restoring' | 'isCurrent'>;
  /** Replaces the settings the service reads and writes. */
  readonly settings?: (real: SettingsRepo) => AutoBackupDeps['settingsRepo'];
  /** Told after each check that ran (the Google Drive copy, P15-04). */
  readonly onChecked?: AutoBackupDeps['onChecked'];
}

async function rig(options: RigOptions = {}) {
  const { db } = await openTestDb();
  opened.push(db);
  let now = FACTORY_NOW;
  const clock: Clock = { now: () => now, timeZone: () => 'America/New_York' };
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
  if (options.seeded) await seedStore(db);
  await settingsRepo.set('onboarding.done', options.onboarded ?? true);
  await settingsRepo.set('backup.lastAt', options.lastAt ?? null);
  const backup = testBackupService(db, { clock, share: { download: () => undefined } });
  const folder = fakeFolder(clock);
  const visibility = new FakeVisibility();
  const errors: string[] = [];
  const service = createAutoBackup({
    backup: options.wrap ? options.wrap(backup) : backup,
    folder,
    settingsRepo: options.settings ? options.settings(settingsRepo) : settingsRepo,
    clock,
    visibility,
    onError: (message) => errors.push(message),
    onChecked: options.onChecked,
  });
  return {
    db,
    backup,
    folder,
    visibility,
    service,
    settingsRepo,
    errors,
    /** Moves the clock on by `ms`. */
    later(ms: number) {
      now += ms;
    },
    now: () => now,
    state: () => settingsRepo.get('backup.autoState'),
    lastAt: () => settingsRepo.get('backup.lastAt'),
  };
}

/** Holds the real service's `make` until the test releases it; `called` settles once it was asked. */
function makeHold() {
  const gate = held<void>();
  const asked = held<void>();
  return {
    called: asked.promise,
    release: () => gate.release(),
    wrap(real: BackupService): Pick<BackupService, 'make' | 'restoring' | 'isCurrent'> {
      return {
        make: async () => {
          const made = real.make();
          asked.release();
          await gate.promise;
          return made;
        },
        restoring: () => real.restoring(),
        isCurrent: (made) => real.isCurrent(made),
      };
    },
  };
}

/** Settles when the next run that got as far as making a file has ended. */
function nextRunEnd(service: AutoBackupService): Promise<void> {
  return new Promise((resolve) => {
    let started = false;
    const stop = service.subscribe(() => {
      const { running } = service.getSnapshot();
      if (running) started = true;
      else if (started) {
        stop();
        resolve();
      }
    });
  });
}

describe('isAutoBackupDue and autoBackupFileName (P14-01)', () => {
  it('is due with no backup, after a day or a week, and when the last one is in the future', () => {
    expect(isAutoBackupDue(null, 'daily', FACTORY_NOW)).toBe(true);
    expect(isAutoBackupDue(FACTORY_NOW - DAY + 1, 'daily', FACTORY_NOW)).toBe(false);
    expect(isAutoBackupDue(FACTORY_NOW - DAY, 'daily', FACTORY_NOW)).toBe(true);
    expect(isAutoBackupDue(FACTORY_NOW - 7 * DAY + 1, 'weekly', FACTORY_NOW)).toBe(false);
    expect(isAutoBackupDue(FACTORY_NOW - 7 * DAY, 'weekly', FACTORY_NOW)).toBe(true);
    expect(isAutoBackupDue(FACTORY_NOW + HOUR, 'weekly', FACTORY_NOW)).toBe(true);
  });

  it('names a file by the local day and minute, with -2, -3 for copies', () => {
    expect(autoBackupFileName(FACTORY_NOW)).toBe(NAME_NOW);
    expect(autoBackupFileName(FACTORY_NOW - 12 * HOUR - 25 * 60_000)).toBe(
      'platewise-backup-2026-10-26-0005.zip',
    );
    expect(autoBackupFileName(FACTORY_NOW, 2)).toBe('platewise-backup-2026-10-26-1230-2.zip');
  });
});

describe('automatic backup: when it runs (P14-01)', () => {
  it('saves the same file as Back up now into the folder and moves Last backup (ACC-K3-3)', async () => {
    const s = await rig({ seeded: true, lastAt: FACTORY_NOW - 30 * DAY });

    expect(await s.service.check()).toBe('written');

    expect(s.folder.names()).toEqual([NAME_NOW]);
    const written = await s.folder.read(NAME_NOW);
    const checked = await s.backup.inspect(written);
    if (!checked.ok) throw new Error(checked.error);
    expect(checked.value.summary).toMatchObject({ madeAt: FACTORY_NOW, entries: 2, photos: 2 });
    expect(await s.lastAt()).toBe(FACTORY_NOW);
    expect(await s.state()).toEqual({
      files: [{ name: NAME_NOW, madeAt: FACTORY_NOW }],
      lastAt: FACTORY_NOW,
      problem: null,
      asked: false,
    });
  });

  it('is due a day after the newest backup when Daily, and not before', async () => {
    const s = await rig();
    expect(await s.service.check()).toBe('written');

    s.later(DAY - 60_000);
    expect(await s.service.check()).toBe('notDue');
    s.later(60_000);
    expect(await s.service.check()).toBe('written');
    expect(s.folder.names()).toEqual([NAME_NOW, 'platewise-backup-2026-10-27-1230.zip']);
  });

  it('is due a week after the newest backup when Weekly, and not before', async () => {
    const s = await rig();
    await s.settingsRepo.set('backup.autoEvery', 'weekly');
    expect(await s.service.check()).toBe('written');

    s.later(6 * DAY);
    expect(await s.service.check()).toBe('notDue');
    s.later(DAY);
    expect(await s.service.check()).toBe('written');
    expect(s.folder.names()).toHaveLength(2);
  });

  it('counts a backup made by hand', async () => {
    const s = await rig({ lastAt: FACTORY_NOW - 2 * HOUR });

    expect(await s.service.check()).toBe('notDue');
    s.later(22 * HOUR);
    expect(await s.service.check()).toBe('written');
  });

  it('runs when the last backup is in the future, so a clock set back never stops backups', async () => {
    const s = await rig({ lastAt: FACTORY_NOW + 3 * DAY });

    expect(await s.service.check()).toBe('written');
    expect(await s.lastAt()).toBe(FACTORY_NOW);
  });

  it('does nothing while automatic backup is off', async () => {
    const s = await rig();
    await s.settingsRepo.set('backup.auto', false);

    expect(await s.service.check()).toBe('off');
    expect(s.folder.log).toEqual([]);
  });

  it('waits until setup is finished, so a fresh install never saves an empty backup', async () => {
    const s = await rig({ onboarded: false });

    expect(await s.service.check()).toBe('notReady');
    expect(s.folder.log).toEqual([]);
  });

  it('does not run while a restore is running or waiting', async () => {
    const s = await rig({ wrap: (real) => ({ ...real, restoring: () => true }) });

    expect(await s.service.check()).toBe('restoring');
    expect(s.folder.log).toEqual([]);
  });

  it('turns on, and checks at once when turned on or set to Daily', async () => {
    const s = await rig();
    await s.service.setOn(false);
    expect(await s.settingsRepo.get('backup.auto')).toBe(false);
    expect(s.folder.names()).toEqual([]);

    await s.service.setOn(true);
    expect(s.folder.names()).toEqual([NAME_NOW]);

    await s.service.setEvery('weekly');
    s.later(3 * DAY);
    expect(await s.service.check()).toBe('notDue');
    await s.service.setEvery('daily');
    expect(await s.settingsRepo.get('backup.autoEvery')).toBe('daily');
    expect(s.folder.names()).toHaveLength(2);
  });
});

describe('automatic backup: keeping 7 (P14-01)', () => {
  it('keeps the newest 7 it wrote and never deletes a file it did not write (ACC-K3-4)', async () => {
    const s = await rig();
    const others = [
      'notes.txt',
      'platewise-backup-2026-10-01.zip',
      'platewise-backup-2026-09-01-0800.zip',
    ];
    for (const name of others) s.folder.put(name);

    for (let day = 0; day < AUTO_BACKUPS_KEPT + 2; day++) {
      expect(await s.service.check()).toBe('written');
      s.later(DAY);
    }

    const ours = Array.from({ length: AUTO_BACKUPS_KEPT }, (_, index) =>
      autoBackupFileName(FACTORY_NOW + (index + 2) * DAY),
    );
    expect(s.folder.names()).toEqual([...others, ...ours].sort());
    expect((await s.state()).files.map((file) => file.name)).toEqual([...ours].reverse());
    expect(s.folder.log.filter((line) => line.startsWith('remove'))).toEqual([
      `remove ${autoBackupFileName(FACTORY_NOW)}`,
      `remove ${autoBackupFileName(FACTORY_NOW + DAY)}`,
    ]);
  });

  it('writes next to a file of the same name it did not write, never over it', async () => {
    const s = await rig();
    s.folder.put(NAME_NOW, 'the person’s own file');

    expect(await s.service.check()).toBe('written');

    expect(s.folder.names()).toEqual(['platewise-backup-2026-10-26-1230-2.zip', NAME_NOW]);
    expect(await s.folder.files.get(NAME_NOW)!.data.text()).toBe('the person’s own file');
    expect((await s.state()).files.map((file) => file.name)).toEqual([
      'platewise-backup-2026-10-26-1230-2.zip',
    ]);
  });

  it('forgets a file deleted in Files, and counts only the files still there', async () => {
    const s = await rig();
    for (let day = 0; day < AUTO_BACKUPS_KEPT; day++) {
      await s.service.check();
      s.later(DAY);
    }
    s.folder.files.delete(autoBackupFileName(FACTORY_NOW + 2 * DAY));
    s.folder.files.delete(autoBackupFileName(FACTORY_NOW + 4 * DAY));

    expect(await s.service.check()).toBe('written');

    expect(s.folder.log.filter((line) => line.startsWith('remove'))).toEqual([]);
    expect((await s.state()).files).toHaveLength(AUTO_BACKUPS_KEPT - 1);
  });

  it('keeps the name of a file it could not delete, and deletes it the next time', async () => {
    const s = await rig();
    for (let day = 0; day < AUTO_BACKUPS_KEPT; day++) {
      await s.service.check();
      s.later(DAY);
    }
    s.folder.failNext.set('remove', 'failed');

    expect(await s.service.check()).toBe('written');
    expect((await s.state()).files).toHaveLength(AUTO_BACKUPS_KEPT + 1);
    expect(s.folder.names()).toContain(NAME_NOW);

    s.later(DAY);
    expect(await s.service.check()).toBe('written');
    expect(s.folder.names()).not.toContain(NAME_NOW);
    expect((await s.state()).files).toHaveLength(AUTO_BACKUPS_KEPT);
  });

  it('prunes nothing when the folder cannot be listed, and forgets no name', async () => {
    const s = await rig();
    for (let day = 0; day < AUTO_BACKUPS_KEPT; day++) {
      await s.service.check();
      s.later(DAY);
    }
    s.folder.failNext.set('list', 'failed');

    expect(await s.service.check()).toBe('written');

    expect(s.folder.names()).toHaveLength(AUTO_BACKUPS_KEPT + 1);
    expect((await s.state()).files).toHaveLength(AUTO_BACKUPS_KEPT + 1);
  });
});

describe('automatic backup: failures (P14-01)', () => {
  it.each([
    ['no space', 'noSpace', 'noSpace'],
    ['access refused', 'denied', 'denied'],
    ['a write error', 'failed', 'failed'],
    ['a vanished folder', 'missing', 'failed'],
  ] as const)(
    'keeps %s as the problem, changes no Last backup, and tries again next time (ACC-K3-5)',
    async (_name, problem, kind) => {
      const s = await rig({ lastAt: FACTORY_NOW - 3 * DAY });
      s.folder.failNext.set('write', problem);

      expect(await s.service.check()).toBe('failed');

      expect(await s.state()).toMatchObject({ problem: { kind, at: FACTORY_NOW }, files: [] });
      expect(await s.lastAt()).toBe(FACTORY_NOW - 3 * DAY);
      expect(s.folder.names()).toEqual([]);

      s.later(HOUR);
      expect(await s.service.check()).toBe('written');
      expect(await s.state()).toMatchObject({ problem: null, lastAt: FACTORY_NOW + HOUR });
    },
  );

  it.each([
    ['photoUnreadable', 'photoUnreadable'],
    ['tooLarge', 'tooLarge'],
    ['insecure', 'failed'],
    ['failed', 'failed'],
  ] as const)('keeps a backup that could not be made (%s) as %s', async (problem, kind) => {
    const s = await rig({
      wrap: (real) => ({
        ...real,
        make: async (): Promise<Result<HeldBackup, BackupProblem>> => err(problem),
      }),
    });

    expect(await s.service.check()).toBe('failed');
    expect((await s.state()).problem).toEqual({ kind, at: FACTORY_NOW });
    expect(s.folder.log).toEqual([]);
  });

  it('asks Android for storage access once by itself, then only when the person turns it on', async () => {
    const s = await rig();
    s.folder.permission = 'denied';
    s.folder.answer = 'denied';

    expect(await s.service.check()).toBe('failed');
    expect(s.folder.asked).toBe(1);
    expect(await s.state()).toMatchObject({ problem: { kind: 'denied' }, asked: true });

    expect(await s.service.check()).toBe('failed');
    expect(s.folder.asked).toBe(1);

    s.folder.answer = 'granted';
    await s.service.setOn(true);
    expect(s.folder.asked).toBe(2);
    expect(s.folder.names()).toEqual([NAME_NOW]);
    expect(await s.state()).toMatchObject({ problem: null, asked: true });
  });

  it('never rejects, even when the settings cannot be read', async () => {
    const broken = new Error('the database is gone');
    const s = await rig({
      settings: () => ({
        get: () => Promise.reject(broken),
        set: () => Promise.reject(broken),
        update: () => Promise.reject(broken),
      }),
    });

    expect(await s.service.check()).toBe('failed');
    await expect(s.service.refresh()).resolves.toBeUndefined();
    expect(s.service.getSnapshot().files).toEqual([]);
    expect(s.errors.length).toBeGreaterThan(0);
  });
});

describe('automatic backup: one at a time (P14-01)', () => {
  it('runs one backup at a time and drops a trigger that comes during it', async () => {
    const hold = makeHold();
    const s = await rig({ wrap: hold.wrap });

    const first = s.service.check();
    expect(await s.service.check()).toBe('busy');
    await hold.called;
    expect(await s.service.check()).toBe('busy');
    hold.release();

    expect(await first).toBe('written');
    expect(s.folder.log.filter((line) => line.startsWith('write'))).toEqual([`write ${NAME_NOW}`]);
  });

  it('neither writes nor records a backup that started before everything was erased (R06.5)', async () => {
    const hold = makeHold();
    const s = await rig({ lastAt: FACTORY_NOW - 2 * DAY, wrap: hold.wrap });

    const running = s.service.check();
    await hold.called;
    s.backup.invalidate();
    hold.release();

    expect(await running).toBe('invalidated');
    expect(s.folder.names()).toEqual([]);
    expect(await s.lastAt()).toBe(FACTORY_NOW - 2 * DAY);
    expect((await s.state()).lastAt).toBeNull();
  });

  it('writes nothing when the switch goes off while the file is being made', async () => {
    const hold = makeHold();
    const s = await rig({ wrap: hold.wrap });

    const running = s.service.check();
    await hold.called;
    await s.settingsRepo.set('backup.auto', false);
    hold.release();

    expect(await running).toBe('off');
    expect(s.folder.names()).toEqual([]);
    expect(s.service.getSnapshot().running).toBe(false);
  });
});

describe('automatic backup: triggers and the card (P14-01)', () => {
  it('tells the Google Drive copy after each check that ran: the backup it wrote, or none (P15-04)', async () => {
    const seen: (number | null)[] = [];
    const s = await rig({ onChecked: (written) => seen.push(written?.madeAt ?? null) });

    const first = s.service.check();
    expect(await s.service.check()).toBe('busy');
    expect(await first).toBe('written');
    expect(await s.service.check()).toBe('notDue');
    await s.settingsRepo.set('backup.auto', false);
    expect(await s.service.check()).toBe('off');

    expect(seen).toEqual([FACTORY_NOW, null, null]);
  });

  it('checks when it starts and each time the app comes back to the front', async () => {
    const s = await rig();

    const started = nextRunEnd(s.service);
    const stop = s.service.start();
    await started;
    expect(s.folder.names()).toHaveLength(1);

    s.later(DAY);
    s.visibility.set(false);
    // Going to the background started nothing: this check is not refused as busy.
    expect(await s.service.check()).toBe('written');
    expect(s.folder.names()).toHaveLength(2);

    s.later(DAY);
    const returned = nextRunEnd(s.service);
    s.visibility.set(true);
    await returned;
    expect(s.folder.names()).toHaveLength(3);

    stop();
    s.later(DAY);
    s.visibility.set(true);
    expect(await s.service.check()).toBe('written');
    expect(s.folder.names()).toHaveLength(4);
  });

  it('lists the automatic backups still in the folder for the card, newest first, with their size', async () => {
    const s = await rig();
    s.folder.put('notes.txt');
    await s.service.check();
    s.later(DAY);
    await s.service.check();

    await s.service.refresh();

    const files = s.service.getSnapshot().files;
    expect(files?.map((file) => [file.name, file.madeAt])).toEqual([
      ['platewise-backup-2026-10-27-1230.zip', FACTORY_NOW + DAY],
      [NAME_NOW, FACTORY_NOW],
    ]);
    expect(files?.every((file) => file.size > 100)).toBe(true);
  });

  it('shows that a backup is being saved while it runs', async () => {
    const hold = makeHold();
    const s = await rig({ wrap: hold.wrap });
    const seen: boolean[] = [];
    s.service.subscribe(() => seen.push(s.service.getSnapshot().running));

    const running = s.service.check();
    await hold.called;
    expect(s.service.getSnapshot().running).toBe(true);
    hold.release();
    await running;

    expect(seen.slice(0, 2)).toEqual([true, false]);
    expect(s.service.getSnapshot().running).toBe(false);
  });

  it('reads a listed backup back for the restore check, and refuses a file it did not write (ACC-K3-6)', async () => {
    const s = await rig({ seeded: true, lastAt: null });
    s.folder.put('notes.txt');
    await s.service.check();

    const opened = await s.service.open(NAME_NOW);
    if (!opened.ok) throw new Error(opened.error);
    const checked = await s.backup.inspect(opened.value);
    expect(checked.ok && checked.value.summary.entries).toBe(2);

    expect(await s.service.open('notes.txt')).toEqual({ ok: false, error: 'missing' });
    s.folder.files.delete(NAME_NOW);
    expect(await s.service.open(NAME_NOW)).toEqual({ ok: false, error: 'missing' });
  });
});
