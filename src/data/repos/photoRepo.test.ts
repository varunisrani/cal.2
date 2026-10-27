import { describe, expect, it } from 'vitest';
import type { Clock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { bytesOf, storableBlob } from '../../test/blobs';
import { openTestDb } from '../../test/db';
import {
  FACTORY_NOW,
  makeAnalysisDraft,
  makeDraft,
  makeEntry,
  makeLine,
  makeSavedMeal,
} from '../../test/factories';
import { settleQuarantine } from '../guard';
import type { PlatewiseDb } from '../schema';
import { createDiaryRepo } from './diaryRepo';
import { ANALYSIS_KEY, CAPTURE_KEY, createDraftsRepo } from './draftsRepo';
import { FRESH_PHOTO_MS, RESTORING_FLAG, createPhotoRepo, photoIdsOf } from './photoRepo';

/** A clock the test moves by hand. */
function manualClock(start: number) {
  let now = start;
  const clock: Clock = { now: () => now, timeZone: () => 'America/New_York' };
  return {
    clock,
    pass(ms: number) {
      now += ms;
    },
  };
}

async function setUp() {
  const { db } = await openTestDb();
  const time = manualClock(FACTORY_NOW);
  const photos = createPhotoRepo(db, { clock: time.clock, newId: withIdSequence('photo') });
  const diary = createDiaryRepo(db, { clock: time.clock });
  const drafts = createDraftsRepo(db, { clock: time.clock });
  return { db, time, photos, diary, drafts };
}

/** Stores `count` small photos and returns their ids. */
async function storePhotos(photos: ReturnType<typeof createPhotoRepo>, count: number) {
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    ids.push(await photos.put(await storableBlob(16, index), { width: 4, height: 3 }));
  }
  return ids;
}

/** Ids of the photos still stored. */
async function storedIds(db: PlatewiseDb): Promise<string[]> {
  return (await db.photos.toCollection().primaryKeys()).sort();
}

