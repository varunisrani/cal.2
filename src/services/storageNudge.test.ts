import { describe, expect, it, vi } from 'vitest';
import { createDiaryRepo } from '../data/repos/diaryRepo';
import { createPhotoRepo } from '../data/repos/photoRepo';
import { createSettingsRepo, type SettingsRepo } from '../data/repos/settingsRepo';
import { createStorageAccess, type StorageManagerLike } from '../data/storage';
import type { Clock } from '../lib/clock';
import { openTestDb, type TestDb } from '../test/db';
import { FACTORY_NOW, makeDraft } from '../test/factories';
import { createDiaryService, type LogContext } from './diary';
import {
  BACKUP_QUIET_KEY,
  createStorageNudge,
  localNudgeMemory,
  type Nudge,
  type NudgeMemory,
} from './storageNudge';

const DAY = 24 * 60 * 60 * 1000;
const LUNCH: LogContext = { loggedAt: FACTORY_NOW, meal: 'lunch', source: 'manual' };

/** A clock the test moves by hand. */
function manualClock(start = FACTORY_NOW) {
  let now = start;
  const clock: Clock = { now: () => now, timeZone: () => 'America/New_York' };
  return {
    clock,
    pass(ms: number) {
      now += ms;
    },
  };
}

/** A browser storage manager that grants (or refuses) persistence when asked. */
function fakeStorage(grant: boolean) {
  let persisted = false;
  return {
    persist: vi.fn(async () => {
      persisted = grant;
      return grant;
    }),
    persisted: vi.fn(async () => persisted),
  } satisfies StorageManagerLike;
}

/** `localStorage` as a map. */
function fakeLocalStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

async function settingsOn({ db, bus }: TestDb, clock: Clock): Promise<SettingsRepo> {
  const settings = createSettingsRepo(db, { locale: 'en-US', clock, bus });
  await settings.loaded;
  return settings;
}

interface SetUpOptions {
  readonly grant?: boolean;
  readonly installed?: boolean;
  /** Shared between "page loads" of one test. */
  readonly memory?: NudgeMemory;
  readonly opened?: TestDb;
}

async function setUp(options: SetUpOptions = {}) {
  const opened = options.opened ?? (await openTestDb());
  const time = manualClock();
  const settingsRepo = await settingsOn(opened, time.clock);
  const browser = fakeStorage(options.grant ?? false);
  const storage = createStorageAccess({ settings: settingsRepo, storage: browser });
  const local = fakeLocalStorage();
  const memory = options.memory ?? localNudgeMemory(() => local);
  const nudge = createStorageNudge({
    storage,
    settingsRepo,
    clock: time.clock,
    installed: () => options.installed ?? false,
    memory,
  });
  return { ...opened, opened, time, settingsRepo, browser, storage, local, memory, nudge };
}

type Setup = Awaited<ReturnType<typeof setUp>>;

/** Logs as the app does after the first entry, and waits for the request to finish. */
async function firstEntry(s: Setup): Promise<void> {
  await s.nudge.afterFirstEntry();
}

/** The card due now, drawn and then dismissed. */
async function drawAndDismiss(s: Setup): Promise<Nudge> {
  const due = await s.nudge.due();
  if (!due) throw new Error('a card should be due');
  s.nudge.shown(due);
  expect(await s.nudge.dismiss(due)).toBe(true);
  return due;
}

