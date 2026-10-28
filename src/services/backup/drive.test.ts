// @vitest-environment node
// Node's own Blob, File and Response here, as in the other backup tests.
//
// The Google Drive copies over the real backup service and settings on a test database, the
// in-memory Drive and the fake sign-in plugin of `testing/fakeDrive.ts`, and a clock the test
// moves. Tests run in America/New_York: Monday 26 October 2026, 12:30.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettingsRepo, type SettingsRepo } from '../../data/repos/settingsRepo';
import type { PlatewiseDb } from '../../data/schema';
import type { DriveBackupState } from '../../data/settingsSchema';
import type { Clock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import { createAutoBackup } from './auto';
import { DRIVE_BACKUPS_KEPT, createDriveBackup, type DriveBackupDeps } from './drive';
import { DRIVE_TRANSFER_TIMEOUT_MS, type DriveFetch } from './driveClient';
import type { DriveErrorCode } from './drivePlugin';
import type { BackupService, HeldBackup } from './service';
import { fakeDrive, fakeDrivePlugin, type FakeDrive } from './testing/fakeDrive';
import { fakeFolder } from './testing/fakeFolder';
import { seedStore, testBackupService } from './testing/seed';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NAME_NOW = 'platewise-backup-2026-10-26-1230.zip';
/** The install id the service makes for this phone, and another phone's. */
const THIS_PHONE = 'this-phone';
const OLD_PHONE = 'old-phone';

const opened: PlatewiseDb[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.close();
  vi.restoreAllMocks();
});

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
  /** Stored as connected (as after an earlier Connect), with this state. */
  readonly connected?: Partial<DriveBackupState>;
  /** Fills the store with a diary, photos and chat (`seedStore`). */
  readonly seeded?: boolean;
  /** The tokens the plugin hands out, in order. */
  readonly grants?: string[];
  /** Wraps the fake Drive's fetch (a held or failing request). */
  readonly fetch?: (drive: FakeDrive) => DriveFetch;
  /** Wraps the real backup service (a restore running, a count of backups made). */
  readonly wrap?: (real: BackupService) => DriveBackupDeps['backup'];
  /** Replaces the settings the service reads and writes. */
  readonly settings?: (real: SettingsRepo) => DriveBackupDeps['settingsRepo'];
}

async function rig(options: RigOptions = {}) {
  const { db } = await openTestDb();
  opened.push(db);
  let now = FACTORY_NOW;
  let online = true;
  const clock: Clock = { now: () => now, timeZone: () => 'America/New_York' };
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
  if (options.seeded) await seedStore(db);
  await settingsRepo.set('onboarding.done', options.onboarded ?? true);
  if (options.connected) {
    await settingsRepo.set('backup.drive', {
      connected: true,
      email: 'sam@example.com',
      lastUploadAt: null,
      problem: null,
      installId: null,
      ...options.connected,
    });
  }
  const backup = testBackupService(db, { clock, share: { download: () => undefined } });
  const drive = fakeDrive(clock);
  const plugin = fakeDrivePlugin(options.grants);
  const errors: string[] = [];
  /** A service as the app builds it at start-up (a fresh one is a restart). */
  const build = () =>
    createDriveBackup({
      plugin,
      fetch: options.fetch ? options.fetch(drive) : drive.fetch,
      backup: options.wrap ? options.wrap(backup) : backup,
      settingsRepo: options.settings ? options.settings(settingsRepo) : settingsRepo,
      clock,
      online: () => online,
      newId: () => THIS_PHONE,
      onError: (message) => errors.push(message),
    });
  const service = build();
  /** A backup made now, as Back up now makes it. */
  const made = async (): Promise<HeldBackup> => {
    const result = await backup.make();
    if (!result.ok) throw new Error(`no backup: ${result.error}`);
    return result.value;
  };
  return {
    db,
    backup,
    drive,
    plugin,
    service,
    settingsRepo,
    errors,
    build,
    made,
    clock,
    later(ms: number) {
      now += ms;
    },
    setOnline(value: boolean) {
      online = value;
    },
    state: () => settingsRepo.get('backup.drive'),
  };
}

async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  const [left, right] = [
    new Uint8Array(await a.arrayBuffer()),
    new Uint8Array(await b.arrayBuffer()),
  ];
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

