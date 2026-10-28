// @vitest-environment node
// Node's own Blob and File here: fake-indexeddb keeps them as blobs, and the backup's bytes can be
// read back exactly.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackupRepo, type BackupRepo } from '../../data/repos/backupRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import type { PlatewiseDb } from '../../data/schema';
import { bytesOf, storableBlob } from '../../test/blobs';
import { openTestDb } from '../../test/db';
import { createFakeCodec } from '../../test/fakeImageCodec';
import { FACTORY_NOW, makePhoto } from '../../test/factories';
import { unpackBackup } from './archive';
import {
  backupFileName,
  makeBackup,
  offerBackup,
  photoFileType,
  type MadeBackup,
  type ShareEnv,
} from './backup';
import { contentHash } from './hash';
import { BACKUP_TABLES, readFrame } from './payload';
import { KNOWN_KEY, SEED_CLOCK, seedStore } from './testing/seed';

const opened: PlatewiseDb[] = [];

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function freshDb(): Promise<PlatewiseDb> {
  const { db } = await openTestDb();
  opened.push(db);
  return db;
}

function deps(db: PlatewiseDb, backupRepo: Pick<BackupRepo, 'read'> = createBackupRepo(db)) {
  return { backupRepo, clock: SEED_CLOCK, appVersion: '0.1.0' };
}

async function made(db: PlatewiseDb): Promise<MadeBackup> {
  const result = await makeBackup(deps(db));
  if (!result.ok) throw new Error(`no backup: ${result.error}`);
  return result.value;
}

