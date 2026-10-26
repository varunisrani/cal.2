import { describe, expect, it } from 'vitest';
import type { AnalysisDraft, IngredientLine } from '../../domain/model';
import { freshDbOptions, openTestDb } from '../../test/db';
import { factories } from '../../test/factories';
import type { PlatewiseDb } from '../db';
import { keptAside } from '../guard';
import {
  ANALYSIS_DRAFT_ID,
  CAPTURE_DRAFT_ID,
  begin,
  clear,
  clearCapture,
  decodeDraftRow,
  draftPhotoIds,
  load,
  loadCapture,
  saveCapture,
  saveResult,
} from './draftsRepo';

const make = factories();

function line(name: string, photoIds: string[]): IngredientLine {
  return { name, grams: 100, kcal: 120, protein: 4, carbs: 20, fat: 2, photoIds };
}

/** A finished analysis with its own photos and, optionally, photos on its lines. */
function result(photoIds: string[], linePhotoIds: string[][] = []): AnalysisDraft {
  const lines = linePhotoIds.map((ids, i) => line(`Part ${i + 1}`, ids));
  return make.analysisDraft({ photoIds, draft: make.draft({ lines }) });
}

async function quarantinedKeys(db: PlatewiseDb) {
  await keptAside();
  return (await db.quarantine.toArray()).map((row) => `${row.table}:${String(row.key)}`);
}

describe('analysis draft', () => {
  it('refuses a result saved with an old generation as stale (R02.10)', async () => {
    const db = await openTestDb();
    const first = await begin(db);
    const second = await begin(db);
    expect(second.gen).toBe(first.gen + 1);

    expect(await saveResult(db, first.gen, result(['photo-late']))).toBe('stale');
    expect(await load(db)).toBeNull();

    const current = result(['photo-now']);
    expect(await saveResult(db, second.gen, current)).toBe('saved');
    expect(await load(db)).toEqual({ gen: second.gen, result: current });
  });

  it('begin hands back the photos of the draft it replaces, lines included', async () => {
    const db = await openTestDb();
    const { gen, previousPhotoIds } = await begin(db);
    expect(previousPhotoIds).toEqual([]);
    await saveResult(db, gen, result(['photo-1', 'photo-2'], [['photo-3', 'photo-1']]));

    const next = await begin(db);
    expect(next.previousPhotoIds).toEqual(['photo-1', 'photo-2', 'photo-3']);
    expect(await load(db)).toBeNull();
  });

  it('a saved draft is there again after a reload, and generations go on from it (D-16.46)', async () => {
    const options = freshDbOptions();
    const db = await openTestDb(options);
    const { gen } = await begin(db);
    // A label saved earlier for a barcode: the restored review must show that notice again.
    const saved = { ...result(['photo-1']), source: 'label' as const, fromSavedLabel: true };
    await saveResult(db, gen, saved);
    db.close();

    const reopened = await openTestDb(options);
    expect(await load(reopened)).toEqual({ gen, result: saved });
    expect((await begin(reopened)).gen).toBe(gen + 1);
  });

  it('clear with an old generation leaves a newer draft alone', async () => {
    const db = await openTestDb();
    const old = await begin(db);
    const newer = await begin(db);
    const kept = result(['photo-1'], [['photo-2']]);
    await saveResult(db, newer.gen, kept);

    expect(await clear(db, old.gen)).toEqual([]);
    expect(await load(db)).toEqual({ gen: newer.gen, result: kept });

    expect(await clear(db, newer.gen)).toEqual(['photo-1', 'photo-2']);
    expect(await load(db)).toBeNull();
  });

  it('clearing makes a save still in flight for that generation stale (R02.10)', async () => {
    const db = await openTestDb();
    const cancelled = await begin(db);
    expect(await clear(db, cancelled.gen)).toEqual([]);
    expect(await saveResult(db, cancelled.gen, result(['photo-late']))).toBe('stale');

    const logged = await begin(db);
    await saveResult(db, logged.gen, result(['photo-1']));
    expect(await clear(db)).toEqual(['photo-1']);
    expect(await saveResult(db, logged.gen, result(['photo-1']))).toBe('stale');
    expect(await load(db)).toBeNull();
  });

  it('runs calls in the order they were made, even when not awaited one by one', async () => {
    const db = await openTestDb();
    const started = begin(db);
    const saving = saveResult(db, 1, result(['photo-1']));
    const restarted = begin(db);
    expect(await started).toEqual({ gen: 1, previousPhotoIds: [] });
    expect(await saving).toBe('saved');
    expect(await restarted).toEqual({ gen: 2, previousPhotoIds: ['photo-1'] });
  });

  it('keeps an unreadable draft aside, reads nothing from it and refuses saves against it', async () => {
    const db = await openTestDb();
    const broken = { id: ANALYSIS_DRAFT_ID, gen: 'seven', result: { photoIds: ['photo-1'] } };
    await db.drafts.put(broken);

    expect(await load(db)).toBeNull();
    expect(await saveResult(db, 7, result(['photo-2']))).toBe('stale');
    expect(await clear(db, 7)).toEqual([]);
    expect(await db.drafts.get(ANALYSIS_DRAFT_ID)).toEqual(broken);

    expect(await begin(db)).toEqual({ gen: 1, previousPhotoIds: [] });
    expect(await quarantinedKeys(db)).toEqual([`drafts:${ANALYSIS_DRAFT_ID}`]);
    expect(await db.drafts.get(ANALYSIS_DRAFT_ID)).toEqual({ id: ANALYSIS_DRAFT_ID, gen: 1 });
  });

  it('refuses to store a result that would not read back', async () => {
    const db = await openTestDb();
    const { gen } = await begin(db);
    const bad = make.analysisDraft({ draft: make.draft({ kcal: Number.NaN }) });
    await expect(saveResult(db, gen, bad)).rejects.toBeInstanceOf(TypeError);
    expect(await load(db)).toBeNull();
  });
});