/** Counts the backups the real service makes. */
function counting(real: BackupService) {
  const counter = { made: 0 };
  const wrapped: DriveBackupDeps['backup'] = {
    make: () => {
      counter.made++;
      return real.make();
    },
    restoring: () => real.restoring(),
    isCurrent: (held) => real.isCurrent(held),
  };
  return { counter, wrapped };
}

describe('Google Drive copies: connecting (P15-04)', () => {
  it('connects through Google’s own screens, stores the account and uploads nothing yet', async () => {
    const s = await rig();

    expect(await s.service.connect()).toBe('connected');
    await s.service.refresh();

    expect(s.plugin.calls).toEqual(['authorize interactive']);
    expect(await s.state()).toEqual({
      connected: true,
      email: 'sam@example.com',
      lastUploadAt: null,
      problem: null,
      installId: null,
    });
    expect(s.drive.backups()).toEqual([]);
    expect(s.service.getSnapshot()).toEqual({ uploading: false, files: [], listProblem: null });
  });

  it('reads the account from Drive when Google signed in without naming it', async () => {
    const s = await rig();
    s.plugin.email = null;
    s.drive.accountEmail = 'alex@example.com';

    expect(await s.service.connect()).toBe('connected');

    expect((await s.state()).email).toBe('alex@example.com');
    expect(s.drive.log).toContain('about');
  });

  it.each([
    ['notConfigured', 'notConfigured'],
    ['cancelled', 'cancelled'],
    ['unavailable', 'unavailable'],
    ['unknown', 'failed'],
  ] as const)(
    'says why Google refused (%s) and stays disconnected',
    async (code: DriveErrorCode, outcome) => {
      const s = await rig();
      s.plugin.refuse = code;

      expect(await s.service.connect()).toBe(outcome);

      expect((await s.state()).connected).toBe(false);
      expect(s.drive.log).toEqual([]);
    },
  );

  it('disconnects: signs out of Google, forgets the account and leaves the copies in Drive', async () => {
    const s = await rig({ connected: { lastUploadAt: FACTORY_NOW - HOUR } });
    await s.service.afterBackup(await s.made());

    await s.service.disconnect();

    expect(s.plugin.calls).toContain('signOut');
    // The install keeps its id: its copies in Drive stay its own.
    expect(await s.state()).toEqual({
      connected: false,
      email: null,
      lastUploadAt: null,
      problem: null,
      installId: THIS_PHONE,
    });
    expect(s.service.getSnapshot().files).toBeNull();
    expect(s.drive.backups()).toHaveLength(1);
    expect(await s.service.afterBackup(await s.made())).toBe('notConnected');
  });

  it('sends a copy still owed when the person connects again', async () => {
    const s = await rig({ connected: { problem: { kind: 'signIn', at: FACTORY_NOW - HOUR } } });
    s.plugin.refuseSilent = 'cancelled';
    expect(await s.service.afterCheck(null)).toBe('failed');
    s.plugin.refuseSilent = null;

    expect(await s.service.connect()).toBe('connected');
    // Queued behind the retry Connect started: by then nothing is owed.
    expect(await s.service.afterCheck(null)).toBe('notNeeded');

    expect(s.drive.backups()).toHaveLength(1);
    expect((await s.state()).problem).toBeNull();
  });
});