/** True when the bytes of `needle` occur in `haystack`. */
function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let start = 0; start + needle.length <= haystack.length; start++) {
    for (let index = 0; index < needle.length; index++) {
      if (haystack[start + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

describe('makeBackup', () => {
  it('makes one file with the diary, its photos and the Coach chat (ACC-K3-1)', async () => {
    const db = await freshDb();
    const { photoIds } = await seedStore(db);

    const backup = await made(db);
    const opened = await unpackBackup(backup.file);
    const framed = readFrame(opened.document);
    if (!framed.ok) throw new Error(framed.problem);
    const { frame } = framed;

    expect(backup.file.name).toBe('platewise-backup-2026-10-26.zip');
    expect(backup.file.type).toBe('application/zip');
    expect(backup.madeAt).toBe(FACTORY_NOW);
    expect(opened.document).toMatchObject({
      format: 'platewise-backup',
      version: 1,
      exportedAt: '2026-10-26T16:30:00.000Z',
      appVersion: '0.1.0',
    });
    expect(Object.keys(frame.tables).sort()).toEqual([...BACKUP_TABLES].sort());
    expect(frame.tables.entries!.map((row) => (row as { id: string }).id).sort()).toEqual([
      'entry-lunch',
      'entry-yoghurt',
    ]);
    const messages = frame.tables.coachMessages as { text: string; thumb?: Blob }[];
    expect(messages.map((message) => message.text)).toEqual([
      'Was this lunch balanced?',
      'Mostly: add some greens.',
    ]);
    expect(await bytesOf(messages[0]!.thumb!)).toEqual(await bytesOf(await storableBlob(400, 33)));
    expect(opened.photos.map((photo) => photo.name)).toEqual([
      `${photoIds[0]}.jpg`,
      `${photoIds[1]}.png`,
    ]);
    expect(await bytesOf(opened.photos[0]!.data)).toEqual(
      await bytesOf(await storableBlob(3_000, 7)),
    );
    expect(frame.tables.photos).toEqual([
      {
        id: photoIds[0],
        file: `${photoIds[0]}.jpg`,
        width: 1600,
        height: 1200,
        createdAt: FACTORY_NOW,
      },
      {
        id: photoIds[1],
        file: `${photoIds[1]}.png`,
        width: 800,
        height: 800,
        createdAt: FACTORY_NOW,
      },
    ]);
  });

  it('carries the hash of exactly the rows and photo files inside it', async () => {
    const db = await freshDb();
    await seedStore(db);

    const opened = await unpackBackup((await made(db)).file);
    const framed = readFrame(opened.document);
    if (!framed.ok) throw new Error(framed.problem);

    const photos = opened.photos.map(({ name, size }) => ({ name, size }));
    expect(framed.frame.contentHash).toBe(
      await contentHash({ tables: framed.frame.tables, photos }),
    );
  });

  it('never holds a key, the rows kept aside or this device’s state (ACC-E14-2, R06.7)', async () => {
    const db = await freshDb();
    await seedStore(db);
    const sealed = (await db.secrets.toArray())[0] as unknown as { data: Uint8Array };

    const backup = await made(db);
    const bytes = new Uint8Array(await backup.file.arrayBuffer());
    const opened = await unpackBackup(backup.file);

    // The file is stored, not compressed, so text in it can be found byte for byte.
    expect(contains(bytes, new TextEncoder().encode('Was this lunch balanced?'))).toBe(true);
    expect(contains(bytes, new TextEncoder().encode(KNOWN_KEY))).toBe(false);
    // Nor the key as stored (sealed under the device key).
    expect(sealed.data.length).toBeGreaterThan(16);
    expect(contains(bytes, sealed.data)).toBe(false);
    const tables = (opened.document as { payload: { tables: Record<string, unknown> } }).payload
      .tables;
    expect(Object.keys(tables)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(secrets|quarantine|meta)$/)]),
    );
    const keys = (tables.settings as { key: string }[]).map((row) => row.key);
    expect(keys).toEqual(
      expect.arrayContaining(['display.accent', 'onboarding.done', 'tabs.hidden', 'water.on']),
    );
    expect(keys).not.toContain('storage.persistAsked');
    expect(keys).not.toContain('backup.lastAt');
  });

  it('leaves this device’s automatic backup state out of the file, and keeps the switch and frequency in it (P14)', async () => {
    const db = await freshDb();
    await seedStore(db);
    const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
    await settingsRepo.set('backup.autoEvery', 'weekly');
    const first = await made(db);
    await settingsRepo.set('backup.autoState', {
      files: [{ name: 'platewise-backup-2026-10-26-1230.zip', madeAt: first.madeAt }],
      lastAt: first.madeAt,
      problem: null,
      asked: true,
    });

    const second = await made(db);

    const opened = await unpackBackup(second.file);
    const document = opened.document as {
      contentHash: string;
      payload: { tables: { settings: { key: string; value: unknown }[] } };
    };
    const keys = document.payload.tables.settings.map((row) => row.key);
    expect(keys).not.toContain('backup.autoState');
    expect(document.payload.tables.settings).toContainEqual({
      key: 'backup.autoEvery',
      value: 'weekly',
    });
    const firstHash = ((await unpackBackup(first.file)).document as { contentHash: string })
      .contentHash;
    expect(document.contentHash).toBe(firstHash);
  });

  it('gives the same hash again after the last backup time was recorded (R06.7)', async () => {
    const db = await freshDb();
    await seedStore(db);
    const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });

    const first = await made(db);
    await settingsRepo.set('backup.lastAt', first.madeAt);
    const second = await made(db);

    const hashOf = async (file: Blob) =>
      ((await unpackBackup(file)).document as { contentHash: string }).contentHash;
    expect(await hashOf(second.file)).toBe(await hashOf(first.file));
  });

  it('fails whole, with nothing to offer, when a photo can no longer be read', async () => {
    const db = await freshDb();
    await seedStore(db);
    const real = createBackupRepo(db);
    const gone = await storableBlob(3_000, 7);
    vi.spyOn(gone, 'arrayBuffer').mockRejectedValue(
      new DOMException('The file is gone', 'NotReadableError'),
    );
    // The snapshot still lists the photo; its bytes vanished before packing.
    const vanishing: Pick<BackupRepo, 'read'> = {
      async read(tables) {
        const rows = await real.read(tables);
        rows.photos = rows.photos.map((row, index) =>
          index === 0 ? { ...(row as object), blob: gone } : row,
        );
        return rows;
      },
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await makeBackup(deps(db, vanishing))).toEqual({
      ok: false,
      error: 'photoUnreadable',
    });
  });

  it('fails whole when a photo’s bytes no longer match its size', async () => {
    const db = await freshDb();
    await seedStore(db);
    const real = createBackupRepo(db);
    const shrunk = await storableBlob(3_000, 7);
    vi.spyOn(shrunk, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(10));
    const changing: Pick<BackupRepo, 'read'> = {
      async read(tables) {
        const rows = await real.read(tables);
        rows.photos = [{ ...(rows.photos[0] as object), blob: shrunk }];
        return rows;
      },
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await makeBackup(deps(db, changing))).toEqual({
      ok: false,
      error: 'photoUnreadable',
    });
  });

  it('puts a photo of another type in as a JPEG copy at its own size', async () => {
    const db = await freshDb();
    const fake = createFakeCodec();
    const gif = await fake.photo(640, 480, 900);
    await db.photos.put(makePhoto({ id: 'gif-1', blob: gif.slice(0, gif.size, 'image/gif') }));

    const result = await makeBackup({ ...deps(db), codec: fake.codec });
    if (!result.ok) throw new Error(result.error);
    const opened = await unpackBackup(result.value.file);

    expect(opened.photos.map((photo) => [photo.name, photo.data.type])).toEqual([
      ['gif-1.jpg', 'image/jpeg'],
    ]);
    expect(fake.encodes).toEqual([{ width: 640, height: 480, maxEdge: 640, quality: 0.9 }]);
    expect(await fake.sizeOf(opened.photos[0]!.data)).toEqual({ width: 640, height: 480 });
    expect(fake.openPictures()).toBe(0);
  });

  it('fails whole when a photo of another type cannot be decoded for its copy', async () => {
    const db = await freshDb();
    const fake = createFakeCodec();
    await db.photos.put(makePhoto({ id: 'heic-1', blob: await fake.undecodable(500) }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await makeBackup({ ...deps(db), codec: fake.codec })).toEqual({
      ok: false,
      error: 'photoUnreadable',
    });
  });

  it('names a photo whose id is not a plain name by its place instead', async () => {
    const db = await freshDb();
    await db.photos.bulkPut([
      makePhoto({ id: '../odd id', blob: await storableBlob(5, 1) }),
      makePhoto({ id: 'plain', blob: await storableBlob(6, 2) }),
    ]);

    const opened = await unpackBackup((await made(db)).file);
    const framed = readFrame(opened.document);
    if (!framed.ok) throw new Error(framed.problem);

    expect(opened.photos.map((photo) => photo.name)).toEqual(['photo-1.jpg', 'plain.jpg']);
    expect(framed.frame.tables.photos).toEqual([
      expect.objectContaining({ id: '../odd id', file: 'photo-1.jpg' }),
      expect.objectContaining({ id: 'plain', file: 'plain.jpg' }),
    ]);
  });

  it('makes nothing on a page without WebCrypto', async () => {
    const db = await freshDb();
    await seedStore(db);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await makeBackup({ ...deps(db), crypto: null })).toEqual({
      ok: false,
      error: 'insecure',
    });
  });

  it('makes an empty backup of an empty store', async () => {
    const db = await freshDb();

    const opened = await unpackBackup((await made(db)).file);

    expect(opened.photos).toEqual([]);
    expect(readFrame(opened.document).ok).toBe(true);
  });
});

