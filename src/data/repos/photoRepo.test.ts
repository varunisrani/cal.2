import { describe, expect, it } from 'vitest';
import type { IngredientLine } from '../../domain/model';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, factories, testBlob } from '../../test/factories';
import type { PlatewiseDb } from '../db';
import { keptAside } from '../guard';
import { isBlobLike } from '../values';
import * as diaryRepo from './diaryRepo';
import { ANALYSIS_DRAFT_ID, CAPTURE_DRAFT_ID } from './draftsRepo';
import {
  RESTORING_FLAG,
  get,
  getThumb,
  photoIdsOf,
  prune,
  put,
  references,
  releaseIfUnused,
  setThumb,
  usage,
} from './photoRepo';

const make = factories();

function line(name: string, photoIds: string[]): IngredientLine {
  return { name, grams: 80, kcal: 100, protein: 3, carbs: 12, fat: 4, photoIds };
}

/** A saved-meal row that cannot be read: it has no name. */
const brokenSavedMeal = { id: 'saved-broken', kcal: 300, protein: 1, carbs: 1, fat: 1 };

/** Stores photos with predictable ids (`photo-1`, `photo-2`, …). */
function photoStore(db: PlatewiseDb) {
  const newId = withIdSequence('photo');
  return (content = 'jpeg bytes', thumb: string | null = 'thumb') =>
    put(
      db,
      testBlob(content),
      { width: 640, height: 480, ...(thumb === null ? {} : { thumb: testBlob(thumb) }) },
      { clock: make.clock, newId },
    );
}

async function storedPhotoIds(db: PlatewiseDb): Promise<string[]> {
  return (await db.photos.toCollection().primaryKeys()).sort();
}

describe('storing photos', () => {
  it('stores a photo with its thumbnail and reads both back', async () => {
    const db = await openTestDb();
    const id = await photoStore(db)('a photo of soup', 'small soup');

    const photo = await get(db, id);
    expect(photo).toMatchObject({ id, width: 640, height: 480, createdAt: FACTORY_NOW });
    expect(isBlobLike(photo?.blob)).toBe(true);
    expect(await photo?.blob.text()).toBe('a photo of soup');
    expect(photo?.bytes).toBe('a photo of soup'.length + 'small soup'.length);
    expect(await (await getThumb(db, id))?.text()).toBe('small soup');
  });

  it('adds a thumbnail made later and counts its bytes', async () => {
    const db = await openTestDb();
    const id = await photoStore(db)('1234567890', null);
    expect(await getThumb(db, id)).toBeUndefined();

    expect(await setThumb(db, id, testBlob('123'))).toBe(true);
    expect(await (await getThumb(db, id))?.text()).toBe('123');
    expect((await get(db, id))?.bytes).toBe(13);
    expect(await setThumb(db, 'photo-gone', testBlob('123'))).toBe(false);
  });

  it('usage sums the bytes of every photo and thumbnail', async () => {
    const db = await openTestDb();
    const store = photoStore(db);
    await store('12345', '12');
    await store('1234567890', null);
    expect(await usage(db)).toEqual({ photos: 2, photoBytes: 15, thumbBytes: 2 });
  });

  it('refuses something that is not an image blob', async () => {
    const db = await openTestDb();
    const notBlob = 'jpeg' as unknown as Blob;
    await expect(put(db, notBlob, { width: 1, height: 1 })).rejects.toBeInstanceOf(TypeError);
    expect(await db.photos.count()).toBe(0);
  });
});

describe('references', () => {
  it('collects the photos of entries, their lines, saved meals and both drafts', async () => {
    const db = await openTestDb();
    await db.entries.put(make.entry({ photoIds: ['p-entry'], lines: [line('Rice', ['p-line'])] }));
    await db.savedMeals.put(make.savedMeal({ photoIds: ['p-saved'] }));
    const analysis = make.analysisDraft({
      photoIds: ['p-draft'],
      draft: make.draft({ lines: [line('Beans', ['p-draft-line'])] }),
    });
    await db.drafts.put({ id: ANALYSIS_DRAFT_ID, gen: 1, result: analysis });
    await db.drafts.put({
      id: CAPTURE_DRAFT_ID,
      photoIds: ['p-capture'],
      note: '',
      progressive: false,
    });

    const used = await references(db);
    expect(used === 'unknown' ? used : [...used].sort()).toEqual([
      'p-capture',
      'p-draft',
      'p-draft-line',
      'p-entry',
      'p-line',
      'p-saved',
    ]);
  });

  it('is unknown when any owner row cannot be read (R06.18)', async () => {
    const db = await openTestDb();
    await db.entries.put(make.entry({ photoIds: ['p-entry'] }));
    await db.table('savedMeals').put(brokenSavedMeal);
    expect(await references(db)).toBe('unknown');
    await keptAside();
    expect(await db.quarantine.count()).toBe(1);
  });

  it('photoIdsOf lists the photo ids of a row, then of its lines, without repeats', () => {
    const entry = make.entry({
      photoIds: ['p-1', 'p-2'],
      lines: [line('A', ['p-3', 'p-1']), line('B', ['p-4'])],
    });
    expect(photoIdsOf(entry)).toEqual(['p-1', 'p-2', 'p-3', 'p-4']);
  });
});

