import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { bytesOf, storableBlob } from '../../test/blobs';
import { openTestDb } from '../../test/db';
import {
  FACTORY_NOW,
  makeCoachMessage,
  makeEntry,
  makeFast,
  makePhoto,
  makeProfileRow,
  makeWeighIn,
} from '../../test/factories';
import { UNREADABLE_FLAG, settleQuarantine } from '../guard';
import type { PlatewiseDb } from '../schema';
import { createBackupRepo, type RestorePlan } from './backupRepo';
import { RESTORING_FLAG } from './photoRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

async function setup() {
  const { db } = await openTestDb();
  return { db, repo: createBackupRepo(db, { clock }) };
}

async function restoring(db: PlatewiseDb): Promise<boolean> {
  return (await db.meta.get(RESTORING_FLAG))?.value === true;
}

const EMPTY: RestorePlan = { replace: {}, upsert: {}, keepSettings: [] };

describe('createBackupRepo', () => {
  describe('read', () => {
    it('gives the readable rows of the named tables as stored, with the fields kept beside the record', async () => {
      const { db, repo } = await setup();
      const entry = { ...makeEntry({ id: 'e1' }), barcodeKey: '4006381333931' };
      const message = { ...makeCoachMessage({ id: 'm1' }), seq: 7 };
      await db.entries.put(entry);
      await db.coachMessages.put(message);
      await db.profile.put(makeProfileRow());
      await db.secrets.put({ id: 'gemini', sealed: 'x' });

      const rows = await repo.read(['entries', 'coachMessages', 'profile']);

      expect(rows).toEqual({
        entries: [entry],
        coachMessages: [message],
        profile: [makeProfileRow()],
      });
      expect(Object.keys(rows)).not.toContain('secrets');
      db.close();
    });

    it('leaves out a row that cannot be read and keeps it aside, as every read does', async () => {
      const { db, repo } = await setup();
      await db.weighIns.bulkPut([
        makeWeighIn({ id: 'w1' }),
        { id: 'w2', at: 'soon', kg: -1 } as never,
      ]);
      await db.settings.bulkPut([
        { key: 'water.on', value: true },
        { key: 'water.goalMl', value: 'lots' },
        { key: 'someday.setting', value: 3 },
      ]);

      const rows = await repo.read(['weighIns', 'settings']);
      await settleQuarantine(db);

      expect(rows.weighIns.map((row) => (row as { id: string }).id)).toEqual(['w1']);
      // A key this build does not know is not damage; a known key with a bad value is.
      expect(rows.settings).toEqual([
        { key: 'someday.setting', value: 3 },
        { key: 'water.on', value: true },
      ]);
      expect((await db.quarantine.toArray()).map((row) => [row.table, row.key])).toEqual([
        ['weighIns', 'w2'],
        ['settings', 'water.goalMl'],
      ]);
      expect(await db.weighIns.count()).toBe(2);
      db.close();
    });
  });

  describe('restore', () => {
    it('replaces the named tables, writes photos over their ids and keeps the named settings', async () => {
      const { db, repo } = await setup();
      const kept = await storableBlob(10, 1);
      await db.entries.bulkPut([makeEntry({ id: 'old-1' }), makeEntry({ id: 'old-2' })]);
      await db.photos.bulkPut([makePhoto({ id: 'p-old', blob: kept }), makePhoto({ id: 'p1' })]);
      await db.settings.bulkPut([
        { key: 'storage.persistAsked', value: true },
        { key: 'water.on', value: true },
      ]);
      const incoming = await storableBlob(20, 5);

      await repo.restore({
        replace: {
          entries: [makeEntry({ id: 'new-1' })],
          settings: [{ key: 'fasting.on', value: true }],
          fasts: [],
        },
        upsert: { photos: [makePhoto({ id: 'p1', blob: incoming, thumb: undefined })] },
        keepSettings: ['storage.persistAsked', 'storage.nudgeDone'],
      });

      expect((await db.entries.toArray()).map((row) => row.id)).toEqual(['new-1']);
      expect(await db.settings.toArray()).toEqual([
        { key: 'fasting.on', value: true },
        { key: 'storage.persistAsked', value: true },
      ]);
      const photos = await db.photos.toArray();
      expect(photos.map((row) => row.id)).toEqual(['p-old', 'p1']);
      expect(await bytesOf(photos[1]!.blob)).toEqual(await bytesOf(incoming));
      expect(await restoring(db)).toBe(true);

      await repo.endRestore();
      expect(await restoring(db)).toBe(false);
      db.close();
    });

    it('changes nothing, flag included, when one write fails (R06.6)', async () => {
      const { db, repo } = await setup();
      await db.entries.put(makeEntry({ id: 'old-1' }));
      await db.fasts.put(makeFast({ id: 'f1' }));

      const failing = repo.restore({
        replace: { entries: [makeEntry({ id: 'new-1' })], fasts: [] },
        // A value IndexedDB cannot store, as a full disk or a lost file would refuse a photo.
        upsert: { photos: [{ ...makePhoto({ id: 'p1' }), broken: () => 1 }] },
        keepSettings: [],
      });

      await expect(failing).rejects.toThrow();
      expect((await db.entries.toArray()).map((row) => row.id)).toEqual(['old-1']);
      expect((await db.fasts.toArray()).map((row) => row.id)).toEqual(['f1']);
      expect(await db.photos.count()).toBe(0);
      expect(await restoring(db)).toBe(false);
      db.close();
    });

    it('keeps an unreadable stored row aside before the replace deletes it (R06.1)', async () => {
      const { db, repo } = await setup();
      const damaged = { id: 'broken', loggedAt: 'yesterday' };
      await db.entries.bulkPut([makeEntry({ id: 'fine' }), damaged as never]);

      await repo.restore({ ...EMPTY, replace: { entries: [] } });

      expect(await db.entries.count()).toBe(0);
      const aside = await db.quarantine.toArray();
      expect(aside.map((row) => [row.table, row.key, row.raw])).toEqual([
        ['entries', 'broken', damaged],
      ]);
      expect((await db.meta.get(UNREADABLE_FLAG))?.value).toBe(true);
      db.close();
    });

    it('keeps an unreadable photo aside before an incoming photo with its id replaces it', async () => {
      const { db, repo } = await setup();
      await db.photos.put({ id: 'p1', blob: 'not a blob' } as never);

      await repo.restore({ ...EMPTY, upsert: { photos: [makePhoto({ id: 'p1' })] } });

      expect((await db.quarantine.toArray()).map((row) => [row.table, row.key])).toEqual([
        ['photos', 'p1'],
      ]);
      db.close();
    });
  });
});