describe('Google Drive copies: uploads (P15-04, D-16.97)', () => {
  it('copies a backup made by Back up now into Drive, and lists it (ACC-M16-1)', async () => {
    const s = await rig({ connected: {}, seeded: true });
    const backup = await s.made();

    expect(await s.service.afterBackup(backup)).toBe('uploaded');

    const [stored] = s.drive.backups();
    expect(stored?.name).toBe(NAME_NOW);
    expect(await sameBytes(stored!.data, backup.file)).toBe(true);
    expect(await s.state()).toMatchObject({ lastUploadAt: FACTORY_NOW, problem: null });
    expect(s.service.getSnapshot().files).toEqual([
      {
        id: stored!.id,
        name: NAME_NOW,
        size: backup.file.size,
        createdAt: stored!.createdAt,
        install: THIS_PHONE,
      },
    ]);
  });

  it('uploads nothing while Google Drive is not connected', async () => {
    const s = await rig();

    expect(await s.service.afterBackup(await s.made())).toBe('notConnected');
    expect(await s.service.uploadNow()).toBe('notConnected');
    expect(await s.service.afterCheck(null)).toBe('notConnected');

    expect(s.drive.log).toEqual([]);
    expect(s.plugin.calls).toEqual([]);
  });

  it('copies the file an automatic backup wrote, without making another (onChecked, ACC-M16-1)', async () => {
    const s = await rig({ connected: {}, seeded: true });
    const { counter, wrapped } = counting(s.backup);
    const folder = fakeFolder(s.clock);
    let copied: Promise<unknown> = Promise.resolve();
    const service = createDriveBackup({
      plugin: s.plugin,
      fetch: s.drive.fetch,
      backup: wrapped,
      settingsRepo: s.settingsRepo,
      clock: s.clock,
      onError: () => undefined,
    });
    const auto = createAutoBackup({
      backup: wrapped,
      folder,
      settingsRepo: s.settingsRepo,
      clock: s.clock,
      visibility: { isVisible: () => true, subscribe: () => () => undefined },
      onError: () => undefined,
      onChecked: (written) => {
        copied = service.afterCheck(written);
      },
    });

    expect(await auto.check()).toBe('written');
    expect(await copied).toBe('uploaded');

    expect(counter.made).toBe(1);
    const [stored] = s.drive.backups();
    expect(stored?.name).toBe(NAME_NOW);
    expect(await sameBytes(stored!.data, await folder.read(NAME_NOW))).toBe(true);
  });

  it('keeps this phone’s newest 7 copies and never deletes a file it did not make (ACC-M16-2)', async () => {
    const s = await rig({ connected: { installId: THIS_PHONE } });
    const earlier = Array.from({ length: DRIVE_BACKUPS_KEPT }, (_, i) =>
      s.drive.put({
        name: `platewise-backup-2026-10-${String(19 + i)}-0900.zip`,
        appProperties: { platewise: 'backup', platewiseInstall: THIS_PHONE },
        createdAt: FACTORY_NOW - (DRIVE_BACKUPS_KEPT - i) * 24 * HOUR,
      }),
    );
    const theirs = s.drive.put({ name: 'platewise-backup-2026-10-01-0900.zip', byApp: false });
    const untagged = s.drive.put({ name: 'notes.zip', createdAt: 0 });

    expect(await s.service.afterBackup(await s.made())).toBe('uploaded');

    const kept = s.drive.backups();
    expect(kept).toHaveLength(DRIVE_BACKUPS_KEPT);
    expect(kept[0]?.name).toBe(NAME_NOW);
    expect(kept[0]?.appProperties).toEqual({ platewise: 'backup', platewiseInstall: THIS_PHONE });
    expect(kept.map((file) => file.id)).not.toContain(earlier[0]!.id);
    expect(s.drive.files.has(theirs.id)).toBe(true);
    expect(s.drive.files.has(untagged.id)).toBe(true);
  });

  it('a new phone’s uploads never push out the old phone’s copies (ACC-M16-2)', async () => {
    const s = await rig({ connected: {} });
    const oldPhone = Array.from({ length: DRIVE_BACKUPS_KEPT }, (_, i) =>
      s.drive.put({
        name: `platewise-backup-2026-10-${String(12 + i)}-0900.zip`,
        appProperties: { platewise: 'backup', platewiseInstall: OLD_PHONE },
        createdAt: FACTORY_NOW - (14 - i) * 24 * HOUR,
      }),
    );
    const noInstall = s.drive.put({
      name: 'platewise-backup-2026-10-01-0900.zip',
      appProperties: { platewise: 'backup' },
      createdAt: FACTORY_NOW - 30 * 24 * HOUR,
    });

    for (let upload = 0; upload < DRIVE_BACKUPS_KEPT + 2; upload++) {
      s.later(HOUR);
      expect(await s.service.afterBackup(await s.made())).toBe('uploaded');
    }

    const left = s.drive.backups();
    const mine = left.filter((file) => file.appProperties.platewiseInstall === THIS_PHONE);
    expect(mine).toHaveLength(DRIVE_BACKUPS_KEPT);
    expect(oldPhone.every((file) => s.drive.files.has(file.id))).toBe(true);
    expect(s.drive.files.has(noInstall.id)).toBe(true);
    // The list shows every copy, this phone's and the old phone's, newest first.
    expect(s.service.getSnapshot().files).toHaveLength(2 * DRIVE_BACKUPS_KEPT + 1);
    expect((await s.state()).installId).toBe(THIS_PHONE);
  });

  it('makes this install’s id once, keeps it through Disconnect, and stamps every copy with it', async () => {
    let made = 0;
    const s = await rig({ connected: {} });
    const service = createDriveBackup({
      plugin: s.plugin,
      fetch: s.drive.fetch,
      backup: s.backup,
      settingsRepo: s.settingsRepo,
      clock: s.clock,
      newId: () => `install-${++made}`,
      onError: () => undefined,
    });

    expect(await service.afterBackup(await s.made())).toBe('uploaded');
    await service.disconnect();
    expect(await service.connect()).toBe('connected');
    s.later(MINUTE);
    expect(await service.afterBackup(await s.made())).toBe('uploaded');

    expect(made).toBe(1);
    expect((await s.state()).installId).toBe('install-1');
    expect(s.drive.backups().map((file) => file.appProperties.platewiseInstall)).toEqual([
      'install-1',
      'install-1',
    ]);
  });

  it('runs one upload at a time, in the order they were asked for', async () => {
    const gate = held<void>();
    const reached = held<void>();
    const s = await rig({
      connected: {},
      fetch: (drive) => async (url, init) => {
        if (url.includes('uploadType=multipart') && drive.backups().length === 0) {
          reached.release();
          await gate.promise;
        }
        return drive.fetch(url, init);
      },
    });
    const first = await s.made();
    s.later(MINUTE);
    const second = await s.made();

    const both = [s.service.afterBackup(first), s.service.afterBackup(second)];
    await reached.promise;
    expect(s.service.getSnapshot().uploading).toBe(true);
    expect(s.drive.log.filter((line) => line.startsWith('multipart'))).toEqual([]);

    gate.release();
    expect(await Promise.all(both)).toEqual(['uploaded', 'uploaded']);
    expect(
      s.drive
        .backups()
        .map((file) => file.name)
        .reverse(),
    ).toEqual([NAME_NOW, 'platewise-backup-2026-10-26-1231.zip']);
    expect(s.service.getSnapshot().uploading).toBe(false);
  });

  it('refreshes the token once when Drive refuses it, then sends (ACC-M16-3)', async () => {
    const s = await rig({ connected: {}, grants: ['expired', 'token-1'] });

    expect(await s.service.afterBackup(await s.made())).toBe('uploaded');

    expect(s.plugin.calls).toEqual(['authorize silent', 'authorize silent']);
    expect(s.drive.backups()).toHaveLength(1);
  });

  it('Upload now makes a backup, sends it and counts it as the last backup', async () => {
    const s = await rig({ connected: {}, seeded: true });

    expect(await s.service.uploadNow()).toBe('uploaded');

    expect(s.drive.backups().map((file) => file.name)).toEqual([NAME_NOW]);
    expect(await s.settingsRepo.get('backup.lastAt')).toBe(FACTORY_NOW);
    const checked = await s.backup.inspect(s.drive.backups()[0]!.data);
    expect(checked.ok && checked.value.summary).toMatchObject({ entries: 2, photos: 2 });
  });

  it('sends nothing before setup is finished or while a restore runs', async () => {
    const notReady = await rig({ connected: {}, onboarded: false });
    expect(await notReady.service.uploadNow()).toBe('notReady');

    const restoring = await rig({
      connected: {},
      wrap: (real) => ({ ...real, restoring: () => true }),
    });
    expect(await restoring.service.uploadNow()).toBe('restoring');

    expect(notReady.drive.log).toEqual([]);
    expect(restoring.drive.log).toEqual([]);
  });

  it('connecting on Welcome sends nothing: the phone holds no setup yet', async () => {
    const s = await rig({ onboarded: false });

    expect(await s.service.connect()).toBe('connected');
    expect(await s.service.afterCheck(null)).toBe('notNeeded');

    expect(s.drive.backups()).toEqual([]);
  });

  it('neither sends nor records a backup made before everything was erased (R06.5)', async () => {
    const s = await rig({ connected: {} });
    const before = await s.made();
    s.backup.invalidate();

    expect(await s.service.afterBackup(before)).toBe('invalidated');
    expect(s.drive.log).toEqual([]);

    // Erased while the copy goes up: it is not recorded.
    const erasing = await rig({
      connected: {},
      fetch: (drive) => async (url, init) => {
        if (url.includes('uploadType=multipart')) erasing.backup.invalidate();
        return drive.fetch(url, init);
      },
    });
    const made = await erasing.backup.make();
    if (!made.ok) throw new Error(made.error);
    expect(await erasing.service.afterBackup(made.value)).toBe('invalidated');
    expect((await erasing.state()).lastUploadAt).toBeNull();
  });
});