describe('capture draft', () => {
  it('survives a reopen', async () => {
    const options = freshDbOptions();
    const db = await openTestDb(options);
    const capture = { photoIds: ['photo-1', 'photo-2'], note: 'half eaten', progressive: true };
    expect(await saveCapture(db, capture)).toEqual([]);
    db.close();

    const reopened = await openTestDb(options);
    expect(await loadCapture(reopened)).toEqual(capture);
  });

  it('save returns the photos it dropped and clear the photos it held, in call order', async () => {
    const db = await openTestDb();
    const first = saveCapture(db, {
      photoIds: ['photo-a', 'photo-b'],
      note: '',
      progressive: false,
    });
    const second = saveCapture(db, {
      photoIds: ['photo-b', 'photo-c'],
      note: '',
      progressive: true,
    });
    const cleared = clearCapture(db);

    expect(await first).toEqual([]);
    expect(await second).toEqual(['photo-a']);
    expect(await cleared).toEqual(['photo-b', 'photo-c']);
    expect(await loadCapture(db)).toBeNull();
    expect(await clearCapture(db)).toEqual([]);
  });

  it('is kept apart from the analysis draft', async () => {
    const db = await openTestDb();
    await saveCapture(db, { photoIds: ['photo-c'], note: '', progressive: false });
    const { gen } = await begin(db);
    await saveResult(db, gen, result(['photo-a']));

    await clear(db);
    expect(await loadCapture(db)).toEqual({ photoIds: ['photo-c'], note: '', progressive: false });
    await clearCapture(db);
    expect(await db.drafts.get(ANALYSIS_DRAFT_ID)).toEqual({ id: ANALYSIS_DRAFT_ID, gen: gen + 1 });
  });

  it('keeps an unreadable capture row aside before replacing it', async () => {
    const db = await openTestDb();
    await db.drafts.put({ id: CAPTURE_DRAFT_ID, photoIds: 'photo-1', note: '' });
    expect(await loadCapture(db)).toBeNull();

    expect(await saveCapture(db, { photoIds: ['photo-2'], note: '', progressive: false })).toEqual(
      [],
    );
    expect(await quarantinedKeys(db)).toEqual([`drafts:${CAPTURE_DRAFT_ID}`]);
  });

  it('refuses a capture that would not read back', async () => {
    const db = await openTestDb();
    const bad = { photoIds: [7], note: '', progressive: false } as unknown as Parameters<
      typeof saveCapture
    >[1];
    await expect(saveCapture(db, bad)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('decodeDraftRow', () => {
  it('reads the two known rows and lists their photos', () => {
    const analysis = { id: ANALYSIS_DRAFT_ID, gen: 3, result: result(['photo-1'], [['photo-2']]) };
    const capture = { id: CAPTURE_DRAFT_ID, photoIds: ['photo-3'], note: 'n', progressive: false };
    const rows = [decodeDraftRow(analysis), decodeDraftRow(capture)];
    expect(rows).toEqual([analysis, capture]);
    expect(rows.map((row) => (row ? draftPhotoIds(row) : null))).toEqual([
      ['photo-1', 'photo-2'],
      ['photo-3'],
    ]);
  });

  it('cannot read an unknown row, a bad generation or a capture without a list of photo ids', () => {
    for (const raw of [
      { id: 'voice', photoIds: [] },
      { id: ANALYSIS_DRAFT_ID, gen: -1 },
      { id: ANALYSIS_DRAFT_ID, gen: 1, result: { photoIds: [] } },
      { id: CAPTURE_DRAFT_ID, photoIds: ['photo-1', 2] },
      { id: CAPTURE_DRAFT_ID },
      null,
    ]) {
      expect(decodeDraftRow(raw)).toBeNull();
    }
  });
});
