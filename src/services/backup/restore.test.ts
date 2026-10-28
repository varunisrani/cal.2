// @vitest-environment node
// Node's own Blob and File here: fake-indexeddb keeps them as blobs, so restored photos and
// thumbnails can be compared byte for byte.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackupRepo } from '../../data/repos/backupRepo';
import { createFastRepo } from '../../data/repos/fastRepo';
import { createPhotoRepo, RESTORING_FLAG } from '../../data/repos/photoRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import type { PlatewiseDb } from '../../data/schema';
import type { StorageEstimateResult } from '../../data/storage';
import { eraseEverything } from '../../data/wipe';
import { bytesOf, storableBlob } from '../../test/blobs';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry, makeFast, makePhoto } from '../../test/factories';
import { packBackup, unpackBackup } from './archive';
import { makeBackup } from './backup';
import { contentHash } from './hash';
import { decodeBlobs } from './payload';
import {
  PHOTO_ALLOWANCE_BYTES,
  RESERVE_BYTES,
  applyBackup,
  inspectBackup,
  type CheckedBackup,
} from './restore';
import { SEED_CLOCK, seedStore, storedTables } from './testing/seed';
import { writeZip } from './zip';

const HOUR = 3_600_000;
const opened: PlatewiseDb[] = [];

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function freshDb() {
  const test = await openTestDb();
  opened.push(test.db);
  return test;
}

/** Storage with this much free (or no estimate at all for null). */
function storageWith(free: number | null) {
  let room = free;
  return {
    estimate: async (): Promise<StorageEstimateResult | null> =>
      room === null ? null : { usage: 1_000, quota: 1_000 + room },
    set(next: number | null) {
      room = next;
    },
  };
}

const PLENTY = 1e12;

function applyDeps(db: PlatewiseDb, storage = storageWith(PLENTY), afterRestore?: () => void) {
  return {
    backupRepo: createBackupRepo(db),
    fastRepo: createFastRepo(db),
    photoRepo: createPhotoRepo(db, { clock: SEED_CLOCK }),
    storage,
    clock: SEED_CLOCK,
    ...(afterRestore ? { afterRestore } : {}),
  };
}

/** A backup file of a freshly seeded store, as a Node Blob (as a picked file would be read). */
async function seededBackup(change?: (db: PlatewiseDb) => Promise<void>) {
  const { db } = await freshDb();
  const seeded = await seedStore(db);
  await change?.(db);
  const made = await makeBackup({
    backupRepo: createBackupRepo(db),
    clock: SEED_CLOCK,
    appVersion: '0.1.0',
  });
  if (!made.ok) throw new Error(`no backup: ${made.error}`);
  return { db, file: made.value.file, seeded };
}

type Doc = {
  version: number;
  format: string;
  contentHash: string;
  payload: { tables: Record<string, unknown[]> };
};

/**
 * The file rewritten: `change` edits the document (and may drop photo files); the hash is taken
 * again unless `keepHash`, as a tool that knows the format would.
 */
async function rewrite(
  file: Blob,
  change: (doc: Doc, photos: { name: string; data: Blob }[]) => void,
  { keepHash = false } = {},
): Promise<Blob> {
  const unpacked = await unpackBackup(file);
  const doc = structuredClone(unpacked.document) as Doc;
  const photos = unpacked.photos.map((photo) => ({ name: photo.name, data: photo.data }));
  change(doc, photos);
  if (!keepHash) {
    doc.contentHash = await contentHash({
      tables: decodeBlobs(doc.payload.tables) as Record<string, unknown[]>,
      photos: photos.map((photo) => ({ name: photo.name, size: photo.data.size })),
    });
  }
  return packBackup({ document: doc, photos, madeAt: FACTORY_NOW });
}