describe('Google Drive copies: failures and retries (P15-04)', () => {
  it('keeps an offline failure as the status, and the next start sends a fresh backup (ACC-M16-3)', async () => {
    const s = await rig({ connected: {}, seeded: true });
    s.drive.offline = true;

    expect(await s.service.afterBackup(await s.made())).toBe('failed');
    expect((await s.state()).problem).toEqual({ kind: 'offline', at: FACTORY_NOW });
    expect(s.drive.backups()).toEqual([]);

    // Back online an hour later: the app starts again and the automatic backup's check is done.
    s.drive.offline = false;
    s.later(HOUR);
    const restarted = s.build();
    expect(await restarted.afterCheck(null)).toBe('uploaded');

    expect(s.drive.backups().map((file) => file.name)).toEqual([
      'platewise-backup-2026-10-26-1330.zip',
    ]);
    expect(await s.state()).toMatchObject({ lastUploadAt: FACTORY_NOW + HOUR, problem: null });
    expect(await s.settingsRepo.get('backup.lastAt')).toBe(FACTORY_NOW + HOUR);
  });

  it('makes no backup to retry while there is no connection, or Google wants the person', async () => {
    const s = await rig({ connected: { problem: { kind: 'offline', at: FACTORY_NOW - HOUR } } });
    const { counter, wrapped } = counting(s.backup);
    let online = false;
    const service = createDriveBackup({
      plugin: s.plugin,
      fetch: s.drive.fetch,
      backup: wrapped,
      settingsRepo: s.settingsRepo,
      clock: s.clock,
      online: () => online,
      onError: () => undefined,
    });

    expect(await service.afterCheck(null)).toBe('failed');
    expect((await s.state()).problem).toEqual({ kind: 'offline', at: FACTORY_NOW });
    online = true;
    s.plugin.refuseSilent = 'cancelled';
    expect(await service.uploadNow()).toBe('failed');
    expect((await s.state()).problem).toEqual({ kind: 'signIn', at: FACTORY_NOW });

    expect(counter.made).toBe(0);
    expect(s.drive.log).toEqual([]);
  });

  it('retries nothing when the last copy went up', async () => {
    const s = await rig({ connected: {} });
    const { counter, wrapped } = counting(s.backup);
    const service = createDriveBackup({
      plugin: s.plugin,
      fetch: s.drive.fetch,
      backup: wrapped,
      settingsRepo: s.settingsRepo,
      clock: s.clock,
    });

    expect(await service.afterCheck(null)).toBe('notNeeded');
    expect(counter.made).toBe(0);
  });

  it('sends the written file, not a second backup, when a copy is owed at the same start', async () => {
    const s = await rig({ connected: { problem: { kind: 'offline', at: FACTORY_NOW - HOUR } } });
    const { counter, wrapped } = counting(s.backup);
    const service = createDriveBackup({
      plugin: s.plugin,
      fetch: s.drive.fetch,
      backup: wrapped,
      settingsRepo: s.settingsRepo,
      clock: s.clock,
    });
    const written = await s.made();

    expect(await service.afterCheck(written)).toBe('uploaded');
    expect(await service.afterCheck(null)).toBe('notNeeded');

    expect(counter.made).toBe(0);
    expect(s.drive.backups()).toHaveLength(1);
  });

  it('counts an upload that gets no answer in 120 s as a plain failure, retried next start', async () => {
    const reached = held<void>();
    let stall = true;
    const s = await rig({
      connected: {},
      fetch: (drive) => (url, init) => {
        if (!stall || !url.includes('uploadType=multipart')) return drive.fetch(url, init);
        reached.release();
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      },
    });
    const backup = await s.made();
    // IndexedDB here runs on setImmediate, which stays real; the request's timer is fake.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const uploading = s.service.afterBackup(backup);
    await reached.promise;
    await vi.advanceTimersByTimeAsync(DRIVE_TRANSFER_TIMEOUT_MS);
    expect(await uploading).toBe('failed');
    vi.useRealTimers();

    expect((await s.state()).problem).toEqual({ kind: 'failed', at: FACTORY_NOW });
    stall = false;
    expect(await s.service.afterCheck(null)).toBe('uploaded');
    expect((await s.state()).problem).toBeNull();
  });

  it('says the Drive is full', async () => {
    const s = await rig({ connected: {} });
    s.drive.quotaBytes = 10;

    expect(await s.service.afterBackup(await s.made())).toBe('failed');

    expect((await s.state()).problem).toEqual({ kind: 'quota', at: FACTORY_NOW });
  });

  it('asks to connect again when Drive refuses the refreshed token as well', async () => {
    const s = await rig({ connected: {} });
    s.drive.token = 'a token Google no longer accepts';

    expect(await s.service.afterBackup(await s.made())).toBe('failed');

    expect((await s.state()).problem).toEqual({ kind: 'signIn', at: FACTORY_NOW });
    expect(s.plugin.calls).toEqual(['authorize silent', 'authorize silent']);
  });

  it.each([
    ['cancelled', 'signIn'],
    ['notConfigured', 'signIn'],
    ['unavailable', 'failed'],
    ['unknown', 'failed'],
  ] as const)(
    'stores a silent sign-in Google refused (%s) as %s, and offline without a connection',
    async (code: DriveErrorCode, kind) => {
      const s = await rig({ connected: {} });
      s.plugin.refuseSilent = code;

      expect(await s.service.afterBackup(await s.made())).toBe('failed');
      expect((await s.state()).problem?.kind).toBe(kind);

      s.setOnline(false);
      expect(await s.service.afterBackup(await s.made())).toBe('failed');
      expect((await s.state()).problem?.kind).toBe('offline');
      expect(s.drive.log).toEqual([]);
    },
  );

  it('keeps a backup that could not be made as a failure', async () => {
    const s = await rig({
      connected: {},
      wrap: (real) => ({ ...real, make: async () => ({ ok: false, error: 'photoUnreadable' }) }),
    });

    expect(await s.service.uploadNow()).toBe('failed');

    expect((await s.state()).problem).toEqual({ kind: 'failed', at: FACTORY_NOW });
  });

  it('never rejects, even when the settings cannot be read', async () => {
    const s = await rig({
      connected: {},
      settings: (real) => ({
        ...real,
        get: async () => {
          throw new Error('the database is gone');
        },
      }),
    });

    expect(await s.service.afterBackup(await s.made())).toBe('failed');
    expect(await s.service.uploadNow()).toBe('failed');
    await expect(s.service.refresh()).resolves.toBeUndefined();
    expect(s.service.getSnapshot().uploading).toBe(false);
  });
});

