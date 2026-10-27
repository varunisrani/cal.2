// @vitest-environment node
// Security review (P10-09): a backup never carries an API key. Node's own Blob and File here, as in
// the other backup tests, so the archive's bytes can be searched exactly. Every key slot holds a
// planted key beside a complete store; the backup is made and handed over through the real
// service, then restored on another device, and the file, its decoded Blobs, the restored tables
// and the console are searched for every planted key in every form.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackupRepo, type BackupRepo } from '../../data/repos/backupRepo';
import { createSecretsRepo } from '../../data/repos/secretsRepo';
import type { PlatewiseDb } from '../../data/schema';
import { storableBlob } from '../../test/blobs';
import { openTestDb } from '../../test/db';
import {
  PLANTED_KEYS,
  blobBytes,
  containsBytes,
  describeValue,
  plantKeys,
  plantedIn,
  recordConsole,
  sealedKeys,
} from '../../test/plantedKeys';
import { unpackBackup } from './archive';
import { makeBackup, type ShareEnv } from './backup';
import { BACKUP_TABLES, readFrame } from './payload';
import { SEED_CLOCK, seedStore, testBackupService } from './testing/seed';

const opened: PlatewiseDb[] = [];

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function freshDb(): Promise<PlatewiseDb> {
  const { db } = await openTestDb();
  opened.push(db);
  return db;
}

/** A complete store with a planted key in every slot. */
async function plantedStore(): Promise<PlatewiseDb> {
  const db = await freshDb();
  await seedStore(db);
  await plantKeys(db, SEED_CLOCK);
  return db;
}

/** A share sheet and a download that keep the File they were given. */
function keepingShare(way: 'share' | 'download') {
  const kept: File[] = [];
  const share: ShareEnv =
    way === 'share'
      ? {
          canShare: () => true,
          share: async (data) => void kept.push(...(data.files ?? [])),
          download: (file) => void kept.push(file),
        }
      : { download: (file) => void kept.push(file) };
  return { share, kept };
}

/** Every Blob inside a value (rows, a document's tables), in order. */
function blobsIn(value: unknown, out: Blob[] = []): Blob[] {
  if (value instanceof Blob) out.push(value);
  else if (Array.isArray(value)) for (const item of value) blobsIn(item, out);
  else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) blobsIn(item, out);
  }
  return out;
}

/** The planted keys found anywhere in a store's backed-up tables: their text and their Blobs. */
async function plantedInStore(db: PlatewiseDb): Promise<string[]> {
  const found = new Set<string>();
  for (const table of BACKUP_TABLES) {
    const rows = await db.table(table).toArray();
    for (const slot of plantedIn(describeValue(rows))) found.add(slot);
    for (const blob of blobsIn(rows)) {
      for (const slot of plantedIn(await blobBytes(blob))) found.add(slot);
    }
  }
  return [...found];
}

describe('backup: no key in any output (P10-09, ACC-E14-2, D-16.30)', () => {
  it.each(['share', 'download'] as const)(
    'hands over (%s) a file with no stored key in its bytes, its decoded Blobs or its photos',
    async (way) => {
      const logged = recordConsole();
      const db = await plantedStore();
      const sealed = await sealedKeys(db);
      expect(sealed.length).toBeGreaterThan(10);
      const { share, kept } = keepingShare(way);
      const service = testBackupService(db, { clock: SEED_CLOCK, share });

      const made = await service.make();
      if (!made.ok) throw new Error(`no backup: ${made.error}`);
      expect(await service.offer(made.value)).toBe(way === 'share' ? 'shared' : 'downloaded');

      expect(kept).toHaveLength(1);
      const bytes = await blobBytes(kept[0]!);
      // The file is stored, not compressed: the diary's words are there to be found.
      expect(containsBytes(bytes, new TextEncoder().encode('Was this lunch balanced?'))).toBe(true);
      expect(plantedIn(bytes)).toEqual([]);
      for (const seal of sealed) expect(containsBytes(bytes, seal)).toBe(false);

      const opened = await unpackBackup(kept[0]!);
      const framed = readFrame(opened.document);
      if (!framed.ok) throw new Error(framed.problem);
      const blobs = blobsIn(framed.frame.tables);
      expect(blobs.length).toBeGreaterThan(0);
      for (const blob of [...blobs, ...opened.photos.map((photo) => photo.data)]) {
        expect(plantedIn(await blobBytes(blob))).toEqual([]);
      }
      expect(plantedIn(logged.calls().join('\n'))).toEqual([]);
    },
  );

  it('restores on another device without any key, and leaves that device’s own keys as they were', async () => {
    const logged = recordConsole();
    const source = await plantedStore();
    const made = await makeBackup({
      backupRepo: createBackupRepo(source),
      clock: SEED_CLOCK,
      appVersion: '0.1.0',
    });
    if (!made.ok) throw new Error(`no backup: ${made.error}`);

    // A device with nothing stored: the restore brings the diary and no key.
    const fresh = await freshDb();
    const onFresh = testBackupService(fresh, {
      clock: SEED_CLOCK,
      share: keepingShare('download').share,
    });
    const checked = await onFresh.inspect(made.value.file);
    if (!checked.ok) throw new Error(checked.error);
    expect((await onFresh.apply(checked.value)).ok).toBe(true);
    expect(await fresh.secrets.count()).toBe(0);
    expect(await fresh.coachMessages.count()).toBeGreaterThan(0);
    expect(await plantedInStore(fresh)).toEqual([]);

    // A device with its own key: the restore never touches it.
    const other = await freshDb();
    await createSecretsRepo(other, { clock: SEED_CLOCK }).set('mistral', PLANTED_KEYS.mistral!);
    const before = await other.secrets.toArray();
    const onOther = testBackupService(other, {
      clock: SEED_CLOCK,
      share: keepingShare('download').share,
    });
    const again = await onOther.inspect(made.value.file);
    if (!again.ok) throw new Error(again.error);
    expect((await onOther.apply(again.value)).ok).toBe(true);
    expect(await other.secrets.toArray()).toEqual(before);
    expect(await createSecretsRepo(other).get('mistral')).toBe(PLANTED_KEYS.mistral);

    expect(plantedIn(logged.calls().join('\n'))).toEqual([]);
  });

  it('logs no key when a backup fails part-way', async () => {
    const logged = recordConsole();
    const db = await plantedStore();
    const real = createBackupRepo(db);
    const gone = await storableBlob(3_000, 7);
    vi.spyOn(gone, 'arrayBuffer').mockRejectedValue(
      new DOMException('The file is gone', 'NotReadableError'),
    );
    const vanishing: Pick<BackupRepo, 'read'> = {
      async read(tables) {
        const rows = await real.read(tables);
        rows.photos = rows.photos.map((row) => ({ ...(row as object), blob: gone }));
        return rows;
      },
    };

    const result = await makeBackup({ backupRepo: vanishing, clock: SEED_CLOCK, appVersion: '0' });

    expect(result).toEqual({ ok: false, error: 'photoUnreadable' });
    expect(logged.calls().length).toBeGreaterThan(0);
    expect(plantedIn(logged.calls().join('\n'))).toEqual([]);
  });
});