async function checked(file: Blob, storage = storageWith(PLENTY)): Promise<CheckedBackup> {
  const result = await inspectBackup(file, { storage });
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

/** A store with data of its own, to show a refused file changes none of it. */
async function otherStore() {
  const test = await freshDb();
  await test.db.entries.put(makeEntry({ id: 'mine' }));
  await createSettingsRepo(test.db, { locale: 'en-US' }).set('display.accent', 'lagoon');
  return { ...test, before: await storedTables(test.db) };
}

describe('inspectBackup and applyBackup', () => {
  it('gives back identical tables after backup, erase everything and restore, and no keys (R06.6)', async () => {
    const source = await seededBackup();
    const before = await storedTables(source.db);
    const { factory, name, db } = await freshDb();
    await seedStore(db);
    const erased = await eraseEverything({
      db,
      indexedDB: factory,
      caches: null,
      localStorage: null,
    });
    expect(erased).toEqual({ status: 'erased' });
    const target = await openTestDb({ indexedDB: factory, name });
    opened.push(target.db);

    const result = await applyBackup(await checked(source.file), applyDeps(target.db));

    expect(result.ok).toBe(true);
    const after = await storedTables(target.db);
    for (const table of ['profile', 'entries', 'savedMeals', 'weighIns', 'bodyFat', 'water']) {
      expect(after[table], table).toEqual(before[table]);
    }
    expect(after.fasts).toEqual(before.fasts);
    expect(after.coachMessages).toEqual(before.coachMessages);
    expect(after.drafts).toEqual(before.drafts);
    // Photos keep their ids, bytes, sizes and times; thumbnails are rebuilt when shown.
    const withoutThumbs = (rows: unknown) =>
      (rows as Record<string, unknown>[]).map(({ thumb: _thumb, ...row }) => row);
    expect(withoutThumbs(after.photos)).toEqual(withoutThumbs(before.photos));
    // Settings: the backup's, without the device-local ones; the last backup is this one.
    const settingsOf = (rows: unknown) =>
      new Map((rows as { key: string; value: unknown }[]).map((row) => [row.key, row.value]));
    const restored = settingsOf(after.settings);
    const original = settingsOf(before.settings);
    original.delete('storage.persistAsked');
    original.set('backup.lastAt', FACTORY_NOW);
    expect(restored).toEqual(original);
    expect(await target.db.secrets.count()).toBe(0);
    expect(await target.db.quarantine.count()).toBe(0);
    expect(await target.db.meta.get(RESTORING_FLAG)).toBeUndefined();
  });

  it('shows what the file holds before anything changes (R06.8, ACC-K4-1)', async () => {
    const source = await seededBackup();
    const target = await otherStore();

    const result = await inspectBackup(source.file, { storage: storageWith(PLENTY) });

    expect(result.ok && result.value.summary).toEqual({
      madeAt: FACTORY_NOW,
      appVersion: '0.1.0',
      entries: 2,
      photos: 2,
      messages: 2,
      hasProfile: true,
      onboardingDone: true,
    });
    expect(await storedTables(target.db)).toEqual(target.before);
  });

  it('refuses a newer version, changing nothing (R06.6)', async () => {
    const source = await seededBackup();
    const target = await otherStore();
    const newer = await rewrite(source.file, (doc) => {
      doc.version = 2;
    });

    expect(await inspectBackup(newer, { storage: storageWith(PLENTY) })).toEqual({
      ok: false,
      error: 'newer',
    });
    expect(await storedTables(target.db)).toEqual(target.before);
  });

  it('refuses a damaged file, changing nothing (ACC-K4-2, R06.6)', async () => {
    const source = await seededBackup();
    const target = await otherStore();
    const bytes = new Uint8Array(await source.file.arrayBuffer());
    // A byte inside payload.json, right after its local header and name.
    bytes[30 + 'payload.json'.length + 20]! ^= 0xff;

    expect(await inspectBackup(new Blob([bytes]), { storage: storageWith(PLENTY) })).toEqual({
      ok: false,
      error: 'damaged',
    });
    expect(await storedTables(target.db)).toEqual(target.before);
  });

  it.each([
    ['a file that is no ZIP', async () => new Blob(['just some text, not a backup'])],
    [
      'a ZIP without a backup document',
      async () =>
        writeZip([{ name: 'notes.json', data: new TextEncoder().encode('{}') }], {
          modifiedAt: FACTORY_NOW,
        }),
    ],
    [
      'another app’s document',
      async () => packBackup({ document: { format: 'other-app' }, photos: [], madeAt: 0 }),
    ],
  ])('refuses %s as not a backup', async (_, make) => {
    expect(await inspectBackup(await make(), { storage: storageWith(PLENTY) })).toEqual({
      ok: false,
      error: 'notBackup',
    });
  });

  it.each<[string, (doc: Doc, photos: { name: string; data: Blob }[]) => void, boolean]>([
    [
      'a row that cannot be read',
      (doc) => {
        (doc.payload.tables.entries![0] as Record<string, unknown>).loggedAt = 'noon';
      },
      false,
    ],
    [
      'a changed value the hash does not cover',
      (doc) => {
        (doc.payload.tables.entries![0] as Record<string, unknown>).kcal = 999;
      },
      true,
    ],
    [
      'a listed photo missing from the archive',
      (_, photos) => {
        photos.pop();
      },
      false,
    ],
    [
      'two entries under one id',
      (doc) => {
        doc.payload.tables.entries!.push(doc.payload.tables.entries![0]);
      },
      false,
    ],
    [
      'a table that is not a list',
      (doc) => {
        (doc.payload.tables as Record<string, unknown>).water = { id: 'water-1' };
      },
      true,
    ],
  ])('refuses %s as damaged, changing nothing', async (_, change, keepHash) => {
    const source = await seededBackup();
    const target = await otherStore();
    const bad = await rewrite(source.file, change, { keepHash });

    expect(await inspectBackup(bad, { storage: storageWith(PLENTY) })).toEqual({
      ok: false,
      error: 'damaged',
    });
    expect(await storedTables(target.db)).toEqual(target.before);
  });

  it('refuses for lack of storage before anything changes, and restores with exactly enough (R06.6)', async () => {
    const source = await seededBackup();
    const unpacked = await unpackBackup(source.file);
    const photoBytes = unpacked.photos.reduce((sum, photo) => sum + photo.size, 0);
    const needed = photoBytes + 2 * PHOTO_ALLOWANCE_BYTES + unpacked.documentBytes + RESERVE_BYTES;
    const target = await otherStore();

    expect(await inspectBackup(source.file, { storage: storageWith(needed - 1) })).toEqual({
      ok: false,
      error: 'noSpace',
    });

    // Space can go between the confirmation and the restore: checked again first.
    const storage = storageWith(needed);
    const ready = await checked(source.file, storage);
    storage.set(needed - 1);
    expect(await applyBackup(ready, applyDeps(target.db, storage))).toEqual({
      ok: false,
      error: 'noSpace',
    });
    expect(await storedTables(target.db)).toEqual(target.before);
    expect(await target.db.meta.get(RESTORING_FLAG)).toBeUndefined();

    storage.set(needed);
    expect((await applyBackup(ready, applyDeps(target.db, storage))).ok).toBe(true);
    expect((await target.db.entries.toArray()).map((row) => row.id).sort()).toEqual([
      'entry-lunch',
      'entry-yoghurt',
    ]);
  });

  it('restores where the browser gives no storage estimate', async () => {
    const source = await seededBackup();
    const target = await otherStore();

    const ready = await checked(source.file, storageWith(null));

    expect((await applyBackup(ready, applyDeps(target.db, storageWith(null)))).ok).toBe(true);
  });

  it('leaves everything as it was, flag included, when a write inside the restore fails (R06.6)', async () => {
    const source = await seededBackup();
    const target = await otherStore();
    const ready = await checked(source.file);
    // The photos go in last: every table before them was already replaced in the transaction.
    target.db.photos.hook('creating', () => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await applyBackup(ready, applyDeps(target.db))).toEqual({ ok: false, error: 'failed' });
    expect(await storedTables(target.db)).toEqual(target.before);
    expect(await target.db.meta.get(RESTORING_FLAG)).toBeUndefined();
  });

  it('ends a fast that runs in the backup while fasting is off in it (R05.2)', async () => {
    const running = makeFast({ id: 'running', start: FACTORY_NOW - 5 * HOUR, end: null });
    const source = await seededBackup(async (db) => {
      await db.fasts.put(running);
    });
    const target = await otherStore();

    await applyBackup(await checked(source.file), applyDeps(target.db));

    expect(await target.db.fasts.get('running')).toEqual({ ...running, end: FACTORY_NOW });
  });

  it('keeps this device’s own settings and takes the backup’s time as the last backup', async () => {
    const source = await seededBackup();
    const target = await otherStore();
    const settings = createSettingsRepo(target.db, { locale: 'en-US' });
    await settings.set('storage.persistAsked', false);
    await settings.set('storage.nudgeDone', true);
    await settings.set('backup.lastAt', FACTORY_NOW + HOUR);

    await applyBackup(await checked(source.file), applyDeps(target.db));

    expect(await settings.get('storage.persistAsked')).toBe(false);
    expect(await settings.get('storage.nudgeDone')).toBe(true);
    expect(await settings.get('backup.lastAt')).toBe(FACTORY_NOW);
    expect(await settings.get('display.accent')).toBe('ember');
  });

  it('keeps this device’s automatic backup state, even from a file that carries one, and takes the switch and frequency from the backup (P14)', async () => {
    const source = await seededBackup(async (db) => {
      const settings = createSettingsRepo(db, { locale: 'en-US' });
      await settings.set('backup.auto', false);
      await settings.set('backup.autoEvery', 'weekly');
    });
    const crafted = await rewrite(source.file, (doc) => {
      doc.payload.tables.settings!.push({
        key: 'backup.autoState',
        value: { files: [{ name: 'platewise-backup-2026-01-01-0000.zip', madeAt: 1 }] },
      });
    });
    const target = await otherStore();
    const settings = createSettingsRepo(target.db, { locale: 'en-US' });
    const mine = {
      files: [{ name: 'platewise-backup-2026-10-25-0900.zip', madeAt: FACTORY_NOW - 27 * HOUR }],
      lastAt: FACTORY_NOW - 27 * HOUR,
      problem: null,
      asked: true,
    };
    await settings.set('backup.autoState', mine);

    expect((await applyBackup(await checked(crafted), applyDeps(target.db))).ok).toBe(true);

    expect(await settings.get('backup.autoState')).toEqual(mine);
    expect(await settings.get('backup.auto')).toBe(false);
    expect(await settings.get('backup.autoEvery')).toBe('weekly');
  });

  it('removes photos nothing uses afterwards, clears the flag and runs the follow-up', async () => {
    const source = await seededBackup();
    const target = await otherStore();
    await target.db.photos.put(
      makePhoto({ id: 'orphan', blob: await storableBlob(10), createdAt: FACTORY_NOW - 48 * HOUR }),
    );
    const afterRestore = vi.fn();

    await applyBackup(await checked(source.file), applyDeps(target.db, undefined, afterRestore));

    expect((await target.db.photos.toArray()).map((row) => row.id)).toEqual(
      [...source.seeded.photoIds].sort(),
    );
    expect(afterRestore).toHaveBeenCalledTimes(1);
    expect(await target.db.meta.get(RESTORING_FLAG)).toBeUndefined();
  });

  it('never writes keys, kept-aside rows or device state, even from a file that carries them', async () => {
    const source = await seededBackup();
    const target = await otherStore();
    const crafted = await rewrite(source.file, (doc) => {
      doc.payload.tables.secrets = [{ id: 'gemini', iv: [1], data: [2] }];
      doc.payload.tables.meta = [{ key: 'wrapKey', value: 'planted' }];
      doc.payload.tables.quarantine = [{ seq: 1, table: 'entries', key: 'x', raw: {} }];
      doc.payload.tables.settings!.push(
        { key: 'storage.persistAsked', value: true },
        { key: 'someday.setting', value: 1 },
      );
    });

    expect((await applyBackup(await checked(crafted), applyDeps(target.db))).ok).toBe(true);

    expect(await target.db.secrets.count()).toBe(0);
    expect(await target.db.meta.get('wrapKey')).toBeUndefined();
    expect(await target.db.quarantine.count()).toBe(0);
    const keys = (await target.db.settings.toArray()).map((row) => row.key);
    expect(keys).not.toContain('storage.persistAsked');
    expect(keys).not.toContain('someday.setting');
  });

  it('keeps a restored photo’s bytes and type, and its thumbnail is left to be rebuilt', async () => {
    const source = await seededBackup();
    const target = await otherStore();

    await applyBackup(await checked(source.file), applyDeps(target.db));

    const side = await target.db.photos.get(source.seeded.photoIds[1]!);
    expect(side?.blob.type).toBe('image/png');
    expect(await bytesOf(side!.blob)).toEqual(await bytesOf(await storableBlob(1_200, 90)));
    expect(side?.thumb).toBeUndefined();
  });

  it('drops a Coach thumbnail that is not a JPEG, PNG or WebP image, and keeps its message (S-6)', async () => {
    const source = await seededBackup();
    const target = await otherStore();
    const page = '<h1>Hello</h1><script>alert(1)</script>';
    let askedId = '';
    const crafted = await rewrite(source.file, (doc) => {
      const [asked, ...rest] = doc.payload.tables.coachMessages as Record<string, unknown>[];
      askedId = String(asked!.id);
      doc.payload.tables.coachMessages = [
        { ...asked, thumb: { '@blob': 'text/html', data: btoa(page) } },
        { ...asked, id: 'message-svg', thumb: { '@blob': 'image/svg+xml', data: btoa('<svg/>') } },
        { ...asked, id: 'message-webp', thumb: { '@blob': 'image/webp', data: 'AAEC' } },
        ...rest,
      ];
    });

    const result = await applyBackup(await checked(crafted), applyDeps(target.db));
    expect(result.ok && result.value.messages).toBe(4);

    const stored = new Map((await target.db.coachMessages.toArray()).map((row) => [row.id, row]));
    expect(stored.size).toBe(4);
    expect(stored.get(askedId)?.text).toBe('Was this lunch balanced?');
    expect(stored.get(askedId)).not.toHaveProperty('thumb');
    expect(stored.get('message-svg')).not.toHaveProperty('thumb');
    expect(stored.get('message-webp')?.thumb?.type).toBe('image/webp');
    expect(await bytesOf(stored.get('message-webp')!.thumb!)).toEqual([0, 1, 2]);
  });

  it('refuses on a page without WebCrypto, changing nothing', async () => {
    const source = await seededBackup();

    expect(
      await inspectBackup(source.file, { storage: storageWith(PLENTY), crypto: null }),
    ).toEqual({ ok: false, error: 'insecure' });
  });
});