describe('photoFileType and backupFileName', () => {
  it('keeps JPEG, PNG and WebP by their type and copies everything else', () => {
    expect(photoFileType('image/jpeg')).toBe('jpg');
    expect(photoFileType('IMAGE/PNG')).toBe('png');
    expect(photoFileType('image/webp; q=1')).toBe('webp');
    expect(photoFileType('image/gif')).toBeNull();
    expect(photoFileType('image/heic')).toBeNull();
    expect(photoFileType('')).toBeNull();
  });

  it('names the file by the local day it was made', () => {
    // 23:30 in New York is already the next day in UTC.
    expect(backupFileName(Date.parse('2026-10-26T23:30:00-04:00'))).toBe(
      'platewise-backup-2026-10-26.zip',
    );
  });
});

describe('offerBackup', () => {
  async function setup() {
    const db = await freshDb();
    const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
    const backup: MadeBackup = {
      file: new File([new Uint8Array(4)], 'platewise-backup-2026-10-26.zip'),
      madeAt: FACTORY_NOW,
    };
    const downloads: File[] = [];
    const lastAt = () => settingsRepo.get('backup.lastAt');
    return { settingsRepo, backup, downloads, lastAt };
  }

  function env(downloads: File[], share?: ShareEnv['share']): ShareEnv {
    return {
      ...(share ? { share, canShare: () => true } : {}),
      download: (file) => downloads.push(file),
    };
  }

  it('shares the file when the browser can, and records the backup’s own time', async () => {
    const s = await setup();
    const share = vi.fn(async () => undefined);

    const result = await offerBackup(s.backup, {
      settingsRepo: s.settingsRepo,
      stillCurrent: () => true,
      share: env(s.downloads, share),
    });

    expect(result).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [s.backup.file] });
    expect(s.downloads).toEqual([]);
    expect(await s.lastAt()).toBe(FACTORY_NOW);
  });

  it('downloads where files cannot be shared, and records the time', async () => {
    const s = await setup();
    const share = vi.fn(async () => undefined);

    const result = await offerBackup(s.backup, {
      settingsRepo: s.settingsRepo,
      stillCurrent: () => true,
      share: { share, canShare: () => false, download: (file) => s.downloads.push(file) },
    });

    expect(result).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(s.downloads).toEqual([s.backup.file]);
    expect(await s.lastAt()).toBe(FACTORY_NOW);
  });

  it('records nothing when the person closes the share sheet', async () => {
    const s = await setup();
    const share = vi.fn(async () => {
      throw new DOMException('Share canceled', 'AbortError');
    });

    const result = await offerBackup(s.backup, {
      settingsRepo: s.settingsRepo,
      stillCurrent: () => true,
      share: env(s.downloads, share),
    });

    expect(result).toBe('cancelled');
    expect(s.downloads).toEqual([]);
    expect(await s.lastAt()).toBeNull();
  });

  it('asks for a new tap when the first one is too old, then downloads if sharing is still refused', async () => {
    const s = await setup();
    const share = vi.fn(async () => {
      throw new DOMException('No user activation', 'NotAllowedError');
    });
    const offer = { settingsRepo: s.settingsRepo, stillCurrent: () => true };

    expect(await offerBackup(s.backup, { ...offer, share: env(s.downloads, share) })).toBe(
      'needsTap',
    );
    expect(await s.lastAt()).toBeNull();

    const again = await offerBackup(
      s.backup,
      { ...offer, share: env(s.downloads, share) },
      { afterTap: true },
    );
    expect(again).toBe('downloaded');
    expect(s.downloads).toEqual([s.backup.file]);
    expect(await s.lastAt()).toBe(FACTORY_NOW);
  });

  it('downloads when sharing fails for another reason', async () => {
    const s = await setup();
    const share = vi.fn(async () => {
      throw new DOMException('Share failed', 'DataError');
    });

    const result = await offerBackup(s.backup, {
      settingsRepo: s.settingsRepo,
      stillCurrent: () => true,
      share: env(s.downloads, share),
    });

    expect(result).toBe('downloaded');
    expect(s.downloads).toEqual([s.backup.file]);
  });

  it('offers nothing for a backup made before an erase (R06.5)', async () => {
    const s = await setup();
    const share = vi.fn(async () => undefined);

    const result = await offerBackup(s.backup, {
      settingsRepo: s.settingsRepo,
      stillCurrent: () => false,
      share: env(s.downloads, share),
    });

    expect(result).toBe('invalidated');
    expect(share).not.toHaveBeenCalled();
    expect(await s.lastAt()).toBeNull();
  });

  it('records nothing when everything was erased while the share sheet was open (R06.5)', async () => {
    const s = await setup();
    let current = true;
    const share = vi.fn(async () => {
      current = false;
    });

    const result = await offerBackup(s.backup, {
      settingsRepo: s.settingsRepo,
      stillCurrent: () => current,
      share: env(s.downloads, share),
    });

    expect(result).toBe('shared');
    expect(await s.lastAt()).toBeNull();
  });
});
