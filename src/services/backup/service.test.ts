// @vitest-environment node
// Node's own Blob and File here, as in the backup and restore tests.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackupRepo, type BackupRepo } from '../../data/repos/backupRepo';
import { createFastRepo } from '../../data/repos/fastRepo';
import { createPhotoRepo } from '../../data/repos/photoRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import type { PlatewiseDb } from '../../data/schema';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import type { ShareEnv } from './backup';
import { createBackupService } from './service';
import { SEED_CLOCK, seedStore } from './testing/seed';

const opened: PlatewiseDb[] = [];

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setup(wrap?: (real: BackupRepo) => BackupRepo) {
  const { db } = await openTestDb();
  opened.push(db);
  await seedStore(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
  const downloads: File[] = [];
  const share: ShareEnv = { download: (file) => downloads.push(file) };
  const estimate = vi.fn(async () => ({ usage: 0, quota: 1e12 }));
  const real = createBackupRepo(db);
  const service = createBackupService({
    backupRepo: wrap ? wrap(real) : real,
    settingsRepo,
    fastRepo: createFastRepo(db),
    photoRepo: createPhotoRepo(db),
    storage: { estimate },
    clock: SEED_CLOCK,
    appVersion: '0.1.0',
    share,
  });
  const lastAt = () => settingsRepo.get('backup.lastAt');
  return { db, service, downloads, estimate, lastAt };
}

describe('createBackupService', () => {
  it('makes a backup, hands it over and records its time; the same file then restores', async () => {
    const s = await setup();

    const made = await s.service.make();
    if (!made.ok) throw new Error(made.error);
    expect(await s.service.offer(made.value)).toBe('downloaded');
    expect(s.downloads.map((file) => file.name)).toEqual(['platewise-backup-2026-10-26.zip']);
    expect(await s.lastAt()).toBe(FACTORY_NOW);

    const checked = await s.service.inspect(made.value.file);
    if (!checked.ok) throw new Error(checked.error);
    expect(checked.value.summary.entries).toBe(2);
    expect((await s.service.apply(checked.value)).ok).toBe(true);
  });

  it('never offers or records a backup that started before everything was erased (R06.5)', async () => {
    const s = await setup();

    const making = s.service.make();
    s.service.invalidate();
    const made = await making;
    if (!made.ok) throw new Error(made.error);

    expect(await s.service.offer(made.value)).toBe('invalidated');
    expect(s.downloads).toEqual([]);
    expect(await s.lastAt()).toBe(FACTORY_NOW - 30 * 86_400_000);
  });

  it('records a backup made after an erase as usual', async () => {
    const s = await setup();
    s.service.invalidate();

    const made = await s.service.make();
    if (!made.ok) throw new Error(made.error);

    expect(await s.service.offer(made.value)).toBe('downloaded');
    expect(await s.lastAt()).toBe(FACTORY_NOW);
  });

  it('checks a file only after the backup being made has finished', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let reading = () => {};
    const reached = new Promise<void>((resolve) => (reading = resolve));
    const s = await setup((real) => ({
      ...real,
      async read(tables) {
        reading();
        await held;
        return real.read(tables);
      },
    }));

    const making = s.service.make();
    await reached;
    const checking = s.service.inspect(new Blob(['not a backup']));
    await Promise.resolve();
    const order: string[] = [];
    void making.then(() => order.push('made'));
    void checking.then(() => order.push('checked'));
    release();
    await Promise.all([making, checking]);

    expect(order).toEqual(['made', 'checked']);
  });

  it('reports a restore from the moment it is asked for until it settles (P14)', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const s = await setup((real) => ({
      ...real,
      async restore(plan) {
        await held;
        return real.restore(plan);
      },
    }));
    const made = await s.service.make();
    if (!made.ok) throw new Error(made.error);
    const checked = await s.service.inspect(made.value.file);
    if (!checked.ok) throw new Error(checked.error);
    expect(s.service.restoring()).toBe(false);

    const restoring = s.service.apply(checked.value);
    expect(s.service.restoring()).toBe(true);
    release();
    expect((await restoring).ok).toBe(true);

    expect(s.service.restoring()).toBe(false);
  });

  it('says whether a made backup is still current, false once everything was erased (P14, R06.5)', async () => {
    const s = await setup();
    const made = await s.service.make();
    if (!made.ok) throw new Error(made.error);
    expect(s.service.isCurrent(made.value)).toBe(true);

    s.service.invalidate();

    expect(s.service.isCurrent(made.value)).toBe(false);
  });
});