describe('Google Drive copies: the list and restoring from it (P15-04)', () => {
  it('downloads a listed copy for the restore check, and refuses one it did not list (ACC-M16-4)', async () => {
    const s = await rig({ connected: {}, seeded: true });
    await s.service.afterBackup(await s.made());
    const [listed] = s.service.getSnapshot().files ?? [];

    const opened = await s.service.open(listed!.id);
    if (!opened.ok) throw new Error(opened.error);
    expect(opened.value.name).toBe(NAME_NOW);
    const checked = await s.backup.inspect(opened.value);
    expect(checked.ok && checked.value.summary).toMatchObject({ madeAt: FACTORY_NOW, entries: 2 });

    expect(await s.service.open('not-listed')).toEqual({ ok: false, error: 'missing' });
  });

  it('says why a listed copy could not be downloaded, and lists again', async () => {
    const s = await rig({ connected: {} });
    await s.service.afterBackup(await s.made());
    const [listed] = s.service.getSnapshot().files ?? [];

    s.drive.offline = true;
    expect(await s.service.open(listed!.id)).toEqual({ ok: false, error: 'offline' });
    s.drive.offline = false;
    s.drive.files.delete(listed!.id);
    expect(await s.service.open(listed!.id)).toEqual({ ok: false, error: 'missing' });

    await s.service.refresh();
    expect(s.service.getSnapshot().files).toEqual([]);
  });

  it('says why the list could not be read', async () => {
    const s = await rig({ connected: {} });
    s.drive.offline = true;

    await s.service.refresh();

    expect(s.service.getSnapshot()).toEqual({
      uploading: false,
      files: null,
      listProblem: 'offline',
    });
  });
});