describe('createStorageNudge: the persistence request (D-16.8)', () => {
  it('asks the browser once, after the first logged entry, and not again after a reload (ACC-L4-1)', async () => {
    const s = await setUp({ grant: true });
    const afterFirstEntry = vi.fn(() => s.nudge.afterFirstEntry());
    const diary = createDiaryService({
      diaryRepo: createDiaryRepo(s.db),
      photoRepo: createPhotoRepo(s.db),
      onFirstEntry: afterFirstEntry,
    });
    expect(s.browser.persist).not.toHaveBeenCalled();

    await diary.logEntry(makeDraft(), LUNCH);
    await afterFirstEntry.mock.results[0]?.value;
    await diary.logEntry(makeDraft(), LUNCH);

    expect(afterFirstEntry).toHaveBeenCalledTimes(1);
    expect(s.browser.persist).toHaveBeenCalledTimes(1);
    expect(await s.settingsRepo.get('storage.persistAsked')).toBe(true);
    expect(await s.storage.persistenceStatus()).toBe('persistent');

    // The page loads again: a new diary service logs its own first entry.
    const again = await setUp({ grant: true, opened: s.opened, memory: s.memory });
    const reloaded = createDiaryService({
      diaryRepo: createDiaryRepo(s.db),
      photoRepo: createPhotoRepo(s.db),
      onFirstEntry: () => again.nudge.afterFirstEntry(),
    });
    await reloaded.logEntry(makeDraft(), LUNCH);
    await again.nudge.afterFirstEntry();
    expect(again.browser.persist).not.toHaveBeenCalled();
    s.db.close();
  });

  it('shows no card before anything was logged, and adds none in the visit of the first entry', async () => {
    const s = await setUp();
    const listener = vi.fn();
    s.nudge.subscribe(listener);
    expect(await s.nudge.check()).toBeNull();

    await firstEntry(s);

    // Home never gets a card pushed in mid-visit; the next visit's check brings it.
    expect(s.nudge.current()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    expect(await s.nudge.check()).toMatchObject({ kind: 'keepSafe' });
    expect(s.nudge.current()).toMatchObject({ kind: 'keepSafe' });
    expect(listener).toHaveBeenCalledTimes(1);
    s.db.close();
  });

  it('takes the card away on a dismissal and tells its listeners', async () => {
    const s = await setUp();
    await firstEntry(s);
    const card = await s.nudge.check();
    if (!card) throw new Error('keep safe should be due');
    const listener = vi.fn();
    const stop = s.nudge.subscribe(listener);

    s.nudge.shown(card);
    await s.nudge.dismiss(card);

    expect(s.nudge.current()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    expect(await s.nudge.check()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    s.db.close();
  });
});

describe('createStorageNudge: keep your diary safe (R06.19, R06.15)', () => {
  it.each([
    { grant: false, installed: false, due: { installed: false, persistence: 'best-effort' } },
    { grant: false, installed: true, due: { installed: true, persistence: 'best-effort' } },
    { grant: true, installed: false, due: { installed: false, persistence: 'persistent' } },
  ])(
    'is due with storage granted $grant and installed $installed',
    async ({ grant, installed, due }) => {
      const s = await setUp({ grant, installed });
      await firstEntry(s);

      expect(await s.nudge.due()).toEqual({ kind: 'keepSafe', ...due });
      s.db.close();
    },
  );

  it('is not due when storage is persistent and the app is installed', async () => {
    const s = await setUp({ grant: true, installed: true });
    await firstEntry(s);

    expect(await s.nudge.due()).toBeNull();
    expect(await s.settingsRepo.get('storage.nudgeDone')).toBe(false);
    s.db.close();
  });

  it('is not marked done when it was never drawn, so it comes back (R06.15)', async () => {
    const s = await setUp();
    await firstEntry(s);
    const due = await s.nudge.due();
    if (!due) throw new Error('keep safe should be due');

    expect(await s.nudge.dismiss(due)).toBe(false);

    expect(await s.settingsRepo.get('storage.nudgeDone')).toBe(false);
    expect(await s.nudge.due()).toMatchObject({ kind: 'keepSafe' });
    s.db.close();
  });

  it('is marked done once drawn and dismissed, and never shows again, after a reload too (R06.15)', async () => {
    const s = await setUp();
    await firstEntry(s);

    expect(await drawAndDismiss(s)).toMatchObject({ kind: 'keepSafe' });

    expect(await s.settingsRepo.get('storage.nudgeDone')).toBe(true);
    expect(await s.nudge.due()).toBeNull();
    const reloaded = await setUp({ opened: s.opened, memory: s.memory });
    expect(await reloaded.nudge.due()).toBeNull();
    s.db.close();
  });

  it('counts a dismissal only once, even when pressed twice', async () => {
    const s = await setUp();
    await firstEntry(s);
    const due = await drawAndDismiss(s);

    expect(await s.nudge.dismiss(due)).toBe(false);
    s.db.close();
  });
});

describe('createStorageNudge: time for a backup (R06.19)', () => {
  /** Keep safe already dismissed, so only the backup card is left to check. */
  async function keptSafe(options: SetUpOptions = {}) {
    const s = await setUp({ grant: true, installed: true, ...options });
    await firstEntry(s);
    return s;
  }

  it('is due 14 days after the last backup, not a day sooner, and not after a new backup', async () => {
    const s = await keptSafe();
    s.time.pass(30 * DAY);
    const lastAt = s.time.clock.now() - 13 * DAY;
    await s.settingsRepo.set('backup.lastAt', lastAt);
    expect(await s.nudge.due()).toBeNull();

    s.time.pass(DAY);
    expect(await s.nudge.due()).toEqual({ kind: 'backupDue', lastBackupAt: lastAt, days: 14 });

    await s.settingsRepo.set('backup.lastAt', s.time.clock.now());
    expect(await s.nudge.due()).toBeNull();
    s.db.close();
  });

  it('stays away for 14 days after it was dismissed', async () => {
    const s = await keptSafe();
    s.time.pass(30 * DAY);
    await s.settingsRepo.set('backup.lastAt', FACTORY_NOW);
    expect(await drawAndDismiss(s)).toMatchObject({ kind: 'backupDue', days: 30 });

    s.time.pass(14 * DAY - 1);
    expect(await s.nudge.due()).toBeNull();
    s.time.pass(1);
    expect(await s.nudge.due()).toMatchObject({ kind: 'backupDue', days: 44 });
    s.db.close();
  });

  it('reminds a diary that was never backed up 14 days after its first entry', async () => {
    const s = await keptSafe();
    expect(s.local.values.get(BACKUP_QUIET_KEY)).toBe(String(FACTORY_NOW));
    expect(await s.nudge.due()).toBeNull();

    s.time.pass(14 * DAY);
    expect(await s.nudge.due()).toEqual({ kind: 'backupDue', lastBackupAt: null, days: null });
    s.db.close();
  });

  it('starts the 14 days at the first check when the first entry came before this device kept the time', async () => {
    const s = await setUp({ grant: true, installed: true });
    await s.settingsRepo.set('storage.persistAsked', true);
    await s.settingsRepo.set('storage.nudgeDone', true);

    expect(await s.nudge.due()).toBeNull();
    expect(s.local.values.get(BACKUP_QUIET_KEY)).toBe(String(FACTORY_NOW));
    s.time.pass(14 * DAY);
    expect(await s.nudge.due()).toMatchObject({ kind: 'backupDue', lastBackupAt: null });
    s.db.close();
  });

  it('takes a backup time ahead of the clock (the clock moved back) as fresh', async () => {
    const s = await keptSafe();
    await s.settingsRepo.set('backup.lastAt', FACTORY_NOW + 40 * DAY);

    s.time.pass(20 * DAY);
    expect(await s.nudge.due()).toBeNull();
    s.db.close();
  });

  it('waits behind keep safe: one card at a time, and keep safe first', async () => {
    const s = await setUp();
    await firstEntry(s);
    s.time.pass(20 * DAY);

    expect(await drawAndDismiss(s)).toMatchObject({ kind: 'keepSafe' });
    // Keep safe has just said to back up: the backup card waits its 14 days from here.
    expect(await s.nudge.due()).toBeNull();
    s.time.pass(14 * DAY);
    expect(await s.nudge.due()).toMatchObject({ kind: 'backupDue' });
    s.db.close();
  });
});

describe('localNudgeMemory', () => {
  it('keeps the quiet time under its own app key', () => {
    const local = fakeLocalStorage();
    const memory = localNudgeMemory(() => local);
    expect(memory.read()).toBeNull();

    memory.write(FACTORY_NOW);

    expect(local.values.get(BACKUP_QUIET_KEY)).toBe(String(FACTORY_NOW));
    expect(BACKUP_QUIET_KEY.startsWith('platewise-')).toBe(true);
    expect(localNudgeMemory(() => local).read()).toBe(FACTORY_NOW);
  });

  it('keeps it in memory where the browser blocks storage, and ignores a damaged value', () => {
    const blocked = localNudgeMemory(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    blocked.write(FACTORY_NOW);
    expect(blocked.read()).toBe(FACTORY_NOW);

    const local = fakeLocalStorage();
    local.setItem(BACKUP_QUIET_KEY, 'soon');
    expect(localNudgeMemory(() => local).read()).toBeNull();
  });
});
