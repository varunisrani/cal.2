import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { storableBlob } from '../../test/blobs';
import { FACTORY_NOW, makeAnalysisDraft, makeDraft, makeLine } from '../../test/factories';
import { settleQuarantine } from '../guard';
import { ANALYSIS_KEY, CAPTURE_KEY, createDraftsRepo } from './draftsRepo';
import { createPhotoRepo } from './photoRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

async function setUp() {
  const opened = await openTestDb();
  return { ...opened, drafts: createDraftsRepo(opened.db, { clock }) };
}

/** A draft with two photos of its own and one more on a part. */
const withPhotos = makeAnalysisDraft({
  photoIds: ['p1', 'p2'],
  draft: makeDraft({ lines: [makeLine({ photoIds: ['p3', 'p1'] })] }),
});

describe('analysis draft', () => {
  it('refuses a result saved with an old generation as stale (R02.10)', async () => {
    const { db, drafts } = await setUp();
    const first = await drafts.begin();
    const second = await drafts.begin();
    expect(second.generation).toBe(first.generation + 1);

    expect(await drafts.saveResult(first.generation, withPhotos)).toBe('stale');
    expect(await drafts.load()).toBeNull();
    expect(await drafts.saveResult(second.generation, withPhotos)).toBe('saved');
    expect(await drafts.load()).toEqual({ generation: second.generation, draft: withPhotos });
    db.close();
  });

  it('drops the previous draft on begin and returns its photos, parts included (R02.10)', async () => {
    const { db, drafts } = await setUp();
    const { generation } = await drafts.begin();
    await drafts.saveResult(generation, withPhotos);

    expect(await drafts.begin()).toEqual({
      generation: generation + 1,
      previousPhotoIds: ['p1', 'p2', 'p3'],
    });
    expect(await drafts.load()).toBeNull();
    db.close();
  });

  it('loads a saved draft again after a reload, with its generation (D-16.46)', async () => {
    const { db, factory, name, drafts } = await setUp();
    const { generation } = await drafts.begin();
    await drafts.saveResult(generation, withPhotos);
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    const afterReload = createDraftsRepo(reopened.db, { clock });
    expect(await afterReload.load()).toEqual({ generation, draft: withPhotos });
    // The counter lives in the database: the next attempt follows on from the stored one.
    expect((await afterReload.begin()).generation).toBe(generation + 1);
    reopened.db.close();
  });

  it('shares one counter between tabs, so a late result from one tab is stale in both (R02.10)', async () => {
    const { db, factory, name, drafts } = await setUp();
    const otherTab = await openTestDb({ indexedDB: factory, name });
    const otherDrafts = createDraftsRepo(otherTab.db, { clock });

    const mine = await drafts.begin();
    const theirs = await otherDrafts.begin();
    expect(await drafts.saveResult(mine.generation, withPhotos)).toBe('stale');
    expect(await otherDrafts.saveResult(theirs.generation, makeAnalysisDraft())).toBe('saved');
    expect(await drafts.load()).toEqual({
      generation: theirs.generation,
      draft: makeAnalysisDraft(),
    });
    otherTab.db.close();
    db.close();
  });

  it('does not clear a newer draft when an older attempt clears (R02.10)', async () => {
    const { db, drafts } = await setUp();
    const older = await drafts.begin();
    const newer = await drafts.begin();
    await drafts.saveResult(newer.generation, withPhotos);

    expect(await drafts.clear(older.generation)).toEqual({ cleared: false, photoIds: [] });
    expect(await drafts.load()).toEqual({ generation: newer.generation, draft: withPhotos });

    expect(await drafts.clear(newer.generation)).toEqual({
      cleared: true,
      photoIds: ['p1', 'p2', 'p3'],
    });
    expect(await drafts.load()).toBeNull();
    db.close();
  });

  it('turns a save still running for a cleared attempt stale (R02.10)', async () => {
    const { db, drafts } = await setUp();
    const { generation } = await drafts.begin();
    await drafts.clear(generation);

    expect(await drafts.saveResult(generation, withPhotos)).toBe('stale');
    expect(await drafts.load()).toBeNull();
    db.close();
  });

  it('clears whatever is stored when no generation is given', async () => {
    const { db, drafts } = await setUp();
    expect(await drafts.clear()).toEqual({ cleared: false, photoIds: [] });
    const { generation } = await drafts.begin();
    await drafts.saveResult(generation, withPhotos);

    expect(await drafts.clear()).toEqual({ cleared: true, photoIds: ['p1', 'p2', 'p3'] });
    expect(await drafts.saveResult(generation, withPhotos)).toBe('stale');
    db.close();
  });

  it('runs calls made without waiting for each other in call order', async () => {
    const { db, drafts } = await setUp();
    const began = drafts.begin();
    const saved = drafts.saveResult(1, withPhotos);
    const refused = drafts.saveResult(1, { ...withPhotos, draft: { name: 7 } } as never);
    const beganAgain = drafts.begin();

    expect(await began).toEqual({ generation: 1, previousPhotoIds: [] });
    expect(await saved).toBe('saved');
    await expect(refused).rejects.toBeInstanceOf(TypeError);
    expect(await beganAgain).toEqual({ generation: 2, previousPhotoIds: ['p1', 'p2', 'p3'] });
    db.close();
  });

  it('loads an unreadable record as nothing and keeps it aside when it is replaced', async () => {
    const { db, drafts } = await setUp();
    const broken = { id: ANALYSIS_KEY, generation: 4, draft: { name: 'no numbers' } };
    await db.drafts.put(broken);

    expect(await drafts.load()).toBeNull();
    expect(await drafts.clear(4)).toEqual({ cleared: false, photoIds: [] });
    expect(await drafts.begin()).toEqual({ generation: 1, previousPhotoIds: [] });
    await settleQuarantine(db);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'drafts', key: ANALYSIS_KEY, raw: broken }),
    ]);
    db.close();
  });

  it('keeps the saved-label flag across a reload, and reads a draft stored without it as false', async () => {
    const { db, factory, name, drafts } = await setUp();
    const { generation } = await drafts.begin();
    const fromLabel = makeAnalysisDraft({ source: 'label', fromSavedLabel: true });
    await drafts.saveResult(generation, fromLabel);
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    const afterReload = createDraftsRepo(reopened.db, { clock });
    expect(await afterReload.load()).toEqual({ generation, draft: fromLabel });

    const { fromSavedLabel: _flag, ...older } = makeAnalysisDraft();
    await reopened.db.drafts.put({ id: ANALYSIS_KEY, generation: 7, draft: older });
    expect(await afterReload.load()).toEqual({
      generation: 7,
      draft: { ...older, fromSavedLabel: false },
    });
    reopened.db.close();
  });

  it('lets the caller delete the photos a late result wrote while the newer draft keeps its own (R02.10)', async () => {
    const { db, drafts } = await setUp();
    const photos = createPhotoRepo(db, { clock, newId: withIdSequence('photo') });
    const late = await drafts.begin();
    const current = await drafts.begin();
    const currentPhoto = await photos.put(await storableBlob(4), { width: 1, height: 1 });
    await drafts.saveResult(current.generation, makeAnalysisDraft({ photoIds: [currentPhoto] }));

    // The late attempt writes its photo, then learns it is stale and releases what it wrote.
    const latePhoto = await photos.put(await storableBlob(4), { width: 1, height: 1 });
    expect(
      await drafts.saveResult(late.generation, makeAnalysisDraft({ photoIds: [latePhoto] })),
    ).toBe('stale');
    expect(await photos.releaseIfUnused([latePhoto, currentPhoto])).toEqual([latePhoto]);
    expect(await photos.get(latePhoto)).toBeNull();
    expect(await photos.get(currentPhoto)).not.toBeNull();
    db.close();
  });
});