describe('storing photos', () => {
  it('stores a blob under a new id and reads it back with its details', async () => {
    const { db, photos } = await setUp();
    const blob = await storableBlob(64, 7);
    const thumb = await storableBlob(8, 200);

    const id = await photos.put(blob, { thumb, width: 2048, height: 1536 });
    expect(id).toBe('photo-1');
    const stored = await photos.get(id);
    expect(stored).toMatchObject({
      id,
      width: 2048,
      height: 1536,
      bytes: 64,
      createdAt: FACTORY_NOW,
    });
    expect(await bytesOf(stored?.blob ?? new Blob())).toEqual(await bytesOf(blob));
    expect(await bytesOf((await photos.getThumb(id)) ?? new Blob())).toEqual(await bytesOf(thumb));
    expect(await photos.get('photo-9')).toBeNull();
    db.close();
  });

  it('sets a thumbnail on a stored photo only', async () => {
    const { db, photos } = await setUp();
    const [id = ''] = await storePhotos(photos, 1);
    expect(await photos.getThumb(id)).toBeNull();

    const thumb = await storableBlob(8, 50);
    expect(await photos.setThumb(id, thumb)).toBe(true);
    expect(await bytesOf((await photos.getThumb(id)) ?? new Blob())).toEqual(await bytesOf(thumb));
    expect(await photos.setThumb('missing', thumb)).toBe(false);
    expect(await storedIds(db)).toEqual([id]);
    db.close();
  });

  it('refuses something that is not a blob', async () => {
    const { db, photos } = await setUp();
    await expect(photos.put('jpeg' as never, { width: 1, height: 1 })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(await db.photos.count()).toBe(0);
    db.close();
  });

  it('adds up photo and thumbnail bytes for the storage card', async () => {
    const { db, photos } = await setUp();
    await photos.put(await storableBlob(64), { thumb: await storableBlob(8), width: 1, height: 1 });
    await photos.put(await storableBlob(10), { width: 1, height: 1 });

    expect(await photos.usage()).toEqual({ count: 2, photoBytes: 74, thumbBytes: 8 });
    db.close();
  });
});

describe('references', () => {
  it('collects the photos of entries, their parts, saved meals and both drafts', async () => {
    const { db, photos, diary, drafts } = await setUp();
    await diary.add(makeEntry({ photoIds: ['e1'], lines: [makeLine({ photoIds: ['e2'] })] }));
    await db.savedMeals.put(makeSavedMeal({ photoIds: ['s1'] }));
    const { generation } = await drafts.begin();
    await drafts.saveResult(
      generation,
      makeAnalysisDraft({
        photoIds: ['a1'],
        draft: makeDraft({ lines: [makeLine({ photoIds: ['a2'] })] }),
      }),
    );
    await drafts.saveCapture({ photoIds: ['c1'], note: '', progressive: false });

    const references = await photos.references();
    expect(references.kind).toBe('known');
    if (references.kind === 'known') {
      expect([...references.ids].sort()).toEqual(['a1', 'a2', 'c1', 'e1', 'e2', 's1']);
    }
    db.close();
  });

  it.each([
    { label: 'an entry', table: 'entries', raw: { id: 'e-broken', name: 'x', photoIds: ['x'] } },
    { label: 'a saved meal', table: 'savedMeals', raw: { id: 's-broken', kcal: 'lots' } },
    { label: 'the analysis draft', table: 'drafts', raw: { id: ANALYSIS_KEY, generation: 'one' } },
    { label: 'a drafts row of no known kind', table: 'drafts', raw: { id: 'leftover' } },
  ] as const)('is unknown while $label cannot be read (R06.18)', async ({ table, raw }) => {
    const { db, photos } = await setUp();
    await db.table(table).put(raw);

    expect(await photos.references()).toEqual({ kind: 'unknown' });
    await settleQuarantine(db);
    expect(await db.quarantine.where('table').equals(table).count()).toBe(1);
    db.close();
  });

  it('lists a record’s own photos, then its parts’, without repeats', () => {
    expect(
      photoIdsOf({
        photoIds: ['a', 'b'],
        lines: [{ photoIds: ['c', 'a'] }, { photoIds: [] }, { photoIds: ['d'] }],
      }),
    ).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('releaseIfUnused', () => {
  it('keeps a photo shared by an entry and a saved meal when the entry is deleted (ACC-D28-1, R02.8)', async () => {
    const { db, photos, diary } = await setUp();
    const [shared = ''] = await storePhotos(photos, 1);
    const entry = await diary.add(makeEntry({ photoIds: [shared] }));
    const saved = makeSavedMeal({ photoIds: [shared], originEntryId: entry.id });
    await db.savedMeals.put(saved);

    const dropped = await diary.remove(entry.id);
    expect(dropped).toEqual([shared]);
    expect(await photos.releaseIfUnused(dropped)).toEqual([]);
    expect(await photos.get(shared)).not.toBeNull();
    expect(await db.savedMeals.get(saved.id)).toEqual(saved);

    // Once the saved meal goes too, nothing uses the photo any more.
    await db.savedMeals.delete(saved.id);
    expect(await photos.releaseIfUnused(dropped)).toEqual([shared]);
    expect(await photos.get(shared)).toBeNull();
    db.close();
  });

  it('keeps the saved meal’s copy when an edit removes the photo from the entry (R02.8)', async () => {
    const { db, photos, diary } = await setUp();
    const [shared = '', own = ''] = await storePhotos(photos, 2);
    const entry = await diary.add(makeEntry({ photoIds: [shared, own] }));
    const saved = makeSavedMeal({ photoIds: [shared] });
    await db.savedMeals.put(saved);

    const result = await diary.update({ ...entry, photoIds: [] });
    if (result.kind !== 'updated') throw new Error('the entry is stored');
    expect(result.releasedPhotoIds).toEqual([shared, own]);
    expect(await photos.releaseIfUnused(result.releasedPhotoIds)).toEqual([own]);
    expect(await storedIds(db)).toEqual([shared]);
    expect(await db.savedMeals.get(saved.id)).toEqual(saved);
    db.close();
  });

  it('keeps a photo another entry uses on one of its parts (R02.8)', async () => {
    const { db, photos, diary } = await setUp();
    const [shared = ''] = await storePhotos(photos, 1);
    const entry = await diary.add(makeEntry({ photoIds: [shared] }));
    await diary.add(makeEntry({ name: 'Rice bowl', lines: [makeLine({ photoIds: [shared] })] }));

    const result = await diary.update({ ...entry, photoIds: [] });
    if (result.kind !== 'updated') throw new Error('the entry is stored');
    expect(await photos.releaseIfUnused(result.releasedPhotoIds)).toEqual([]);
    expect(await storedIds(db)).toEqual([shared]);
    db.close();
  });

  it('keeps the photo when the edit that dropped it fails to save', async () => {
    const { db, photos, diary } = await setUp();
    const [kept = ''] = await storePhotos(photos, 1);
    const entry = await diary.add(makeEntry({ photoIds: [kept] }));

    await expect(diary.update({ ...entry, photoIds: [], kcal: Number.NaN })).rejects.toBeInstanceOf(
      TypeError,
    );
    // A caller that releases anyway still loses nothing: the stored entry names the photo.
    expect(await photos.releaseIfUnused([kept])).toEqual([]);
    expect(await storedIds(db)).toEqual([kept]);
    db.close();
  });

  it('releases only the ids it is given, and skips ids that are not stored', async () => {
    const { db, photos } = await setUp();
    const [first = '', second = ''] = await storePhotos(photos, 2);

    expect(await photos.releaseIfUnused([first, first, 'never-stored'])).toEqual([first]);
    expect(await storedIds(db)).toEqual([second]);
    db.close();
  });

  it('deletes nothing while a saved-meal row cannot be read (R06.18)', async () => {
    const { db, time, photos } = await setUp();
    const [unused = ''] = await storePhotos(photos, 1);
    await db.savedMeals.put({ id: 's-broken', name: 'Porridge', kcal: 'lots' } as never);
    time.pass(FRESH_PHOTO_MS + 1);

    expect(await photos.releaseIfUnused([unused])).toEqual([]);
    expect(await photos.prune()).toEqual([]);
    expect(await storedIds(db)).toEqual([unused]);
    db.close();
  });
});

describe('prune', () => {
  it('deletes every photo nothing uses, but not one stored moments ago', async () => {
    const { db, time, photos, diary } = await setUp();
    const [used = '', unused = ''] = await storePhotos(photos, 2);
    await diary.add(makeEntry({ photoIds: [used] }));
    time.pass(FRESH_PHOTO_MS + 1);
    const [fresh = ''] = await storePhotos(photos, 1);

    expect(await photos.prune()).toEqual([unused]);
    expect(await storedIds(db)).toEqual([used, fresh].sort());

    time.pass(FRESH_PHOTO_MS + 1);
    expect(await photos.prune()).toEqual([fresh]);
    db.close();
  });

  it('deletes nothing while an unreadable saved-meal row exists (R06.18, R02.8)', async () => {
    const { db, time, photos } = await setUp();
    await storePhotos(photos, 2);
    time.pass(FRESH_PHOTO_MS + 1);
    await db.savedMeals.put({ id: 's-broken', kcal: 'lots' } as never);

    expect(await photos.prune()).toEqual([]);
    expect(await db.photos.count()).toBe(2);

    await db.savedMeals.delete('s-broken');
    expect(await photos.prune()).toHaveLength(2);
    db.close();
  });

  it('keeps photos a row kept aside in quarantine still names', async () => {
    const { db, time, photos, diary } = await setUp();
    const [named = '', unnamed = ''] = await storePhotos(photos, 2);
    await db.entries.put({ id: 'e-broken', name: 'no numbers', photoIds: [named] } as never);
    // Deleting the unreadable entry moves its raw value into quarantine first.
    await diary.remove('e-broken');
    time.pass(FRESH_PHOTO_MS + 1);

    expect(await photos.prune()).toEqual([unnamed]);
    expect(await storedIds(db)).toEqual([named]);
    db.close();
  });

  it('deletes nothing while a restore runs (R06.18)', async () => {
    const { db, time, photos } = await setUp();
    const [unused = ''] = await storePhotos(photos, 1);
    time.pass(FRESH_PHOTO_MS + 1);
    await db.meta.put({ key: RESTORING_FLAG, value: true });

    expect(await photos.prune()).toEqual([]);
    expect(await photos.releaseIfUnused([unused])).toEqual([]);
    expect(await storedIds(db)).toEqual([unused]);

    await db.meta.delete(RESTORING_FLAG);
    expect(await photos.prune()).toEqual([unused]);
    db.close();
  });

  it('keeps an unreadable photo row aside before deleting it', async () => {
    const { db, time, photos } = await setUp();
    const broken = { id: 'photo-broken', width: 4 };
    await db.photos.put(broken as never);
    time.pass(FRESH_PHOTO_MS + 1);

    expect(await photos.prune()).toEqual(['photo-broken']);
    expect(await db.photos.count()).toBe(0);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'photos', key: 'photo-broken', raw: broken }),
    ]);
    db.close();
  });

  it('keeps the photos of both drafts', async () => {
    const { db, time, photos, drafts } = await setUp();
    const [analysed = '', captured = '', unused = ''] = await storePhotos(photos, 3);
    const { generation } = await drafts.begin();
    await drafts.saveResult(generation, makeAnalysisDraft({ photoIds: [analysed] }));
    await drafts.saveCapture({ photoIds: [captured], note: '', progressive: false });
    time.pass(FRESH_PHOTO_MS + 1);

    expect(await photos.prune()).toEqual([unused]);
    expect(await db.drafts.get(CAPTURE_KEY)).toBeDefined();
    expect(await storedIds(db)).toEqual([analysed, captured].sort());
    db.close();
  });
});

describe('clearThumbs', () => {
  it('drops every thumbnail and keeps every photo with its bytes', async () => {
    const { db, photos } = await setUp();
    const blob = await storableBlob(64, 3);
    const withThumb = await photos.put(blob, {
      thumb: await storableBlob(8, 9),
      width: 4,
      height: 3,
    });
    const [plain = ''] = await storePhotos(photos, 1);

    expect(await photos.clearThumbs()).toBe(1);

    expect(await storedIds(db)).toEqual([withThumb, plain].sort());
    expect(await photos.getThumb(withThumb)).toBeNull();
    expect(await bytesOf((await photos.get(withThumb))?.blob ?? new Blob())).toEqual(
      await bytesOf(blob),
    );
    expect(await photos.usage()).toEqual({ count: 2, photoBytes: 80, thumbBytes: 0 });
    db.close();
  });

  it('leaves an unreadable row as it is, and changes nothing while a restore runs', async () => {
    const { db, photos } = await setUp();
    const broken = { id: 'photo-broken', thumb: await storableBlob(4) };
    await db.photos.put(broken as never);
    const id = await photos.put(await storableBlob(16), {
      thumb: await storableBlob(8),
      width: 1,
      height: 1,
    });
    await db.meta.put({ key: RESTORING_FLAG, value: true });

    expect(await photos.clearThumbs()).toBe(0);
    expect(await photos.getThumb(id)).not.toBeNull();

    await db.meta.delete(RESTORING_FLAG);
    expect(await photos.clearThumbs()).toBe(1);
    expect(await photos.getThumb(id)).toBeNull();
    expect((await db.photos.get('photo-broken'))?.thumb).toBeDefined();
    db.close();
  });
});