describe('releasing photos after a diary change', () => {
  it('a photo shared by an entry and a saved meal survives deleting the entry (ACC-D28-1, R02.8)', async () => {
    const db = await openTestDb();
    const shared = await photoStore(db)();
    const entry = make.entry({ photoIds: [shared] });
    await diaryRepo.add(db, entry);
    await db.savedMeals.put(make.savedMeal({ photoIds: [shared], originEntryId: entry.id }));

    expect(await diaryRepo.remove(db, entry.id)).toBe(true);
    expect(await db.entries.count()).toBe(0);
    expect(await get(db, shared)).toBeDefined();
  });

  it('removing a photo from one entry keeps the saved meal copy and deletes what nothing uses (R02.8)', async () => {
    const db = await openTestDb();
    const store = photoStore(db);
    const shared = await store('shared');
    const own = await store('own');
    const entry = make.entry({ photoIds: [shared, own] });
    await diaryRepo.add(db, entry);
    await db.savedMeals.put(make.savedMeal({ photoIds: [shared] }));

    expect(await diaryRepo.update(db, { ...entry, photoIds: [] })).toBe('updated');
    expect(await storedPhotoIds(db)).toEqual([shared]);
    expect(await (await get(db, shared))?.blob.text()).toBe('shared');
  });

  it('a failed edit keeps the photo it would have released (R02.8)', async () => {
    const db = await openTestDb();
    const photo = await photoStore(db)();
    const entry = make.entry({ photoIds: [photo] });
    await diaryRepo.add(db, entry);
    db.entries.hook('updating', () => {
      throw new Error('disk full');
    });

    await expect(diaryRepo.update(db, { ...entry, photoIds: [] })).rejects.toThrow('disk full');
    expect(await storedPhotoIds(db)).toEqual([photo]);
    expect((await db.entries.get(entry.id))?.photoIds).toEqual([photo]);
  });

  it('keeps photos that another entry line or a draft still uses (R02.8)', async () => {
    const db = await openTestDb();
    const store = photoStore(db);
    const [inLine, inCapture, inAnalysis, alone] = [
      await store(),
      await store(),
      await store(),
      await store(),
    ];
    const entry = make.entry({ photoIds: [inLine, inCapture, inAnalysis, alone] });
    await diaryRepo.add(db, entry);
    await diaryRepo.add(db, make.entry({ lines: [line('Rice', [inLine])] }));
    await db.drafts.put({
      id: CAPTURE_DRAFT_ID,
      photoIds: [inCapture],
      note: '',
      progressive: false,
    });
    await db.drafts.put({
      id: ANALYSIS_DRAFT_ID,
      gen: 4,
      result: make.analysisDraft({ photoIds: [inAnalysis] }),
    });

    await diaryRepo.remove(db, entry.id);
    expect(await storedPhotoIds(db)).toEqual([inLine, inCapture, inAnalysis].sort());
  });

  it('releaseIfUnused deletes only the given ids that nothing uses', async () => {
    const db = await openTestDb();
    const store = photoStore(db);
    const [used, unused, other] = [await store(), await store(), await store()];
    await diaryRepo.add(db, make.entry({ photoIds: [used] }));

    expect(await releaseIfUnused(db, [used, unused, unused, 'photo-never-stored'])).toEqual([
      unused,
    ]);
    expect(await storedPhotoIds(db)).toEqual([used, other].sort());
  });

  it('deletes nothing when a saved-meal row cannot be read (R06.18)', async () => {
    const db = await openTestDb();
    const photo = await photoStore(db)();
    const entry = make.entry({ photoIds: [photo] });
    await diaryRepo.add(db, entry);
    await db.table('savedMeals').put(brokenSavedMeal);

    expect(await diaryRepo.remove(db, entry.id)).toBe(true);
    expect(await releaseIfUnused(db, [photo])).toEqual([]);
    expect(await storedPhotoIds(db)).toEqual([photo]);
  });
});

describe('prune', () => {
  it('deletes every photo nothing uses and keeps the rest', async () => {
    const db = await openTestDb();
    const store = photoStore(db);
    const [inEntry, inSaved, unused] = [await store(), await store(), await store()];
    await db.entries.put(make.entry({ photoIds: [inEntry] }));
    await db.savedMeals.put(make.savedMeal({ lines: [line('Toast', [inSaved])] }));
    // A damaged photo row nobody uses: kept aside, then deleted.
    await db.table('photos').put({ id: 'photo-damaged', width: 10 });

    expect((await prune(db)).sort()).toEqual(['photo-damaged', unused].sort());
    expect(await storedPhotoIds(db)).toEqual([inEntry, inSaved].sort());
    expect((await db.quarantine.toArray()).map((row) => row.key)).toEqual(['photo-damaged']);
  });

  it('deletes nothing when a saved-meal row cannot be read (R06.18, R02.8)', async () => {
    const db = await openTestDb();
    const unused = await photoStore(db)();
    await db.table('savedMeals').put(brokenSavedMeal);
    expect(await prune(db)).toEqual([]);
    expect(await storedPhotoIds(db)).toEqual([unused]);
  });

  it('deletes nothing while a restore is running (R06.18)', async () => {
    const db = await openTestDb();
    const unused = await photoStore(db)();
    await db.meta.put({ key: RESTORING_FLAG, value: true });

    expect(await prune(db)).toEqual([]);
    expect(await releaseIfUnused(db, [unused])).toEqual([]);
    expect(await storedPhotoIds(db)).toEqual([unused]);

    await db.meta.delete(RESTORING_FLAG);
    expect(await prune(db)).toEqual([unused]);
  });
});