describe('capture draft', () => {
  const capture = { photoIds: ['c1', 'c2'], note: 'no dressing', progressive: true };

  it('survives a reopen (D-16.46)', async () => {
    const { db, factory, name, drafts } = await setUp();
    expect(await drafts.saveCapture(capture)).toEqual([]);
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    expect(await createDraftsRepo(reopened.db, { clock }).loadCapture()).toEqual(capture);
    reopened.db.close();
  });

  it('reports the photos a new save no longer lists and returns them all on clear', async () => {
    const { db, drafts } = await setUp();
    await drafts.saveCapture(capture);

    expect(await drafts.saveCapture({ ...capture, photoIds: ['c2', 'c3', 'c3'] })).toEqual(['c1']);
    expect(await drafts.loadCapture()).toEqual({ ...capture, photoIds: ['c2', 'c3'] });
    expect(await drafts.clearCapture()).toEqual(['c2', 'c3']);
    expect(await drafts.loadCapture()).toBeNull();
    expect(await drafts.clearCapture()).toEqual([]);
    db.close();
  });

  it('keeps the analysis draft apart from the capture draft', async () => {
    const { db, drafts } = await setUp();
    const { generation } = await drafts.begin();
    await drafts.saveResult(generation, withPhotos);
    await drafts.saveCapture(capture);

    await drafts.clearCapture();
    expect(await drafts.load()).toEqual({ generation, draft: withPhotos });
    await drafts.saveCapture(capture);
    await drafts.clear();
    expect(await drafts.loadCapture()).toEqual(capture);
    db.close();
  });

  it('keeps an unreadable capture record aside before clearing it', async () => {
    const { db, drafts } = await setUp();
    const broken = { id: CAPTURE_KEY, photoIds: 'c1' };
    await db.drafts.put(broken);

    expect(await drafts.loadCapture()).toBeNull();
    expect(await drafts.clearCapture()).toEqual([]);
    expect(await db.drafts.get(CAPTURE_KEY)).toBeUndefined();
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'drafts', key: CAPTURE_KEY, raw: broken }),
    ]);
    db.close();
  });
});
